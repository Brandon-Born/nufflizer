import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { committedScoringRushImpact } from "@/domain/nufflizer/committedScoringRush";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";

const replay = (name: string) =>
  parseReplayXml(
    decodeReplayInput(readFileSync(`demo-replays/${name}`, "utf8")).xml
  );

const fallAt = (
  report: ReturnType<typeof analyzeReplayLuck>,
  replayStep: number,
  rollType = 1
) =>
  report.events.find(
    (event) =>
      event.metadata.locator?.replayStep === replayStep &&
      event.metadata.rollType === rollType
  )!;

describe("committed replacement on an immediate touchdown Rush", () => {
  const boardAt = (input: ReturnType<typeof replay>, sourceIndex: number) =>
    input.boardCheckpoints!.find((row) => row.afterSourceIndex === sourceIndex)!.board!;

  it("verifies demo1's failed Rush at 0–0 immediately before halftime", () => {
    const input = replay("demo1.bbr");
    const waiting = boardAt(input, 2897);
    expect(waiting.periodCode).toBeNull();
    expect(waiting.teams[0]!.players.find((p) => p.id === 11)?.cell).toEqual({ x: 13, y: null });
    expect(boardAt(input, 2913).periodCode).toBe(1);
    const report = analyzeReplayLuck(input);
    const rush = fallAt(report, 369);
    expect(rush.metadata.preRoll).toMatchObject({
      period: null, activeTeamId: null, checkpointAfter: 2897,
      actorCell: { x: 24, y: 2 }, actorCarriesBall: true
    });
    expect(rush.metadata.preRoll?.actorMovementRemaining).toBeUndefined();
    expect(rush.metadata.scoringAttemptScore).toEqual({ scores: [0, 0], touchdowns: [], checkpointAfter: 2897, ownRoster: 0 });
    const impact = rush.contextualImpact;
    expect(impact?.policy).toBe("committed_team_scoring_rush");
    if (impact?.policy !== "committed_team_scoring_rush") throw new Error("Expected the halftime Rush");
    expect(impact.evidence).toMatchObject({
      periodBasis: "half_boundary_counters", period: 0, teamTurns: [8, 8],
      carryCheckpointAfter: 2877, waitingCheckpointAfter: 2897
    });
    expect(impact.contribution).toBeCloseTo(-190 / 51, 12);
    expect(rush.weightedDelta).toBeCloseTo(-5 / 3, 12);
    expect(rush.metadata.teamRerollsSpent).toBe(1);
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    impact.evidence.carryCheckpointAfter!--;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it.each(["unknown adjacent marker", "extra movement", "missing half transition", "inconsistent half clock"])(
    "withholds the halftime estimate after %s", (change) => {
      const input = replay("demo1.bbr");
      if (change === "unknown adjacent marker") {
        const marker = boardAt(input, 2897).teams[1]!.players.find((p) => p.pitchLocation === "on_pitch")!;
        marker.cell = { x: 23, y: null };
        marker.pitchLocation = "unknown";
      }
      if (change === "extra movement") boardAt(input, 2877).teams[0]!.players.find(p => p.id === 3)!.movementRemaining = 6;
      if (change === "missing half transition") boardAt(input, 2913).periodCode = null;
      if (change === "inconsistent half clock") boardAt(input, 2913).teams[0]!.gameTurn = 9;
      const rush = fallAt(analyzeReplayLuck(input), 369);
      expect(rush.contextualImpact).toBeUndefined();
      expect(rush.weightedDelta).toBeCloseTo(-5 / 3, 12);
    }
  );

  it("uses opening turn counters for demo5's successful committed replacement without filling its raw fields", () => {
    const input = replay("demo5.bbr");
    expect(boardAt(input, 795)).toMatchObject({ periodCode: null, activeTeamIndex: null });
    const report = analyzeReplayLuck(input);
    const rush = report.events.find((event) => event.metadata.sourceId === "source-799")!;
    expect(rush.metadata.preRoll).toMatchObject({ period: null, activeTeamId: null });
    const impact = rush.contextualImpact;
    expect(impact?.policy).toBe("committed_team_scoring_rush");
    if (impact?.policy !== "committed_team_scoring_rush") throw new Error("Expected a committed scoring Rush");
    expect(impact).toMatchObject({
      evidence: {
        scores: [0, 0], touchdowns: [], ownRoster: 0, waitingCheckpointAfter: 795,
        period: 0, periodBasis: "opening_turn_counters", teamTurns: [3, 2]
      },
      successors: { success: { ownScore: 1, opponentScore: 0 }, failure: { ownScore: 0, opponentScore: 0 } }
    });
    expect(impact.contribution).toBeCloseTo(5 / 7, 12);
    expect(rush.delta).toBeCloseTo(-2 / 3, 12);
    expect(rush.metadata.teamRerollsSpent).toBe(1);
    expect(report.verdict.luckierTeam).toBe("unknown");
    // Hold the roll, score and policy fixed. Losing the same touchdown on
    // the last scheduled turn costs more than missing this early attempt.
    const earlyMiss = committedScoringRushImpact(impact.evidence, 10, false);
    const lateMiss = committedScoringRushImpact({
      ...impact.evidence, period: 1, periodBasis: undefined, teamTurns: [16, 16]
    }, 10, false);
    expect(earlyMiss.contribution).toBeCloseTo(-25 / 7, 12);
    expect(lateMiss.contribution).toBe(-10);
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    delete impact.evidence.periodBasis;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it.each(["earlier later-period observation", "clock reversal", "contrary active team"])(
    "requires consistent opening evidence after %s", (change) => {
      const input = replay("demo5.bbr");
      const prior = input.boardCheckpoints!.filter((row) => row.afterSourceIndex < 766).at(-1)!.board!;
      if (change === "earlier later-period observation") prior.periodCode = 1;
      if (change === "clock reversal") prior.teams[1]!.gameTurn = 3;
      if (change === "contrary active team") boardAt(input, 795).activeTeamIndex = 1;
      const rush = analyzeReplayLuck(input).events.find((event) => event.metadata.sourceId === "source-799")!;
      expect(rush.contextualImpact).toBeUndefined();
      if (change === "contrary active team") {
        expect(rush.scoringStatus).toBe("excluded");
        expect(rush.metadata.dice).toEqual([2]);
      } else expect(rush.delta).toBeCloseTo(-2 / 3, 12);
    }
  );

  it("reconstructs the prior score and values only the replacement die", () => {
    const input = replay("demo2.bbr");
    expect(boardAt(input, 0).teams.map((team) => team.touchdowns)).toEqual([0, 0]);
    expect(boardAt(input, 2204).teams[0]!.touchdowns).toBe(1);
    expect(boardAt(input, 3524).teams.map((team) => team.touchdowns)).toEqual([1, null]);
    const report = analyzeReplayLuck(input);
    const rush = fallAt(report, 405);
    const impact = rush.contextualImpact;
    expect(impact?.policy).toBe("committed_team_scoring_rush");
    if (impact?.policy !== "committed_team_scoring_rush") throw new Error("Expected a committed scoring Rush");
    expect(impact).toMatchObject({
      evidence: {
        scores: [1, 0], ownRoster: 1, teamTurns: [11, 12], turnsPerPeriod: 8,
        waitingCheckpointAfter: 3524, origin: { x: 1, y: 7 }, destination: { x: 0, y: 7 },
        touchdowns: [{ sourceIndex: 2202, scorerId: 6, roster: 0, confirmedCheckpointAfter: 2204, observedScore: 1 }]
      },
      components: { touchdown: 4, scorePressure: 4 / 5 },
      deviation: -5 / 6, difference: 24 / 5, contribution: -4,
      successors: {
        success: { kind: "touchdown", ownScore: 1, opponentScore: 1, ballCarrierId: 48, actorCell: { x: 0, y: 7 } },
        failure: { kind: "fall_before_damage", ownScore: 0, opponentScore: 1, actorCell: { x: 1, y: 7 } }
      }
    });
    expect(rush.weightedDelta).toBeCloseTo(-5 / 3, 12);
    expect(report.teams[1]).toMatchObject({ impactCount: 1, impactScore: -4 });
    expect(report.verdict.luckierTeam).toBe("unknown");
    const sixFaces = [1, 2, 3, 4, 5, 6].map((face) =>
      committedScoringRushImpact(impact.evidence, 48, face >= 2).contribution
    );
    expect(sixFaces[0]).toBe(-4);
    for (const success of sixFaces.slice(1)) expect(success).toBeCloseTo(4 / 5, 12);
    expect(sixFaces.reduce((sum, face) => sum + face, 0)).toBeCloseTo(0, 12);
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    impact.evidence.touchdowns[0]!.confirmedCheckpointAfter++;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it.each(["unknown opening score", "contradictory score", "marked origin", "later score"])(
    "requires the pre-roll evidence with %s", (change) => {
      const input = replay("demo2.bbr");
      if (change === "unknown opening score") boardAt(input, 0).teams[1]!.touchdowns = null;
      if (change === "contradictory score") boardAt(input, 3501).teams[1]!.touchdowns = 1;
      if (change === "marked origin") {
        const marker = boardAt(input, 3524).teams[0]!.players.find((p) => p.pitchLocation === "on_pitch")!;
        marker.cell = { x: 2, y: 8 };
      }
      if (change === "later score") boardAt(input, 3546).teams[1]!.touchdowns = 1;
      const rush = fallAt(analyzeReplayLuck(input), 405);
      expect(rush.weightedDelta).toBeCloseTo(-5 / 3, 12);
      expect(rush.contextualImpact?.contribution).toBe(change === "later score" ? -4 : undefined);
    }
  );
});

describe("observed movement fall, damage and turnover (NUF-018)", () => {
  it.each([
    { demo: "demo1.bbr", step: 369, actor: "3", source: 2897, ball: [2907, 2909, 2911],
      path: [[25, 2], [26, 1], [22, 5], [22, 6]], turnover: 2912,
      aftermath: { status: "turn_transition", checkpointAfter: 2913 } },
    { demo: "demo2.bbr", step: 405, actor: "48", source: 3524, ball: [3534, 3536, 3538, 3540],
      path: [[0, 7], [-1, 8], [8, 15], [13, 8], [12, 8]], turnover: 3541,
      aftermath: { status: "loose", checkpointAfter: 3546 } }
  ])("links both dice, armor and the recorded ball path in $demo", (example) => {
    // Stdlib replay decode: the carrier is one square short, both 2+ dice
    // are ones, and armor10+ holds. The later ball dice keep their own rows.
    const input = replay(example.demo);
    const report = analyzeReplayLuck(input);
    const roll = fallAt(report, example.step);
    const cells = example.path.map(([x, y]) => ({ x, y }));
    expect(roll).toMatchObject({
      playerId: example.actor, actualSuccess: false, probabilitySuccess: 35 / 36,
      metadata: { teamRerollsSpent: 1, movementFall: {
        turnoverSourceIndex: example.turnover, diceContribution: -1.5,
        armorHeld: true, unscoredDamageRolls: 0, playerRemoved: false,
        ballPath: { waitingCheckpointAfter: example.source, aftermath: example.aftermath, legs: example.ball.map((id, i) => ({
          sourceId: `source-${id}`, from: cells[i], to: cells[i + 1]
        })) }
      } }
    });
    if (example.demo === "demo2.bbr")
      expect(roll.contextualImpact).toMatchObject({
        policy: "committed_team_scoring_rush", contribution: -4
      });
    else expect(roll.contextualImpact?.contribution).toBeCloseTo(-190 / 51, 12);
    expect(roll.contextualBounds).toBeUndefined();
    for (const id of example.ball)
      expect(report.events.find((e) => e.metadata.sourceIndex === id)).toMatchObject({
        scoringStatus: "excluded", weightedDelta: 0
      });
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    const path = roll.metadata.movementFall!.ballPath!;
    const aftermath = path.aftermath!;
    if (aftermath.status === "loose") {
      expect(aftermath.exclusions).toHaveLength(26);
      expect(aftermath.exclusions).toContainEqual({ playerId: 48, axis: "y", coordinate: 7 });
      expect(aftermath.recovery).toEqual({
        pickupSourceId: "source-3685", waitingCheckpointAfter: 3682,
        confirmedCheckpointAfter: 3698, confirmedCell: { x: 16, y: 4 },
        boardCount: 15, bombCatchSourceIds: ["source-3583"]
      });
      const pickup = report.events.find((e) => e.metadata.sourceId === "source-3685")!;
      expect(pickup).toMatchObject({ playerId: "13", teamId: "0", scoringStatus: "scored", actualSuccess: true });
      expect(pickup.weightedDelta).toBeCloseTo(-1.1 / 3, 12);
      const recovery = aftermath.recovery!;
      recovery.pickupSourceId = "source-3583";
      expect(LuckReportSchema.safeParse(report).success).toBe(false);
      recovery.pickupSourceId = "source-3685";
      const witness = aftermath.exclusions.find((row) => row.playerId === 48)!;
      witness.coordinate = 8;
      expect(LuckReportSchema.safeParse(report).success).toBe(false);
      witness.coordinate = 7;
    }
    aftermath.checkpointAfter++;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
    aftermath.checkpointAfter--;
    roll.metadata.movementFall!.ballPath!.legs[0]!.to.y++;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
    delete roll.metadata.movementFall!.ballPath;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);

    // A discontinuous path loses the receipt without affecting scored dice.
    const firstThrowIn = input.turns.flatMap((turn) => turn.events)
      .find((e) => e.sourceIndex === example.ball[1]! - 1)!;
    (firstThrowIn.payload!.CellFrom as { Y: number }).Y++;
    const changed = analyzeReplayLuck(input);
    expect(fallAt(changed, example.step).metadata.movementFall).toBeUndefined();
    expect(changed.teams.map((t) => t.luckScore)).toEqual(report.teams.map((t) => t.luckScore));
  });

  it("keeps possession unknown when a partial player coordinate could match the landing", () => {
    const input = replay("demo2.bbr");
    const board = input.boardCheckpoints!.find((row) => row.afterSourceIndex === 3546)!.board!;
    const carrier = board.teams[1]!.players.find((player) => player.id === 48)!;
    expect(carrier.cell).toEqual({ x: null, y: 7 });
    carrier.cell.y = 8;
    const event = fallAt(analyzeReplayLuck(input), 405);
    expect(event.metadata.movementFall?.diceContribution).toBe(-1.5);
    expect(event.metadata.movementFall?.ballPath?.legs).toHaveLength(4);
    expect(event.metadata.movementFall?.ballPath?.aftermath).toBeUndefined();
  });

  it.each(["board discontinuity", "unqualified bomb window", "unknown holder"])(
    "withholds pickup continuity after %s while keeping the earlier Rush and later Pickup", (change) => {
      const input = replay("demo2.bbr");
      const at = (index: number) => input.boardCheckpoints!.find((row) => row.afterSourceIndex === index)!.board!;
      if (change === "board discontinuity") at(3598).ball.cell.x = 13;
      if (change === "unknown holder") {
        const ball = at(3698).ball;
        ball.carrierId = null;
        ball.isHeld = null;
        ball.possession = "unknown";
        ball.holderRosterIndex = null;
      }
      if (change === "unqualified bomb window") {
        const question = input.turns.flatMap((turn) => turn.events).find((e) => e.sourceIndex === 3574)!;
        question.payload!.PassType = 2;
      }
      const report = analyzeReplayLuck(input);
      const fall = fallAt(report, 405).metadata.movementFall;
      expect(fall?.diceContribution).toBe(-1.5);
      expect(fall?.ballPath?.aftermath).toMatchObject({ status: "loose", checkpointAfter: 3546 });
      expect(fall?.ballPath?.aftermath).not.toHaveProperty("recovery");
      const pickup = report.events.find((e) => e.metadata.sourceId === "source-3685")!;
      expect(pickup.actualSuccess).toBe(true);
      expect(pickup.weightedDelta).toBeCloseTo(-1.1 / 3, 12);
    }
  );
  it("scores one failed Dodge after a verified skill reroll and self-fall", () => {
    // Independent decode of demo-goblins1 280/1 step 2. Player 8 fails
    // Dodge3+ on 1, uses Dodge (7), then fails on 2. Step 3 breaks
    // armor8+ on [6,5] and records injury, casualty and removal.
    const report = analyzeReplayLuck(replay("demo-goblins1.bbr"));
    const [original, terminal] = report.events.filter(
      (event) =>
        event.metadata.locator?.replayStep === 280 &&
        event.metadata.rollType === 2
    );
    expect(original).toMatchObject({
      scoringStatus: "excluded",
      metadata: { dice: [1], isRollCandidate: false }
    });
    expect(terminal).toMatchObject({
      playerId: "8",
      scoringStatus: "scored",
      actualSuccess: false,
      metadata: {
        dice: [2],
        rerollSkill: "Dodge",
        rerollOriginalId: original!.metadata.sourceId,
        teamRerollsSpent: 0,
        movementFall: {
          armorHeld: false,
          unscoredDamageRolls: 2,
          playerRemoved: true,
          turnoverChildIndex: 2
        }
      }
    });
    expect(terminal!.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(terminal!.metadata.movementFall!.diceContribution).toBeCloseTo(
      (-1.1 * 4) / 3 - 21 / 36,
      12
    );
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
  });

  it("links the full held-out Rush chain in demo8 and sums only verified chance", () => {
    const report = analyzeReplayLuck(replay("demo8.bbr"));
    // Independent stdlib decode of 463/1: step6 Rush2+ on 1, failure in
    // ResultMoveOutcome. Step7 applied self-damage at [5,3], armor9+ on
    // [6,3], injury [6,6], casualty D16=5 and removal. 463/2 Reason2.
    const rush = fallAt(report, 463);
    expect(rush).toMatchObject({
      playerId: "44",
      probabilitySuccess: 5 / 6,
      actualSuccess: false,
      metadata: {
        locator: {
          replayStep: 463,
          childIndex: 1,
          stepIndex: 6,
          messageIndex: 0
        },
        movementFall: {
          turnoverChildIndex: 2,
          armorHeld: false,
          unscoredDamageRolls: 2,
          playerRemoved: true
        }
      }
    });
    expect(rush.metadata.movementFall!.diceContribution).toBeCloseTo(
      -5 / 6 - 26 / 36,
      12
    );
    const step = report.damageSteps.find(
      (damage) => damage.actionId === rush.metadata.movementFall!.damageActionId
    )!;
    expect(step).toMatchObject({
      scoredRolls: 1,
      unscoredRolls: 2,
      contextRecords: 1
    });
    expect(
      step.eventIds.map(
        (id) =>
          report.events.find((event) => event.id === id)?.metadata.sourceTag
      )
    ).toEqual([
      "ResultRoll",
      "ResultInjuryRoll",
      "ResultCasualtyRoll",
      "ResultPlayerRemoval"
    ]);
    expect(rush.contextualImpact).toBeUndefined();
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    rush.metadata.movementFall!.diceContribution++;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it.each([
    {
      demo: "demo8.bbr",
      step: 331,
      odds: 1 / 2,
      spent: 0,
      armorHeld: false,
      unscoredDamageRolls: 1,
      subtotal: -1.1 / 2 - 30 / 36
    },
    {
      demo: "demo4.bbr",
      step: 462,
      odds: 3 / 4,
      spent: 1,
      armorHeld: true,
      unscoredDamageRolls: 0,
      subtotal: -1.1 * (1 / 2 + 1 / 2) + 15 / 36
    }
  ])(
    "counts one resolved Dodge with $spent team rerolls spent ($demo)",
    (example) => {
      // Independent decode: both questions show Dodge4+ on 2. At 331/1
      // the coach keeps 2, armor10+ breaks on [5,6] and injury leads to
      // removal. At 462/1 the coach uses a reroll, rolls 1 and armor8+
      // holds on [4,1]. Both 331/2 and 462/2 explicitly report Reason2.
      const input = replay(example.demo);
      const report = analyzeReplayLuck(input);
      const dodge = fallAt(report, example.step, 2);
      expect(dodge).toMatchObject({
        probabilitySuccess: example.odds,
        actualSuccess: false,
        metadata: {
          teamRerollsSpent: example.spent,
          movementFall: {
            armorHeld: example.armorHeld,
            unscoredDamageRolls: example.unscoredDamageRolls
          }
        }
      });
      expect(dodge.metadata.movementFall!.diceContribution).toBeCloseTo(
        example.subtotal,
        12
      );
      const question = input.turns
        .flatMap((turn) => turn.events)
        .find((event) => event.id === dodge.metadata.rerollQuestionId);
      expect(question).toMatchObject({
        sourceTag: "QuestionTeamRerollUsage",
        locator: { replayStep: example.step - 1, childIndex: 1 }
      });
      expect(
        report.events.filter(
          (event) =>
            event.metadata.sourceId === question!.id &&
            event.metadata.isRollCandidate
        )
      ).toHaveLength(0);
      expect(LuckReportSchema.safeParse(report).success).toBe(true);
    }
  );

  it.each([
    "manual",
    "different_player",
    "contradictory_summary",
    "intervening_action",
    "duplicate_armor"
  ])(
    "abstains from linking unsupported aftermath (%s) without changing verified dice",
    (change) => {
      const original = replay("demo1.bbr");
      const baseline = analyzeReplayLuck(original);
      // Independent raw case at 342/1 steps7 and 8: Rush2+ on1, armor8+
      // on [6,1] holds, and 342/2 marks the turnover. No removal occurs.
      expect(fallAt(baseline, 342).metadata.movementFall).toMatchObject({
        armorHeld: true,
        unscoredDamageRolls: 0,
        playerRemoved: false
      });
      expect(
        fallAt(baseline, 342).metadata.movementFall!.diceContribution
      ).toBeCloseTo(-5 / 12, 12);
      const turn = original.turns.find(
        (turn) => turn.events.at(-1)?.locator?.replayStep === 342
      )!;
      const end = turn.events.at(-1)!;
      const armor = turn.events.at(-2)!;
      const damage = turn.events.at(-3)!;
      const outcome = turn.events.at(-4)!;
      if (change === "manual") end.reasonCode = 1;
      if (change === "different_player") damage.targetId = "41";
      if (change === "contradictory_summary")
        outcome.payload!.Rolls = { RollSummary: { RollType: 1, Outcome: 1 } };
      if (change === "intervening_action")
        turn.events.splice(-1, 0, { type: "step", sourceTag: "PlayerStep" });
      if (change === "duplicate_armor") {
        // A repeated fresh-looking result cannot anchor a movement chain.
        turn.events.splice(-1, 0, { ...armor, id: "duplicate-armor" });
      }
      const report = analyzeReplayLuck(original);
      expect(fallAt(report, 342).metadata.movementFall).toBeUndefined();
      expect(fallAt(report, 342).weightedDelta).toBe(-5 / 6);
      if (change !== "duplicate_armor" && change !== "different_player")
        expect(report.teams).toEqual(baseline.teams);
      if (change === "different_player") {
        const changed = report.events.filter(e => e.scoringStatus === "scored");
        const diceValue = (e: typeof report.events[number]) => [e.id,e.type,e.probabilitySuccess,e.actualSuccess,e.delta,e.weightedDelta];
        expect(changed.filter(e => e.type !== "armor_break").map(diceValue)).toEqual(baseline.events.filter(e => e.scoringStatus === "scored" && e.type !== "armor_break").map(diceValue));
        expect(report.events.find(e => e.metadata.sourceId === armor.id)!.scoringStatus).toBe("excluded");
      }
    }
  );
});
