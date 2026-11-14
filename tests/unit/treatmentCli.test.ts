import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { it, expect } from "vitest";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

it("[cli-worker] exports real retained initial injury and first reserves states without filling missing flags", () => {
  const dir = mkdtempSync(join(tmpdir(), "nuff-treatment-cli-")),
    file = join(dir, "source.bbr");
  const run = (source: string, format: string) => {
    writeFileSync(file, readFileSync(`demo-replays/${source}.bbr`));
    const out = spawnSync(
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
    expect(out.status, out.stderr).toBe(0);
    return out.stdout;
  };
  try {
    const r = LuckReportSchema.parse(JSON.parse(run("demo3", "json")));
    expect(r.schemaVersion).toBe("2.68");
    expect(r.modelVersion).toBe("dice-only-35");
    expect(r.events.filter((e) => e.metadata.recordedTreatment)).toHaveLength(
      5
    );
    const e = r.events.find((e) => e.metadata.sourceId === "source-636")!;
    expect(e.metadata.apothecary).toMatchObject({
      applied: "injury_original",
      originalSourceId: "source-628",
      initialRemovalSourceId: "source-635",
      treatmentSppSourceId: "source-634",
      resourceSpent: 0,
      appliedCasualty: 1
    });
    expect(e).toMatchObject({
      scoringStatus: "excluded",
      actualSuccess: null,
      probabilitySuccess: null,
      weightedDelta: 0
    });
    const original = r.events.find(
      (e) => e.metadata.sourceId === "source-628"
    )!;
    expect(original.metadata.initialInjuryOriginal).toBeUndefined();
    expect(original.metadata.injuryTable).toBeUndefined();
    for (const id of ["source-2043", "source-3060"]) {
      const e = r.events.find((e) => e.metadata.sourceId === id)!;
      expect(e.metadata.treatmentAftermath).toMatchObject({
        recordedFlags: { status: false, canAct: true, tackleZone: true },
        observation: {
          cell: { x: -1, y: -1 },
          situationCode: 1,
          statusCode: null,
          canAct: true,
          tackleZone: true
        }
      });
      expect(e.weightedDelta).toBe(0);
    }
    const text = run("demo3", "text");
    expect(text).toContain("Recorded treatment notifications: 5.");
    expect(text).toContain(
      "source source-636: Recorded Apothecary decision: no resource used; retained the recorded initial injury without a new roll"
    );
    expect(text).toContain("snapshot omits the status flag; it stays unknown");
    expect(text).toContain(
      "Off-pitch flags do not establish a legal or useful activation"
    );
    const negative = LuckReportSchema.parse(JSON.parse(run("demo11", "json"))),
      blocked = negative.events.find(
        (e) => e.metadata.recordedTreatment?.stage === "initial_injury"
      )!;
    expect(blocked.metadata.apothecary?.applied).toBe("injury_original");
    expect(blocked.metadata.treatmentAftermath).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
