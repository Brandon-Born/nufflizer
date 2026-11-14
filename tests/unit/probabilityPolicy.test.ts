import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { playbackFragment } from "../helpers/playback";
import { model, rollEvent } from "../helpers/replay";

const counters = (id: string) =>
  lonerDriveXml(id, "tests/fixtures/evidence/bb3-reroll-counters.json");
const combined = () =>
  analyzeNufflizerInput(
    lonerDriveXml(
      "combined_team_rush",
      "tests/fixtures/evidence/bb3-combined-movement.json"
    )
  );

describe("applied odds policy is separate from resource eligibility", () => {
  it("keeps an explicitly offered but declined reroll at one-attempt odds", () => {
    const xml = counters("numeric_dodge_declined");
    const raw = parseReplayXml(xml).turns.flatMap((t) => t.events);
    expect(
      raw.find((e) => e.sourceTag === "QuestionTeamRerollUsage")?.payload
        ?.CanUseTeamReroll
    ).toBe(1);
    expect(
      raw.find((e) => e.sourceTag === "ResultTeamRerollUsage")?.payload?.Used
    ).toBe(0);
    const report = analyzeNufflizerInput(xml);
    const dodge = report.events.find(
      (e) => e.type === "dodge" && e.scoringStatus === "scored"
    )!;
    expect(dodge.metadata).toMatchObject({
      probabilityPolicy: "single_attempt",
      rerollUsed: false
    });
    expect(dodge.probabilitySuccess).toBeCloseTo(5 / 6, 12);
    expect(dodge.explainability.inputsSummary).toContain(
      "odds policy one attempt"
    );
    const proof = report.events.find((e) => e.metadata.teamRerollCounter)!
      .metadata.teamRerollCounter!;
    expect(proof).toMatchObject({
      before: { count: 5 },
      after: { count: 5 },
      spent: 0
    });
    expect(JSON.stringify(report)).not.toContain("rerollAvailable");
    expect(JSON.stringify(report)).not.toContain("reroll available no");
  });

  it("keeps compound Rush and fresh Dodge chances distinct with unknown Dodge usage", () => {
    const report = combined();
    const dodge = report.events.find((e) => e.metadata.combinedMovement)!;
    const rush = report.events.find(
      (e) =>
        e.metadata.sourceId === dodge.metadata.combinedMovement!.rushSourceId
    )!;
    expect(rush.metadata).toMatchObject({
      probabilityPolicy: "two_attempt",
      rerollUsed: true,
      rerollResource: "team"
    });
    expect(rush.probabilitySuccess).toBeCloseTo(35 / 36, 12);
    expect(dodge.metadata.probabilityPolicy).toBe("single_attempt");
    expect(dodge.probabilitySuccess).toBeCloseTo(2 / 3, 12);
    expect(dodge.metadata.rerollUsed).toBeUndefined();
    expect(JSON.parse(JSON.stringify(dodge)).metadata).not.toHaveProperty(
      "rerollUsed"
    );
    for (const e of report.events.filter((e) => e.scoringStatus !== "scored"))
      expect(e.metadata.probabilityPolicy).toBeUndefined();
  });

  it("does not default unknown fresh-roll use to false", () => {
    const report = LuckReportSchema.parse(
      analyzeReplayLuck(model([rollEvent({ id: "fresh" })]))
    );
    expect(report.events[0]!.metadata.probabilityPolicy).toBe("single_attempt");
    expect(report.events[0]!.metadata.rerollUsed).toBeUndefined();
    expect(report.events[0]!.probabilitySuccess).toBeCloseTo(5 / 6, 12);
  });

  it("labels linked own-skill compound odds without labeling the merged original", () => {
    const report = LuckReportSchema.parse(
      analyzeReplayLuck(playbackFragment("001", "UI-002", [], [44]))
    );
    const rolls = report.events.filter((e) => e.metadata.rollType === 4);
    expect(rolls[0]!.metadata.probabilityPolicy).toBeUndefined();
    expect(rolls[1]!.metadata).toMatchObject({
      probabilityPolicy: "two_attempt",
      rerollUsed: true,
      rerollResource: "skill",
      rerollSkill: "Sure Hands"
    });
    expect(rolls[1]!.probabilitySuccess).toBeCloseTo(8 / 9, 12);
  });

  it.each(["block_loner3_spent_pass", "block_loner3_spent_fail"])(
    "keeps %s pools conditional on recorded gates",
    (id) => {
      const report = analyzeNufflizerInput(counters(id));
      const pools = report.events.filter(
        (e) => !!e.metadata.block
      );
      expect(pools.length).toBeGreaterThan(0);
      for (const pool of pools) {
        expect(pool.scoringStatus).toBe("excluded");
        expect(pool.metadata.probabilityPolicy).toBeUndefined();
        expect(pool.probabilitySuccess).toBeNull();
        expect(pool.explainability.baseOdds).toBeUndefined();
        expect(pool.metadata.block!.distribution[3]!+pool.metadata.block!.distribution[4]!).toBeCloseTo(5/9,12);
      }
      const gate = report.events.find((e) => e.metadata.lonerGate)!;
      expect(gate.scoringStatus).toBe("excluded");
      expect(gate.metadata.probabilityPolicy).toBeUndefined();
      expect(gate.metadata.teamRerollsSpent).toBe(1);
    }
  );

  it.each([
    "missing",
    "wrong_policy",
    "missing_use",
    "missing_source",
    "wrong_base",
    "obsolete_field",
    "excluded_policy"
  ])("rejects forged %s odds metadata", (kind) => {
    const report = combined();
    const e = report.events.find(
      (e) => e.metadata.probabilityPolicy === "two_attempt"
    )!;
    if (kind === "missing") delete e.metadata.probabilityPolicy;
    if (kind === "wrong_policy")
      e.metadata.probabilityPolicy = "single_attempt";
    if (kind === "missing_use") delete e.metadata.rerollUsed;
    if (kind === "missing_source") {
      delete e.metadata.rerollQuestionId;
      delete e.metadata.rerollOriginalId;
    }
    if (kind === "wrong_base") e.explainability.baseOdds = 1 / 2;
    if (kind === "obsolete_field")
      Object.assign(e.metadata, { rerollAvailable: true });
    if (kind === "excluded_policy")
      report.events.find(
        (e) => e.scoringStatus !== "scored"
      )!.metadata.probabilityPolicy = "single_attempt";
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
});
