import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import {
  computeProbabilityForEvent,
  resolveActualSuccess
} from "@/domain/nufflizer/probability";
import { linkTeamRerolls } from "@/domain/nufflizer/rerolls";
import {
  annotateTurnAttribution,
  buildPlayerOwnershipIndex
} from "@/domain/replay/attribution";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { model, rollEvent, envelope } from "../helpers/replay";

describe("NUF-007/012/013/014/015/019 evidence regressions", () => {
  it("refuses unsupported multi-die numeric check contracts", () => {
    expect(() =>
      computeProbabilityForEvent({
        eventType: "ball_handling",
        dice: [2, 2],
        dieTypes: [0, 0],
        difficulty: 4,
        rerollAvailable: false
      })
    ).toThrow(/exactly one D6/);
    expect(
      resolveActualSuccess(undefined, [2, 2], 4, "ball_handling").deterministic
    ).toBe(false);
    expect(
      resolveActualSuccess(1, [2, 2], 4, "ball_handling").deterministic
    ).toBe(false);
    expect(resolveActualSuccess(55, [6], 2).deterministic).toBe(false);
  });
  it("independently enumerates every 2D6 threshold", () => {
    const totals = Array.from(
      { length: 36 },
      (_, i) => Math.floor(i / 6) + 1 + (i % 6) + 1
    );
    for (let target = 2; target <= 12; target++)
      expect(
        computeProbabilityForEvent({
          eventType: "injury",
          dice: [1, 1],
          dieTypes: [0, 0],
          difficulty: target,
          rerollAvailable: false
        }).baseOdds
      ).toBe(totals.filter((n) => n >= target).length / 36);
  });
  it.each([[0], [7], [1.5], [Infinity], [1e9], Array(20).fill(1)])(
    "rejects invalid D6 faces/counts %s",
    (...args) => {
      const dice = args as number[];
      expect(() =>
        computeProbabilityForEvent({
          eventType: "ball_handling",
          dice,
          dieTypes: dice.map(() => 0),
          difficulty: 2,
          rerollAvailable: false
        })
      ).toThrow();
    }
  );
  it("distinguishes D6 type zero from missing or unknown metadata", () => {
    const input = {
      eventType: "ball_handling" as const,
      dice: [6],
      difficulty: 2,
      rerollAvailable: false
    };
    expect(
      computeProbabilityForEvent({ ...input, dieTypes: [0] }).baseOdds
    ).toBe(5 / 6);
    expect(() =>
      computeProbabilityForEvent({ ...input, dieTypes: [] })
    ).toThrow();
    expect(() =>
      computeProbabilityForEvent({ ...input, dieTypes: [999] })
    ).toThrow();
  });
  it("does not hide unknown or unattributed random outcomes", () => {
    const events = [
      rollEvent(),
      ...Array.from({ length: 100 }, () => rollEvent({ rollType: 999 })),
      rollEvent({ actorTeamId: undefined })
    ];
    const report = analyzeReplayLuck(model(events));
    expect(report.coverage.rollCandidates.scoredCount).toBe(1);
    expect(report.coverage.rollCandidates.excludedCount).toBe(101);
    expect(report.events).toHaveLength(102);
    expect(report.events.some((e) => e.teamId === "unresolved")).toBe(true);
    expect(report.verdict).toMatchObject({
      status: "partial_analysis",
      luckierTeam: "unknown"
    });
  });
  it("abstains when there is no scored evidence", () =>
    expect(analyzeNufflizerInput(envelope()).verdict).toMatchObject({
      status: "insufficient_evidence",
      luckierTeam: "unknown"
    }));
  it("retains actual block/injury outcomes in the denominator and never awards own damage", () => {
    const report = analyzeReplayLuck(
      model([
        rollEvent({ sourceTag: "ResultBlockRoll", rollType: 3 }),
        rollEvent({ sourceTag: "ResultInjuryRoll", rollType: 11 }),
        rollEvent({ rollType: 10 })
      ])
    );
    expect(report.coverage.rollCandidates).toMatchObject({
      scoredCount: 0,
      excludedCount: 3
    });
    expect(report.teams[0].luckScore).toBe(0);
    expect(
      report.events.every(
        (e) => e.scoringStatus === "excluded" && e.probabilitySuccess === null
      )
    ).toBe(true);
  });
  it("sums independent contributions without average dilution", () => {
    const once = analyzeReplayLuck(model([rollEvent()]));
    const ten = analyzeReplayLuck(
      model(Array.from({ length: 10 }, () => rollEvent()))
    );
    expect(ten.teams[0].luckScore).toBeCloseTo(
      10 * once.teams[0].luckScore,
      12
    );
    expect(
      Object.values(ten.teams[0].categoryScores).reduce((a, b) => a + b, 0)
    ).toBeCloseTo(ten.teams[0].luckScore, 12);
    expect(ten.events.reduce((n, e) => n + e.weightedDelta, 0)).toBeCloseTo(
      ten.teams[0].luckScore,
      12
    );
  });
  it("uses unnamed roster ownership and discloses explicit conflicts", () => {
    const ownership = buildPlayerOwnershipIndex({
      playerOwnershipKeys: ["0:42"]
    });
    expect(ownership.playerToTeam.get("42")).toBe("0");
    const turn = model([rollEvent({ actorTeamId: "1" })]).turns[0]!;
    expect(
      annotateTurnAttribution(turn, ownership).events[0]?.attributionConflict
    ).toBe(true);
    const overlap = buildPlayerOwnershipIndex({
      playerOwnershipKeys: ["0:42", "1:42"]
    });
    expect(overlap.ambiguousPlayerIds.has("42")).toBe(true);
    expect(overlap.playerToTeam.has("42")).toBe(false);
  });
  it.each([0, 1])(
    "links a recorded team reroll choice %s across sequences without affecting another actor",
    (used) => {
      const base = { playerId: "42", stepType: 1, targetId: "-1" };
      const events = [
        rollEvent({ playerId: "37" }),
        rollEvent({
          ...base,
          sourceTag: "QuestionTeamRerollUsage",
          payload: {
            CanUseTeamReroll: 1,
            RollInfos: {
              Status: 1,
              NewRoll: 1,
              Outcome: 0,
              Difficulty: 2,
              RollType: 7,
              Dice: { Die: { DieType: 0, Value: 1 } }
            }
          }
        }),
        rollEvent({
          ...base,
          sourceTag: "ResultTeamRerollUsage",
          payload: { Used: used }
        }),
        rollEvent({
          ...base,
          payload: { ...rollEvent().payload, Status: used ? 2 : 1 }
        })
      ];
      const links = linkTeamRerolls(events);
      expect(links.has(0)).toBe(false);
      expect(links.get(3)?.rerollAvailable).toBe(Boolean(used));
      const report = analyzeReplayLuck(model(events));
      const last = report.events.at(-1)!;
      expect(last.probabilitySuccess).toBeCloseTo(used ? 35 / 36 : 5 / 6, 12);
    }
  );
});
