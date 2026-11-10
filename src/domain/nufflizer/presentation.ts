import type { LuckEventType, LuckReport } from "./types";
import { LuckEventTypeSchema } from "./reportSchema";

export function scoredEvidenceForTeam(
  report: Pick<LuckReport, "events">,
  teamId: string
) {
  const byType = Object.fromEntries(
    LuckEventTypeSchema.options.map((type) => [type, 0])
  ) as Record<LuckEventType, number>;
  let total = 0;
  for (const event of report.events)
    if (event.teamId === teamId && event.scoringStatus === "scored") {
      total++;
      byType[event.type]++;
    }
  return { total, byType };
}
// An empty sum is mathematically zero, but it is not measured even luck.
export function formatDiceContribution(
  value: number,
  scoredCount: number,
  digits = 2
): string {
  return scoredCount ? value.toFixed(digits) : "Not scored";
}
