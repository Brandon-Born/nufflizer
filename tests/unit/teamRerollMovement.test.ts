import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { reconstructReplayContext } from "@/domain/replay/reconstructContext";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainMovementOutcome } from "@/domain/nufflizer/presentation";
import type { ReplayModel, ReplayEvent } from "@/domain/replay/types";

const evidence = "tests/fixtures/evidence/bb3-team-reroll-movement.json";
const xml = (id = "team_rush_carrier") => lonerDriveXml(id, evidence);
function source(id?: string) {
  const replay = parseReplayXml(xml(id));
  const proof = [
    ...reconstructReplayContext(replay).teamRerollMovements.values()
  ][0]!;
  const events = replay.turns.flatMap((t) => t.events);
  const at = (id: string) => events.find((e) => e.id === id)!;
  const question = at(proof.questionSourceId),
    choice = at(proof.decisionSourceId);
  const final = events.find((e) => e.sourceIndex === choice.sourceIndex! + 1)!;
  const waiting = replay.boardCheckpoints!.find(
    (c) => c.afterSourceIndex === proof.checkpointAfter
  )!;
  const owner = waiting.board!.teams.find((t) =>
    t.players.some((p) => String(p.id) === final.playerId)
  )!;
  return {
    replay,
    proof,
    events,
    question,
    choice,
    final,
    waiting,
    owner,
    actor: owner.players.find((p) => String(p.id) === final.playerId)!,
    declaration: at(proof.declarationSourceId),
    doMove: at(proof.doMoveSourceId),
    outcome: at(proof.outcomeSourceId)
  };
}
// Synthetic observation probe immediately after the real confirmed move. It
// asks what the reducer knows before any following source checkpoint.
function probeAfter(r: ReplayModel, outcome: ReplayEvent) {
  const probe: ReplayEvent = {
    ...outcome,
    id: "synthetic-after-move",
    sourceIndex: outcome.sourceIndex! + 1,
    type: "roll",
    sourceTag: "ResultRoll",
    rollType: 1,
    payload: {
      Status: 1,
      NewRoll: 1,
      RollType: 1,
      Requirement: 2,
      Difficulty: 2,
      Outcome: 1,
      Dice: { Die: { DieType: 0, Value: 4 } }
    }
  };
  for (const c of r.boardCheckpoints!)
    if (c.afterSourceIndex >= outcome.sourceIndex!) c.afterSourceIndex++;
  for (const e of r.turns.flatMap((t) => t.events))
    if (e.sourceIndex! > outcome.sourceIndex!) e.sourceIndex!++;
  const turn = r.turns.find((t) => t.events.includes(outcome))!;
  turn.events.splice(turn.events.indexOf(outcome) + 1, 0, probe);
  return probe;
}
describe("actual movement after a direct committed team-rerolled Rush", () => {
  it.each([
    ["team_dodge_move", 7, 6, 10, 6, 11, 6],
    ["team_dodge_second_move", 7, 6, 11, 13, 10, 13],
    ["team_dodge_diagonal_move", 7, 6, 15, 10, 14, 11],
    ["team_dodge_missing_period", 4, 3, 17, 5, 18, 6]
  ] as const)(
    "retains fresh ordinary Dodge movement %s",
    (id, before, after, x, y, tx, ty) => {
      const s = source(id),
        probe = probeAfter(s.replay, s.outcome);
      const context = reconstructReplayContext(s.replay),
        proof = context.teamRerollMovements.get(s.final.id!)!;
      expect(proof).toMatchObject({
        rollType: 2,
        movementBefore: before,
        movementAfter: after,
        from: { x, y },
        to: { x: tx, y: ty }
      });
      expect(context.preRollEvidence.get(probe.id!)).toMatchObject({
        actorCell: { x: tx, y: ty },
        actorMovementRemaining: after
      });
      const r = LuckReportSchema.parse(analyzeReplayLuck(s.replay)),
        e = r.events.find((e) => e.metadata.sourceId === s.final.id)!;
      expect(e.probabilitySuccess).toBeCloseTo(8 / 9, 12);
      expect(e.delta).toBeCloseTo(1 / 9, 12);
      expect(explainMovementOutcome(e.metadata)).toContain(
        `${after} movement points remained`
      );
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    }
  );
  it("keeps an omitted waiting Dodge budget unknown rather than inheriting the earlier budget", () => {
    const s = source("team_dodge_move");
    s.actor.movementRemaining = null;
    const proof = [
      ...reconstructReplayContext(s.replay).teamRerollMovements.values()
    ][0]!;
    expect(proof).toMatchObject({ movementBefore: null, movementAfter: null });
    expect(
      LuckReportSchema.safeParse(analyzeReplayLuck(s.replay)).success
    ).toBe(true);
  });
  it.each([0, -1, 17, 1.5])(
    "withholds a Dodge with unsupported fresh budget %s",
    (budget) => {
      const s = source("team_dodge_move");
      s.actor.movementRemaining = budget;
      expect(reconstructReplayContext(s.replay).teamRerollMovements.size).toBe(
        0
      );
    }
  );
  it("excludes the real Blitz Dodge source without changing its raw two-attempt dice", () => {
    const r = analyzeNufflizerInput(xml("team_dodge_late_move"));
    expect(r.events.some((e) => e.metadata.teamRerollMovement)).toBe(false);
    expect(
      r.events.find((e) => e.metadata.rerollResource === "team")
        ?.probabilitySuccess
    ).toBeCloseTo(8 / 9, 12);
  });
  it.each(["cost", "family", "unknown_budget"] as const)(
    "rejects a forged Dodge %s",
    (change) => {
      const r = analyzeNufflizerInput(xml("team_dodge_move")),
        proof = r.events.find((e) => e.metadata.teamRerollMovement)!.metadata
          .teamRerollMovement!;
      if (change === "cost") proof.movementAfter = proof.movementBefore;
      if (change === "family") proof.rollType = 1;
      if (change === "unknown_budget") proof.movementBefore = null;
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  );
  it.each([
    ["team_rush_move", 17, 9, 17, 10, null],
    ["team_rush_unknown_ball_after_dodge", 20, 12, 19, 13, null],
    ["team_rush_second_move", 16, 8, 16, 9, false],
    ["team_rush_third_move", 13, 12, 14, 12, false],
    ["team_rush_away_move", 8, 8, 8, 9, false],
    ["team_rush_diagonal_move", 6, 5, 7, 6, false],
    ["team_rush_carrier", 9, 12, 10, 12, true],
    ["team_rush_touchdown", 24, 12, 25, 12, true],
    ["team_rush_carrier_unknown_side", 23, 12, 24, 13, true]
  ] as const)(
    "reconciles independent %s source and adds no extra die or point",
    (id, x, y, tx, ty, held) => {
      const r = analyzeNufflizerInput(xml(id)),
        moves = r.events.filter((e) => e.metadata.teamRerollMovement);
      expect(moves).toHaveLength(1);
      const e = moves[0]!;
      expect(e.metadata.teamRerollMovement).toMatchObject({
        rollType: 1,
        from: { x, y },
        to: { x: tx, y: ty },
        movementBefore: null,
        movementAfter: null,
        carriesBall: held
      });
      expect(e.probabilitySuccess).toBeCloseTo(35 / 36, 12);
      expect(e.delta).toBeCloseTo(1 / 36, 12);
      expect(e.metadata.preRoll?.actorCell).toEqual({ x, y });
      for (const tag of [
        "ResultDoMove",
        "ResultMoveOutcome",
        "ResultTeamRerollUsage"
      ])
        expect(
          r.events
            .filter((e) => e.metadata.sourceTag === tag)
            .every((e) => e.scoringStatus === "excluded" && e.delta === 0)
        ).toBe(true);
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
      expect(explainMovementOutcome(e.metadata)).toContain(
        "waiting snapshot omitted remaining movement"
      );
      if (held)
        expect(explainMovementOutcome(e.metadata)).toContain(
          "explicitly held ball followed"
        );
      if (id === "team_rush_touchdown")
        expect(explainMovementOutcome(e.metadata)).toContain(
          "touchdown immediately after"
        );
    }
  );
  it("retains raw waiting omissions and source locators, without inventing a stable budget", () => {
    const data = JSON.parse(readFileSync(evidence, "utf8"));
    const c = data.cases.find(
      (c: { id: string }) => c.id === "team_rush_carrier"
    );
    const waiting = c.records.find(
      (r: { replayStep: number; projection?: { BoardState?: unknown } }) =>
        r.replayStep === 43 && r.projection?.BoardState
    ).projection.BoardState;
    expect(waiting.IsStable).toBeUndefined();
    const actor =
      waiting.ListTeams[0].TeamState[0].ListPitchPlayers[0].PlayerState.find(
        (p: { Id: string[] }) => p.Id[0] === "10"
      );
    expect(actor.MovePoint).toBeUndefined();
    expect(actor.Cell[0]).toEqual({ X: ["9"], Y: ["12"] });
    expect(waiting.Ball[0]).toMatchObject({ Carrier: ["10"], IsHeld: ["1"] });
    const s = source();
    expect(s.actor.movementRemaining).toBeNull();
    expect(s.waiting.board!.stable).toBeNull();
  });
  it("preserves later actual carrier position and unknown traits immutably", () => {
    const s = source(),
      probe = probeAfter(s.replay, s.outcome),
      copy = structuredClone(s.replay);
    const c = reconstructReplayContext(s.replay),
      later = c.preRollEvidence.get(probe.id!)!;
    expect(later).toMatchObject({
      actorCell: s.proof.to,
      actorCarriesBall: true
    });
    expect(later.actorMovementRemaining).toBeUndefined();
    expect(later.actorTraits).toBeUndefined();
    expect(s.replay).toEqual(copy);
    expect(c.preRollEvidence.get(s.question.id!)?.actorCell).toEqual(
      s.proof.from
    );
  });
  it("can retain an explicitly observed zero budget, without a decrement or reset", () => {
    const s = source();
    s.actor.movementRemaining = 0;
    const p = [
      ...reconstructReplayContext(s.replay).teamRerollMovements.values()
    ][0]!;
    expect(p).toMatchObject({ movementBefore: 0, movementAfter: 0 });
    expect(
      LuckReportSchema.safeParse(analyzeReplayLuck(s.replay)).success
    ).toBe(true);
  });
  it("never repairs a failed terminal outcome from its future board", () => {
    const s = source();
    s.final.payload!.Outcome = 0;
    (s.final.payload!.Dice as { Die: { Value: number } }).Die.Value = 1;
    const probe = probeAfter(s.replay, s.outcome),
      result = reconstructReplayContext(s.replay);
    expect(result.teamRerollMovements.size).toBe(0);
    expect(result.preRollEvidence.has(probe.id!)).toBe(false);
  });
  it("reconciles all independently extracted carrier-checkpoint numeric chains", () => {
    type Numeric = Record<string, unknown[]>;
    type Row = {
      sourceFile: string;
      sha256: string;
      resultLocator: Record<string, number>;
      originalStep: Numeric;
      terminalStep: Numeric;
      question: Numeric;
      choice: Numeric;
      result: Numeric;
    };
    const rows = JSON.parse(
      readFileSync(
        "tests/fixtures/evidence/bb3-checkpoint-rerolls.json",
        "utf8"
      )
    ).cases as Row[];
    const expected: Record<string, number> = {
      "demo-goblins1.bbr": 0,
      "demo1.bbr": 9,
      "demo2.bbr": 9,
      "demo3.bbr": 7,
      "demo4.bbr": 1,
      "demo5.bbr": 2,
      "demo6.bbr": 2,
      "demo7.bbr": 4,
      "demo8.bbr": 6,
      "demo9.bbr": 2,
      "demo11.bbr": 7
    };
    let used = 0,
      kept = 0,
      moves = 0,
      ranges = 0;
    for (const [file, count] of Object.entries(expected)) {
      const bytes = readFileSync(`demo-replays/${file}`),
        r = analyzeNufflizerInput(bytes.toString("utf8"));
      const cases = rows.filter((c) => c.sourceFile === file);
      let admitted = 0;
      for (const c of cases) {
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(c.sha256);
        const e = r.events.find(
          (e) =>
            JSON.stringify(e.metadata.locator) ===
            JSON.stringify(c.resultLocator)
        );
        if (e?.scoringStatus !== "scored") continue;
        admitted++;
        const original = c.question.RollInfos![0] as Numeric,
          target = Number(original.Difficulty![0]),
          p = (7 - target) / 6;
        const didUse = Number(c.choice.Used![0]) === 1;
        expect(Number(original.Outcome![0])).toBe(0);
        expect(Number(original.Status![0])).toBe(1);
        expect(Number(original.NewRoll![0])).toBe(1);
        expect(c.terminalStep.PlayerId).toEqual(c.originalStep.PlayerId);
        expect(c.terminalStep.TargetId).toEqual(c.originalStep.TargetId);
        expect(c.terminalStep.StepType).toEqual(c.originalStep.StepType);
        expect(c.choice.GamerId).toEqual(c.question.GamerId);
        expect(c.result.Difficulty).toEqual(original.Difficulty);
        expect(c.result.Requirement).toEqual(original.Requirement);
        expect(c.result.Modifiers).toEqual(original.Modifiers);
        expect(e.probabilitySuccess).toBeCloseTo(
          didUse ? 1 - (1 - p) ** 2 : p,
          12
        );
        expect(e.delta).toBeCloseTo(
          Number(c.result.Outcome![0]) - e.probabilitySuccess!,
          12
        );
        expect(Number(c.result.NewRoll![0])).toBe(didUse ? 1 : 0);
        if (didUse) {
          used++;
          expect(e.metadata.teamRerollsSpent).toBe(1);
          expect(Number(c.result.Status![0])).toBe(2);
        } else {
          kept++;
          expect(c.result.Dice).toEqual(original.Dice);
          expect(e.metadata.teamRerollsSpent).toBe(0);
        }
      }
      expect(admitted, file).toBe(count);
      moves += r.events.filter((e) => e.metadata.teamRerollMovement).length;
      ranges += r.events.filter(
        (e) =>
          e.contextualBounds || e.possessionBounds || e.catchPossessionBounds
      ).length;
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
    expect({ used, kept, moves, ranges }).toEqual({
      used: 37,
      kept: 12,
      moves: 15,
      ranges: 24
    });
  }, 60000);
  it.each([
    "question_gamer",
    "choice_gamer",
    "choice_unused",
    "choice_payload",
    "offer_payload",
    "owner",
    "inferred_owner",
    "target",
    "declaration",
    "evaluation",
    "resume_cell",
    "positive_budget",
    "prone",
    "spent_actor",
    "effect",
    "occupied",
    "unknown_position",
    "duplicate_cell",
    "phase",
    "controller",
    "clock",
    "original_checkpoint",
    "failed_final",
    "freshness",
    "threshold",
    "modifier",
    "roll_payload",
    "move_payload",
    "combined_summary",
    "pushback",
    "outcome_false",
    "unmarked_carrier",
    "unknown_message",
    "loner_gate",
    "intervening_checkpoint"
  ] as const)("withholds actual movement for %s", (change) => {
    const s = source();
    const step = s.events.find(
      (e) => e.sourceTag === "PlayerStep" && e.actionId === s.choice.actionId
    )!;
    if (change === "question_gamer") s.question.payload!.GamerId = 1;
    if (change === "choice_gamer") s.choice.payload!.GamerId = 1;
    if (change === "choice_unused") s.choice.payload!.Used = 0;
    if (change === "choice_payload") s.choice.payload!.Unexpected = 1;
    if (change === "offer_payload") s.question.payload!.Unexpected = 1;
    if (change === "owner") s.final.actorTeamId = "1";
    if (change === "inferred_owner") s.final.actorTeamSource = "turn_inferred";
    if (change === "target") s.final.targetId = "999";
    if (change === "declaration") s.declaration.actionCode = 3;
    if (change === "evaluation") step.payload!.IsEvaluation = 1;
    if (change === "resume_cell") step.payload!.CellTo = { x: 20, y: 12 };
    if (change === "positive_budget") s.actor.movementRemaining = 1;
    if (change === "prone") s.actor.statusCode = 1;
    if (change === "spent_actor") s.actor.canAct = false;
    if (change === "effect") s.actor.mentalEffect = { providerSkillId: 31 };
    if (change === "occupied")
      s.owner.players.find(
        (p) => p !== s.actor && p.pitchLocation === "on_pitch"
      )!.cell = { ...s.proof.to };
    if (change === "unknown_position")
      s.owner.players.find((p) => p !== s.actor)!.pitchLocation = "unknown";
    if (change === "duplicate_cell") {
      const ps = s.owner.players.filter(
        (p) => p !== s.actor && p.pitchLocation === "on_pitch"
      );
      ps[1]!.cell = { ...ps[0]!.cell };
    }
    if (change === "phase") s.waiting.board!.phaseCode = 4;
    if (change === "controller") s.waiting.board!.activeGamerId = 1;
    if (change === "clock") s.owner.gameTurn = s.owner.gameTurn! + 1;
    if (change === "original_checkpoint") {
      const c = structuredClone(s.waiting);
      c.afterSourceIndex = s.declaration.sourceIndex!;
      s.replay.boardCheckpoints!.splice(3, 0, c);
    }
    if (change === "failed_final") {
      s.final.payload!.Outcome = 0;
      (s.final.payload!.Dice as { Die: { Value: number } }).Die.Value = 1;
    }
    if (change === "freshness") s.final.payload!.NewRoll = 0;
    if (change === "threshold") s.final.payload!.Difficulty = 3;
    if (change === "modifier")
      s.final.payload!.Modifiers = { Modifier: { Value: 1 } };
    if (change === "roll_payload") s.final.payload!.Unexpected = 1;
    if (change === "move_payload") s.doMove.payload = { Unexpected: 1 };
    if (change === "combined_summary")
      s.outcome.payload!.Rolls = {
        RollSummary: [
          { RollType: 1, Outcome: 1 },
          { RollType: 2, Outcome: 1 }
        ]
      };
    if (change === "pushback") s.outcome.payload!.Pushbacks = { PlayerId: 1 };
    if (change === "outcome_false") s.outcome.payload!.Moved = 0;
    if (change === "unmarked_carrier")
      s.events.find(
        (e) => e.sourceIndex! > s.question.sourceIndex! && e.checkpointCarrier
      )!.checkpointCarrier = false;
    if (change === "unknown_message" || change === "loner_gate") {
      s.doMove.sourceTag =
        change === "loner_gate" ? "ResultSkillUsage" : "UnknownMessage";
      s.doMove.payload = change === "loner_gate" ? { Skill: 44, Used: 1 } : {};
    }
    if (change === "intervening_checkpoint") {
      const c = structuredClone(s.waiting);
      c.afterSourceIndex = s.choice.sourceIndex!;
      s.replay.boardCheckpoints!.splice(4, 0, c);
    }
    expect(reconstructReplayContext(s.replay).teamRerollMovements.size).toBe(0);
  });
  it.each([
    "unmarked",
    "unknown",
    "changed_turn",
    "changed_controller",
    "unknown_board"
  ] as const)("does not repair reroll odds after %s", (change) => {
    const s = source();
    const marker = s.events.find(
      (e) => e.sourceIndex! > s.question.sourceIndex! && e.checkpointCarrier
    )!;
    if (change === "unmarked") marker.checkpointCarrier = false;
    if (change === "unknown") marker.sourceTag = "UnknownMessage";
    if (change === "changed_turn") s.owner.gameTurn = s.owner.gameTurn! + 1;
    if (change === "changed_controller") s.waiting.board!.activeGamerId = 1;
    if (change === "unknown_board") s.waiting.board = null;
    const e = analyzeReplayLuck(s.replay).events.find(
      (e) => e.metadata.sourceId === s.final.id
    )!;
    expect(e.scoringStatus).toBe("excluded");
    expect(e.probabilitySuccess).toBeNull();
    expect(e.metadata.teamRerollMovement).toBeUndefined();
  });
  it.each([
    "question",
    "choice",
    "declaration",
    "outcome",
    "gamer",
    "from",
    "to",
    "checkpoint",
    "budget",
    "source_order"
  ] as const)("rejects forged %s report proof", (change) => {
    const r = analyzeNufflizerInput(xml()),
      e = r.events.find((e) => e.metadata.teamRerollMovement)!,
      p = e.metadata.teamRerollMovement!;
    if (change === "question") p.questionSourceId = p.outcomeSourceId;
    if (change === "choice") p.decisionSourceId = p.questionSourceId;
    if (change === "declaration") p.declarationSourceId = p.doMoveSourceId;
    if (change === "outcome") p.outcomeSourceId = p.doMoveSourceId;
    if (change === "gamer") p.gamerId = 1;
    if (change === "from") p.from.x--;
    if (change === "to") p.to.x += 2;
    if (change === "checkpoint") p.originalCheckpointAfter = p.checkpointAfter;
    if (change === "budget") p.movementAfter = 0;
    if (change === "source_order")
      r.events.find((e) => e.metadata.sourceId === p.doMoveSourceId)!.metadata
        .sourceIndex!++;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("prints actual movement independently of top-swing selection", () => {
    const dir = mkdtempSync(join(tmpdir(), "nufflizier-team-move-"));
    try {
      const file = join(dir, "source.xml");
      writeFileSync(file, xml());
      const run = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          file,
          "--format",
          "text"
        ],
        { encoding: "utf8", timeout: 20000 }
      );
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain("successful team-rerolled Rush");
      expect(run.stdout).toContain("explicitly held ball followed");
      expect(run.stdout).toContain("actual movement adds no luck score");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
