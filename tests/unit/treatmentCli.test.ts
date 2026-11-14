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
    expect(r.schemaVersion).toBe("2.72");
    expect(r.modelVersion).toBe("dice-only-36");
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
    expect(
      r.events.find((e) => e.metadata.sourceId === "source-2043")!.metadata
        .treatmentReturn
    ).toEqual({
      status: "unverified",
      stop: { reason: "identity_transition", sourceIndex: 2466 }
    });
    expect(
      r.events.find((e) => e.metadata.sourceId === "source-3060")!.metadata
        .treatmentReturn
    ).toMatchObject({
      status: "observed",
      setup: { checkpointAfter: 3809, activeGamerId: null },
      playing: { checkpointAfter: 3876 },
      activation: {
        sourceId: "source-4175",
        before: { checkpointAfter: 4172, activeGamerId: null, statusCode: null }
      }
    });
    expect(
      r.events.find((e) => e.metadata.sourceId === "source-4175")
    ).toMatchObject({
      playerId: "7",
      teamId: "0",
      scoringStatus: "excluded",
      weightedDelta: 0,
      metadata: {
        isRollCandidate: false,
        treatmentReturnActivation: { treatmentSourceId: "source-3060" },
        ownership: { role: "actor", teamId: "0", playerId: "7" }
      }
    });
    const text = run("demo3", "text");
    expect(text).toContain("Recorded treatment notifications: 5.");
    expect(text).toContain(
      "Player 7 is later observed back on the pitch during setup (source 3809), then in regular play (source 3876)"
    );
    expect(text).toContain("A Move declaration is recorded at source-4175");
    expect(text).toContain(
      "This treated player's Move declaration is linked to treatment source-3060"
    );
    expect(text).toContain(
      "A later return cannot be linked to this treatment."
    );

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

it("[cli-worker] retains the treated player's Pass budget before Throw Team-mate execution", () => {
  const run = (format: string) => {
    const out = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        "demo-replays/demo1.bbr",
        "--format",
        format
      ],
      { encoding: "utf8", maxBuffer: 4_000_000 }
    );
    expect(out.status, out.stderr).toBe(0);
    return out.stdout;
  };
  const r = LuckReportSchema.parse(JSON.parse(run("json"))),
    e = r.events.find((e) => e.metadata.sourceId === "source-5188")!;
  expect(e.teamId).toBe("1");
  expect(e.metadata.treatmentReturn).toMatchObject({
    status: "observed",
    setup: { checkpointAfter: 5302 },
    playing: { checkpointAfter: 5366 },
    activation: {
      sourceId: "source-5397",
      actionCode: 4,
      budget: {
        kind: "pass",
        headerCellFrom: { x: 13, y: 7 },
        headerCellTo: { x: 13, y: 8 }
      }
    }
  });
  expect(e.metadata.treatmentReturn).not.toHaveProperty("stop");
  const marker = r.events.find((e) => e.metadata.sourceId === "source-5397")!;
  expect(marker).toMatchObject({
    playerId: "37",
    teamId: "1",
    probabilitySuccess: null,
    weightedDelta: 0,
    metadata: { isRollCandidate: false }
  });
  expect(marker.metadata.treatmentReturnActivation).toMatchObject({
    treatmentSourceId: "source-5188",
    actionCode: 4,
    budget: { kind: "pass" }
  });
  const text = run("text");
  expect(text).toContain(
    "Player 37 is later observed back on the pitch during setup (source 5302), then in regular play (source 5366)"
  );
  expect(text).toContain(
    "A Pass budget declaration is recorded at source-5397"
  );
  expect(text).toContain("Recorded Pass budget declaration");
  expect(text).toContain("No new roll");
  expect(text).toContain("are declaration parameters");
  expect(text).toContain("No extra luck or contextual value is added");
}, 20000);
