import type { LuckEvent } from "./types";

export type DamageStepSummary = {
  actionId: string;
  teamId: string;
  playerId: string;
  eventIds: string[];
  scoredRolls: number;
  unscoredRolls: number;
  contextRecords: number;
  diceContribution: number;
};

// Only a verified armor or recovery check anchors a damage step. Grouping
// references the existing contributions and never adds them to a team twice.
export function summarizeDamageSteps(
  events: readonly LuckEvent[]
): DamageStepSummary[] {
  const summaries = new Map<string, DamageStepSummary>();
  for (const event of events) {
    const damage = event.metadata.damage;
    if (!damage?.chainActionId || event.scoringStatus !== "scored") continue;
    if (!summaries.has(damage.chainActionId)) {
      summaries.set(damage.chainActionId, {
        actionId: damage.chainActionId,
        teamId: damage.subjectTeamId,
        playerId: damage.subjectId,
        eventIds: [],
        scoredRolls: 0,
        unscoredRolls: 0,
        contextRecords: 0,
        diceContribution: 0
      });
    }
  }
  for (const event of events) {
    if (event.type !== "armor_break" && event.type !== "injury") continue;
    const step =
      event.metadata.actionId && summaries.get(event.metadata.actionId);
    if (
      !step ||
      event.playerId !== step.playerId ||
      event.teamId !== step.teamId
    )
      continue;
    step.eventIds.push(event.id);
    if (event.scoringStatus === "scored") {
      step.scoredRolls++;
      step.diceContribution += event.weightedDelta;
    } else if (event.metadata.isRollCandidate) {
      step.unscoredRolls++;
    } else {
      step.contextRecords++;
    }
  }
  return [...summaries.values()];
}
