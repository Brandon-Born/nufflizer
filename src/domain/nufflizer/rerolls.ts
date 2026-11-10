import type { ReplayEvent } from "@/domain/replay/types";

type Link = {
  rerollAvailable: boolean;
  rerollUsed: boolean;
  questionId?: string;
  originalDice?: unknown;
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
  let pending: { question: ReplayEvent; choice?: ReplayEvent } | undefined;
  function sameAction(a: ReplayEvent, b: ReplayEvent): boolean {
    return (
      a.playerId !== undefined &&
      a.playerId === b.playerId &&
      a.stepType === b.stepType &&
      a.targetId === b.targetId &&
      (!a.actorTeamId || !b.actorTeamId || a.actorTeamId === b.actorTeamId)
    );
  }
  for (const [index, event] of events.entries()) {
    if (event.sourceTag === "QuestionTeamRerollUsage") {
      pending = { question: event };
      continue;
    }
    if (!pending) continue;
    // A conditional skill/gate or a fresh declaration invalidates the simple
    // full-team-reroll policy. Loner/Pro/skill replacements need their own links.
    if (
      event.sourceTag === "ResultSkillUsage" ||
      event.sourceTag === "ResultUseAction"
    ) {
      pending = undefined;
      continue;
    }
    if (event.sourceTag === "ResultTeamRerollUsage") {
      if (sameAction(pending.question, event)) pending.choice = event;
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
      question.payload?.GamerId === choice.payload?.GamerId &&
      roll?.Difficulty === event.payload?.Difficulty &&
      roll?.Requirement === event.payload?.Requirement &&
      JSON.stringify(roll?.Modifiers) ===
        JSON.stringify(event.payload?.Modifiers)
    ) {
      const fullTeam =
        question.payload?.CanUseTeamReroll === 1 &&
        choice.payload?.Used === 1 &&
        roll.Status === 1 &&
        roll.NewRoll === 1 &&
        roll.Outcome === 0 &&
        isFailedSingleD6(roll) &&
        event.payload?.Status === 2 &&
        event.payload?.NewRoll === 1;
      links.set(index, {
        rerollAvailable: fullTeam,
        rerollUsed: choice.payload?.Used === 1,
        questionId: question.id,
        originalDice: roll?.Dice,
        resource: fullTeam ? "team" : undefined,
        policy: fullTeam
          ? "Full team reroll on the recorded failed initial attempt; choice quality is not scored."
          : "Single attempt; availability alone does not change odds."
      });
    }
    pending = undefined;
  }
  return links;
}
