import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { formatExpectedOutcome } from "@/domain/nufflizer/presentation";

const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-treatment-aftermath.json", "utf8")
);
const reports = new Map<string, ReturnType<typeof analyzeNufflizerInput>>();
function source(file: string) {
  if (!reports.has(file))
    reports.set(
      file,
      analyzeNufflizerInput(readFileSync(`demo-replays/${file}`, "utf8"))
    );
  return reports.get(file)!;
}
function locate(file: string, locator: Record<string, number>) {
  return source(file).events.find(
    (e) =>
      e.metadata.sourceTag === "ResultApothecary" &&
      e.metadata.locator &&
      ["replayStep", "childIndex", "stepIndex", "messageIndex"].every(
        (k) =>
          e.metadata.locator![k as keyof typeof e.metadata.locator] ===
          locator[k]
      )
  )!;
}

describe("recorded treatment and first observed aftermath", () => {
  it("reproduces every raw notification/state and the existing UI witnesses independently", () => {
    const run = spawnSync(
      "python3",
      ["scripts/extract-treatment-aftermath-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(run.status, run.stderr).toBe(0);
    expect(facts.rawResults).toHaveLength(13);
    expect(facts.paired.map((p: { caseId: string }) => p.caseId)).toEqual([
      "UI-064",
      "UI-060",
      "UI-033",
      "UI-065",
      "UI-066"
    ]);
  });
  it("retains all13 usage/outcome notifications without claiming a fresh die or full selection chain", () => {
    let retained = 0;
    for (const raw of facts.rawResults) {
      const e = locate(raw.sourceFile, raw.locator);
      expect(e).toBeDefined();
      expect(e.metadata).toHaveProperty(
        "recordedTreatment",
        expect.objectContaining({
          stage: raw.result.IsInjury[0] === "1" ? "initial_injury" : "casualty",
          resourceSpent: Number(raw.result.ApothecaryUsed[0]),
          appliedOutcomeCode: Number(raw.result.Casualty[0]),
          playerStatusCode: Number(raw.result.PlayerStatus[0]),
          subjectId: String(raw.subjectId)
        })
      );
      expect(e).toMatchObject({
        scoringStatus: "excluded",
        probabilitySuccess: null,
        actualSuccess: null,
        delta: 0,
        weightedDelta: 0
      });
      expect(e.metadata.isRollCandidate).toBe(false);
      expect(formatExpectedOutcome(e)).toBe("No new roll");
      retained++;
    }
    expect(retained).toBe(13);
    expect(
      [...reports.values()]
        .flatMap((r) => r.events)
        .filter((e) => e.metadata.apothecary)
    ).toHaveLength(10);
  });
  it.each(["source-2043", "source-3060"])(
    "joins %s to reserves with missing posture and off-pitch flags kept separate from availability",
    (id) => {
      const r = source("demo3.bbr"),
        e = r.events.find((e) => e.metadata.sourceId === id)!;
      expect(e.metadata).toHaveProperty(
        "treatmentAftermath",
        expect.objectContaining({
          observation: {
            cell: { x: -1, y: -1 },
            situationCode: 1,
            statusCode: null,
            canAct: true,
            tackleZone: true
          }
        })
      );
      expect(e.contextualImpact).toBeUndefined();
      expect(e.weightedDelta).toBe(0);
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
    }
  );
  it.each([
    ["demo1.bbr", 38],
    ["demo11.bbr", 7],
    ["demo3.bbr", 13]
  ] as const)(
    "links the exact no-resource initial continuation in %s/%s without naming code1",
    (file, subject) => {
      const raw = facts.rawResults.find(
        (r: { sourceFile: string; subjectId: number }) =>
          r.sourceFile === file && r.subjectId === subject
      )!;
      const e = locate(file, raw.locator),
        selection = e.metadata.apothecary!;
      expect(selection).toMatchObject({
        applied: "injury_original",
        resourceSpent: 0,
        appliedCasualty: 1,
        playerStatus: 4,
        initialRemovalSourceId: expect.any(String),
        treatmentSppSourceId: expect.any(String)
      });
      expect(e.metadata.recordedTreatment).toMatchObject({
        stage: "initial_injury",
        resourceSpent: 0,
        appliedOutcomeCode: 1
      });
      expect(e.metadata.injuryObservation).toBeUndefined();
      const spp = source(file).events.find(
        (e) => e.metadata.sourceId === selection.treatmentSppSourceId
      )!;
      expect(spp.metadata.treatmentSpp).toEqual({
        points: 2,
        treatmentSourceId: e.metadata.sourceId,
        originalSourceId: selection.originalSourceId
      });
      expect(spp).toMatchObject({
        scoringStatus: "excluded",
        probabilitySuccess: null,
        actualSuccess: null,
        weightedDelta: 0,
        type: "unknown"
      });
      if (raw.tailSteps.length)
        expect(e.metadata.treatmentAftermath).toBeUndefined();
      else
        expect(e.metadata.treatmentAftermath?.observation).toEqual({
          cell: { x: -1, y: -1 },
          situationCode: 4,
          statusCode: 4,
          canAct: null,
          tackleZone: null
        });
    }
  );
  it("joins each admitted first aftermath and each omitted flag to the raw first board", () => {
    let count = 0,
      unknown = 0;
    for (const raw of facts.rawResults) {
      const e = locate(raw.sourceFile, raw.locator),
        after = e.metadata.treatmentAftermath;
      if (raw.tailSteps.length) {
        expect(after).toBeUndefined();
        continue;
      }
      expect(after, raw.sourceFile + JSON.stringify(raw.locator)).toBeDefined();
      const fields = raw.after.subjects[0].fields;
      expect(after!.observation).toEqual({
        cell: { x: fields["Cell/X"], y: fields["Cell/Y"] },
        situationCode: fields.Situation,
        statusCode: fields.Status,
        canAct: fields.CanAct === null ? null : fields.CanAct === 1,
        tackleZone: fields.TackleZone === null ? null : fields.TackleZone === 1
      });
      expect(after!.recordedFlags).toEqual({
        status: fields.Status !== null,
        canAct: fields.CanAct !== null,
        tackleZone: fields.TackleZone !== null
      });
      expect(after!.observedActiveGamerId).toBe(raw.after.activeGamer);
      if (raw.after.activeGamer === null) unknown++;
      count++;
    }
    expect(count).toBe(12);
    expect(unknown).toBe(5);
  });
});
