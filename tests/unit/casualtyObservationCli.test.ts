import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

it("[cli-worker] keeps original, replacement and applied casualty roles without adding a league-damage score", () => {
  const dir = mkdtempSync(join(tmpdir(), "nuff-casualty-cli-"));
  try {
    const file = join(dir, "source.bbr");
    writeFileSync(file, readFileSync("demo-replays/demo3.bbr"));
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
    expect(r.schemaVersion).toBe("2.69");
    const original = r.events.find(
        (e) => e.metadata.sourceId === "source-2033"
      )!,
      replacement = r.events.find(
        (e) => e.metadata.sourceId === "source-2039"
      )!,
      applied = r.events.find((e) => e.metadata.sourceId === "source-2043")!;
    expect(original.metadata.casualtyObservation).toMatchObject({
      recordKind: "apothecary_original",
      outcome: "serious_injury",
      subjectId: "45",
      subjectTeamId: "1"
    });
    expect(replacement.metadata.casualtyObservation).toMatchObject({
      recordKind: "apothecary_replacement",
      outcome: "no_injury",
      subjectId: "45",
      subjectTeamId: "1"
    });
    expect(applied.metadata.apothecary).toMatchObject({
      originalSourceId: "source-2033",
      replacementSourceId: "source-2039",
      resourceSpent: 1,
      applied: "replacement",
      appliedCasualty: 0
    });
    for (const e of [original, replacement, applied]) {
      expect(e.scoringStatus).toBe("excluded");
      expect(e.probabilitySuccess).toBeNull();
      expect(e.actualSuccess).toBeNull();
      expect(e.weightedDelta).toBe(0);
      expect(e.contextualImpact).toBeUndefined();
    }
    expect(
      r.diceRecords.find(
        (d) =>
          d.parentSourceId === "source-2039" &&
          d.path.join() === "OriginalRoll,Dice"
      )
    ).toMatchObject({ disposition: "summary", aliasOf: expect.any(String) });
    const text = run("text");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain("Recorded casualty results: 8.");
    expect(text.stdout).toContain(
      "source source-2033: Serious Injury (recorded); Not scored."
    );
    expect(text.stdout).toContain(
      "source source-2039: No injury (recorded); Not scored."
    );
    expect(text.stdout).toContain(
      "source source-2043: Recorded Apothecary decision: one resource used; applied the replacement casualty: No injury."
    );
    expect(text.stdout).toContain(
      "Long-term league damage is not priced as current-match impact."
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
