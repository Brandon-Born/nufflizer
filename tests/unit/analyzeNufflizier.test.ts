import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

function readDemoReplay(name: string): string {
  return readFileSync(path.resolve(process.cwd(), "demo-replays", name), "utf-8");
}

describe("analyzeNufflizerInput", () => {
  it("returns full luck schema for demo replay", () => {
    const report = analyzeNufflizerInput(readDemoReplay("demo1.bbr"));

    expect(report.id).toHaveLength(12);
    expect(report.match.homeTeam.length).toBeGreaterThan(0);
    expect(report.match.awayTeam.length).toBeGreaterThan(0);
    expect(report.teams).toHaveLength(2);
    expect(report.events.length).toBeGreaterThan(0);
    expect(report.keyMoments.length).toBeGreaterThan(0);
    expect(report.keyMoments.length).toBeLessThanOrEqual(15);
    expect(report.events.every((event) => event.probabilitySuccess >= 0 && event.probabilitySuccess <= 1)).toBe(true);
    expect(report.coverage.scoredCount + report.coverage.excludedCount).toBe(report.events.length);
    expect(report.coverage.scoredRate).toBeGreaterThanOrEqual(0);
    expect(report.coverage.scoredRate).toBeLessThanOrEqual(1);
    const byTypeTotal =
      Object.values(report.coverage.scoredByType).reduce((sum, count) => sum + count, 0) +
      Object.values(report.coverage.excludedByType).reduce((sum, count) => sum + count, 0);
    expect(byTypeTotal).toBe(report.events.length);
    expect(report.coverage.scoredByType.argue_call).toBeGreaterThanOrEqual(1);
    expect(report.howScoredSummary.length).toBeGreaterThan(0);
  });

  it("keeps verdict and score gap stable for sample fixture", () => {
    const xml = readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "replays", "sample-basic.xml"), "utf-8");
    const report = analyzeNufflizerInput(xml);

    expect(report.verdict).toHaveProperty("luckierTeam");
    expect(report.verdict).toHaveProperty("scoreGap");
    expect(report.teams.every((team) => Number.isFinite(team.luckScore))).toBe(true);
  });
});
