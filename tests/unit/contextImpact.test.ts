import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { estimateNumericImpact } from "@/domain/nufflizer/contextImpact";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { explainPreRollEvidence } from "@/domain/nufflizer/presentation";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
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
  it.each(["verified_roll", "contradictory_roll", "wrong_actor"] as const)(
    "uses pre-roll pickup geometry only after reconciling the preceding move (%s)",
    (movementEvidence) => {
      const report = analyzeNufflizerInput(
        contextReplayXml({ type: 4, exposed: true, movementEvidence })
      );
      const pickup = report.events.find(
        (e) => e.type === "ball_handling" && e.scoringStatus === "scored"
      )!;
      expect(pickup.probabilitySuccess).toBeCloseTo(5 / 6, 12);
      if (movementEvidence === "verified_roll") {
        expect(pickup.contextualImpact!.contribution).toBeCloseTo(
          -(5 / 6) * (35 / 8),
          12
        );
      } else {
        expect(pickup.contextualImpact).toBeUndefined();
      }
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

describe("held-out public replay context (NUF-016/017/022)", () => {
  function demo(name: string) {
    return parseReplayXml(
      decodeReplayInput(readFileSync(`demo-replays/${name}`, "utf8")).xml
    );
  }

  it("retains the declared activation and movement through a corroborated stand-up", () => {
    // Independent stdlib decode: 143/3 player38 is prone at [13,5] with
    // CanAct1 and 3 points. At 144/1 steps 0–2 he declares Move, stands,
    // and dodges to [14,4]. The 144/3 checkpoint shows 2 points left.
    const replay = demo("demo1.bbr");
    const dodge = (report: ReturnType<typeof analyzeReplayLuck>) =>
      report.events.find(
        (event) =>
          event.metadata.locator?.replayStep === 144 && event.type === "dodge"
      )!;
    const report = analyzeReplayLuck(replay);
    const pre = dodge(report).metadata.preRoll;
    expect(pre).toMatchObject({
      checkpointReplayStep: 143,
      teamTurn: 3,
      activeTeamId: "1",
      actorCell: { x: 13, y: 5 },
      actorMovementRemaining: 3,
      movementCheckLinked: true,
      otherUsefulActivations: null
    });
    expect(explainPreRollEvidence(pre)).toContain(
      "stood up earlier in this activation"
    );
    expect(dodge(report).contextualImpact).toBeUndefined();
    const turn = replay.turns.find((turn) =>
      turn.events.some(
        (event) => event.sourceIndex === pre!.actorStandUpSourceIndex
      )
    )!;
    const stand = turn.events.findIndex(
      (event) => event.sourceIndex === pre!.actorStandUpSourceIndex
    );
    expect(turn.events[stand]).toMatchObject({
      sourceTag: "ResultNoRollSuccess",
      locator: { replayStep: 144, childIndex: 1, stepIndex: 1, messageIndex: 0 }
    });
    turn.events.splice(stand, 1);
    expect(dodge(analyzeReplayLuck(replay)).metadata.preRoll).toBeUndefined();
  });

  it("explains movement toward a held ball using only the board before the dodge", () => {
    // Independent stdlib decode: 412/3 is the active side's turn11 in
    // period1 with player42 holding the ball at [15,6]. At 413/1 step1
    // player45 moves to [13,6] on Dodge3+ die5. Step2 attempts [14,7].
    const replay = demo("demo6.bbr");
    const dodges = (report: ReturnType<typeof analyzeReplayLuck>) =>
      report.events.filter(
        (event) =>
          event.metadata.locator?.replayStep === 413 && event.type === "dodge"
      );
    const report = analyzeReplayLuck(replay);
    const [first, second] = dodges(report);
    expect(first!.metadata.preRoll?.teammateCarrierMove).toBeUndefined();
    const pre = second!.metadata.preRoll;
    expect(pre).toMatchObject({
      checkpointReplayStep: 412,
      teamTurn: 11,
      turnsRemaining: 5,
      actorCell: { x: 13, y: 6 },
      actorCarriesBall: false,
      teammateCarrierMove: {
        carrierCell: { x: 15, y: 6 },
        destination: { x: 14, y: 7 },
        effect: "approach"
      }
    });
    expect(explainPreRollEvidence(pre)).toContain("next to their ball carrier");
    expect(second!.contextualImpact).toBeUndefined();
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    const next = replay.boardCheckpoints!.find(
      (checkpoint) => checkpoint.replayStep === 413
    )!;
    next.board!.ball.possession = "unknown";
    expect(dodges(analyzeReplayLuck(replay))[1]!.metadata.preRoll).toEqual(pre);
  });

  it("keeps a winning turn-16 touchdown with no dice out of luck totals", () => {
    // Independent stdlib decode: 535/3 is a 1–1 board with player12
    // carrying at [21,13]. 536/1 contains four ordinary moves and no
    // dice. 536/2 records the touchdown. 536/12 records the 2–1 board.
    const replay = demo("demo-goblins1.bbr");
    const before = replay.boardCheckpoints!.find((c) => c.replayStep === 535)!;
    const after = replay.boardCheckpoints!.find((c) => c.replayStep === 536)!;
    expect(
      before.board?.teams.map((team) => [team.gameTurn, team.touchdowns])
    ).toEqual([
      [16, 1],
      [15, 1]
    ]);
    expect(before.board?.ball).toMatchObject({
      possession: "held",
      carrierId: 12,
      cell: { x: 21, y: 13 }
    });
    expect(after.board?.teams.map((team) => team.touchdowns)).toEqual([2, 1]);
    expect(
      replay.turns
        .flatMap((turn) => turn.events)
        .find(
          (event) =>
            event.sourceTag === "EventTouchdown" &&
            event.locator?.replayStep === 536
        )
    ).toMatchObject({
      locator: { childIndex: 2 },
      payload: { PlayerId: "12" }
    });
    const sameStep = analyzeReplayLuck(replay).events.filter(
      (event) => event.metadata.locator?.replayStep === 536
    );
    // The drive boundary subsequently emits two independent KO checks.
    expect(
      sameStep.map((event) => [
        event.metadata.locator?.childIndex,
        event.metadata.rollType
      ])
    ).toEqual([
      [4, 13],
      [5, 13]
    ]);
  });
});
