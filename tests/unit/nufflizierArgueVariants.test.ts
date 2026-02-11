import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import type { ReplayModel } from "@/domain/replay/types";

function readModelFixture(name: string): ReplayModel {
  const input = readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "models", name), "utf-8");
  return JSON.parse(input) as ReplayModel;
}

describe("nufflizier argue-call variant gate", () => {
  it("keeps rollType 42 excluded because target source is inconsistent", () => {
    const report = analyzeReplayLuck(readModelFixture("argue-rolltype-42.json"));
    const events = report.events.filter((event) => event.type === "argue_call" && event.metadata.rollType === 42);

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.scoringStatus === "excluded")).toBe(true);
    expect(events.some((event) => (event.metadata.normalizationFlags ?? []).includes("missing_target_threshold"))).toBe(true);
    expect(events.every((event) => /missing target threshold|unsupported ResultRoll context/i.test(event.statusReason))).toBe(true);
    expect(Object.values(report.coverage.excludedByReason).reduce((sum, count) => sum + count, 0)).toBeGreaterThanOrEqual(events.length);
  });

  it("keeps rollType 70 excluded because fixture semantics remain nondeterministic", () => {
    const report = analyzeReplayLuck(readModelFixture("argue-rolltype-70.json"));
    const events = report.events.filter((event) => event.type === "argue_call" && event.metadata.rollType === 70);

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.scoringStatus === "excluded")).toBe(true);
    expect(events.some((event) => (event.metadata.normalizationFlags ?? []).includes("missing_target_threshold"))).toBe(true);
    expect(events.every((event) => /missing target threshold|unsupported ResultRoll context/i.test(event.statusReason))).toBe(true);
    expect(Object.values(report.coverage.excludedByReason).reduce((sum, count) => sum + count, 0)).toBeGreaterThanOrEqual(events.length);
  });
});
