import type { ReplayTurn } from "@/domain/replay/types";
import type { DamageStepSummary } from "./damageSteps";
import type { LuckEvent } from "./types";
import { unmodifiedD6Check } from "@/domain/replay/numericCheck";
import { sameMovementActor } from "@/domain/replay/teamRerollMovement";
import { recordedZoneD6Check } from "@/domain/replay/zoneD6Check";

function pitchCell(value: unknown): { X: number; Y: number } | undefined {
  const cell = value as { X?: unknown; Y?: unknown } | undefined;
  if (
    typeof cell?.X === "number" &&
    Number.isInteger(cell.X) &&
    cell.X >= 0 &&
    cell.X <= 25 &&
    typeof cell.Y === "number" &&
    Number.isInteger(cell.Y) &&
    cell.Y >= 0 &&
    cell.Y <= 14
  )
    return { X: cell.X, Y: cell.Y };
}

function sameCell(
  a: ReturnType<typeof pitchCell>,
  b: ReturnType<typeof pitchCell>
): boolean {
  return a !== undefined && b !== undefined && a.X === b.X && a.Y === b.Y;
}

const damageMessages = new Set([
  "ResultRoll",
  "ResultInjuryRoll",
  "ResultCasualtyRoll",
  "ResultPlayerRemoval",
  "QuestionApothecaryCasualtyUsage"
]);

// These sequences end with the movement check and self-damage. A later ball
// action, different sequence, or unverified damage response breaks the link.
export function findMovementFall(turn: ReplayTurn) {
  const events = turn.events;
  const turnover = events.at(-1);
  if (
    turnover?.sourceTag !== "EventEndTurn" ||
    turnover.reasonCode !== 2 ||
    turnover.locator?.replayStep === undefined ||
    turnover.locator.childIndex === undefined ||
    turnover.sourceIndex === undefined
  )
    return;
  const damageActionId = events.at(-2)?.actionId;
  if (!damageActionId) return;
  let i = events.length - 2;
  while (i >= 0 && events[i]?.actionId === damageActionId) {
    const message = events[i]!;
    if (message.sourceTag === "DamageStep") break;
    if (
      !damageMessages.has(message.sourceTag) ||
      message.playerId !== message.stepTargetId ||
      (message.sourceTag === "ResultRoll" && message.rollType !== 10)
    )
      return;
    i--;
  }
  const damage = events[i];
  const outcome = events[i - 1];
  const move = events[i - 2];
  const roll = events[i - 3];
  const beforeRoll = events[i - 4];
  const decision =
    beforeRoll?.sourceTag === "ResultTeamRerollUsage" ? beforeRoll : undefined;
  const skill =
    beforeRoll?.sourceTag === "ResultSkillUsage" ? beforeRoll : undefined;
  const original = skill ? events[i - 5] : undefined;
  const combinedRush =
    beforeRoll &&
    unmodifiedD6Check(beforeRoll, 1, 1, true) &&
    !!roll &&
    recordedZoneD6Check(roll, 2, 1, false) &&
    roll?.rollType === 2 &&
    roll.payload?.Status === 1 &&
    roll.payload.NewRoll === 1 &&
    sameMovementActor(beforeRoll, roll) &&
    beforeRoll.actionId === roll.actionId &&
    beforeRoll.sequenceId === roll.sequenceId &&
    beforeRoll.sourceIndex === roll.sourceIndex! - 1
      ? beforeRoll
      : undefined;
  const step = skill
    ? events[i - 6]
    : decision || combinedRush
      ? events[i - 5]
      : beforeRoll;
  const from = pitchCell(step?.payload?.CellFrom);
  const to = pitchCell(step?.payload?.CellTo);
  const damageCell = pitchCell(damage?.payload?.CellFrom);
  if (
    damage?.sourceTag !== "DamageStep" ||
    damage.stepType !== 2 ||
    damage.payload?.Applied !== 1 ||
    damage.payload.IsEvaluation !== 0 ||
    outcome?.sourceTag !== "ResultMoveOutcome" ||
    outcome.payload?.Moved !== 1 ||
    outcome.payload.TentacleUsed !== 0 ||
    outcome.payload.FumbleRooskieUsed !== 0 ||
    move?.sourceTag !== "ResultDoMove" ||
    roll?.sourceTag !== "ResultRoll" ||
    (roll.rollType !== 1 && roll.rollType !== 2) ||
    roll.payload?.Outcome !== 0 ||
    (decision
      ? !decision.id ||
        (decision.payload?.Used !== 0 && decision.payload?.Used !== 1) ||
        roll.payload.NewRoll !== decision.payload.Used
      : roll.payload.NewRoll !== 1) ||
    step?.sourceTag !== "PlayerStep" ||
    step.stepType !== 1 ||
    step.payload?.IsEvaluation !== 0 ||
    step.locator?.stepIndex === undefined ||
    damage.locator?.stepIndex !== step.locator.stepIndex + 1 ||
    step.locator.replayStep !== turnover.locator.replayStep ||
    step.locator.childIndex !== turnover.locator.childIndex - 1 ||
    damage.sequenceId !== step.sequenceId ||
    damage.damageSource !== (roll.rollType === 1 ? 9 : 0) ||
    !step.playerId ||
    [roll, move, outcome, damage].some(
      (e) => e.playerId !== step.playerId || e.attributionConflict
    ) ||
    damage.targetId !== step.playerId ||
    [roll, move, outcome].some((e) => e.actionId !== step.actionId) ||
    (decision &&
      (decision.actionId !== step.actionId ||
        decision.playerId !== step.playerId ||
        decision.attributionConflict)) ||
    (skill &&
      (roll.rollType !== 2 ||
        !skill.id ||
        skill.payload?.Skill !== 7 ||
        skill.payload.Used !== 1 ||
        skill.actionId !== step.actionId ||
        skill.playerId !== step.playerId ||
        skill.attributionConflict ||
        !original?.id ||
        original.sourceTag !== "ResultRoll" ||
        original.rollType !== 2 ||
        original.actionId !== step.actionId ||
        original.playerId !== step.playerId ||
        original.attributionConflict ||
        original.payload?.Outcome !== 0)) ||
    !from ||
    !to ||
    Math.max(Math.abs(from.X - to.X), Math.abs(from.Y - to.Y)) !== 1 ||
    !sameCell(from, damageCell) ||
    !sameCell(damageCell, pitchCell(damage.payload.CellTo)) ||
    !roll.id ||
    outcome.sourceIndex === undefined
  )
    return;
  const summary = (
    outcome.payload.Rolls as
      { RollSummary?: { RollType?: number; Outcome?: number } } | undefined
  )?.RollSummary;
  if (combinedRush) {
    if (
      (move.payload && Object.keys(move.payload).length > 0) ||
      Object.keys(outcome.payload!).some(
        (k) =>
          ![
            "Moved",
            "TentacleUsed",
            "FumbleRooskieUsed",
            "Rolls",
            "Pushbacks"
          ].includes(k)
      ) ||
      (outcome.payload!.Pushbacks !== undefined &&
        outcome.payload!.Pushbacks !== "")
    )
      return;
    const rows = summary as unknown as {
      RollType?: number;
      Outcome?: number;
    }[];
    if (
      !Array.isArray(rows) ||
      rows.length !== 2 ||
      rows.some(
        (r) =>
          !r ||
          typeof r !== "object" ||
          Array.isArray(r) ||
          Object.keys(r).length !== 2
      ) ||
      rows[0]?.RollType !== 1 ||
      rows[0].Outcome !== 1 ||
      rows[1]?.RollType !== 2 ||
      rows[1].Outcome !== 0 ||
      !combinedRush.id
    )
      return;
  } else if (summary?.RollType !== roll.rollType || summary.Outcome !== 0)
    return;
  return {
    rollSourceId: roll.id,
    decisionSourceId: decision?.id ?? skill?.id,
    skillOriginalId: original?.id,
    evidence: {
      damageActionId,
      ...(combinedRush ? { combinedRushSourceId: combinedRush.id! } : {}),
      moveOutcomeSourceIndex: outcome.sourceIndex,
      turnoverSourceIndex: turnover.sourceIndex,
      turnoverChildIndex: turnover.locator.childIndex
    }
  };
}

export function summarizeMovementFall(
  roll: LuckEvent,
  damage: DamageStepSummary,
  events: ReadonlyMap<string, LuckEvent>,
  combinedRush?: LuckEvent
) {
  const damageEvents = damage.eventIds.map((id) => events.get(id)!);
  return {
    diceContribution:
      roll.weightedDelta +
      damage.diceContribution +
      (combinedRush?.weightedDelta ?? 0),
    unscoredDamageRolls: damage.unscoredRolls,
    armorHeld:
      damageEvents.find(
        (event) =>
          event.type === "armor_break" && event.scoringStatus === "scored"
      )?.actualSuccess ?? null,
    playerRemoved: damageEvents.some(
      (event) => event.metadata.sourceTag === "ResultPlayerRemoval"
    )
  };
}

// Match the last move directly to the recorded scoring square and player.
// The touchdown is aftermath evidence for the roll, with no extra score.
export function findMovementTouchdown(turn: ReplayTurn) {
  const end = turn.events.at(-1);
  const touchdown = turn.events.at(-2);
  const spp = turn.events.at(-3);
  const outcome = turn.events.at(-4);
  const move = turn.events.at(-5);
  const roll = turn.events.at(-6);
  const choice =
    turn.events.at(-7)?.sourceTag === "ResultTeamRerollUsage"
      ? turn.events.at(-7)
      : undefined;
  const step = turn.events.at(choice ? -8 : -7);
  if (
    end?.sourceTag !== "EventEndTurn" ||
    end.reasonCode !== 4 ||
    touchdown?.sourceTag !== "EventTouchdown" ||
    touchdown.sourceIndex === undefined ||
    touchdown.locator?.replayStep === undefined ||
    touchdown.locator.childIndex === undefined ||
    end.locator?.replayStep !== touchdown.locator.replayStep ||
    end.locator.childIndex !== touchdown.locator.childIndex + 1 ||
    step?.sourceTag !== "PlayerStep" ||
    step.stepType !== 1 ||
    step.payload?.IsEvaluation !== 0 ||
    step.locator?.replayStep !== touchdown.locator.replayStep ||
    step.locator.childIndex !== touchdown.locator.childIndex - 1 ||
    !step.actionId ||
    !step.playerId ||
    step.attributionConflict ||
    (choice &&
      (choice.payload?.Used !== 1 ||
        (choice.payload.GamerId !== 0 && choice.payload.GamerId !== 1) ||
        choice.actionId !== step.actionId ||
        choice.playerId !== step.playerId ||
        choice.targetId !== step.targetId ||
        choice.attributionConflict)) ||
    roll?.sourceTag !== "ResultRoll" ||
    !roll.id ||
    (roll.rollType !== 1 && roll.rollType !== 2) ||
    roll.payload?.Outcome !== 1 ||
    roll.payload.NewRoll !== 1 ||
    move?.sourceTag !== "ResultDoMove" ||
    outcome?.sourceTag !== "ResultMoveOutcome" ||
    outcome.payload?.Moved !== 1 ||
    outcome.payload.TentacleUsed !== 0 ||
    outcome.payload.FumbleRooskieUsed !== 0 ||
    spp?.sourceTag !== "ResultGainSpp" ||
    [roll, move, outcome, spp].some(
      (e) =>
        e.actionId !== step.actionId ||
        e.playerId !== step.playerId ||
        e.attributionConflict
    ) ||
    touchdown.payload?.PlayerId !== step.playerId
  )
    return;
  const from = pitchCell(step.payload.CellFrom);
  const to = pitchCell(step.payload.CellTo);
  const scoredCell = touchdown.payload.Cell as
    { X?: string; Y?: string } | undefined;
  const summary = (
    outcome.payload.Rolls as
      { RollSummary?: { RollType?: number; Outcome?: number } } | undefined
  )?.RollSummary;
  if (
    !from ||
    !to ||
    Math.max(Math.abs(from.X - to.X), Math.abs(from.Y - to.Y)) !== 1 ||
    (to.X !== 0 && to.X !== 25) ||
    !scoredCell ||
    (scoredCell.X !== undefined && scoredCell.X !== String(to.X)) ||
    (scoredCell.Y !== undefined && scoredCell.Y !== String(to.Y)) ||
    (scoredCell.X === undefined && scoredCell.Y === undefined) ||
    summary?.RollType !== roll.rollType ||
    summary.Outcome !== 1
  )
    return;
  return {
    rollSourceId: roll.id,
    evidence: {
      sourceIndex: touchdown.sourceIndex,
      childIndex: touchdown.locator.childIndex,
      destination: { x: to.X, y: to.Y },
      recordedCell: {
        x: scoredCell.X === undefined ? null : to.X,
        y: scoredCell.Y === undefined ? null : to.Y
      }
    }
  };
}
