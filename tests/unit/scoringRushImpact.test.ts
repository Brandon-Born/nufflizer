import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { scoringRushXml } from "../helpers/scoringRush";
import { contextReplayXml } from "../helpers/contextReplay";

describe("legal scoring Rush successors and regulation score pressure", () => {
  it.each([32, 64] as const)(
    "values a late tied-score failure from the same pre-roll profile (side%s)",
    (side) => {
      const r = analyzeNufflizerInput(scoringRushXml({ side })),
        e = r.events.find((e) => e.metadata.rollType === 1)!;
      expect(e.scoringStatus).toBe("scored");
      expect(e.probabilitySuccess).toBe(5 / 6);
      expect(e.contextualImpact).toMatchObject({
        policy: "ordinary_no_retry_scoring_rush",
        difference: 12,
        components: { touchdown: 4, scorePressure: 8 }
      });
      expect(e.contextualImpact!.contribution).toBeCloseTo(-10, 12);
      expect(r.teams[0]!.impactScore).toBeCloseTo(-10, 12);
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
    }
  );
  it("matches early/late failures and an independent low-stakes Dodge without changing dice odds", () => {
    const event = (o: Parameters<typeof scoringRushXml>[0]) =>
      analyzeNufflizerInput(scoringRushXml(o)).events.find(
        (e) => e.metadata.rollType === 1
      )!;
    const early = event({ early: true }),
      late = event({}),
      low = analyzeNufflizerInput(contextReplayXml()).events.find(
        (e) => e.type === "dodge"
      )!;
    expect(early.probabilitySuccess).toBe(late.probabilitySuccess);
    expect(early.contextualImpact!.difference).toBe(17 / 4);
    expect(early.contextualImpact!.contribution).toBeCloseTo(-85 / 24, 12);
    expect(late.contextualImpact!.contribution).toBeLessThan(
      early.contextualImpact!.contribution
    );
    expect(late.contextualImpact!.contribution).toBeLessThan(
      low.contextualImpact!.contribution
    );
  });
  it("admits all six faces from one pre-roll state and has exact zero mean", () => {
    let sum = 0;
    for (let face = 1; face <= 6; face++) {
      const r = analyzeNufflizerInput(scoringRushXml({ face })),
        e = r.events.find((e) => e.metadata.rollType === 1)!;
      expect(e.contextualImpact).toBeDefined();
      expect(e.contextualImpact!.contribution).toBeCloseTo(
        (Number(face >= 2) - 5 / 6) * 12,
        12
      );
      sum += e.contextualImpact!.contribution;
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
    }
    expect(sum).toBeCloseTo(0, 12);
  });
  it.each([
    "RerollNumber",
    "Touchdown",
    "GameTurn",
    "Period",
    "Status",
    "Situation",
    "MovePoint"
  ])(
    "keeps omitted%s unknown instead of inventing scoring state",
    (unknown) => {
      const r = analyzeNufflizerInput(scoringRushXml({ unknown }));
      expect(r.events.every((e) => e.contextualImpact === undefined)).toBe(
        true
      );
    }
  );
  it.each([
    { teamRerolls: 1 },
    { actorSkills: [50] },
    { opponentNear: true },
    { otherScorer: true },
    { opponentScorer: true }
  ])(
    "withholds an unresolved resource, extra check or failure-scoring branch: %j",
    (o) => {
      const r = analyzeNufflizerInput(scoringRushXml(o));
      expect(r.events.every((e) => e.contextualImpact === undefined)).toBe(
        true
      );
    }
  );
  it("uses score pressure rather than a universal late multiplier", () => {
    const r = analyzeNufflizerInput(
      scoringRushXml({ ownScore: 2, opponentScore: 0 })
    );
    const e = r.events.find((e) => e.metadata.rollType === 1)!;
    expect(e.contextualImpact!.difference).toBe(4);
    expect(e.contextualImpact!.contribution).toBeCloseTo(-10 / 3, 12);
  });
  it("does not borrow a future match result or checkpoint", () => {
    const first = analyzeNufflizerInput(scoringRushXml()),
      next = analyzeNufflizerInput(scoringRushXml({ future: true }));
    expect(
      first.events.find((e) => e.metadata.rollType === 1)!.contextualImpact
    ).toBeDefined();
    expect(
      next.events.find((e) => e.metadata.rollType === 1)!.contextualImpact
    ).toEqual(
      first.events.find((e) => e.metadata.rollType === 1)!.contextualImpact
    );
  });
});
