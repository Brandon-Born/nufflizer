import type { LuckEvent } from "./types";
import type { DiceRecord } from "./diceEvidence";

export type RollFamilyCoverage = {
  teamId: string;
  sourceTag: string;
  rollType?: number;
  scoredCount: number;
  unscoredCount: number;
  unattributedCount: number;
  malformedCount: number;
  unresolvedIdentityCount: number;
};

// Preserve first-observed order so the JSON is stable for a replay.
export function summarizeRollFamilies(
  events: readonly LuckEvent[],
  diceRecords: readonly DiceRecord[] = []
): RollFamilyCoverage[] {
  const families = new Map<string, RollFamilyCoverage>();
  const malformed = new Set(
    diceRecords
      .filter((r) => r.quality === "malformed" && r.eventId)
      .map((r) => r.eventId)
  );
  const unresolved = new Set(
    diceRecords
      .filter((r) => r.disposition === "unresolved" && r.eventId)
      .map((r) => r.eventId)
  );
  for (const { id, teamId, scoringStatus, metadata } of events) {
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
        unattributedCount: 0,
        malformedCount: 0,
        unresolvedIdentityCount: 0
      };
      families.set(key, family);
    }
    if (teamId === "unresolved") family.unattributedCount++;
    else if (scoringStatus === "scored") family.scoredCount++;
    else family.unscoredCount++;
    if (malformed.has(id)) family.malformedCount++;
    if (unresolved.has(id)) family.unresolvedIdentityCount++;
  }
  return [...families.values()];
}
