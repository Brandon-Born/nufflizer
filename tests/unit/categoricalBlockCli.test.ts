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
    expect(report.schemaVersion).toBe("2.65");
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
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20000);
