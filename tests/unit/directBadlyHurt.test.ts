import { assertIntrinsicInjury } from "../helpers/intrinsicInjuryFacts";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { directInjuryOutcome } from "@/domain/nufflizer/injuryObservation";
import { formatActualOutcome } from "@/domain/nufflizer/presentation";
import { categoricalInjuryXml } from "../helpers/categoricalInjury";

const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-injury-observations.json", "utf8")
);
const enumFacts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-installed-enums.json", "utf8")
);
const witnesses = [
  ["demo-goblins1.bbr", "source-1003", "10", "0", [3, 5]],
  ["demo-goblins1.bbr", "source-2830", "48", "1", [3, 6]],
  ["demo-goblins1.bbr", "source-3083", "46", "1", [6, 3]],
  ["demo10.bbr", "source-1121", "48", "1", [5, 4]],
  ["demo4.bbr", "source-2833", "49", "1", [6, 3]],
  ["demo6.bbr", "source-248", "47", "1", [6, 3]],
  ["demo6.bbr", "source-3956", "45", "1", [5, 4]],
  ["demo8.bbr", "source-2870", "8", "0", [4, 5]]
] as const;
const reports = new Map<string, ReturnType<typeof analyzeNufflizerInput>>();
function source(file: string) {
  if (!reports.has(file))
    reports.set(
      file,
      analyzeNufflizerInput(readFileSync(`demo-replays/${file}`, "utf8"))
    );
  return reports.get(file)!;
}

describe("direct Badly Hurt keeps its injury namespace and initial severity", () => {
  it("reproduces all eight witnesses from raw replay bytes independently", () => {
    const run = spawnSync(
      "python3",
      ["scripts/extract-direct-badly-hurt-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(run.status, run.stderr).toBe(0);
  });
  it("joins the installed gameplay enum to eight existing raw direct records", () => {
    const entry = enumFacts.enums.find(
      (e: { name: string }) => e.name === "EBB3NetGameplayInjuryOutcome"
    );
    expect(
      entry.entries.map((e: { member: string; value: number }) => [
        e.member,
        e.value
      ])
    ).toEqual([
      ["Stunned", 0],
      ["Reserve", 1],
      ["Ko", 2],
      ["BadlyHurt", 3],
      ["Casualty", 4]
    ]);
    expect(
      facts.rawEmissions.filter(
        (e: { tag: string; roll: { Outcome: string[] } }) =>
          e.tag === "ResultInjuryRoll" && e.roll.Outcome[0] === "3"
      )
    ).toHaveLength(8);
    expect(directInjuryOutcome(3)).toBe("badly_hurt");
    expect(directInjuryOutcome(1)).toBeUndefined();
  });
  it.each(witnesses)(
    "labels %s/%s without manufacturing probability or final availability",
    (file, id, player, team, dice) => {
      const report = source(file),
        e = report.events.find((e) => e.metadata.sourceId === id)!;
      const l = e.metadata.locator!;
      const raw = facts.rawEmissions.find(
        (r: {
          sourceFile: string;
          replayStep: number;
          childIndex: number;
          stepIndex: number;
          messageIndex: number;
        }) =>
          r.sourceFile === file &&
          r.replayStep === l.replayStep &&
          r.childIndex === l.childIndex &&
          r.stepIndex === l.stepIndex &&
          r.messageIndex === l.messageIndex
      );
      expect(raw.tag).toBe("ResultInjuryRoll");
      expect(raw.roll.Outcome).toEqual(["3"]);
      expect(raw.step.DamageStep.PlayerId).toEqual([player]);
      expect(
        raw.roll.Dice[0].Die.map((d: { Value: string[] }) => Number(d.Value[0]))
      ).toEqual(dice);
      const qualified =
        (file === "demo6.bbr" && id === "source-248") ||
        (file === "demo10.bbr" && id === "source-1121");
      expect(e).toMatchObject({
        playerId: player,
        teamId: team,
        actualSuccess: null,
        probabilitySuccess: null,
        scoringStatus: qualified ? "scored" : "excluded",
        delta: qualified ? -13 / 18 : 0,
        weightedDelta: qualified ? -13 / 12 : 0
      });
      expect(e.metadata.injuryObservation).toMatchObject({
        outcome: "badly_hurt",
        recordKind: "direct",
        subjectId: player,
        subjectTeamId: team
      });
      expect(formatActualOutcome(e)).toBe("Badly Hurt (recorded)");
      if (id === "source-248")
        expect(e.metadata.injuryScoring?.sppSourceId).toBe("source-247");
      else if (qualified) {
        expect(assertIntrinsicInjury(file, e, report)).toBe(true);
        expect(e.metadata.injuryScoring!.cause.kind).toBe("self_fall");
        expect(e.metadata.injuryScoring!.sppSourceId).toBeUndefined();
      } else expect(e.metadata.injuryScoring).toBeUndefined();
      expect(e.contextualImpact).toBeUndefined();
      expect(LuckReportSchema.safeParse(report).success).toBe(true);
    }
  );
  it("scores all four Stunty total-nine faces in the same removal tier as pending Casualty", () => {
    for (const dice of [
      [3, 6],
      [4, 5],
      [5, 4],
      [6, 3]
    ] as [number, number][]) {
      const r = analyzeNufflizerInput(
        categoricalInjuryXml({ skills: [59], dice, outcome: 3 })
      );
      const e = r.events.find((e) => e.metadata.injuryScoring)!;
      expect(e).toBeDefined();
      expect(e.label).toBe("Injury: Badly Hurt");
      expect(e.delta).toBe(-13 / 18);
      expect(e.weightedDelta).toBe(-13 / 12);
      expect(e.metadata.injuryTable?.counts).toEqual([15, 11, 4, 6]);
      expect(e.metadata.injuryScoring).toMatchObject({
        lessSevereChance: 26 / 36,
        sameSeverityChance: 10 / 36,
        moreSevereChance: 0
      });
      expect(e.actualSuccess).toBeNull();
      expect(e.probabilitySuccess).toBeNull();
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
    }
  });
  it.each([
    "wrong-code",
    "wrong-name",
    "treatment-namespace",
    "unearned-table"
  ])("rejects a %s export forgery", (kind) => {
    const r = structuredClone(source("demo8.bbr"));
    const e = r.events.find((e) => e.metadata.sourceId === "source-2870")!;
    if (kind === "wrong-code") e.metadata.outcomeCode = 1;
    if (kind === "wrong-name")
      e.metadata.injuryObservation!.outcome = "casualty";
    if (kind === "treatment-namespace")
      e.metadata.sourceTag = "QuestionApothecaryCasualtyUsage";
    if (kind === "unearned-table")
      e.metadata.injuryTable = structuredClone(
        r.events.find((e) => e.metadata.injuryTable)!.metadata.injuryTable!
      );
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
