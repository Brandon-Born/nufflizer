import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

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
    expect(cliReport.coverage.explicitCount).toBe(apiReport.coverage.explicitCount);
    expect(cliReport.coverage.fallbackCount).toBe(apiReport.coverage.fallbackCount);
    expect(cliReport.teams[0]?.luckScore).toBe(apiReport.teams[0]?.luckScore);
    expect(cliReport.teams[1]?.luckScore).toBe(apiReport.teams[1]?.luckScore);
  });
});
