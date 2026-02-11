import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { CATEGORY_EXAMPLE_LINES, HOW_TO_READ_LINES } from "@/domain/nufflizer/explainabilityCopy";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

describe("nufflizier CLI/API parity", () => {
  it("keeps verdict and core aggregates aligned for the same replay", () => {
    const replayPath = path.resolve(process.cwd(), "tests", "fixtures", "replays", "sample-basic.xml");
    const replayInput = readFileSync(replayPath, "utf-8");

    const apiReport = analyzeNufflizerInput(replayInput);

    const cliRun = spawnSync("corepack", ["pnpm", "-s", "nufflizier", "analyze", replayPath, "--format", "json"], {
      cwd: process.cwd(),
      encoding: "utf-8"
    });

    expect(cliRun.status).toBe(0);
    const cliReport = JSON.parse(cliRun.stdout) as ReturnType<typeof analyzeNufflizerInput>;

    expect(cliReport.verdict.luckierTeam).toBe(apiReport.verdict.luckierTeam);
    expect(cliReport.verdict.scoreGap).toBe(apiReport.verdict.scoreGap);
    expect(cliReport.coverage.scoredCount).toBe(apiReport.coverage.scoredCount);
    expect(cliReport.coverage.excludedCount).toBe(apiReport.coverage.excludedCount);
    expect(cliReport.teams[0]?.luckScore).toBe(apiReport.teams[0]?.luckScore);
    expect(cliReport.teams[1]?.luckScore).toBe(apiReport.teams[1]?.luckScore);
  });

  it("prints shared explainability guidance in text mode", () => {
    const replayPath = path.resolve(process.cwd(), "tests", "fixtures", "replays", "sample-basic.xml");
    const replayInput = readFileSync(replayPath, "utf-8");
    const apiReport = analyzeNufflizerInput(replayInput);
    const cliRun = spawnSync("corepack", ["pnpm", "-s", "nufflizier", "analyze", replayPath, "--format", "text"], {
      cwd: process.cwd(),
      encoding: "utf-8"
    });

    expect(cliRun.status).toBe(0);
    for (const line of HOW_TO_READ_LINES) {
      expect(cliRun.stdout).toContain(line);
    }
    for (const line of CATEGORY_EXAMPLE_LINES) {
      expect(cliRun.stdout).toContain(line);
    }

    if (Object.keys(apiReport.coverage.excludedByReason).length > 0) {
      expect(cliRun.stdout).toContain("Top exclusion reasons:");
    } else {
      expect(cliRun.stdout).not.toContain("Top exclusion reasons:");
    }
  });
});
