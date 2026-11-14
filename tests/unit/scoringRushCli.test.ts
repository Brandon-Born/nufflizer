import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { scoringRushXml } from "../helpers/scoringRush";

it("[cli-worker] exports the same scoring successors, component and honest heuristic explanation", () => {
  const dir = mkdtempSync(join(tmpdir(), "nuff-score-cli-"));
  try {
    const file = join(dir, "synthetic.xml");
    writeFileSync(file, scoringRushXml());
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
    const e = r.events.find((e) => e.metadata.rollType === 1)!;
    expect(e.contextualImpact).toMatchObject({
      policy: "ordinary_no_retry_scoring_rush",
      difference: 12,
      contribution: -10,
      successors: {
        success: { ownScore: 1, phase: "drive_end" },
        failure: {
          ownScore: 0,
          phase: "turnover_pending",
          pending: ["armor", "ball_bounce"]
        }
      }
    });
    expect(r.teams[0]!.impactByType.movement_risk).toBe(-10);
    expect(
      r.contextComponents.filter(
        (c) => c.bounds && c.bounds.lower === c.bounds.upper
      )
    ).toHaveLength(1);
    expect(r.verdict.luckierTeam).toBe("unknown");
    const text = run("text");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain(
      "4 touchdown units plus 8.000 score-pressure units"
    );
    expect(text.stdout).toContain("armor and ball movement still pending");
    expect(text.stdout).toContain(
      "heuristic, not a win probability or final-match prediction"
    );
    // A real CLI run must not edit its uploaded input.
    expect(readFileSync(file, "utf8")).toBe(scoringRushXml());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
