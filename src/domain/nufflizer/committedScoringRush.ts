import {
  lastBoardCheckpointBefore,
  type ReplayBoardCheckpoint
} from "@/domain/replay/boardState";
import { unmodifiedD6Check } from "@/domain/replay/numericCheck";
import { observedActorRoster } from "@/domain/replay/observedActorRoster";
import type { PreRollEvidence } from "@/domain/replay/reconstructContext";
import { immediateScoringSuccessors } from "@/domain/replay/scoringRushState";
import {
  moveCell,
  ordinaryAppliedMove,
  sameObservedCell,
  scoreThrough,
  type ScoreRoster
} from "@/domain/replay/scoreContinuity";
import {
  failedMovementOffer,
  sameMovementActor
} from "@/domain/replay/teamRerollMovement";
import type { ReplayEvent } from "@/domain/replay/types";
import { immediateTouchdownComponents } from "./scoringRushImpact";
import type { LuckEvent, LuckReport } from "./types";

type Impact = Extract<
  NonNullable<LuckEvent["contextualImpact"]>,
  { policy: "committed_team_scoring_rush" }
>;
type Evidence = Impact["evidence"];

export function committedScoringRushImpact(
  evidence: Evidence,
  actor: number,
  actual: boolean
): Impact {
  const { scores, ownRoster, teamTurns, turnsPerPeriod, destination, origin } =
    evidence;
  const own = scores[ownRoster],
    opponent = scores[1 - ownRoster]!;
  const components = immediateTouchdownComponents(
    own,
    opponent,
    4 * turnsPerPeriod - teamTurns[0] - teamTurns[1]
  );
  const difference = components.touchdown + components.scorePressure;
  const deviation = Number(actual) - 5 / 6;
  return {
    policy: "committed_team_scoring_rush",
    evidence,
    components,
    difference,
    deviation,
    contribution: deviation * difference,
    successors: immediateScoringSuccessors(
      actor,
      destination,
      origin,
      own,
      opponent
    )
  };
}

function regulationClock(
  period: number,
  turnsPerPeriod: number,
  ownTurn: number,
  otherTurn: number
) {
  const start = period * turnsPerPeriod,
    end = start + turnsPerPeriod;
  return (
    (period === 0 || period === 1) &&
    turnsPerPeriod > 0 &&
    turnsPerPeriod <= 16 &&
    ownTurn > start &&
    ownTurn <= end &&
    otherTurn >= start &&
    otherTurn <= end &&
    ownTurn >= otherTurn &&
    ownTurn <= otherTurn + 1
  );
}

// An early regular turn can be identified from the cumulative clocks. Keep
// the raw period nullable and reject a prior later period or a clock reset.
function openingTurnCounters(
  frames: readonly ({
    periodCode: number | null;
    teamTurns: readonly (number | null)[];
  } | null)[],
  turnsPerPeriod: number,
  ownTurn: number
) {
  if (ownTurn > turnsPerPeriod) return false;
  const last = [0, 0];
  for (const clock of frames) {
    if (
      !clock ||
      (clock.periodCode !== null && clock.periodCode !== 0) ||
      clock.teamTurns.length !== 2
    )
      return false;
    for (const [i, turn] of clock.teamTurns.entries()) {
      if (turn === null) continue;
      if (turn < last[i]! || turn > ownTurn) return false;
      last[i] = turn;
    }
  }
  return true;
}

function isAppliedScoringResult(event: LuckEvent) {
  const m = event.metadata;
  return (
    event.scoringStatus === "scored" &&
    event.actualSuccess !== null &&
    m.rollType === 1 &&
    m.requirement === 2 &&
    m.difficulty === 2 &&
    m.rerollResource === "team" &&
    m.rerollUsed === true &&
    m.teamRerollsSpent === 1 &&
    !m.rerollSkill &&
    !m.lonerGate &&
    !m.proGate &&
    !m.modifiers?.length &&
    m.rerollDraws?.initialFace === 1 &&
    m.rerollDraws.baseSuccessChance === 5 / 6 &&
    (event.actualSuccess ? !!m.movementTouchdown : !!m.movementFall?.ballPath)
  );
}

type Clock = {
  phaseCode: number | null;
  periodCode: number | null;
  teamTurns: readonly (number | null)[];
};

function halfBoundary(
  waiting: Clock,
  closing: Clock | null | undefined,
  turnsPerPeriod: number
) {
  return (
    waiting.phaseCode === 5 &&
    waiting.periodCode === null &&
    closing?.phaseCode === 7 &&
    closing.periodCode === 1 &&
    [waiting, closing].every(
      (clock) =>
        clock.teamTurns.length === 2 &&
        clock.teamTurns.every((turn) => turn === turnsPerPeriod)
    )
  );
}

function boardClock(board: NonNullable<ReplayBoardCheckpoint["board"]>): Clock {
  return {
    phaseCode: board.phaseCode,
    periodCode: board.periodCode,
    teamTurns: board.teams.map((team) => team.gameTurn)
  };
}

export function observeCommittedScoringRush(
  event: LuckEvent,
  checkpoints: readonly ReplayBoardCheckpoint[],
  raw: ReadonlyMap<number, ReplayEvent>,
  teamIds: readonly string[]
): { impact: Impact; recoveredPreRoll?: PreRollEvidence } | undefined {
  if (
    !isAppliedScoringResult(event) ||
    event.contextualImpact ||
    event.contextualBounds
  )
    return;
  const m = event.metadata,
    index = m.sourceIndex,
    p = m.preRoll;
  if (index === undefined) return;
  const step = raw.get(index - 2);
  const origin = moveCell(step?.payload?.CellFrom),
    destination = moveCell(step?.payload?.CellTo);
  const actor = Number(event.playerId);
  if (
    !origin ||
    !destination ||
    (p &&
      (p.actorCarriesBall !== true ||
        !sameObservedCell(p.actorCell ?? undefined, origin) ||
        !sameObservedCell(p.scoringAttempt?.destination, destination) ||
        (p.activeTeamId !== null && p.activeTeamId !== event.teamId) ||
        p.actorMovementRemaining !== 0)) ||
    checkpoints[0]?.board?.pitchLayout !== "standard" ||
    (!p && m.movementFall?.ballPath?.aftermath?.status !== "turn_transition")
  )
    return;
  const question = raw.get(index - 4),
    offerStep = raw.get(index - 5);
  const result = raw.get(index),
    choice = raw.get(index - 1);
  const offered = question && failedMovementOffer(question);
  if (
    !question?.id ||
    question.id !== m.rerollQuestionId ||
    offered?.family !== 1 ||
    offered.threshold !== 2 ||
    !result ||
    unmodifiedD6Check(result, 1, 2, event.actualSuccess!) !== 2 ||
    !choice?.id ||
    choice.id !== m.rerollDecisionId ||
    choice.sourceTag !== "ResultTeamRerollUsage" ||
    choice.payload?.Used !== 1 ||
    choice.payload.GamerId !== question.payload?.GamerId ||
    !sameMovementActor(question, result) ||
    !sameMovementActor(choice, result) ||
    ![offerStep, step].every(
      (header) =>
        header?.sourceTag === "PlayerStep" &&
        header.stepType === 1 &&
        header.playerId === event.playerId &&
        header.payload?.IsEvaluation === 0 &&
        header.payload.Skill === 0 &&
        sameObservedCell(moveCell(header.payload.CellFrom), origin) &&
        sameObservedCell(moveCell(header.payload.CellTo), destination)
    ) ||
    offerStep?.actionId !== question.actionId ||
    step?.actionId !== result.actionId
  )
    return;
  const waiting = lastBoardCheckpointBefore(checkpoints, index - 2),
    board = waiting?.board;
  const owner =
      board && observedActorRoster(board, actor, event.teamId, teamIds),
    roster = owner?.rosterIndex as ScoreRoster | undefined;
  const carrier = owner?.players.find((player) => player.id === actor);
  if (
    !waiting ||
    waiting.afterSourceIndex !== index - 4 ||
    !board ||
    board.phaseCode !== 5 ||
    board.issues.length ||
    board.standardPitchCompatible !== true ||
    board.activePlayerId !== actor ||
    board.ball.possession !== "held" ||
    board.ball.carrierId !== actor ||
    !sameObservedCell(board.ball.cell, origin) ||
    !sameObservedCell(carrier?.cell, origin) ||
    carrier?.canAct !== true ||
    carrier.tackleZone !== true ||
    carrier.effectsKnownEmpty !== true ||
    (carrier.statusCode != null && carrier.statusCode !== 0) ||
    (carrier.situationCode != null && carrier.situationCode !== 0) ||
    !owner ||
    roster === undefined ||
    (board.activeTeamIndex !== null && board.activeTeamIndex !== roster) ||
    board.ball.holderRosterIndex !== roster ||
    roster !== choice.payload.GamerId ||
    owner.rerolls == null ||
    owner.rerolls < 1 ||
    !(owner.sideCode === 32
      ? destination.x === 25 && origin.x === 24
      : owner.sideCode === 64 && destination.x === 0 && origin.x === 1) ||
    Math.abs(destination.y - origin.y) > 1
  )
    return;

  const opponent = board.teams[1 - roster]!;
  if (opponent.sideCode !== (owner.sideCode === 32 ? 64 : 32)) return;
  // Either known axis can exclude an opponent from the carrier's neighborhood.
  if (
    board.teams.some((team) =>
      team.players.some((player) => {
        const { x, y } = player.cell;
        return (
          x === null ||
          (p && y === null) ||
          x === 0 ||
          x === 25 ||
          (team === opponent &&
            player.pitchLocation !== "off_pitch" &&
            Math.abs(x - origin.x) <= 1 &&
            (y === null || Math.abs(y - origin.y) <= 1))
        );
      })
    )
  )
    return;
  if (
    event.actualSuccess
      ? !sameObservedCell(m.movementTouchdown?.destination, destination)
      : m.movementFall?.ballPath?.waitingCheckpointAfter !==
        waiting.afterSourceIndex
  )
    return;

  const before = lastBoardCheckpointBefore(
    checkpoints,
    p ? p.checkpointAfter + 1 : waiting.afterSourceIndex
  );
  if (!before) return;
  const declaration = raw.get(before.afterSourceIndex + 3);
  const start = before?.board?.ball.cell;
  if (
    (p && before.afterSourceIndex !== p.checkpointAfter) ||
    before.board?.phaseCode !== 5 ||
    before.board.stable !== true ||
    before.board.issues.length ||
    before.board.ball.possession !== "held" ||
    before.board.ball.carrierId !== actor ||
    !start ||
    start.x === null ||
    start.y === null ||
    before.board.periodCode !== board.periodCode ||
    before.board.teams.some(
      (team, i) => team.gameTurn !== board.teams[i]?.gameTurn
    ) ||
    !declaration?.id ||
    (p && declaration.id !== p.activationId) ||
    declaration.sourceTag !== "ResultUseAction" ||
    declaration.payload?.Action !== 1 ||
    declaration.playerId !== event.playerId ||
    declaration.actorTeamId !== event.teamId ||
    declaration.actorTeamSource === "turn_inferred" ||
    declaration.sequenceId !== question.sequenceId
  )
    return;
  let position = { x: start.x, y: start.y };
  const stop = index - 5,
    first = before.afterSourceIndex + 4;
  if (stop < first || stop - first > 24 || (stop - first) % 3 !== 0) return;
  for (let step = first; step < stop; step += 3) {
    const move = ordinaryAppliedMove(raw, step);
    if (
      !move ||
      move.step.playerId !== event.playerId ||
      move.step.actorTeamId !== event.teamId ||
      move.step.sequenceId !== declaration.sequenceId ||
      !sameObservedCell(move.from, position)
    )
      return;
    position = move.to;
  }
  if (
    !sameObservedCell(position, origin) ||
    checkpoints.some(
      (cp) =>
        cp.afterSourceIndex > before.afterSourceIndex &&
        cp.afterSourceIndex < waiting.afterSourceIndex
    )
  )
    return;

  const turnsPerPeriod = board.turnsPerPeriod;
  const ownTurn = owner.gameTurn,
    otherTurn = opponent.gameTurn;
  if (turnsPerPeriod === null || ownTurn === null || otherTurn === null) return;
  const carriesThroughOpening =
    board.periodCode === null &&
    openingTurnCounters(
      checkpoints
        .filter((cp) => cp.afterSourceIndex <= waiting.afterSourceIndex)
        .map(
          ({ board }) =>
            board && {
              periodCode: board.periodCode,
              teamTurns: board.teams.map((team) => team.gameTurn)
            }
        ),
      turnsPerPeriod,
      ownTurn
    );
  let periodBasis: Evidence["periodBasis"];
  if (p && ownTurn < turnsPerPeriod && carriesThroughOpening)
    periodBasis = "opening_turn_counters";
  const aftermath = m.movementFall?.ballPath?.aftermath;
  if (!p) {
    const closing = checkpoints.find(
      (cp) => cp.afterSourceIndex === aftermath?.checkpointAfter
    )?.board;
    const carrierRecord = raw.get(before.afterSourceIndex + 1);
    const startStep = raw.get(before.afterSourceIndex + 2);
    const startRoster = observedActorRoster(
      before.board,
      actor,
      event.teamId,
      teamIds
    );
    const startCarrier = startRoster?.players.find(
      (player) => player.id === actor
    );
    if (
      !carriesThroughOpening ||
      !halfBoundary(
        boardClock(board),
        closing && boardClock(closing),
        turnsPerPeriod
      ) ||
      carrierRecord?.checkpointCarrier !== true ||
      carrierRecord.playerId !== event.playerId ||
      startStep?.sourceTag !== "PlayerStep" ||
      startStep.stepType !== 0 ||
      startStep.actionId !== declaration.actionId ||
      startStep.playerId !== event.playerId ||
      startStep.payload?.Skill !== 0 ||
      startStep.payload.IsEvaluation !== 0 ||
      !sameObservedCell(moveCell(startStep.payload.CellFrom), {
        x: start.x,
        y: start.y
      }) ||
      !sameObservedCell(moveCell(startStep.payload.CellTo), {
        x: start.x,
        y: start.y
      }) ||
      startRoster?.rosterIndex !== roster ||
      before.board.ball.holderRosterIndex !== roster ||
      !sameObservedCell(startCarrier?.cell, { x: start.x, y: start.y }) ||
      startCarrier?.movementRemaining !== (stop - first) / 3 ||
      (carrier.movementRemaining !== null && carrier.movementRemaining !== 0)
    )
      return;
    periodBasis = "half_boundary_counters";
  }
  const period = periodBasis ? 0 : board.periodCode;
  if (
    (period !== 0 && period !== 1) ||
    !regulationClock(period, turnsPerPeriod, ownTurn, otherTurn)
  )
    return;
  const score = scoreThrough(
    checkpoints,
    raw,
    waiting.afterSourceIndex,
    teamIds
  );
  if (!score) return;
  const impact = committedScoringRushImpact(
    {
      ...score,
      origin,
      destination,
      period,
      turnsPerPeriod,
      ownRoster: roster,
      waitingCheckpointAfter: waiting.afterSourceIndex,
      teamTurns: roster === 0 ? [ownTurn, otherTurn] : [otherTurn, ownTurn],
      ...(periodBasis ? { periodBasis } : {}),
      ...(!p ? { carryCheckpointAfter: before.afterSourceIndex } : {})
    },
    actor,
    event.actualSuccess!
  );
  return {
    impact,
    ...(!p
      ? {
          recoveredPreRoll: {
            checkpointAfter: waiting.afterSourceIndex,
            checkpointReplayStep: waiting.replayStep ?? undefined,
            phaseCode: 5,
            period: null,
            activeTeamId:
              board.activeTeamIndex === null || owner.explicitTeamId === null
                ? null
                : String(owner.explicitTeamId),
            teamTurn: null,
            turnsRemaining: null,
            activationId: declaration.id,
            actorCell: origin,
            ...(carrier.movementRemaining === 0
              ? { actorMovementRemaining: 0 }
              : {}),
            actorTackleZone: carrier.tackleZone,
            actorCarriesBall: true,
            carriedBallCell: origin,
            movementCheckLinked: true,
            otherUsefulActivations: null,
            pickupBounceExposure: null,
            scoringAttempt: {
              destination,
              sideCode: owner.sideCode as 32 | 64,
              teamTurn: ownTurn,
              turnsRemaining: null,
              turnsPerPeriod
            }
          } satisfies PreRollEvidence
        }
      : {})
  };
}

export function validReportedCommittedScoringRush(
  event: LuckEvent,
  report: LuckReport
) {
  const impact = event.contextualImpact;
  if (impact?.policy !== "committed_team_scoring_rush") return true;
  const m = event.metadata,
    e = impact.evidence,
    index = m.sourceIndex;
  const ownTurn = e.teamTurns[e.ownRoster],
    otherTurn = e.teamTurns[1 - e.ownRoster]!;
  if (
    !isAppliedScoringResult(event) ||
    m.preRoll?.actorCarriesBall !== true ||
    !event.playerId ||
    index === undefined ||
    e.waitingCheckpointAfter !== index - 4 ||
    e.scores.some((score) => score < 0) ||
    report.teams[e.ownRoster].teamId !== event.teamId ||
    !regulationClock(e.period, e.turnsPerPeriod, ownTurn, otherTurn) ||
    !sameObservedCell(m.preRoll?.actorCell ?? undefined, e.origin) ||
    !sameObservedCell(m.preRoll?.scoringAttempt?.destination, e.destination) ||
    m.preRoll?.scoringAttempt?.turnsPerPeriod !== e.turnsPerPeriod ||
    m.preRoll.scoringAttempt.teamTurn !== ownTurn ||
    (event.actualSuccess
      ? !sameObservedCell(m.movementTouchdown?.destination, e.destination)
      : m.movementFall?.ballPath?.waitingCheckpointAfter !==
        e.waitingCheckpointAfter)
  )
    return false;
  const { clockSnapshots } = report.rerollResources.flow;
  const waitingIndex = clockSnapshots.findIndex(
    (f) => f.source.checkpointAfter === e.waitingCheckpointAfter
  );
  const waiting = clockSnapshots[waitingIndex];
  const choice = report.rerollResources.decisions.find(
    (d) => d.decisionSourceId === m.rerollDecisionId
  );
  if (
    waiting?.clock?.phaseCode !== 5 ||
    (waiting.clock.activeTeamIndex !== null &&
      waiting.clock.activeTeamIndex !== e.ownRoster) ||
    (m.preRoll?.activeTeamId !== null &&
      m.preRoll?.activeTeamId !== event.teamId) ||
    !e.teamTurns.every((turn, i) => turn === waiting.clock?.teamTurns[i]) ||
    !waiting.playerIds[e.ownRoster].includes(Number(event.playerId)) ||
    choice?.namespace?.basis !== "observed_roster" ||
    choice.status !== "linked" ||
    choice.teamId !== event.teamId ||
    choice.namespace.actorPlayerId !== event.playerId ||
    choice.namespace.checkpointAfter !== e.waitingCheckpointAfter
  )
    return false;
  if (e.periodBasis === "opening_turn_counters") {
    if (
      e.period !== 0 ||
      ownTurn >= e.turnsPerPeriod ||
      e.carryCheckpointAfter !== undefined ||
      waiting.clock.periodCode !== null ||
      !openingTurnCounters(
        clockSnapshots
          .filter((f) => f.source.checkpointAfter <= e.waitingCheckpointAfter)
          .map((f) => f.clock),
        e.turnsPerPeriod,
        ownTurn
      )
    )
      return false;
  } else if (e.periodBasis === "half_boundary_counters") {
    const aftermath = m.movementFall?.ballPath?.aftermath;
    const closing = clockSnapshots.find(
      (f) => f.source.checkpointAfter === aftermath?.checkpointAfter
    );
    const carry = clockSnapshots[waitingIndex - 1];
    if (
      e.period !== 0 ||
      aftermath?.status !== "turn_transition" ||
      !halfBoundary(waiting.clock, closing?.clock, e.turnsPerPeriod) ||
      !openingTurnCounters(
        clockSnapshots
          .filter((f) => f.source.checkpointAfter <= e.waitingCheckpointAfter)
          .map((f) => f.clock),
        e.turnsPerPeriod,
        ownTurn
      ) ||
      m.preRoll.checkpointAfter !== e.waitingCheckpointAfter ||
      e.carryCheckpointAfter === undefined ||
      carry?.source.checkpointAfter !== e.carryCheckpointAfter ||
      carry.clock?.phaseCode !== 5 ||
      carry.clock.periodCode !== null ||
      !carry.clock.teamTurns.every((turn, i) => turn === e.teamTurns[i]) ||
      !carry.playerIds[e.ownRoster].includes(Number(event.playerId))
    )
      return false;
  } else if (
    waiting.clock.periodCode !== e.period ||
    e.carryCheckpointAfter !== undefined
  )
    return false;
  if (!validReportedScoreEvidence(report, e, e.waitingCheckpointAfter))
    return false;
  const expected = committedScoringRushImpact(
    e,
    Number(event.playerId),
    event.actualSuccess!
  );
  return (
    impact.deviation === expected.deviation &&
    impact.contribution === expected.contribution &&
    impact.difference === expected.difference &&
    impact.components.scorePressure === expected.components.scorePressure &&
    JSON.stringify(impact.successors) === JSON.stringify(expected.successors)
  );
}

export function validReportedScoreEvidence(
  report: LuckReport,
  evidence: Pick<Evidence, "scores" | "touchdowns">,
  through: number
) {
  const { clockSnapshots, endNotifications } = report.rerollResources.flow;
  const initial = clockSnapshots[0];
  if (
    initial?.source.kind !== "initial" ||
    initial.source.checkpointAfter !== 0 ||
    initial.clock?.phaseCode !== 0 ||
    initial.clock.teamTurns.some((turn) => turn !== 0)
  )
    return false;
  const goals = endNotifications.filter(
    (end) =>
      end.reasonCode === 4 &&
      end.sourceIndex !== null &&
      end.sourceIndex <= through
  );
  if (goals.length !== evidence.touchdowns.length) return false;
  const scores = [0, 0];
  for (const [i, goal] of evidence.touchdowns.entries()) {
    const end = goals[i]!;
    const confirmed = clockSnapshots.find(
      (f) => f.source.checkpointAfter >= goal.sourceIndex + 1
    );
    if (
      end.sourceIndex !== goal.sourceIndex + 1 ||
      confirmed?.source.checkpointAfter !== goal.confirmedCheckpointAfter ||
      confirmed.source.replayStep !== end.replayStep ||
      !confirmed.playerIds[goal.roster].includes(goal.scorerId) ||
      goal.confirmedCheckpointAfter > through ||
      ++scores[goal.roster]! !== goal.observedScore
    )
      return false;
  }
  return evidence.scores.every((score, i) => score === scores[i]);
}
