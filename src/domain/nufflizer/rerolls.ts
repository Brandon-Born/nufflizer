import type { ReplayEvent } from "@/domain/replay/types";

type Link = {
  rerollAvailable: boolean;
  rerollUsed: boolean;
  questionId?: string;
  originalDice?: unknown;
  retainedOriginal?: boolean;
  exclusionReason?: string;
  resource?: "team";
  policy?: string;
};
function isFailedSingleD6(roll: Record<string, unknown>): boolean {
  const dice = roll.Dice as
    { Die?: { DieType?: unknown; Value?: unknown } } | undefined;
  const die = dice?.Die;
  return (
    die?.DieType === 0 &&
    Number.isInteger(die.Value) &&
    Number(die.Value) >= 1 &&
    Number(die.Value) <= 6 &&
    Number.isInteger(roll.Difficulty) &&
    Number(roll.Difficulty) >= 2 &&
    Number(roll.Difficulty) <= 6 &&
    Number(die.Value) < Number(roll.Difficulty)
  );
}
// Questions carry the original failed dice. Choice and result often occur in a later sequence.
// Match the explicit actor/step/target/roll contract; proximity alone is never sufficient.
export function linkTeamRerolls(events: ReplayEvent[]): Map<number, Link> {
  const links = new Map<number, Link>();
  const initialRollsInStep = new Set<string>();
  let pending:
    | {
        question: ReplayEvent;
        choice?: ReplayEvent;
        originalAlreadyReported: boolean;
      }
    | undefined;
  function sameAction(a: ReplayEvent, b: ReplayEvent): boolean {
    return (
      a.playerId !== undefined &&
      a.playerId === b.playerId &&
      a.stepType !== undefined &&
      a.stepType === b.stepType &&
      a.targetId !== undefined &&
      a.targetId === b.targetId &&
      (!a.actorTeamId || !b.actorTeamId || a.actorTeamId === b.actorTeamId)
    );
  }
  function sameRoll(
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): boolean {
    return (
      a.Difficulty === b.Difficulty &&
      a.Requirement === b.Requirement &&
      JSON.stringify(a.Modifiers) === JSON.stringify(b.Modifiers)
    );
  }
  function sameDie(
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): boolean {
    const die = (value: Record<string, unknown>) =>
      (
        value.Dice as
          { Die?: { DieType?: unknown; Value?: unknown } } | undefined
      )?.Die;
    return (
      die(a)?.DieType === die(b)?.DieType && die(a)?.Value === die(b)?.Value
    );
  }
  // Retain all initial dice within the source step, including an earlier
  // family separated from its question by another numeric result. Team
  // ambiguity conservatively suppresses a second contribution.
  function originalKey(
    event: ReplayEvent,
    family: unknown,
    roll: Record<string, unknown>
  ): string {
    const die = (
      roll.Dice as { Die?: { DieType?: unknown; Value?: unknown } } | undefined
    )?.Die;
    return JSON.stringify([
      event.actionId,
      event.playerId,
      event.stepType,
      event.targetId,
      family,
      roll.Difficulty,
      roll.Requirement,
      roll.Modifiers,
      die?.DieType,
      die?.Value
    ]);
  }
  for (const [index, event] of events.entries()) {
    if (event.sourceTag === "QuestionTeamRerollUsage") {
      const original = event.payload?.RollInfos as
        Record<string, unknown> | undefined;
      pending = {
        question: event,
        originalAlreadyReported: Boolean(
          original &&
          event.actionId !== undefined &&
          initialRollsInStep.has(
            originalKey(event, original.RollType, original)
          )
        )
      };
      initialRollsInStep.clear();
      continue;
    }
    if (!pending) {
      if (
        event.sourceTag === "PlayerStep" ||
        event.sourceTag === "ResultUseAction"
      )
        initialRollsInStep.clear();
      if (
        event.sourceTag === "ResultRoll" &&
        event.actionId !== undefined &&
        event.payload?.Status === 1 &&
        event.payload?.NewRoll === 1
      )
        initialRollsInStep.add(
          originalKey(event, event.rollType, event.payload)
        );
      continue;
    }
    // Only a matching continuation step can intervene in this simple policy.
    // Unknown messages, skill gates, declarations and turn/controller changes
    // break the link; proximity or a later matching actor is insufficient.
    if (event.sourceTag === "PlayerStep" && sameAction(pending.question, event))
      continue;
    if (!["ResultTeamRerollUsage", "ResultRoll"].includes(event.sourceTag)) {
      pending = undefined;
      continue;
    }
    if (event.sourceTag === "ResultTeamRerollUsage") {
      if (!pending.choice && sameAction(pending.question, event))
        pending.choice = event;
      else pending = undefined;
      continue;
    }
    if (event.sourceTag !== "ResultRoll") continue;
    const { question, choice } = pending;
    const roll = question.payload?.RollInfos as
      Record<string, unknown> | undefined;
    if (
      roll &&
      sameAction(question, event) &&
      choice &&
      roll?.RollType === event.rollType &&
      Number.isSafeInteger(question.payload?.GamerId) &&
      Number(question.payload?.GamerId) >= 0 &&
      question.payload?.GamerId === choice.payload?.GamerId &&
      event.payload &&
      sameRoll(roll, event.payload)
    ) {
      const validOriginal =
        roll.Status === 1 &&
        roll.NewRoll === 1 &&
        roll.Outcome === 0 &&
        isFailedSingleD6(roll);
      const fullTeam =
        validOriginal &&
        question.payload?.CanUseTeamReroll === 1 &&
        choice.payload?.Used === 1 &&
        !pending.originalAlreadyReported &&
        event.payload?.Status === 2 &&
        event.payload?.NewRoll === 1;
      const kept =
        validOriginal &&
        choice.payload?.Used === 0 &&
        event.payload.Status === 1 &&
        event.payload.NewRoll === 0 &&
        event.payload.Outcome === 0 &&
        isFailedSingleD6(event.payload) &&
        sameDie(roll, event.payload);
      const retainedOriginal = kept && !pending.originalAlreadyReported;
      links.set(index, {
        retainedOriginal,
        exclusionReason:
          choice.payload?.Used === 0 && !retainedOriginal
            ? kept
              ? "retained original already reported; repeated summary is not another attempt"
              : "declined reroll summary does not match valid original dice"
            : undefined,
        rerollAvailable: fullTeam,
        rerollUsed: choice.payload?.Used === 1,
        questionId: question.id,
        originalDice: roll?.Dice,
        resource: fullTeam ? "team" : undefined,
        policy: fullTeam
          ? "Full team reroll on the recorded failed initial attempt; choice quality is not scored."
          : retainedOriginal
            ? "Retained original after declining the team reroll; one single attempt, not fresh dice."
            : "Single attempt; availability alone does not change odds."
      });
    }
    pending = undefined;
  }
  return links;
}
