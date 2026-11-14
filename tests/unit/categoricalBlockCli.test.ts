import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

it("[cli-worker] shares original-source categorical scores, unknown pools and partial subtotals", () => {
  const directory = mkdtempSync(join(tmpdir(), "nuff-block-cli-"));
  try {
    const bytes = readFileSync("demo-replays/demo5.bbr"),
      file = join(directory, "source.bbr");
    writeFileSync(file, bytes);
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
    const report = LuckReportSchema.parse(JSON.parse(json.stdout));
    // Run the direct corpus only after the real deadline worker has exited.
    const direct = analyzeNufflizerInput(bytes.toString());
    expect(report.events).toEqual(direct.events);
    expect(report.schemaVersion).toBe("2.72");
    expect(report.events.filter((e) => e.metadata.blockScoring)).toHaveLength(
      11
    );
    expect(
      report.events.find((e) => e.metadata.sourceId === "source-98")!
        .weightedDelta
    ).toBeCloseTo(17 / 48, 12);
    expect(
      report.events.find((e) => e.metadata.sourceId === "source-132")!
        .weightedDelta
    ).toBeCloseTo(-19 / 48, 12);
    expect(
      report.events.find((e) => e.metadata.sourceId === "source-1324")!.metadata
        .blockResolution!.unscoredPool
    ).toBe(true);
    const text = run("text");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain(
      "82 observed; 11 have qualified categorical luck; 71 have no qualified luck value"
    );
    expect(text.stdout).toContain(
      "source source-98: Offered balance +1; fair conditional mean 0.527778; dice contribution 0.354167"
    );
    expect(text.stdout).toContain(
      "source source-132: Offered balance 0; fair conditional mean 0.527778; dice contribution -0.395833"
    );
    expect(text.stdout).toContain(
      "The subtotal includes only other supported linked dice; it is not an even-luck result"
    );
    expect(text.stdout).toContain("included once in dice totals");
    expect(report.verdict.luckierTeam).toBe("unknown");
    // Exercise the newly qualified original-source block and injury policies,
    // preserving the demo5 case above and keeping each actual worker serial.
    const next = readFileSync("demo-replays/demo9.bbr");
    writeFileSync(file, next);
    const nextJson = run("json");
    expect(nextJson.status, nextJson.stderr).toBe(0);
    const newer = LuckReportSchema.parse(JSON.parse(nextJson.stdout));
    const expected = analyzeNufflizerInput(next.toString());
    expect(newer.events).toEqual(expected.events);
    expect(
      newer.events.find((e) => e.metadata.sourceId === "source-797")!
        .weightedDelta
    ).toBeCloseTo(5 / 24, 12);
    expect(
      newer.events.find((e) => e.metadata.sourceId === "source-2060")!
        .weightedDelta
    ).toBe(-5 / 4);
    expect(
      newer.events.find((e) => e.metadata.sourceId === "source-4183")!
        .weightedDelta
    ).toBe(5 / 8);
    expect(newer.modelVersion).toBe("dice-only-36");
    expect(newer.verdict.luckierTeam).toBe("unknown");
    const nextText = run("text");
    expect(nextText.status, nextText.stderr).toBe(0);
    expect(nextText.stdout).toContain(
      "source source-797: Offered balance +1; fair conditional mean 0.722222; dice contribution 0.208333"
    );
    expect(newer.teams.every((t) => t.impactCount === 0)).toBe(true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20000);
