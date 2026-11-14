import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { scoringRushXml } from "../helpers/scoringRush";
import references from "../fixtures/evidence/scoring-pressure-arithmetic.json";

const fraction = (s: string) => {
  const [n, d = "1"] = s.split("/");
  return Number(n) / Number(d);
};
const roll = (r: ReturnType<typeof analyzeNufflizerInput>) =>
  r.events.filter((e) => e.metadata.rollType === 1).at(-1)!;

describe("scoring-state policy, source integrity and exact arithmetic", () => {
  it.each([32, 64] as const)(
    "joins the owned second roster slot without changing team identity or side%s odds",
    (side) => {
      for (let face = 1; face <= 6; face++) {
        const r = analyzeNufflizerInput(
          scoringRushXml({ side, ownRoster: 1, face })
        );
        const e = roll(r);
        expect(e.metadata.preRoll!.scoringRushState!.ownRoster).toBe(1);
        expect(e.teamId).toBe("0");
        expect(e.contextualImpact!.contribution).toBeCloseTo(
          (Number(face >= 2) - 5 / 6) * 12,
          12
        );
        expect(LuckReportSchema.safeParse(r).success).toBe(true);
      }
    }
  );
  it.each([
    { ownTurn: 15, opponentTurn: 16 },
    { ownTurn: 16, opponentTurn: 14 },
    { ownTurn: 17, opponentTurn: 16 },
    { ownTurn: 8, opponentTurn: 8 }
  ])("withholds inconsistent regulation clocks: %j", (o) => {
    expect(
      roll(analyzeNufflizerInput(scoringRushXml(o))).contextualImpact
    ).toBeUndefined();
  });
  it("requires explicitly empty global effects independently of team and player effects", () => {
    const xml = scoringRushXml().replaceAll(
      "<ActivePlayer>10</ActivePlayer><Effects/>",
      "<ActivePlayer>10</ActivePlayer>"
    );
    expect(roll(analyzeNufflizerInput(xml)).contextualImpact).toBeUndefined();
  });
  it.each([
    { stepSkill: 50 },
    { evaluation: 1 },
    { headerExtra: "<Teleport>1</Teleport>" },
    { repeatDeclaration: true }
  ])("withholds unsupported move headers or a repeated activation: %j", (o) => {
    const r = analyzeNufflizerInput(scoringRushXml(o));
    expect(roll(r).contextualImpact).toBeUndefined();
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
  });
  it("keeps second-Rush admission independent of the current result", () => {
    for (const side of [32, 64] as const) {
      let sum = 0;
      for (let face = 1; face <= 6; face++) {
        const r = analyzeNufflizerInput(
          scoringRushXml({ side, priorRushes: 1, face })
        );
        const e = roll(r);
        expect(e.contextualImpact).toBeDefined();
        sum += e.contextualImpact!.contribution;
      }
      expect(sum).toBeCloseTo(0, 12);
    }
  });
  it("withholds a contradictory observed posture instead of granting a scoring successor", () => {
    const xml = scoringRushXml().replaceAll(
      "<Id>11</Id><Cell><X>5</X><Y>3</Y></Cell><Status>0</Status>",
      "<Id>11</Id><Cell><X>5</X><Y>3</Y></Cell><Status>1</Status>"
    );
    expect(roll(analyzeNufflizerInput(xml)).contextualImpact).toBeUndefined();
  });
  it.each([32, 64] as const)(
    "retains one observed prior Rush without resetting the two-Rush budget across a checkpoint (side%s)",
    (side) => {
      const r = analyzeNufflizerInput(scoringRushXml({ side, priorRushes: 1 })),
        e = roll(r);
      expect(e.metadata.preRoll!.scoringRushState!.priorRushes).toHaveLength(1);
      expect(e.contextualImpact!.contribution).toBe(-10);
      const tooMany = analyzeNufflizerInput(
        scoringRushXml({ side, priorRushes: 2 })
      );
      expect(roll(tooMany).contextualImpact).toBeUndefined();
    }
  );
  it("matches 756 full-pipeline score/clock/face/side cases with zero mean in every stratum", () => {
    let checked = 0;
    for (const c of references.cases)
      for (const side of [32, 64] as const) {
        let sum = 0;
        for (let face = 1; face <= 6; face++) {
          const r = analyzeNufflizerInput(
            scoringRushXml({ ...c, period: c.period as 0 | 1, side, face })
          );
          const e = roll(r),
            impact = e.contextualImpact!;
          expect(impact).toBeDefined();
          expect(impact.policy).toBe("ordinary_no_retry_scoring_rush");
          expect(impact.difference).toBeCloseTo(fraction(c.difference), 12);
          expect(impact.contribution).toBeCloseTo(
            fraction(c.contributions[face - 1]!),
            12
          );
          expect(r.contextComponents[0]!.bounds).toEqual({
            lower: impact.contribution,
            upper: impact.contribution
          });
          expect(r.teams[0]!.impactByType.movement_risk).toBe(
            impact.contribution
          );
          sum += impact.contribution;
          checked++;
        }
        expect(sum).toBeCloseTo(0, 12);
      }
    expect(checked).toBe(756);
  }, 30000);
  it("regenerates exact references without application imports", () => {
    const p = spawnSync(
      "python3",
      ["scripts/scoring-pressure-reference.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stdout + p.stderr).toBe(0);
  });
  it("does not declare an omitted previously known player absent", () => {
    const r = analyzeNufflizerInput(scoringRushXml({ omitCurrentPlayer: 11 }));
    expect(roll(r).scoringStatus).toBe("scored");
    expect(roll(r).metadata.preRoll?.scoringRushState).toBeUndefined();
    expect(roll(r).contextualImpact).toBeUndefined();
  });
  it.each([
    "Effects",
    "ActivePrayers",
    "TransformedPlayers",
    "InnateSkills",
    "AcquiredSkills",
    "TackleZone"
  ])("keeps omitted %s unknown", (unknown) => {
    expect(
      roll(analyzeNufflizerInput(scoringRushXml({ unknown }))).contextualImpact
    ).toBeUndefined();
  });
  it("does not charge the observed touchdown a second time", () => {
    const base = analyzeNufflizerInput(scoringRushXml({ face: 2 }));
    const after = analyzeNufflizerInput(
      scoringRushXml({ face: 2, aftermath: true })
    );
    expect(roll(after).metadata.movementTouchdown).toBeDefined();
    expect(roll(after).contextualImpact).toEqual(roll(base).contextualImpact);
    expect(after.events.filter((e) => e.contextualImpact)).toHaveLength(1);
    expect(after.teams[0]!.impactScore).toBe(base.teams[0]!.impactScore);
  });
  it.each([
    "score",
    "clock",
    "budget",
    "skill",
    "roster",
    "header",
    "declaration",
    "source",
    "policy",
    "state",
    "delta",
    "category",
    "total"
  ])("rejects a scoring component %s forgery", (kind) => {
    const r = analyzeNufflizerInput(scoringRushXml());
    const e = roll(r),
      s = e.metadata.preRoll!.scoringRushState!,
      impact = e.contextualImpact!;
    if (kind === "score") s.frame.teams[0].score = 2;
    if (kind === "clock") s.frame.teams[1].turn = 15;
    if (kind === "budget") s.frame.teams[0].rerolls = 1;
    if (kind === "skill")
      s.frame.teams[0].players[0]!.traits.innateSkills = [50];
    if (kind === "roster") s.frame.teams[0].players.pop();
    if (kind === "header") s.step.sourceIndex++;
    if (kind === "declaration") s.declarationSourceId = e.metadata.sourceId!;
    if (kind === "source") s.source.childIndex = 999;
    if (kind === "policy") e.metadata.probabilityPolicy = "two_attempt";
    if (kind === "state" && impact.policy === "ordinary_no_retry_scoring_rush")
      impact.successors.failure.ballCarrierId = 10 as unknown as null;
    if (kind === "delta") impact.contribution = 0;
    if (kind === "category") e.type = "dodge";
    if (kind === "total") r.teams[0]!.impactByType.movement_risk = 0;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
