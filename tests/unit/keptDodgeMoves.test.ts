import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainContextBounds } from "@/domain/nufflizer/presentation";
import { estimateKeptDodgeMoveBounds } from "@/domain/nufflizer/contextImpact";
import { lonerDriveXml } from "../helpers/lonerDrive";
const evidence = "tests/fixtures/evidence/bb3-kept-dodge-moves.json";
const facts = JSON.parse(readFileSync(evidence, "utf8")).cases as {
  id: string;
  sourceFile: string;
  sha256: string;
  actorId: string;
  possiblePlayerIds: string[];
  maximumMoves: number;
  finalStep: number;
  originalDie: number;
}[];
const xml = () => lonerDriveXml(facts[0]!.id, evidence);
const kept = (r: ReturnType<typeof analyzeReplayLuck>) =>
  r.events.find(
    (e) => e.contextualBounds?.policy === "kept_dodge_terminal_moves"
  );
function source() {
  const replay = parseReplayXml(xml()),
    r = analyzeReplayLuck(replay),
    e = kept(r)!;
  const events = replay.turns.flatMap((t) => t.events),
    at = (id: string) => events.find((e) => e.id === id)!;
  const question = at(e.metadata.rerollQuestionId!),
    choice = at(e.metadata.rerollDecisionId!),
    final = at(e.metadata.sourceId!),
    decl = at(e.metadata.preRoll!.activationId!);
  const before = replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === e.metadata.preRoll!.checkpointAfter
    )!,
    wait = replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === e.contextualBounds!.terminalCheckpointAfter
    )!;
  return {
    replay,
    r,
    e,
    events,
    at,
    question,
    choice,
    final,
    decl,
    before,
    wait
  };
}
describe("retained original Dodge terminal teammate component", () => {
  it.each(facts)(
    "joins $sourceFile to independent source/geometry/completion facts",
    (f) => {
      const input = readFileSync(`demo-replays/${f.sourceFile}`);
      expect(createHash("sha256").update(input).digest("hex")).toBe(f.sha256);
      const r = analyzeNufflizerInput(input.toString()),
        e = kept(r)!;
      expect(e).toMatchObject({
        type: "dodge",
        teamId: "1",
        playerId: f.actorId,
        actualSuccess: false,
        probabilitySuccess: 2 / 3
      });
      expect(e.metadata.locator!.replayStep).toBe(f.finalStep);
      expect(e.metadata).toMatchObject({
        rollType: 2,
        rerollUsed: false,
        teamRerollsSpent: 0,
        dice: [f.originalDie],
        originalDice: { Die: { DieType: 0, Value: f.originalDie } },
        preRoll: { actorCarriesBall: false, otherUsefulActivations: null },
        movementFall: { armorHeld: true, unscoredDamageRolls: 0 }
      });
      expect(
        e.metadata.preRoll!.ordinaryMoveAvailability!.unknownPlayerIds
      ).toEqual(f.possiblePlayerIds);
      expect(e.contextualBounds).toMatchObject({
        policy: "kept_dodge_terminal_moves",
        successChance: 2 / 3,
        minimumMoves: 0,
        maximumMoves: f.maximumMoves,
        upper: 0
      });
      expect(e.contextualBounds!.lower).toBeCloseTo(
        (-2 * f.maximumMoves) / 3,
        12
      );
      expect(e.metadata.movementFall!.diceContribution).toBeCloseTo(
        -17 / 30,
        12
      );
      expect(e.contextualImpact).toBeUndefined();
      expect(e.metadata.rerollResource).toBeUndefined();
      expect(e.metadata.teamRerollMovement).toBeUndefined();
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
    }
  );
  it("regenerates the raw numeric fixtures without application code", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-kept-dodge-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stdout + p.stderr).toBe(0);
  });
  it.each(facts)(
    "keeps a short $sourceFile fragment conservative about missing completion history",
    (f) => {
      const r = analyzeNufflizerInput(lonerDriveXml(f.id, evidence)),
        e = kept(r)!;
      expect(e.contextualBounds!.maximumMoves).toBe(
        f.sourceFile === "demo3.bbr" ? 10 : f.maximumMoves
      );
      expect(e.metadata.preRoll!.otherUsefulActivations).toBeNull();
      expect(e.contextualImpact).toBeUndefined();
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
    }
  );
  it("never derives the original probability from compound reroll odds or damage", () => {
    const { e, r } = source();
    expect(e.probabilitySuccess).toBe(2 / 3);
    expect(e.weightedDelta).toBeCloseTo(-11 / 15, 12);
    expect(e.contextualBounds!.successChance).not.toBe(8 / 9);
    expect(e.metadata.preRoll!.actorStandUpSourceIndex).toBeDefined();
    const text = explainContextBounds(e);
    expect(text).toContain("Before the original Dodge die");
    expect(text).toContain("66.7%");
    expect(text).toContain("no team reroll was spent");
    expect(text).toContain("No midpoint");
    expect(
      r.contextComponents[1].byAction.find((a) => a.eventIds.includes(e.id))!
        .eventIds
    ).toEqual([e.id]);
  });
  it("does not mutate source projections or earlier state", () => {
    const { replay } = source(),
      before = JSON.stringify(replay);
    analyzeReplayLuck(replay);
    expect(JSON.stringify(replay)).toBe(before);
  });
  it.each([
    "declaration",
    "used",
    "gamer",
    "original-die",
    "final-die",
    "modifiers",
    "family",
    "original-step",
    "cell",
    "owner",
    "unknown-decision",
    "extra-checkpoint",
    "wait-phase",
    "wait-ball",
    "teammate-cell",
    "clock",
    "turnover",
    "damage-subject",
    "actor-spent",
    "actor-offpitch"
  ])("withholds raw %s contradictions", (kind) => {
    const s = source(),
      info = s.question.payload!.RollInfos as Record<string, unknown>;
    if (kind === "declaration") {
      s.decl.actionCode = 3;
      s.decl.payload!.Action = 3;
    }
    if (kind === "used") s.choice.payload!.Used = 1;
    if (kind === "gamer") s.choice.payload!.GamerId = 0;
    if (kind === "original-die")
      (info.Dice as { Die: { Value: number } }).Die.Value = 2;
    if (kind === "final-die")
      (s.final.payload!.Dice as { Die: { Value: number } }).Die.Value = 2;
    if (kind === "modifiers") {
      s.final.payload!.Modifiers = { Modifier: { Value: -1 } };
      s.final.payload!.Difficulty = 4;
    }
    if (kind === "family") {
      s.final.rollType = 1;
      s.final.payload!.RollType = 1;
    }
    if (kind === "original-step")
      s.events.find(
        (e) =>
          e.actionId === s.question.actionId && e.sourceTag === "PlayerStep"
      )!.payload!.Skill = 7;
    if (kind === "cell")
      (
        s.events.find(
          (e) =>
            e.actionId === s.question.actionId && e.sourceTag === "PlayerStep"
        )!.payload!.CellTo as { X: number }
      ).X = 0;
    if (kind === "owner") s.final.actorTeamSource = "turn_inferred";
    if (kind === "unknown-decision") s.choice.payload!.UnmodeledEffect = 1;
    if (kind === "extra-checkpoint") {
      s.replay.boardCheckpoints!.push({
        ...structuredClone(s.before),
        afterSourceIndex: s.question.sourceIndex! - 1
      });
      s.replay.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
    }
    if (kind === "wait-phase") s.wait.board!.phaseCode = 3;
    if (kind === "wait-ball")
      s.wait.board!.ball.carrierId = Number(s.e.playerId);
    if (kind === "teammate-cell")
      s.wait.board!.teams[1]!.players.find((p) => p.id === 38)!.cell.x = 1;
    if (kind === "clock") s.wait.board!.teams[1]!.gameTurn = 14;
    if (kind === "turnover")
      s.events.find(
        (e) =>
          e.sourceTag === "EventEndTurn" &&
          e.sourceIndex! > s.final.sourceIndex!
      )!.reasonCode = 1;
    if (kind === "damage-subject") {
      const d = s.events.find(
        (e) =>
          e.sourceTag === "DamageStep" && e.sourceIndex! > s.final.sourceIndex!
      )!;
      d.targetId = "45";
      d.stepTargetId = "45";
    }
    if (kind === "actor-spent")
      s.before.board!.teams[1]!.players.find(
        (p) => String(p.id) === s.e.playerId
      )!.canAct = false;
    if (kind === "actor-offpitch")
      s.before.board!.teams[1]!.players.find(
        (p) => String(p.id) === s.e.playerId
      )!.cell.x = -1;
    expect(kept(analyzeReplayLuck(s.replay))).toBeUndefined();
  });
  it.each([
    "policy",
    "family",
    "chance",
    "endpoint",
    "original",
    "declaration",
    "gamer",
    "checkpoint",
    "spend",
    "overlap"
  ])("rejects a public %s forgery", (kind) => {
    const { r, e } = source(),
      b = e.contextualBounds!,
      m = e.metadata;
    if (kind === "policy") b.policy = "team_reroll_terminal_moves";
    if (kind === "family") m.rollType = 1;
    if (kind === "chance") b.successChance = 8 / 9;
    if (kind === "endpoint") b.lower = -999;
    if (kind === "original") m.originalDice = { Die: { DieType: 0, Value: 2 } };
    if (kind === "declaration")
      r.events.find(
        (x) => x.metadata.sourceId === m.preRoll!.activationId
      )!.metadata.actionCode = 3;
    if (kind === "gamer")
      r.events.find(
        (x) => x.metadata.sourceId === m.rerollDecisionId
      )!.metadata.teamRerollDecision!.gamerId = 0;
    if (kind === "checkpoint") b.terminalCheckpointAfter!--;
    if (kind === "spend") m.teamRerollsSpent = 1;
    if (kind === "overlap")
      e.catchPossessionBounds = {
        policy: "kept_catch_failure_envelope",
        successChance: 2 / 3,
        minimumDifference: 0,
        maximumDifference: 2,
        lower: -4 / 3,
        upper: 0
      };
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("has zero expected dice deviation for every fixed eligibility count without converting an envelope to a mean", () => {
    const c = source().e.metadata.preRoll!;
    for (let n = 0; n <= 8; n++)
      expect(
        [1, 2, 3, 4, 5, 6].reduce(
          (sum, face) => sum + ((Number(face >= 3) - 2 / 3) * n) / 6,
          0
        )
      ).toBeCloseTo(0, 12);
    expect(
      estimateKeptDodgeMoveBounds(
        {
          ...c,
          ordinaryMoveAvailability: {
            ...c.ordinaryMoveAvailability!,
            unknownPlayerIds: []
          }
        },
        2 / 3,
        1
      )
    ).toBeUndefined();
  });
  it("leaves modified and special-action corpus examples outside this slice", () => {
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo8.bbr", "utf8")
    );
    for (const id of ["source-308", "source-1426", "source-1777"])
      expect(
        r.events.find((e) => e.metadata.sourceId === id)!.contextualBounds
      ).toBeUndefined();
  });
});
