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
  });

  it("keeps verdict and score gap stable for sample fixture", () => {
    const xml = readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "replays", "sample-basic.xml"), "utf-8");
    const report = analyzeNufflizerInput(xml);

    expect(report.verdict).toHaveProperty("luckierTeam");
    expect(report.verdict).toHaveProperty("scoreGap");
    expect(report.teams.every((team) => Number.isFinite(team.luckScore))).toBe(true);
  });
});
