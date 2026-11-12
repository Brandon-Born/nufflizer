import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainContextBounds } from "@/domain/nufflizer/presentation";
import { lonerDriveXml } from "../helpers/lonerDrive";
const evidence = "tests/fixtures/evidence/bb3-kept-rush-moves.json";
const facts = JSON.parse(readFileSync(evidence, "utf8")).cases[0] as {
  sha256: string;
  possiblePlayerIds: string[];
  maximumMoves: number;
  priorSuccessDie: number;
  prefixMoves: unknown[];
};
const xml = () =>
  lonerDriveXml("retained_original_second_rush_failure", evidence);
const report = () => analyzeNufflizerInput(xml());
const kept = (r: ReturnType<typeof report>) =>
  r.events.find((e) => e.metadata.retainedRushContext)!;
function source() {
  const replay = parseReplayXml(xml()),
    r = analyzeReplayLuck(replay),
    e = kept(r),
    p = e.metadata.retainedRushContext!;
  const events = replay.turns.flatMap((t) => t.events),
    at = (id: string) => events.find((e) => e.id === id)!;
  const final = at(e.metadata.sourceId!),
    question = at(p.questionSourceId),
    resume = replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === p.resumeCheckpointAfter
    )!;
  return {
    replay,
    r,
    e,
    p,
    events,
    at,
    final,
    question,
    resume,
    decl: at(p.declarationSourceId),
    success: at(p.successRushSourceId),
    choice: at(p.decisionSourceId),
    wait: replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === p.waitingCheckpointAfter
    )!
  };
}
describe("retained original Rush under its fixed observed decline policy", () => {
  it("bounds the original failed die from its source-qualified ordinary prefix and terminal fall", () => {
    const r = report(),
      e = kept(r),
      p = e.metadata.retainedRushContext!;
    expect(e).toMatchObject({
      teamId: "1",
      playerId: "46",
      type: "movement_risk",
      actualSuccess: false,
      probabilitySuccess: 5 / 6
    });
    expect(e.metadata).toMatchObject({
      rerollUsed: false,
      teamRerollsSpent: 0,
      originalDice: { Die: { DieType: 0, Value: 1 } },
      dice: [1],
      preRoll: {
        activationId: null,
        actorCell: { x: 15, y: 9 },
        actorCarriesBall: false,
        teamTurn: 9
      }
    });
    expect(
      e.metadata.preRoll!.ordinaryMoveAvailability!.unknownPlayerIds
    ).toEqual(facts.possiblePlayerIds);
    expect(e.contextualBounds).toMatchObject({
      policy: "kept_rush_terminal_moves",
      successChance: 5 / 6,
      minimumMoves: 0,
      maximumMoves: 9,
      lower: -15 / 2,
      upper: 0
    });
    expect(p).toMatchObject({
      from: { x: 16, y: 9 },
      via: { x: 15, y: 9 },
      destination: { x: 14, y: 9 }
    });
    expect(e.metadata.movementFall).toMatchObject({
      diceContribution: -5 / 3,
      unscoredDamageRolls: 1,
      playerRemoved: true
    });
    const prior = r.events.find(
      (e) => e.metadata.sourceId === p.successRushSourceId
    )!;
    expect(prior.metadata.dice).toEqual([facts.priorSuccessDie]);
    expect(prior.weightedDelta).toBeCloseTo(1 / 6, 12);
    expect(prior.contextualBounds).toBeUndefined();
    const receipts = r.events.filter((e) =>
      [p.doMoveSourceId, p.moveOutcomeSourceId].includes(e.metadata.sourceId!)
    );
    expect(receipts).toHaveLength(2);
    expect(
      receipts.every(
        (e) =>
          e.scoringStatus === "excluded" && e.metadata.isRollCandidate === false
      )
    ).toBe(true);
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    expect(r.verdict.luckierTeam).toBe("unknown");
    expect(explainContextBounds(e)).toContain("Before the original Rush die");
    expect(explainContextBounds(e)).toContain("not a new random draw");
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
  });
  it("joins full original source locators and independent rational/geometry facts", () => {
    const input = readFileSync("demo-replays/demo2.bbr");
    expect(createHash("sha256").update(input).digest("hex")).toBe(facts.sha256);
    const r = analyzeNufflizerInput(input.toString()),
      e = kept(r);
    expect(e.metadata.sourceId).toBe("source-2704");
    expect(e.metadata.locator?.replayStep).toBe(337);
    expect(e.metadata.retainedRushContext).toMatchObject({
      declarationSourceId: "source-2677",
      resumeCheckpointAfter: 2693,
      successRushSourceId: "source-2696",
      doMoveSourceId: "source-2697",
      moveOutcomeSourceId: "source-2698",
      questionSourceId: "source-2700",
      decisionSourceId: "source-2703",
      waitingCheckpointAfter: 2700
    });
    expect(
      e.metadata.preRoll!.ordinaryMoveAvailability!.unknownPlayerIds
    ).toEqual(facts.possiblePlayerIds);
    expect(facts.prefixMoves).toHaveLength(5);
    const summary = r.contextComponents.find((t) => t.teamId === "1")!;
    expect(summary.componentCount).toBe(4);
    expect(summary.bounds!.lower).toBeCloseTo(-77 / 6, 12);
    expect(summary.bounds!.upper).toBeCloseTo(11 / 6, 12);
    expect(
      summary.byAction.find((a) => a.eventIds.includes(e.id))!.eventIds
    ).toEqual([e.id]);
  });
  it("regenerates the independent stdlib source projection and exact interval", () => {
    const result = spawnSync(
      "python3",
      ["scripts/extract-kept-rush-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("-15/2");
  });
  it("retains wider uncertainty when the prior completed teammate's starting frame is absent", () => {
    const s = source();
    s.replay.boardCheckpoints = s.replay.boardCheckpoints!.filter(
      (c) => c.replayStep !== 1
    );
    s.replay.turns = s.replay.turns.map((t) => ({
      ...t,
      events: t.events.filter((e) => e.locator?.replayStep !== 1)
    }));
    const e = kept(analyzeReplayLuck(s.replay));
    expect(e.contextualBounds!.maximumMoves).toBe(10);
    expect(e.contextualBounds!.lower).toBeCloseTo(-25 / 3, 12);
    expect(
      e.metadata.preRoll!.ordinaryMoveAvailability!.unknownPlayerIds
    ).toContain("43");
  });
  it.each([
    "declaration",
    "prefix-skill",
    "prefix-geometry",
    "prefix-unknown",
    "prefix-wait",
    "extra-checkpoint",
    "previous-clock",
    "other-player",
    "owner",
    "fresh-family",
    "fresh-status",
    "fresh-extra",
    "summary",
    "original-die",
    "used",
    "gamer",
    "pending-skill",
    "wait-phase",
    "wait-ball",
    "turnover",
    "damage-subject",
    "actor-prone",
    "actor-spent",
    "prefix-checkpoint"
  ])("withholds a raw %s contradiction", (kind) => {
    const s = source(),
      info = s.question.payload!.RollInfos as Record<string, unknown>;
    const after = s.events.find(
      (e) => e.sourceIndex === s.decl.sourceIndex! + 1
    )!;
    if (kind === "prefix-checkpoint") {
      const extra = structuredClone(s.resume);
      extra.afterSourceIndex = s.decl.sourceIndex! + 3;
      extra.board!.teams[1]!.players.find((p) => p.id === 46)!.cell = {
        x: 14,
        y: 5
      };
      s.replay.boardCheckpoints!.push(extra);
      s.replay.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
    }
    if (kind === "actor-prone")
      s.resume.board!.teams[1]!.players.find((p) => p.id === 46)!.statusCode =
        1;
    if (kind === "actor-spent")
      s.resume.board!.teams[1]!.players.find((p) => p.id === 46)!.canAct =
        false;
    if (kind === "declaration") {
      s.decl.actionCode = 3;
      s.decl.payload!.Action = 3;
    }
    if (kind === "prefix-skill") after.payload!.Skill = 7;
    if (kind === "prefix-geometry")
      (after.payload!.CellFrom as { X: number }).X = 0;
    if (kind === "prefix-unknown")
      s.events.find(
        (e) => e.sourceIndex === s.decl.sourceIndex! + 2
      )!.sourceTag = "UnmodeledTransition";
    if (kind === "prefix-wait")
      s.events.find(
        (e) => e.sourceIndex === s.p.resumeCheckpointAfter
      )!.payload!.Phase = 3;
    if (kind === "extra-checkpoint") {
      s.replay.boardCheckpoints!.push({
        ...structuredClone(s.resume),
        afterSourceIndex: s.p.resumeCheckpointAfter + 1
      });
      s.replay.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
    }
    if (kind === "previous-clock")
      s.replay.boardCheckpoints!.find(
        (c) => c.afterSourceIndex === s.p.declarationCheckpointAfter
      )!.board!.teams[1]!.gameTurn = 10;
    if (kind === "other-player")
      s.resume.board!.teams[1]!.players.find((p) => p.id === 37)!.cell.x = 2;
    if (kind === "owner") s.final.actorTeamSource = "turn_inferred";
    if (kind === "fresh-family") {
      s.success.rollType = 2;
      s.success.payload!.RollType = 2;
    }
    if (kind === "fresh-status") s.success.payload!.Status = 2;
    if (kind === "fresh-extra") s.success.payload!.UnmodeledEffect = 1;
    if (kind === "summary")
      s.at(s.p.moveOutcomeSourceId).payload!.Rolls = {
        RollSummary: [
          { RollType: 1, Outcome: 1 },
          { RollType: 2, Outcome: 1 }
        ]
      };
    if (kind === "original-die")
      (info.Dice as { Die: { Value: number } }).Die.Value = 2;
    if (kind === "used") s.choice.payload!.Used = 1;
    if (kind === "gamer") s.choice.payload!.GamerId = 0;
    if (kind === "pending-skill")
      s.events.find(
        (e) => e.sourceIndex === s.question.sourceIndex! - 1
      )!.payload!.Skill = 7;
    if (kind === "wait-phase") s.wait.board!.phaseCode = 3;
    if (kind === "wait-ball") s.wait.board!.ball.carrierId = 46;
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
    expect(kept(analyzeReplayLuck(s.replay))).toBeUndefined();
  });
  it.each([
    "declaration",
    "resume",
    "waiting",
    "success",
    "move",
    "outcome",
    "question",
    "decision",
    "from",
    "via",
    "destination",
    "policy",
    "chance",
    "endpoint",
    "original",
    "proof",
    "bound",
    "question-step",
    "choice-step"
  ])("rejects public %s forgeries without throwing", (kind) => {
    const r = report(),
      e = kept(r),
      p = e.metadata.retainedRushContext!,
      b = e.contextualBounds!;
    if (kind === "question-step")
      r.events.find(
        (e) => e.metadata.sourceId === p.questionSourceId
      )!.metadata.stepType = 0;
    if (kind === "choice-step")
      r.events.find(
        (e) => e.metadata.sourceId === p.decisionSourceId
      )!.metadata.stepType = 6;
    if (kind === "declaration") p.declarationSourceId = p.successRushSourceId;
    if (kind === "resume") p.resumeCheckpointAfter++;
    if (kind === "waiting") p.waitingCheckpointAfter = 0;
    if (kind === "success") p.successRushSourceId = e.metadata.sourceId!;
    if (kind === "move") p.doMoveSourceId = p.moveOutcomeSourceId;
    if (kind === "outcome") p.moveOutcomeSourceId = p.doMoveSourceId;
    if (kind === "question") p.questionSourceId = p.decisionSourceId;
    if (kind === "decision") p.decisionSourceId = p.questionSourceId;
    if (kind === "from") p.from.x = 0;
    if (kind === "via") p.via.x = 0;
    if (kind === "destination") p.destination.x = 0;
    if (kind === "policy") b.policy = "team_reroll_rush_moves";
    if (kind === "chance") b.successChance = 35 / 36;
    if (kind === "endpoint") b.lower = 0;
    if (kind === "original")
      e.metadata.originalDice = { Die: { DieType: 0, Value: 2 } };
    if (kind === "proof") delete e.metadata.retainedRushContext;
    if (kind === "bound") delete e.contextualBounds;
    expect(() => LuckReportSchema.safeParse(r)).not.toThrow();
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("preserves raw input, names and prefix-only evidence independently of future observations", () => {
    const s = source(),
      before = structuredClone(s.replay),
      r = analyzeReplayLuck(s.replay);
    expect(s.replay).toEqual(before);
    s.replay.teams.forEach((t) => (t.name = "Changed initial label"));
    const end = s.events.find(
      (e) =>
        e.sourceTag === "EventEndTurn" && e.sourceIndex! > s.final.sourceIndex!
    )!.sourceIndex!;
    s.replay.turns = s.replay.turns
      .map((t) => ({
        ...t,
        events: t.events.filter((e) => e.sourceIndex! <= end)
      }))
      .filter((t) => t.events.length);
    s.replay.boardCheckpoints = s.replay.boardCheckpoints!.filter(
      (c) => c.afterSourceIndex <= s.p.waitingCheckpointAfter
    );
    expect(kept(analyzeReplayLuck(s.replay)).contextualBounds).toEqual(
      kept(r).contextualBounds
    );
  });
  it("does not score the kept original twice after another repeated summary", () => {
    const s = source(),
      t = s.replay.turns.find((t) => t.events.includes(s.final))!,
      copy = { ...structuredClone(s.final), id: "duplicate-kept-original" };
    t.events.splice(t.events.indexOf(s.final) + 1, 0, copy);
    const after = analyzeReplayLuck(s.replay);
    expect(kept(after)).toBeUndefined();
    expect(after.teams.map((t) => t.luckScore)).toEqual(
      s.r.teams.map((t) => t.luckScore)
    );
  });
  it("has zero mean for every fixed eligible count under the same decline policy", () => {
    for (const n of [0, 1, 3, 9])
      expect(
        [1, 2, 3, 4, 5, 6].reduce(
          (sum, face) => sum + ((Number(face >= 2) - 5 / 6) * n) / 6,
          0
        )
      ).toBeCloseTo(0, 12);
  });
  it("prints the original-die policy separately from earlier Rush and damage dice", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        "demo-replays/demo2.bbr",
        "--format",
        "text"
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Before the original Rush die");
    expect(result.stdout).toContain("recorded decline-on-failure policy fixed");
    expect(result.stdout).toContain("-7.50 to 0.00 provisional context units");
    expect(result.stdout).toContain("not a new random draw");
  });
});
