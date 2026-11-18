import type { ReplayEvent } from "./types";

export type BombCatch = {
  explosionSourceId: string;
  starQuestionSourceId?: string;
  caught: boolean;
};

export const BOMB_CATCH_EXCLUSION =
  "bomb catch odds have no verified scoring contract";

function sameCell(a: unknown, b: unknown) {
  const from = a as { X?: unknown; Y?: unknown } | undefined;
  const to = b as { X?: unknown; Y?: unknown } | undefined;
  return (
    Number.isInteger(from?.X) &&
    Number.isInteger(from?.Y) &&
    from?.X === to?.X &&
    from?.Y === to?.Y
  );
}

function catchStep(step: ReplayEvent | undefined, result: ReplayEvent) {
  return (
    step?.sourceTag === "PlayerStep" &&
    step.stepType === 4 &&
    step.payload?.IsEvaluation === 0 &&
    step.actionId !== undefined &&
    step.actionId === result.actionId &&
    step.sequenceId === result.sequenceId &&
    step.playerId === result.playerId &&
    !!step.playerId &&
    sameCell(step.payload.CellFrom, step.payload.CellTo)
  );
}

function explosionAt(step: ReplayEvent, event: ReplayEvent | undefined) {
  return (
    event?.sourceTag === "ResultBombExplosion" &&
    event.id &&
    event.actionId === step.actionId &&
    event.sequenceId === step.sequenceId &&
    event.playerId === step.playerId &&
    sameCell(step.payload?.CellTo, event.payload?.Cell)
  );
}

// A Catch die can belong to the bomb or the regular ball. The explosion must
// be tied to that exact catch action, including the recorded star-choice pause.
export function findBombCatches(
  events: readonly ReplayEvent[],
  version?: string
) {
  const found = new Map<string, BombCatch>();
  if (version !== "1-4-0-0") return found;
  for (const [index, roll] of events.entries()) {
    const outcome = roll.payload?.Outcome;
    const step = events[index - 1];
    if (
      !roll.id ||
      roll.sourceTag !== "ResultRoll" ||
      roll.rollType !== 7 ||
      roll.payload?.Status !== 1 ||
      roll.payload.NewRoll !== 1 ||
      (outcome !== 0 && outcome !== 1) ||
      roll.executionExclusion ||
      !step ||
      !catchStep(step, roll)
    )
      continue;

    const immediate = events[index + 1];
    if (immediate && explosionAt(step, immediate)) {
      found.set(roll.id, {
        explosionSourceId: immediate.id!,
        caught: outcome === 1
      });
      continue;
    }

    const resume = events[index + 4],
      explosion = events[index + 5],
      decision = events[index + 6];
    if (
      outcome === 1 &&
      immediate?.sourceTag === "QuestionStarSpecialRuleUsage" &&
      immediate.id &&
      immediate.actionId === step.actionId &&
      immediate.payload?.StarSpecialRule === 38 &&
      events[index + 2]?.sourceTag === "EventGamersAreReady" &&
      events[index + 3]?.sourceTag === "EventStartActiveTimer" &&
      resume &&
      explosion &&
      catchStep(resume, explosion) &&
      resume.sequenceId !== step.sequenceId &&
      resume.playerId === step.playerId &&
      sameCell(step.payload?.CellTo, resume.payload?.CellTo) &&
      explosionAt(resume, explosion) &&
      decision?.sourceTag === "ResultStarSpecialRuleUsage" &&
      decision.actionId === resume.actionId &&
      decision.payload?.StarSpecialRule === 38 &&
      decision.payload.Used === 1 &&
      immediate.payload.PlayerId === decision.payload.PlayerId
    )
      found.set(roll.id, {
        explosionSourceId: explosion.id!,
        starQuestionSourceId: immediate.id,
        caught: true
      });
  }
  return found;
}
