import { describe, expect, it } from "vitest";

import { saveReplayReport, getReplayReportById } from "@/server/services/reportStore";

describe("report store", () => {
  it("persists and retrieves report payloads", async () => {
    const report = {
      id: "report-test-1",
      generatedAt: new Date().toISOString(),
      replay: {
        matchId: "match-1",
        replayVersion: "1-4-0-0",
        format: "xml" as const,
        teamCount: 2,
        turnCount: 4,
        unknownCodes: []
      },
      analysis: {
        metrics: {
          totalTurns: 4,
          turnoverSignals: 1,
          rerollSignals: 1,
          aggressiveActionSignals: 2,
          ballCarrierTransitions: 1
        },
        findings: [],
        turnAdvice: []
      },
      coaching: {
        headline: "test",
        priorities: ["p1"],
        turnByTurn: []
      }
    };

    await saveReplayReport(report);

    const loaded = await getReplayReportById(report.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(report.id);
    expect(loaded?.replay.matchId).toBe("match-1");
  });
});
