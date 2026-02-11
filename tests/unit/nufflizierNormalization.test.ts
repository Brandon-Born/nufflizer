import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import type { ReplayModel } from "@/domain/replay/types";

function readModelFixture(name: string): ReplayModel {
  const input = readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "models", name), "utf-8");
  return JSON.parse(input) as ReplayModel;
}

describe("nufflizier normalization", () => {
  it("keeps argue-call variants explicit/fallback with transparent reasons", () => {
    const report = analyzeReplayLuck(readModelFixture("argue-edge-replay.json"));
    const argueEvents = report.events.filter((event) => event.type === "argue_call");

    expect(argueEvents).toHaveLength(3);

    const roll71 = argueEvents.find((event) => event.metadata.rollType === 71);
    const roll42 = argueEvents.find((event) => event.metadata.rollType === 42);
    const roll70 = argueEvents.find((event) => event.metadata.rollType === 70);

    expect(roll71?.calculationMethod).toBe("explicit");
    expect(roll42?.calculationMethod).toBe("fallback");
    expect(roll42?.calculationReason).toMatch(/rollType 42/i);
    expect(roll70?.calculationMethod).toBe("fallback");
    expect(roll70?.calculationReason).toMatch(/rollType 70/i);

    expect(report.coverage.byType.argue_call.explicit).toBe(1);
    expect(report.coverage.byType.argue_call.fallback).toBe(2);
  });

  it("emits normalization flags for ambiguous event context", () => {
    const report = analyzeReplayLuck(readModelFixture("argue-edge-replay.json"));
    const roll70 = report.events.find((event) => event.type === "argue_call" && event.metadata.rollType === 70);

    expect(roll70).toBeDefined();
    expect(roll70?.metadata.normalizationFlags).toContain("ambiguous_team_attribution");
    expect(roll70?.metadata.normalizationFlags).toContain("missing_target_threshold");
    expect(roll70?.metadata.normalizationFlags).toContain("inferred_reroll_from_skill_only");
    expect(roll70?.metadata.normalizationFlags).toContain("insufficient_dice_metadata");
    expect(roll70?.metadata.normalizationNotes?.length).toBeGreaterThan(0);
  });

  it("flags unstable target context for rollType 42 and keeps fallback", () => {
    const report = analyzeReplayLuck(readModelFixture("argue-rolltype-42.json"));
    const roll42 = report.events.filter((event) => event.type === "argue_call" && event.metadata.rollType === 42);

    expect(roll42.length).toBeGreaterThan(0);
    expect(roll42.every((event) => event.calculationMethod === "fallback")).toBe(true);
    expect(roll42.some((event) => (event.metadata.normalizationFlags ?? []).includes("missing_target_threshold"))).toBe(true);
  });
});
