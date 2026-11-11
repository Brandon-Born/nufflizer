import type { ReplayTurn } from "@/domain/replay/types";
import type { DamageStepSummary } from "./damageSteps";
import type { LuckEvent } from "./types";

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
  const step = decision ? events[i - 5] : beforeRoll;
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
  if (summary?.RollType !== roll.rollType || summary.Outcome !== 0) return;
  return {
    rollSourceId: roll.id,
    decisionSourceId: decision?.id,
    evidence: {
      damageActionId,
      moveOutcomeSourceIndex: outcome.sourceIndex,
      turnoverSourceIndex: turnover.sourceIndex,
      turnoverChildIndex: turnover.locator.childIndex
    }
  };
}

export function summarizeMovementFall(
  roll: LuckEvent,
  damage: DamageStepSummary,
  events: ReadonlyMap<string, LuckEvent>
) {
  const damageEvents = damage.eventIds.map((id) => events.get(id)!);
  return {
    diceContribution: roll.weightedDelta + damage.diceContribution,
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
