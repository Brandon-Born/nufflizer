import { tmpdir } from "node:os";
import { ownershipReplayXml } from "../helpers/ownershipReplay";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  CATEGORY_EXAMPLE_LINES,
  HOW_TO_READ_LINES
} from "@/domain/nufflizer/explainabilityCopy";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

describe("nufflizier CLI/API parity", () => {
  it("[cli-worker] retains current roles and unresolved stale defenders in text and JSON", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "nuff-ownership-"));
    try {
      for (const conflict of [false, true]) {
        const replayPath = path.join(directory, "source.xml");
        writeFileSync(
          replayPath,
          ownershipReplayXml(
            conflict
              ? { kind: "block", defenderTeam: 0 }
              : { kind: "block", initialActor: "missing" }
          )
        );
        const run = (format: string) =>
          spawnSync(
            process.execPath,
            [
              "--import",
              "tsx",
              "src/cli/nufflizier.ts",
              "analyze",
              replayPath,
              "--format",
              format
            ],
            { encoding: "utf8" }
          );
        const json = run("json");
        expect(json.status, json.stderr).toBe(0);
        const r = JSON.parse(json.stdout),
          e = r.events.find(
            (e: { metadata: { isRollCandidate: boolean } }) =>
              e.metadata.isRollCandidate
          );
        const text = run("text");
        expect(text.status, text.stderr).toBe(0);
        if (conflict) {
          expect(e.metadata.ownershipConflict).toMatchObject({
            role: "defender",
            reason: "current_roster_conflict"
          });
          expect(e.scoringStatus).toBe("excluded");
          expect(text.stdout).toContain(
            "Ownership unresolved for defender player 7"
          );
        } else {
          expect(e.metadata.ownership).toMatchObject({
            basis: "current_roster",
            teamId: "0",
            defender: { teamId: "1" }
          });
          expect(text.stdout).toContain(
            "current roster observation before this outcome"
          );
          expect(text.stdout).toContain(
            "Ownership alone does not establish current skills"
          );
        }
        expect(r.verdict.luckierTeam).toBe("unknown");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 20000);

  it("[cli-worker] keeps verdict and core aggregates aligned for the same replay", () => {
    const replayPath = path.resolve(
      process.cwd(),
      "tests",
      "fixtures",
      "replays",
      "sample-basic.xml"
    );
    const replayInput = readFileSync(replayPath, "utf-8");

    const apiReport = analyzeNufflizerInput(replayInput);

    const cliRun = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        replayPath,
        "--format",
        "json"
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8"
      }
    );

    expect(cliRun.status).toBe(0);
    const cliReport = JSON.parse(cliRun.stdout) as ReturnType<
      typeof analyzeNufflizerInput
    >;

    expect(cliReport.verdict.luckierTeam).toBe(apiReport.verdict.luckierTeam);
    expect(cliReport.verdict.scoreGap).toBe(apiReport.verdict.scoreGap);
    expect(cliReport.coverage.allEvents.scoredCount).toBe(
      apiReport.coverage.allEvents.scoredCount
    );
    expect(cliReport.coverage.allEvents.excludedCount).toBe(
      apiReport.coverage.allEvents.excludedCount
    );
    expect(cliReport.coverage.rollCandidates.scoredCount).toBe(
      apiReport.coverage.rollCandidates.scoredCount
    );
    expect(cliReport.coverage.rollCandidates.excludedCount).toBe(
      apiReport.coverage.rollCandidates.excludedCount
    );
    expect(cliReport.teams[0]?.luckScore).toBe(apiReport.teams[0]?.luckScore);
    expect(cliReport.teams[1]?.luckScore).toBe(apiReport.teams[1]?.luckScore);
  });

  it("[cli-worker] prints shared explainability guidance in text mode", () => {
    const replayPath = path.resolve(
      process.cwd(),
      "tests",
      "fixtures",
      "replays",
      "sample-basic.xml"
    );
    const replayInput = readFileSync(replayPath, "utf-8");
    const apiReport = analyzeNufflizerInput(replayInput);
    const cliRun = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        replayPath,
        "--format",
        "text"
      ],
      {
        cwd: process.cwd(),
        encoding: "utf-8"
      }
    );

    expect(cliRun.status).toBe(0);
    for (const line of HOW_TO_READ_LINES) {
      expect(cliRun.stdout).toContain(line);
    }
    for (const line of CATEGORY_EXAMPLE_LINES) {
      expect(cliRun.stdout).toContain(line);
    }
    expect(cliRun.stdout).toContain("Roll-candidate coverage:");
    expect(cliRun.stdout).toContain("All-event coverage:");

    if (Object.keys(apiReport.coverage.excludedByReason).length > 0) {
      expect(cliRun.stdout).toContain("Top exclusion reasons:");
    } else {
      expect(cliRun.stdout).not.toContain("Top exclusion reasons:");
    }
  });
});
