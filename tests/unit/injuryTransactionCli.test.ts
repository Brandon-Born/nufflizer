import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

it("[cli-worker] exports continued source traits and a measured-zero block without inventing injury eligibility", () => {
  const dir = mkdtempSync(join(tmpdir(), "nuff-injury-traits-cli-"));
  try {
    const file = join(dir, "source.bbr");
    writeFileSync(file, readFileSync("demo-replays/demo9.bbr"));
    const run = (format: string) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          file,
          "--format",
          format
        ],
        { encoding: "utf8", maxBuffer: 4_000_000 }
      );
    const json = run("json");
    expect(json.status, json.stderr).toBe(0);
    const r = LuckReportSchema.parse(JSON.parse(json.stdout));
    const zero = r.events.find((e) => e.metadata.sourceId === "source-501")!;
    expect(zero).toMatchObject({
      scoringStatus: "scored",
      delta: 0,
      weightedDelta: 0,
      probabilitySuccess: null,
      actualSuccess: null,
      metadata: { blockScoring: { observedValue: 0, expectedValue: 0 } }
    });
    const pool = r.events.find((e) => e.metadata.sourceId === "source-625")!;
    expect(pool.weightedDelta).toBeCloseTo(5 / 24, 12);
    expect(pool.metadata.block?.traitEvidence?.attacker).toMatchObject({
      playerId: "44",
      observedCheckpointAfter: 12,
      traits: { acquiredSkills: [30] }
    });
    expect(pool.metadata.block?.traitEvidence?.defender).toMatchObject({playerId:"4",observedCheckpointAfter:12,traits:{acquiredSkills:[15]}});
    const unknown = r.events.find((e) => e.metadata.sourceId === "source-212")!;
    expect(unknown.metadata.injuryTable).toBeDefined();
    expect(unknown.metadata.injuryScoring).toBeUndefined();
    expect(unknown.scoringStatus).toBe("excluded");
    expect(r.verdict.luckierTeam).toBe("unknown");
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    const text = run("text");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain(
      "source source-501: Offered balance 0; fair conditional mean 0.000000; dice contribution 0.000000"
    );
    expect(text.stdout).toContain(
      "source source-625: Offered balance +1; fair conditional mean 0.722222; dice contribution 0.208333"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
