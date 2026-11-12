import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { estimateKeptCatchPossession } from "@/domain/nufflizer/contextImpact";
import { explainContextBounds } from "@/domain/nufflizer/presentation";
import { lonerDriveXml } from "../helpers/lonerDrive";
const fixture = "tests/fixtures/evidence/bb3-retained-catch-reaction.json";
const xml = () => lonerDriveXml("kept_catch_first_bounce", fixture);
const report = () => analyzeNufflizerInput(xml());
const caught = (r: ReturnType<typeof report>) =>
  r.events.find((e) => e.metadata.retainedCatchReaction)!;
function raw() {
  const r = parseReplayXml(xml());
  const events = r.turns.flatMap((t) => t.events);
  const c = events.find(
    (e) => e.sourceTag === "ResultRoll" && e.rollType === 7
  )!;
  const i = events.indexOf(c);
  return {
    r,
    events,
    c,
    q: events[i - 3]!,
    decision: events[i - 1]!,
    start: events[i - 4]!,
    continuation: events[i - 2]!,
    next: events[i + 2]!
  };
}
describe("retained-original first-bounce Catch possession", () => {
  it("uses the independent six-face expectation before the original die and fixed decline policy", () => {
    const evidence = JSON.parse(readFileSync(fixture, "utf8"));
    expect(evidence.expectation.sixFaces).toEqual({
      successes: [5, 6],
      failures: [1, 2, 3, 4],
      failedContribution: [-2 / 3, 0]
    });
    const bound = estimateKeptCatchPossession(2 / 6);
    expect(bound).toEqual({
      policy: "kept_catch_failure_envelope",
      successChance: 1 / 3,
      minimumDifference: 0,
      maximumDifference: 2,
      lower: -2 / 3,
      upper: 0
    });
    for (const failureValue of [0, 1, 2]) {
      const values = Array.from({ length: 6 }, (_, i) =>
        i + 1 >= 5 ? 2 : failureValue
      );
      const mean = values.reduce((a, b) => a + b, 0) / 6;
      const deviations = values.map((v) => v - mean);
      expect(deviations.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
      expect(deviations[2]).toBeGreaterThanOrEqual(-2 / 3 - 1e-12);
      expect(deviations[2]).toBeLessThanOrEqual(0);
    }
  });
  it("links source offer/decline, two D8s and one retained D6 without restoring state or adding scores", () => {
    const r = report(),
      e = caught(r),
      proof = e.metadata.retainedCatchReaction!;
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
    expect(e).toMatchObject({
      teamId: "0",
      playerId: "1",
      actualSuccess: false,
      probabilitySuccess: 1 / 3,
      delta: -1 / 3
    });
    expect(e.weightedDelta).toBeCloseTo(-11 / 30, 12);
    expect(e.catchPossessionBounds).toMatchObject({ lower: -2 / 3, upper: 0 });
    expect(e.metadata).toMatchObject({
      dice: [3],
      dieTypes: [0],
      requirement: 3,
      difficulty: 5,
      modifiers: [-1, -1],
      rerollUsed: false,
      teamRerollsSpent: 0,
      probabilityPolicy: "single_attempt",
      ballCatchCell: { x: 4, y: 5 }
    });
    expect(e.metadata.rerollResource).toBeUndefined();
    expect(e.metadata.preRoll).toBeUndefined();
    expect(e.contextualImpact).toBeUndefined();
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    const source = (id: string) =>
      r.events.find((e) => e.metadata.sourceId === id)!;
    expect(source(proof.questionSourceId)).toMatchObject({
      scoringStatus: "excluded",
      metadata: { sourceTag: "QuestionTeamRerollUsage", isRollCandidate: false }
    });
    expect(source(proof.decisionSourceId)).toMatchObject({
      scoringStatus: "excluded",
      metadata: { sourceTag: "ResultTeamRerollUsage", isRollCandidate: false }
    });
    expect(proof.waitingCheckpointAfter).toBe(
      source(proof.questionSourceId).metadata.sourceIndex
    );
    expect(source(proof.bounceSourceId).metadata).toMatchObject({
      dice: [2],
      dieTypes: [1],
      ballTravel: { from: { x: 4, y: 4 }, to: { x: 4, y: 5 } }
    });
    expect(source(proof.followingBounceSourceId).metadata).toMatchObject({
      dice: [4],
      dieTypes: [1],
      ballTravel: { from: { x: 4, y: 5 }, to: { x: 3, y: 5 } }
    });
    expect(source(proof.pickupSourceId).weightedDelta).toBeCloseTo(-0.55, 12);
    expect(
      source(proof.pickupSourceId).metadata.pickupBallChain!.diceByTeam["0"]
    ).toBeCloseTo(-11 / 12, 12);
    const text = explainContextBounds(e)!;
    expect(text).toContain("Before the original Catch die");
    expect(text).toContain("same die, not another random outcome");
    expect(text).toContain("No midpoint or endpoint enters point totals");
  });
  it("also admits the unchanged original demo1 without the fragment's initial-roster scaffold", () => {
    const r = analyzeNufflizerInput(
        readFileSync("demo-replays/demo1.bbr", "utf8")
      ),
      e = caught(r);
    expect(e.metadata.sourceId).toBe("source-548");
    expect(e.metadata.retainedCatchReaction).toEqual({
      pickupSourceId: "source-541",
      bounceSourceId: "source-543",
      questionSourceId: "source-545",
      decisionSourceId: "source-547",
      followingBounceSourceId: "source-550",
      beforeCheckpointAfter: 538,
      waitingCheckpointAfter: 545
    });
    expect(e.catchPossessionBounds!.lower).toBeCloseTo(-2 / 3, 12);
  });
  it.each([
    "used",
    "gamer",
    "offer",
    "newdie",
    "face",
    "extra",
    "step",
    "direction"
  ])("withholds the envelope on contradictory %s evidence", (kind) => {
    const x = raw();
    if (kind === "used") x.decision.payload!.Used = 1;
    if (kind === "gamer") x.decision.payload!.GamerId = 1;
    if (kind === "offer") x.q.payload!.CanUseProReroll = 1;
    if (kind === "newdie") x.c.payload!.NewRoll = 1;
    if (kind === "face")
      (x.c.payload!.Dice as { Die: { Value: number } }).Die.Value = 2;
    if (kind === "extra") x.q.payload!.UnknownPolicy = 1;
    if (kind === "step") x.continuation.payload!.Skill = 6;
    if (kind === "direction")
      (x.next.payload!.Dice as { Die: { Value: number } }).Die.Value = 8;
    expect(
      analyzeReplayLuck(x.r).events.some(
        (e) => e.metadata.retainedCatchReaction
      )
    ).toBe(false);
  });
  it.each(["die-field", "modifier-field", "modifier-skill", "modifier-owner"])(
    "withholds unmodeled %s while preserving the existing fixed dice scope",
    (kind) => {
      const x = raw(),
        original = x.q.payload!.RollInfos as Record<string, unknown>;
      const modify = (roll: Record<string, unknown>) => {
        if (kind === "die-field")
          (roll.Dice as { Die: Record<string, unknown> }).Die.UnknownEffect = 1;
        const mods = (roll.Modifiers as { Modifier: Record<string, unknown>[] })
          .Modifier;
        if (kind === "modifier-field") mods[1]!.UnknownPolicy = 1;
        if (kind === "modifier-skill") mods[1]!.Skill = 99;
        if (kind === "modifier-owner") mods[1]!.PlayerId = 1;
      };
      modify(original);
      modify(x.c.payload!);
      expect(
        analyzeReplayLuck(x.r).events.some(
          (e) => e.metadata.retainedCatchReaction
        )
      ).toBe(false);
    }
  );
  it.each([
    "team",
    "position",
    "duplicate",
    "phase",
    "clock",
    "holder",
    "missing",
    "extra-checkpoint"
  ])("does not bridge a %s checkpoint contradiction", (kind) => {
    const x = raw(),
      wait = x.r.boardCheckpoints!.find(
        (c) => c.afterSourceIndex === x.q.sourceIndex
      )!;
    const b = wait.board!,
      p = b.teams[0]!.players.find((p) => p.id === 1)!;
    if (kind === "team") b.teams[1]!.explicitTeamId = 0;
    if (kind === "position") p.cell.x = 5;
    if (kind === "duplicate") b.teams[0]!.players.push({ ...p });
    if (kind === "phase") b.phaseCode = 4;
    if (kind === "clock") b.teams[0]!.gameTurn!++;
    if (kind === "holder") b.ball.carrierId = 1;
    if (kind === "missing") {
      p.cell.x = null;
      p.pitchLocation = "unknown";
    }
    if (kind === "extra-checkpoint")
      x.r.boardCheckpoints!.splice(x.r.boardCheckpoints!.indexOf(wait), 0, {
        ...structuredClone(wait),
        afterSourceIndex: x.q.sourceIndex! - 1
      });
    expect(
      analyzeReplayLuck(x.r).events.some(
        (e) => e.metadata.retainedCatchReaction
      )
    ).toBe(false);
  });
  it.each([
    "bound",
    "policy",
    "question",
    "decision",
    "bounce",
    "checkpoint",
    "fresh",
    "original",
    "point"
  ])("rejects exported %s proof tampering", (kind) => {
    const r = report(),
      e = caught(r),
      proof = e.metadata.retainedCatchReaction!;
    if (kind === "bound") e.catchPossessionBounds!.lower = -1;
    if (kind === "policy") e.metadata.rerollUsed = true;
    if (kind === "question") proof.questionSourceId = proof.decisionSourceId;
    if (kind === "decision") proof.decisionSourceId = proof.bounceSourceId;
    if (kind === "bounce") proof.followingBounceSourceId = proof.bounceSourceId;
    if (kind === "checkpoint") proof.waitingCheckpointAfter--;
    if (kind === "fresh") delete e.metadata.retainedCatchReaction;
    if (kind === "original")
      (e.metadata.originalDice as { Die: { Value: number } }).Die.Value = 2;
    if (kind === "point")
      e.contextualImpact = {
        policy: "fresh_numeric",
        successChance: 1 / 3,
        successValue: 2,
        failureValue: 0,
        contribution: -2 / 3
      } as never;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("reproduces its numeric-only raw projection independently", () => {
    const dir = mkdtempSync(join(tmpdir(), "nufflizier-kept-catch-")),
      out = join(dir, "evidence.json");
    try {
      const run = spawnSync(
        "python3",
        ["scripts/extract-retained-catch-evidence.py", "--output", out],
        { encoding: "utf8" }
      );
      expect(run.status, run.stderr).toBe(0);
      expect(readFileSync(out, "utf8")).toBe(readFileSync(fixture, "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
