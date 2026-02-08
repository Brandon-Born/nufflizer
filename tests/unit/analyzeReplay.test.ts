import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeReplayXml } from "@/server/services/analyzeReplay";

function readFixture(name: string): string {
  return readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "replays", name), "utf-8");
}

describe("analyzeReplayXml", () => {
  it("returns a stable report envelope with coaching output", () => {
    const report = analyzeReplayXml(readFixture("sample-basic.xml"));

    expect(report.id).toHaveLength(12);
    expect(report.replay).toMatchObject({
      matchId: "fixture-001",
      teamCount: 2,
      turnCount: 2
    });

    expect(report.analysis.metrics.totalTurns).toBe(2);
    expect(report.coaching.priorities.length).toBeGreaterThan(0);
  });
});
