import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import {
  formatActualOutcome,
  formatExpectedOutcome,
  explainTreatmentReturn,
  explainRegenerationReturn
} from "@/domain/nufflizer/presentation";
import { treatmentReturnXml } from "../helpers/treatmentReturn";
import { regenerationReturnXml } from "../helpers/regenerationReturn";
const kinds = [
  [3, "blitz", "Blitz"],
  [4, "pass", "Pass"],
  [5, "handoff", "Hand-off"],
  [6, "foul", "Foul"]
] as const;
const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-action-budgets.json", "utf8")
);
const analyze = (xml: string) =>
  LuckReportSchema.parse(analyzeReplayLuck(parseReplayXml(xml)));
describe("source-qualified activation budget declarations after a return", () => {
  it("reproduces the complete raw census and four separately hashed paired declarations", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-action-budget-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stderr).toBe(0);
    expect(facts.files).toHaveLength(12);
    expect(
      facts.files.flatMap(
        (f: { budgetDeclarations: unknown[] }) => f.budgetDeclarations
      )
    ).toHaveLength(342);
    for (const f of facts.files)
      expect(
        createHash("sha256")
          .update(readFileSync(`demo-replays/${f.file}`))
          .digest("hex")
      ).toBe(f.sha256);
    expect(
      facts.pairedWitnesses.map(
        (w: { witness: { code: number } }) => w.witness.code
      )
    ).toEqual([3, 4, 5, 6]);
    for (const w of facts.pairedWitnesses) {
      expect(w.records.length).toBeGreaterThan(0);
      expect(
        createHash("sha256")
          .update(readFileSync(`tests/fixtures/evidence/${w.witness.fixture}`))
          .digest("hex")
      ).toBe(w.fixtureSha256);
    }
    expect(facts.treatmentAnchor.declaration).toMatchObject({
      step: {
        PlayerId: ["37"],
        CellFrom: [{ X: ["13"], Y: ["7"] }],
        CellTo: [{ X: ["13"], Y: ["8"] }]
      },
      message: { Action: ["4"], TeamId: ["0"] }
    });
  });
  it("retains demo1's Pass budget as owned participation before Throw Team-mate execution", () => {
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo1.bbr", "utf8")
    );
    const origin = r.events.find((e) => e.metadata.sourceId === "source-5188")!;
    expect(origin.metadata.treatmentReturn).toMatchObject({
      status: "observed",
      activation: {
        sourceId: "source-5397",
        stepSourceIndex: 5396,
        actionCode: 4,
        budget: {
          kind: "pass",
          actionCode: 4,
          headerState: 3,
          headerTargetId: -1,
          headerCellFrom: { x: 13, y: 7 },
          headerCellTo: { x: 13, y: 8 }
        }
      }
    });
    expect(origin.metadata.treatmentReturn).not.toHaveProperty("stop");
    const marker = r.events.find((e) => e.metadata.sourceId === "source-5397")!;
    expect(marker).toMatchObject({
      playerId: "37",
      teamId: "1",
      type: "unknown",
      scoringStatus: "excluded",
      probabilitySuccess: null,
      actualSuccess: null,
      delta: 0,
      weightedDelta: 0,
      metadata: {
        isRollCandidate: false,
        actionCode: 4,
        ownership: {
          role: "actor",
          playerId: "37",
          teamId: "1",
          checkpointAfter: 4887
        }
      }
    });
    expect(formatExpectedOutcome(marker)).toBe("No new roll");
    expect(formatActualOutcome(marker)).toBe(
      "Recorded Pass budget declaration"
    );
    expect(explainTreatmentReturn(marker)).toContain("Pass budget");
    expect(marker.metadata.treatmentReturnActivation!.before.cell).toEqual({
      x: 13,
      y: 7
    });
    expect(marker.metadata.teamRerollMovement).toBeUndefined();
    expect(marker.contextualImpact).toBeUndefined();
    expect(
      r.events.find((e) => e.metadata.sourceId === "source-5400")!.metadata
        .throwTeamMate
    ).toMatchObject({ throwerId: "37", thrownMateId: "50" });
    expect(r.rerollResources.linkedCount).toBe(21);
  });
  it.each(kinds)(
    "keeps treatment action%s/%s as a declaration rather than execution",
    (action, kind, label) => {
      const r = analyze(treatmentReturnXml({ action })),
        origin = r.events.find((e) => e.metadata.treatmentReturn)!;
      expect(origin.metadata.treatmentReturn).toMatchObject({
        status: "observed",
        activation: {
          actionCode: action,
          budget: {
            actionCode: action,
            kind,
            headerCellFrom: { x: 4, y: 5 },
            headerCellTo: { x: 4, y: 5 }
          }
        }
      });
      const marker = r.events.find(
        (e) => e.metadata.treatmentReturnActivation
      )!;
      expect(marker).toBeDefined();
      expect(marker.metadata.isRollCandidate).toBe(false);
      expect(marker.weightedDelta).toBe(0);
      expect(formatActualOutcome(marker)).toBe(
        `Recorded ${label} budget declaration`
      );
    }
  );
  it.each(kinds)(
    "keeps recovery action%s/%s separate from recovery dice",
    (action, kind, label) => {
      const r = analyze(regenerationReturnXml({ action })),
        origin = r.events.find((e) => e.metadata.regenerationReturn)!;
      expect(origin.metadata.regenerationReturn).toMatchObject({
        status: "observed",
        activation: { actionCode: action, budget: { actionCode: action, kind } }
      });
      const marker = r.events.find((e) => e.metadata.recoveryReturnActivation)!;
      expect(marker).toBeDefined();
      expect(marker.metadata.isRollCandidate).toBe(false);
      expect(marker.weightedDelta).toBe(0);
      expect(formatExpectedOutcome(marker)).toBe("No new roll");
      expect(formatActualOutcome(marker)).toBe(
        `Recorded ${label} budget declaration`
      );
      expect(explainRegenerationReturn(marker)).toContain(`${label} budget`);
    }
  );
});
