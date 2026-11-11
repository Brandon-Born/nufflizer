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
import { explainContextBounds } from "@/domain/nufflizer/presentation";
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
  it("keeps the unknown-side stand-up case outside the current geometry contract", () => {
    const r = analyzeNufflizerInput(xml("standup_pickup_bounce_catch"));
    expect(r.events.some((e) => e.catchPossessionBounds)).toBe(false);
    expect(r.events.find((e) => e.metadata.rollType === 7)?.actualSuccess).toBe(
      true
    );
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
      expect(run.stdout).toContain("0 to 1.67 context units");
      expect(run.stdout).toContain(
        "No midpoint or endpoint enters point totals"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("reconciles the twelve public demos with one new envelope and no fabricated point estimate", () => {
    let count = 0;
    for (const file of readdirSync("demo-replays").filter((f) =>
      f.endsWith(".bbr")
    )) {
      const r = analyzeNufflizerInput(
        readFileSync(`demo-replays/${file}`, "utf8")
      );
      count += r.events.filter((e) => e.catchPossessionBounds).length;
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
    expect(count).toBe(1);
  });
});
