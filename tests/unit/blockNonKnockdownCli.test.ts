import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

it("[cli-worker] exports the original Stunty/Right Stuff source and explains its separate effects", () => {
  const dir = mkdtempSync(join(tmpdir(), "nuff-block-effects-cli-"));
  try {
    const file = join(dir, "source.bbr");
    writeFileSync(file, readFileSync("demo-replays/demo6.bbr"));
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
    const e = r.events.find((e) => e.metadata.sourceId === "source-188")!;
    expect(e.weightedDelta).toBeCloseTo(-13 / 24, 12);
    expect(e.metadata.block!.skillModel!.nonKnockdownSkills).toEqual({
      policy: "outside_current_pool_knockdowns",
      attacker: [],
      defender: [52, 59]
    });
    expect(r.events.find(e => e.metadata.sourceId === "source-248")).toMatchObject({
      playerId: "47", teamId: "1", scoringStatus: "excluded",
      probabilitySuccess: null, actualSuccess: null, weightedDelta: 0,
      metadata: {injuryObservation: {outcome: "badly_hurt", recordKind: "direct"}}
    });
    expect(r.verdict.luckierTeam).toBe("unknown");
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    const text = run("text");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain(
      "source source-188: Offered balance 0; fair conditional mean 0.722222; dice contribution -0.541667"
    );
    expect(text.stdout).toContain("defender Right Stuff, Stunty");
    expect(text.stdout).toContain(
      "without changing this pool's immediate knockdown table"
    );
    expect(text.stdout).toContain(
      "Those other effects are outside this component"
    );
    expect(text.stdout).toContain("Player 47; source source-248: Badly Hurt (recorded); Not scored.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
