import type { ReplayEvent } from "@/domain/replay/types";

type Link = {
  rerollAvailable: boolean;
  rerollUsed: boolean;
  questionId?: string;
  originalDice?: unknown;
  resource?: "team";
  policy?: string;
};
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
      sameAction(question, event) &&
      choice &&
      roll?.RollType === event.rollType
    ) {
      const fullTeam =
        question.payload?.CanUseTeamReroll === 1 && choice.payload?.Used === 1;
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
