import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { estimateNumericImpact } from "@/domain/nufflizer/contextImpact";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { contextReplayXml } from "../helpers/contextReplay";

describe("bounded pre-roll context (NUF-016–019)", () => {
  it("distinguishes a failed dodge with two useful moves left from the last move of the period", () => {
    const early = analyzeNufflizerInput(contextReplayXml());
    const late = analyzeNufflizerInput(
      contextReplayXml({ remainingTeammates: 0 })
    );
    const dodge = (r: typeof early) =>
      r.events.find((e) => e.type === "dodge" && e.scoringStatus === "scored")!;
    expect(dodge(early).probabilitySuccess).toBeCloseTo(5 / 6, 12);
    expect(dodge(early).metadata.preRoll).toMatchObject({
      teamTurn: 1,
      period: "first_half",
      turnsRemaining: 7,
      otherUsefulActivations: 2
    });
    expect(dodge(early).contextualImpact!.contribution).toBeCloseTo(-5 / 3, 12);
    expect(dodge(late).metadata.preRoll).toMatchObject({
      teamTurn: 8,
      turnsRemaining: 0,
      otherUsefulActivations: 0
    });
    expect(Math.abs(dodge(late).contextualImpact!.contribution)).toBe(0);
    expect(early.teams.find((t) => t.teamId === "0")!.impactScore).toBeCloseTo(
      -5 / 3,
      12
    );
    expect(early.verdict.luckierTeam).toBe("unknown");
  });
  it("updates movement before pickup and values a marked bounce risk separately", () => {
    const safe = analyzeNufflizerInput(contextReplayXml({ type: 4 }));
    const exposed = analyzeNufflizerInput(
      contextReplayXml({ type: 4, exposed: true })
    );
    const pickup = (r: typeof safe) =>
      r.events.find(
        (e) => e.type === "ball_handling" && e.scoringStatus === "scored"
      )!;
    expect(pickup(safe).metadata.preRoll).toMatchObject({
      actorCell: { x: 9, y: 7 },
      pickupBounceExposure: 0
    });
    expect(pickup(exposed).contextualImpact).toMatchObject({
      components: { availableMoves: 2, possession: 2, markedBounce: 3 / 8 },
      difference: 35 / 8
    });
    expect(pickup(exposed).contextualImpact!.contribution).toBeCloseTo(
      -(5 / 6) * (35 / 8),
      12
    );
    expect(pickup(exposed).contextualImpact!.contribution).toBeLessThan(
      pickup(safe).contextualImpact!.contribution
    );
  });
  it.each([{ omittedAvailability: true }, { interruption: true }])(
    "uses dice only when pre-roll evidence is incomplete: %j",
    (options) => {
      const r = analyzeNufflizerInput(contextReplayXml(options));
      expect(r.events.find((e) => e.type === "dodge")).toMatchObject({
        scoringStatus: "scored"
      });
      expect(r.events.every((e) => e.contextualImpact === undefined)).toBe(
        true
      );
    }
  );
  it("does not use future state, clock markup, or a duplicate kept result in context totals", () => {
    const base = analyzeNufflizerInput(contextReplayXml());
    const perturbed = analyzeNufflizerInput(
      contextReplayXml({
        futureCheckpoint: true,
        insertClock: true,
        duplicateSummary: true
      })
    );
    expect(perturbed.events.filter((e) => e.contextualImpact)).toHaveLength(1);
    expect(perturbed.teams[0].impactScore).toBe(base.teams[0].impactScore);
    expect(perturbed.events[0]!.metadata.preRoll?.teamTurn).toBe(1);
  });
  it("has zero mean across all six faces under a fixed policy and rejects tampered totals", () => {
    const r = analyzeNufflizerInput(contextReplayXml());
    const e = r.events.find((e) => e.contextualImpact)!;
    const contributions = [1, 2, 3, 4, 5, 6].map(
      (face) =>
        estimateNumericImpact(
          e.metadata.preRoll,
          2,
          "declined_team_reroll",
          Number(face >= 2) - 5 / 6
        )!.contribution
    );
    expect(contributions.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
    r.teams[0].impactScore++;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
