import {
  validScoringRushState,
  scoringRushSuccessors,
  type ScoringRushState
} from "@/domain/replay/scoringRushState";
import type { LuckEvent, LuckReport } from "./types";
import type { DiceRecord } from "./diceEvidence";

// Common provisional context units: one ordinary move=1, possession=2 in the
// existing model. These transparent score-pressure weights are heuristic,
// not calibrated win probabilities or an assertion about overtime/results.
export const SCORE_PRESSURE_WEIGHTS = { touchdown: 4, lead: 8 } as const;

export function estimateScoringRushImpact(
  state: ScoringRushState,
  successChance: number,
  actualSuccess: boolean
) {
  if (
    !validScoringRushState(state) ||
    !Number.isFinite(successChance) ||
    successChance <= 0 ||
    successChance >= 1
  )
    return;
  const successors = scoringRushSuccessors(state)!,
    f = state.frame;
  const remaining = f.teams.map((t) => 2 * f.turnsPerPeriod - t.turn);
  const lead = (own: number, opponent: number) => Math.sign(own - opponent);
  const components = {
    touchdown: SCORE_PRESSURE_WEIGHTS.touchdown,
    scorePressure:
      (SCORE_PRESSURE_WEIGHTS.lead *
        (lead(successors.success.ownScore, successors.success.opponentScore) -
          lead(
            successors.failure.ownScore,
            successors.failure.opponentScore
          ))) /
      (1 + remaining[0]! + remaining[1]!)
  };
  const difference = components.touchdown + components.scorePressure;
  const deviation = Number(actualSuccess) - successChance;
  return {
    policy: "ordinary_no_retry_scoring_rush" as const,
    components,
    difference,
    deviation,
    contribution: deviation * difference,
    successors
  };
}

export function validReportedScoringRushImpact(
  event: LuckEvent,
  report: LuckReport,
  sources: ReadonlyMap<string, LuckEvent>,
  dice: ReadonlyMap<string | undefined, DiceRecord>
): boolean {
  const state = event.metadata.preRoll?.scoringRushState,
    impact = event.contextualImpact;
  if (!state) return impact?.policy !== "ordinary_no_retry_scoring_rush";
  if (
    event.metadata.sourceTag !== "ResultRoll" ||
    event.metadata.rollType !== 1 ||
    event.metadata.stepType !== 1
  )
    return false;
  if (!validScoringRushState(state)) return false;
  const context = event.metadata.preRoll!,
    own = state.frame.teams[state.ownRoster],
    opponent = state.frame.teams[1 - state.ownRoster]!;
  const declaration = sources.get(state.declarationSourceId),
    index = event.metadata.sourceIndex;
  const cp = report.rerollResources.flow.clockSnapshots.filter(
    (cp) =>
      cp.source.kind === state.source.kind &&
      cp.source.replayStep === state.source.replayStep &&
      cp.source.childIndex === state.source.childIndex &&
      cp.source.checkpointAfter === state.source.checkpointAfter
  );
  if (
    cp.length !== 1 ||
    index === undefined ||
    state.source.checkpointAfter >= index ||
    context.checkpointAfter !== state.source.checkpointAfter ||
    context.activationId !== state.declarationSourceId ||
    !declaration ||
    declaration.metadata.sourceTag !== "ResultUseAction" ||
    declaration.metadata.actionCode !== 1 ||
    declaration.scoringStatus !== "excluded" ||
    declaration.metadata.isRollCandidate !== false ||
    declaration.playerId !== String(state.actorId) ||
    declaration.teamId !== own.teamId ||
    (declaration.metadata.sourceIndex ?? Infinity) >= index ||
    event.playerId !== String(state.actorId) ||
    event.teamId !== own.teamId ||
    context.activeTeamId !== own.teamId ||
    context.actorCarriesBall !== true ||
    context.actorCell?.x !== state.frame.ball.cell.x ||
    context.actorCell?.y !== state.frame.ball.cell.y ||
    context.scoringAttempt?.destination.x !== state.destination.x ||
    context.scoringAttempt.destination.y !== state.destination.y
  )
    return false;
  const clock = cp[0]!;
  if (
    !clock.clock ||
    clock.clock.phaseCode !== 5 ||
    clock.clock.periodCode !== state.frame.period ||
    clock.clock.activeTeamIndex !== state.ownRoster ||
    clock.counts[state.ownRoster] !== 0 ||
    clock.clock.teamTurns[state.ownRoster] !== own.turn ||
    clock.clock.teamTurns[1 - state.ownRoster] !== opponent.turn ||
    state.frame.teams.some(
      (t, i) =>
        clock.explicitTeamIds[i] !== Number(t.teamId) ||
        JSON.stringify(clock.playerIds[i]) !==
          JSON.stringify(t.players.map((p) => p.id))
    )
  )
    return false;
  const prefix = report.rerollResources.flow.clockSnapshots.filter(
    (cp) => cp.source.checkpointAfter < index
  );
  if (
    !prefix.some(
      (cp) =>
        cp.source.kind === "initial" &&
        cp.source.checkpointAfter === 0 &&
        cp.identityStructureObserved
    ) ||
    prefix.some(
      (cp) =>
        !cp.identityStructureObserved ||
        cp.rosterCount !== 2 ||
        cp.playerIds.some((ids) => ids.some((id) => id === null))
    ) ||
    Array.from(sources.values()).some(
      (e) =>
        (e.metadata.sourceIndex ?? Infinity) < index &&
        ["EventBuyMercenary", "EventRemoveMercenary"].includes(
          e.metadata.sourceTag ?? ""
        )
    )
  )
    return false;
  for (const i of [0, 1]) {
    const known = Array.from(
      new Set(prefix.flatMap((cp) => cp.playerIds[i] ?? []))
    ).sort((a, b) => a! - b!);
    if (
      JSON.stringify(known) !==
      JSON.stringify([...state.rosterIds[i]!].sort((a, b) => a - b))
    )
      return false;
  }
  if (impact?.policy !== "ordinary_no_retry_scoring_rush") return !impact;
  const draw = dice.get(event.metadata.sourceId);
  const priorDice = report.diceRecords.filter(
    (r) =>
      r.parentKind === "event" &&
      r.rollType === 1 &&
      (r.parentSourceIndex ?? -1) >
        (declaration.metadata.sourceIndex ?? Infinity) &&
      (r.parentSourceIndex ?? Infinity) < index
  );
  if (priorDice.length !== state.priorRushes.length) return false;
  for (const [i, p] of state.priorRushes.entries()) {
    const d = priorDice[i],
      row = sources.get(p.sourceId);
    if (
      !d ||
      !row ||
      d.parentSourceId !== p.sourceId ||
      d.parentSourceIndex !== p.sourceIndex ||
      d.status !== 1 ||
      d.newRoll !== 1 ||
      d.stepActorId !== event.playerId ||
      d.dice.length !== 1 ||
      d.dice[0]!.dieType !== 0 ||
      d.dice[0]!.value !== p.face ||
      row.scoringStatus !== "scored" ||
      row.metadata.sourceTag !== "ResultRoll" ||
      row.metadata.requirement !== 2 ||
      row.metadata.difficulty !== 2 ||
      row.probabilitySuccess !== 5 / 6 ||
      row.actualSuccess !== true ||
      row.metadata.rerollUsed !== undefined ||
      row.metadata.actionId !== p.actionId ||
      p.stepSourceId !== `source-${p.stepSourceIndex}`
    )
      return false;
  }
  if (
    Array.from(sources.values()).some(
      (e) =>
        e.metadata.sourceTag === "ResultUseAction" &&
        e.playerId === event.playerId &&
        (e.metadata.sourceIndex ?? Infinity) <
          (declaration.metadata.sourceIndex ?? -1) &&
        e.metadata.preRoll?.teamTurn === own.turn &&
        e.metadata.preRoll?.period === context.period
    )
  )
    return false;
  if (
    state.step.sourceIndex !== index - 1 ||
    state.step.sourceId !== `source-${index - 1}` ||
    state.step.actionId !== event.metadata.actionId ||
    draw?.stepTag !== "PlayerStep" ||
    draw.stepType !== 1 ||
    draw.stepActorId !== event.playerId ||
    draw.locator?.messageIndex !== 0
  )
    return false;
  if (
    event.scoringStatus !== "scored" ||
    event.type !== "movement_risk" ||
    event.metadata.rollType !== 1 ||
    event.metadata.sourceTag !== "ResultRoll" ||
    event.metadata.probabilityPolicy !== "single_attempt" ||
    event.probabilitySuccess !== 5 / 6 ||
    event.actualSuccess === null ||
    event.metadata.difficulty !== 2 ||
    event.metadata.requirement !== 2 ||
    (event.metadata.modifiers?.length ?? 0) !== 0 ||
    event.metadata.rerollUsed !== undefined ||
    event.metadata.rerollDraws ||
    draw?.status !== 1 ||
    draw.newRoll !== 1 ||
    draw.eventId !== event.id
  )
    return false;
  const expected = estimateScoringRushImpact(
    state,
    event.probabilitySuccess,
    event.actualSuccess
  )!;
  return JSON.stringify(expected) === JSON.stringify(impact);
}
