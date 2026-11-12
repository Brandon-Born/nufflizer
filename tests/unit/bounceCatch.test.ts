import { describe, expect, it } from "vitest";
import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { estimateFreshCatchPossession } from "@/domain/nufflizer/contextImpact";
import {
  explainContextBounds,
  explainPickupBallChain
} from "@/domain/nufflizer/presentation";
import { lonerDriveXml } from "../helpers/lonerDrive";
const xml = (id = "pickup_bounce_catch") =>
  lonerDriveXml(id, "tests/fixtures/evidence/bb3-bounce-catch-reactions.json");
const report = () => analyzeNufflizerInput(xml());
const check = (r: ReturnType<typeof report>) =>
  r.events.find((e) => e.catchPossessionBounds)!;
function raw() {
  const replay = parseReplayXml(xml()),
    events = replay.turns.flatMap((t) => t.events),
    caught = events.find((e) => e.rollType === 7)!;
  const i = events.indexOf(caught);
  return {
    replay,
    caught,
    catchStep: events[i - 1]!,
    bounce: events[i - 2]!,
    bounceStep: events[i - 3]!,
    pickup: events[i - 4]!
  };
}
describe("occupied-bounce fresh catch possession envelope", () => {
  it("matches independent demo3 pickup, D8 destination and fresh modified catch without filling eligibility", () => {
    const r = report(),
      e = check(r),
      proof = e.metadata.bounceCatchReaction!;
    expect(e).toMatchObject({
      playerId: "45",
      teamId: "1",
      actualSuccess: true,
      probabilitySuccess: 1 / 6
    });
    expect(e.metadata).toMatchObject({
      difficulty: 6,
      requirement: 3,
      dice: [6],
      modifiers: [-1, -1, -1],
      ballCatchCell: { x: 15, y: 10 }
    });
    expect(e.catchPossessionBounds).toMatchObject({
      successChance: 1 / 6,
      minimumDifference: 0,
      maximumDifference: 2,
      lower: 0
    });
    expect(e.catchPossessionBounds!.upper).toBeCloseTo(5 / 3, 12);
    expect(e.metadata.preRoll).toBeUndefined();
    expect(e.contextualImpact).toBeUndefined();
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    const source = (id: string) =>
      r.events.find((e) => e.metadata.sourceId === id)!;
    expect(source(proof.pickupSourceId)).toMatchObject({
      playerId: "42",
      actualSuccess: false,
      probabilitySuccess: 1 / 6
    });
    expect(source(proof.bounceSourceId).metadata).toMatchObject({
      dice: [2],
      dieTypes: [1],
      ballTravel: { from: { x: 15, y: 9 }, to: { x: 15, y: 10 } }
    });
    expect(source(proof.moveOutcomeSourceId).scoringStatus).toBe("excluded");
    expect(
      source(proof.pickupSourceId).metadata.pickupBallChain!.diceByTeam["1"]
    ).toBeCloseTo(11 / 15, 12);
    expect(explainContextBounds(e)).toContain(
      "Failed-catch rerolls, reactions and later bounces are unresolved"
    );
    const evidence = JSON.parse(
      readFileSync(
        "tests/fixtures/evidence/bb3-bounce-catch-reactions.json",
        "utf8"
      )
    );
    const c = evidence.cases.find(
      (c: { id: string }) => c.id === "pickup_bounce_catch"
    );
    const after = c.records.find(
      (r: { replayStep: number; projection?: { BoardState?: unknown } }) =>
        r.replayStep === 531 && r.projection?.BoardState
    ).projection.BoardState;
    expect(after.Ball[0]).toMatchObject({
      Carrier: ["45"],
      IsHeld: ["1"],
      Cell: [{ X: ["15"], Y: ["10"] }]
    });
  });
  it("preserves the actual unknown-side stand-up but withholds its movement cost and clock", () => {
    const evidence = JSON.parse(
      readFileSync(
        "tests/fixtures/evidence/bb3-bounce-catch-reactions.json",
        "utf8"
      )
    );
    const records = evidence.cases.find(
      (c: { id: string }) => c.id === "standup_pickup_bounce_catch"
    ).records;
    const boards = records
      .filter(
        (r: { projection?: { BoardState?: unknown } }) =>
          r.projection?.BoardState
      )
      .map(
        (r: { projection: { BoardState: Record<string, unknown> } }) =>
          r.projection.BoardState
      );
    const picker = (b: (typeof boards)[number]) =>
      b.ListTeams[0].TeamState[0].ListPitchPlayers[0].PlayerState.find(
        (p: { Id: string[] }) => p.Id[0] === "6"
      );
    expect(boards[0].ActiveTeam).toBeUndefined();
    expect(boards[0].Period).toBeUndefined();
    expect(picker(boards[0])).toMatchObject({
      Status: ["1"],
      MovePoint: ["4"],
      CanAct: ["1"]
    });
    expect(picker(boards[1]).MovePoint).toEqual(["7"]);
    const r = analyzeNufflizerInput(xml("standup_pickup_bounce_catch"));
    const e = check(r),
      proof = e.metadata.bounceCatchReaction!;
    expect(e).toMatchObject({
      playerId: "9",
      teamId: "0",
      probabilitySuccess: 1 / 2,
      actualSuccess: true,
      catchPossessionBounds: { lower: 0, upper: 1 }
    });
    const pickup = r.events.find(
      (e) => e.metadata.sourceId === proof.pickupSourceId
    )!;
    expect(pickup.metadata.preRoll).toMatchObject({
      actorCell: { x: 19, y: 7 },
      activeTeamId: null,
      period: null,
      teamTurn: null,
      turnsRemaining: null
    });
    expect(pickup.metadata.preRoll!.actorStandUpSourceIndex).toBeTypeOf(
      "number"
    );
    expect(pickup.metadata.preRoll!.actorMovementRemaining).toBeUndefined();
    expect(e.metadata.preRoll).toBeUndefined();
    expect(e.contextualImpact).toBeUndefined();
  });
  it.each([
    "missing_teams",
    "both_roster_ids_missing",
    "opposite_roster_conflict",
    "unknown_team",
    "wrong_active",
    "duplicate_actor",
    "wrong_declaration_owner",
    "inferred_declaration",
    "declaration_payload",
    "wrong_stand_owner",
    "inferred_stand",
    "stand_payload",
    "step_payload",
    "evaluation",
    "wrong_cell",
    "not_prone",
    "spent",
    "mental_effect",
    "checkpoint_interrupt"
  ] as const)("unknown-side stand-up rejects %s", (change) => {
    const replay = parseReplayXml(xml("standup_pickup_bounce_catch"));
    const events = replay.turns.flatMap((t) => t.events);
    const stand = events.find(
      (e) => e.sourceTag === "ResultNoRollSuccess" && e.stepType === 7
    )!;
    const step = events.find(
      (e) => e.actionId === stand.actionId && e.type === "step"
    )!;
    const declaration = events.find(
      (e) => e.sourceTag === "ResultUseAction" && e.playerId === "6"
    )!;
    const before = replay.boardCheckpoints!.find((c) =>
      c.board?.teams.some((t) =>
        t.players.some((p) => p.id === 6 && p.statusCode === 1)
      )
    )!;
    const board = before.board!,
      owner = board.teams.find((t) => t.players.some((p) => p.id === 6))!,
      other = board.teams.find((t) => t !== owner)!;
    const actor = owner.players.find((p) => p.id === 6)!;
    if (change === "missing_teams") replay.teams.pop();
    if (change === "both_roster_ids_missing") other.explicitTeamId = null;
    if (change === "opposite_roster_conflict") other.explicitTeamId = 0;
    if (change === "unknown_team") other.explicitTeamId = 99;
    if (change === "wrong_active") board.activeTeamIndex = other.rosterIndex;
    if (change === "duplicate_actor")
      other.players.push(structuredClone(actor));
    if (change === "wrong_declaration_owner") declaration.actorTeamId = "1";
    if (change === "inferred_declaration")
      declaration.actorTeamSource = "turn_inferred";
    if (change === "declaration_payload") declaration.payload!.Unexpected = 1;
    if (change === "wrong_stand_owner") stand.actorTeamId = "1";
    if (change === "inferred_stand") stand.actorTeamSource = "turn_inferred";
    if (change === "stand_payload") stand.payload = { Unexpected: 1 };
    if (change === "step_payload") step.payload!.Unexpected = 1;
    if (change === "evaluation") step.payload!.IsEvaluation = 1;
    if (change === "wrong_cell") step.payload!.CellTo = { X: 18, Y: 8 };
    if (change === "not_prone") actor.statusCode = 0;
    if (change === "spent") actor.canAct = false;
    if (change === "mental_effect")
      actor.mentalEffect = { providerSkillId: 51 };
    if (change === "checkpoint_interrupt") {
      replay.boardCheckpoints!.push({
        ...structuredClone(before),
        afterSourceIndex: declaration.sourceIndex!
      });
      replay.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
    }
    expect(
      analyzeReplayLuck(replay).events.some((e) => e.catchPossessionBounds)
    ).toBe(false);
  });
  it("never recovers a pre-catch movement budget from the next-turn reset", () => {
    const replay = parseReplayXml(xml("standup_pickup_bounce_catch"));
    const before = check(analyzeReplayLuck(replay));
    const caught = replay.turns
      .flatMap((t) => t.events)
      .find((e) => e.rollType === 7)!;
    for (const c of replay.boardCheckpoints!)
      if (c.afterSourceIndex > caught.sourceIndex!) {
        for (const p of c.board?.teams.flatMap((t) => t.players) ?? [])
          p.movementRemaining = 16;
      }
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(check(r).catchPossessionBounds).toEqual(
      before.catchPossessionBounds
    );
    const pickup = r.events.find(
      (e) =>
        e.metadata.sourceId ===
        before.metadata.bounceCatchReaction!.pickupSourceId
    )!;
    expect(pickup.metadata.preRoll!.actorMovementRemaining).toBeUndefined();
  });
  it("does not backfill a reaction if a matching checkpoint interrupts the prefix", () => {
    const r = raw(),
      proof = check(analyzeReplayLuck(r.replay)).metadata.bounceCatchReaction!;
    const b = structuredClone(
      r.replay.boardCheckpoints!.find(
        (b) => b.afterSourceIndex === proof.checkpointAfter
      )!
    );
    b.afterSourceIndex = r.bounce.sourceIndex!;
    r.replay.boardCheckpoints!.push(b);
    r.replay.boardCheckpoints!.sort(
      (a, b) => a.afterSourceIndex - b.afterSourceIndex
    );
    expect(
      analyzeReplayLuck(r.replay).events.some((e) => e.catchPossessionBounds)
    ).toBe(false);
  });
  it("a changed future carrier cannot supply or alter earlier reaction geometry", () => {
    const r = raw(),
      before = check(analyzeReplayLuck(r.replay));
    for (const b of r.replay.boardCheckpoints!)
      if (b.afterSourceIndex > r.caught.sourceIndex! && b.board)
        b.board.ball.carrierId = 42;
    const after = check(LuckReportSchema.parse(analyzeReplayLuck(r.replay)));
    expect(after.metadata.bounceCatchReaction).toEqual(
      before.metadata.bounceCatchReaction
    );
    expect(after.catchPossessionBounds).toEqual(before.catchPossessionBounds);
  });
  it.each([
    "pickup_result",
    "pickup_modifier",
    "bounce_direction",
    "bomb",
    "evaluation",
    "catch_cell",
    "catch_actor",
    "catch_owner",
    "catch_status",
    "catch_extra",
    "optional_skill",
    "extra_modifier",
    "unknown_interruption",
    "prone_receiver",
    "receiver_effect",
    "unmodeled_trait"
  ] as const)("withholds the component after %s", (change) => {
    const r = raw();
    if (change === "pickup_result") r.pickup.payload!.Outcome = 1;
    if (change === "pickup_modifier")
      (
        r.pickup.payload!.Modifiers as { Modifier: { ModifierType: number }[] }
      ).Modifier[0]!.ModifierType = 99;
    if (change === "bounce_direction")
      (r.bounce.payload!.Dice as { Die: { Value: number } }).Die.Value = 3;
    if (change === "bomb") r.bounceStep.payload!.BallId = 1;
    if (change === "evaluation") r.catchStep.payload!.IsEvaluation = 1;
    if (change === "catch_cell") r.catchStep.payload!.CellTo = { X: 14, Y: 10 };
    if (change === "catch_actor") r.caught.playerId = "42";
    if (change === "catch_owner") r.caught.actorTeamId = "0";
    if (change === "catch_status") r.caught.payload!.Status = 2;
    if (change === "catch_extra") r.caught.payload!.Mystery = 1;
    if (change === "optional_skill")
      (
        r.caught.payload!.Modifiers as { Modifier: { Skill: number }[] }
      ).Modifier[0]!.Skill = 6;
    if (change === "extra_modifier")
      (
        r.caught.payload!.Modifiers as { Modifier: { ModifierType: number }[] }
      ).Modifier[0]!.ModifierType = 99;
    if (change === "unknown_interruption") {
      const t = r.replay.turns.find((t) => t.events.includes(r.caught))!;
      t.events.splice(t.events.indexOf(r.caught), 0, {
        ...r.caught,
        id: "unknown",
        sourceTag: "UnknownMutation",
        type: "unknown"
      });
    }
    if (
      ["prone_receiver", "receiver_effect", "unmodeled_trait"].includes(change)
    )
      for (const c of r.replay.boardCheckpoints!) {
        const p = c.board?.teams[1]!.players.find((p) => p.id === 45);
        if (p) {
          if (change === "prone_receiver") p.statusCode = 1;
          if (change === "receiver_effect")
            p.mentalEffect = { providerSkillId: 51 };
          if (change === "unmodeled_trait")
            p.traits = {
              dataPlayerId: 45,
              playerTypeId: null,
              innateSkills: [999],
              acquiredSkills: []
            };
        }
      }
    expect(
      analyzeReplayLuck(r.replay).events.some((e) => e.catchPossessionBounds)
    ).toBe(false);
  });
  it("keeps a range over every possible failed continuation rather than guessing a reroll policy", () => {
    const p = 1 / 6,
      bound = estimateFreshCatchPossession(p);
    for (const failedContinuation of [0, 0.25, 1, 1.5, 2]) {
      const conditional = (1 - p) * (2 - failedContinuation);
      expect(conditional).toBeGreaterThanOrEqual(bound.lower);
      expect(conditional).toBeLessThanOrEqual(bound.upper);
      // Independent six-face martingale for a fixed continuation expectation;
      // the production range is only admitted for the observed successful die.
      const terms = [1, 2, 3, 4, 5, 6].map((face) =>
        face === 6
          ? 2 - (p * 2 + (1 - p) * failedContinuation)
          : failedContinuation - (p * 2 + (1 - p) * failedContinuation)
      );
      expect(terms.reduce((a, b) => a + b, 0) / 6).toBeCloseTo(0, 12);
    }
  });
  it.each([
    "pickup",
    "bounce",
    "declaration",
    "move",
    "checkpoint",
    "chance",
    "upper",
    "point_overlap"
  ] as const)("shared reports reject forged %s", (change) => {
    const r = report(),
      e = check(r),
      p = e.metadata.bounceCatchReaction!;
    if (change === "pickup") p.pickupSourceId = p.bounceSourceId;
    if (change === "bounce") p.bounceSourceId = p.pickupSourceId;
    if (change === "declaration") p.declarationSourceId = p.moveOutcomeSourceId;
    if (change === "move") p.moveOutcomeSourceId = p.declarationSourceId;
    if (change === "checkpoint") p.checkpointAfter++;
    if (change === "chance") e.catchPossessionBounds!.successChance = 2 / 3;
    if (change === "upper") e.catchPossessionBounds!.upper++;
    if (change === "point_overlap")
      e.possessionBounds = {
        policy: "sure_hands_reroll",
        successChance: 1 / 6,
        minimumDifference: 0,
        maximumDifference: 2,
        lower: 0,
        upper: 5 / 3
      };
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("prints the reaction envelope through shared CLI copy", () => {
    const dir = mkdtempSync(join(tmpdir(), "nuff-catch-"));
    try {
      const p = join(dir, "source.xml");
      writeFileSync(p, xml());
      const run = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          p,
          "--format",
          "text"
        ],
        { encoding: "utf8", timeout: 20000 }
      );
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("fresh catch die");
      expect(run.stdout).toContain(
        "recorded team turn ended immediately after the successful catch"
      );
      expect(run.stdout).toContain("0 to 10 other players");
      expect(run.stdout).toContain("0 to 1.67 context units");
      expect(run.stdout).toContain(
        "No midpoint or endpoint enters point totals"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("reconciles the twelve public demos with two fresh catch envelopes and no fabricated point estimate", () => {
    let count = 0;
    for (const file of readdirSync("demo-replays").filter((f) =>
      f.endsWith(".bbr")
    )) {
      const r = analyzeNufflizerInput(
        readFileSync(`demo-replays/${file}`, "utf8")
      );
      count += r.events.filter((e) => e.catchPossessionBounds?.policy === "fresh_catch_failure_envelope").length;
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
    expect(count).toBe(2);
  });
  it("links the independently recorded turnover without counting an extra random outcome or trusting omitted eligibility", () => {
    const r = report(),
      caught = check(r),
      pickup = r.events.find(
        (e) =>
          e.metadata.sourceId ===
          caught.metadata.bounceCatchReaction!.pickupSourceId
      )!;
    expect(pickup.metadata.pickupTurnEnd!.ordinaryMoves).toEqual({
      knownAvailablePlayerIds: [],
      unknownPlayerIds: [
        "37",
        "38",
        "39",
        "40",
        "41",
        "43",
        "44",
        "45",
        "47",
        "48"
      ]
    });
    const end = r.events.find(
      (e) => e.metadata.sourceId === pickup.metadata.pickupTurnEnd!.endSourceId
    )!;
    expect(end).toMatchObject({
      scoringStatus: "excluded",
      delta: 0,
      weightedDelta: 0,
      metadata: {
        sourceTag: "EventEndTurn",
        turnEndReason: 2,
        isRollCandidate: false
      }
    });
    expect(end.metadata.sourceIndex).toBe(caught.metadata.sourceIndex! + 1);
    expect(r.coverage.contextEvidence.boundedCount).toBe(1);
    expect(explainPickupBallChain(pickup)).toContain("0 to 10 other players");
    const r2 = analyzeNufflizerInput(xml("standup_pickup_bounce_catch")),
      p2 = r2.events.find((e) => e.metadata.pickupTurnEnd)!;
    expect(p2.metadata.pickupTurnEnd!.ordinaryMoves).toBeUndefined();
    expect(explainPickupBallChain(p2)).toContain(
      "Current-side movement opportunities remain unknown"
    );
  });
  it.each([
    "reason",
    "payload",
    "interruption",
    "nonadjacent",
    "checkpoint"
  ] as const)(
    "withholds observed turn-end linkage after %s without erasing the earlier catch range",
    (change) => {
      const r = raw(),
        events = r.replay.turns.find((t) =>
          t.events.includes(r.caught)
        )!.events;
      const end = events[events.indexOf(r.caught) + 1]!;
      if (change === "reason") {
        end.reasonCode = 1;
        end.payload!.Reason = "1";
      }
      if (change === "payload") end.payload!.Unexpected = 1;
      if (change === "nonadjacent") end.locator!.childIndex!++;
      if (change === "interruption")
        events.splice(events.indexOf(end), 0, {
          ...end,
          id: "unknown-mutation",
          sourceTag: "UnknownMutation"
        });
      if (change === "checkpoint")
        r.replay.boardCheckpoints!.push({
          ...structuredClone(r.replay.boardCheckpoints![0]!),
          afterSourceIndex: r.caught.sourceIndex!
        });
      const report = LuckReportSchema.parse(analyzeReplayLuck(r.replay));
      expect(report.events.some((e) => e.metadata.pickupTurnEnd)).toBe(false);
      expect(check(report).catchPossessionBounds!.upper).toBeCloseTo(5 / 3, 12);
    }
  );
  it.each([
    "catch",
    "end",
    "reason",
    "duplicate_candidates",
    "actor_candidate",
    "unknown_side_candidates"
  ] as const)("shared reports reject forged turn-end %s", (change) => {
    const r =
      change === "unknown_side_candidates"
        ? analyzeNufflizerInput(xml("standup_pickup_bounce_catch"))
        : report();
    const p = r.events.find((e) => e.metadata.pickupTurnEnd)!,
      proof = p.metadata.pickupTurnEnd!;
    if (change === "catch") proof.catchSourceId = proof.endSourceId;
    if (change === "end") proof.endSourceId = proof.catchSourceId;
    if (change === "reason")
      delete r.events.find((e) => e.metadata.sourceId === proof.endSourceId)!
        .metadata.turnEndReason;
    if (change === "duplicate_candidates")
      proof.ordinaryMoves!.knownAvailablePlayerIds.push(
        proof.ordinaryMoves!.unknownPlayerIds[0]!
      );
    if (change === "actor_candidate")
      proof.ordinaryMoves!.unknownPlayerIds.push(p.playerId!);
    if (change === "unknown_side_candidates")
      proof.ordinaryMoves = {
        knownAvailablePlayerIds: [],
        unknownPlayerIds: []
      };
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
