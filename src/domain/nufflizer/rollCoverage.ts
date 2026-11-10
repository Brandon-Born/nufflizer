import type { LuckEvent } from "./types";

export type RollFamilyCoverage = {
  teamId: string;
  sourceTag: string;
  rollType?: number;
  scoredCount: number;
  unscoredCount: number;
  unattributedCount: number;
};

// Preserve first-observed order so the JSON is stable for a replay.
export function summarizeRollFamilies(
  events: readonly LuckEvent[]
): RollFamilyCoverage[] {
  const families = new Map<string, RollFamilyCoverage>();
  for (const { teamId, scoringStatus, metadata } of events) {
    if (!metadata.isRollCandidate) continue;
    const { sourceTag, rollType } = metadata;
    const key = JSON.stringify([teamId, sourceTag, rollType]);
    let family = families.get(key);
    if (!family) {
      family = {
        teamId,
        sourceTag,
        rollType,
        scoredCount: 0,
        unscoredCount: 0,
        unattributedCount: 0
      };
      families.set(key, family);
    }
    if (teamId === "unresolved") family.unattributedCount++;
    else if (scoringStatus === "scored") family.scoredCount++;
    else family.unscoredCount++;
  }
  return [...families.values()];
}
