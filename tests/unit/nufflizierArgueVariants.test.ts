import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import type { ReplayModel } from "@/domain/replay/types";

function readModelFixture(name: string): ReplayModel {
  const input = readFileSync(
    path.resolve(process.cwd(), "tests", "fixtures", "models", name),
    "utf-8"
  );
  return JSON.parse(input) as ReplayModel;
}

describe("referee identity and exclusion", () => {
  it.each([
    [42, "land"],
    [70, "throw_a_rock"]
  ] as const)(
    "retains %d as %s, outside the referee category",
    (rollType, label) => {
      const replay = readModelFixture(`argue-rolltype-${rollType}.json`);
      const report = analyzeReplayLuck({ ...replay, replayVersion: "1-4-0-0" });
      const events = report.events.filter(
        (event) => event.metadata.rollType === rollType
      );
      expect(events.length).toBeGreaterThan(0);
      expect(
        events.every(
          (event) =>
            event.type !== "argue_call" &&
            event.scoringStatus === "excluded" &&
            event.metadata.rollLabel === label
        )
      ).toBe(true);
    }
  );
});
