import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { reconstructReplayContext } from "@/domain/replay/reconstructContext";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainMovementOutcome } from "@/domain/nufflizer/presentation";
import type { ReplayModel, ReplayEvent } from "@/domain/replay/types";
import { lonerDriveXml } from "../helpers/lonerDrive";
const replay = (id = "terminal_dodge_success") =>
  parseReplayXml(
    lonerDriveXml(id, "tests/fixtures/evidence/bb3-dodge-successors.json")
  );
function chain(r: ReplayModel) {
  const turn = r.turns.find((t) =>
    t.events.some(
      (e) => e.sourceTag === "ResultSkillUsage" && e.payload?.Skill === 7
    )
  )!;
  const index = turn.events.findIndex(
    (e) => e.sourceTag === "ResultSkillUsage" && e.payload?.Skill === 7
  );
  return {
    turn,
    original: turn.events[index - 1]!,
    skill: turn.events[index]!,
    final: turn.events[index + 1]!,
    doMove: turn.events[index + 2]!,
    outcome: turn.events[index + 3]!
  };
}
// Explicit synthetic probe after the source's second ordinary move, before its
// next checkpoint: no source availability, traits or clock values are filled.
function probeAfterTwoMoves(r: ReplayModel) {
  const c = chain(r),
    last = c.turn.events.find(
      (e) =>
        e.sourceTag === "ResultMoveOutcome" &&
        e.sourceIndex! > c.outcome.sourceIndex! &&
        e.playerId === c.final.playerId
    )!;
  const probe: ReplayEvent = {
    ...last,
    id: "synthetic-later-check",
    sourceIndex: last.sourceIndex! + 1,
    sourceTag: "ResultRoll",
    type: "roll",
    rollType: 2,
    payload: {
      Status: 1,
      Requirement: 3,
      Difficulty: 3,
      RollType: 2,
      Outcome: 0,
      NewRoll: 1,
      Dice: { Die: { DieType: 0, Value: 1 } }
    }
  };
  for (const checkpoint of r.boardCheckpoints ?? [])
    if (checkpoint.afterSourceIndex >= last.sourceIndex!)
      checkpoint.afterSourceIndex++;
  const insertion = c.turn.events.indexOf(last) + 1;
  for (const event of r.turns.flatMap((t) => t.events))
    if (event.sourceIndex! > last.sourceIndex!) event.sourceIndex!++;
  c.turn.events.splice(insertion, 0, probe);
  return probe;
}
describe("actual movement after a recorded own Dodge replacement", () => {
  it("advances only after the source confirms movement and preserves6→5→4 across two moves", () => {
    const r = replay(),
      c = chain(r),
      probe = probeAfterTwoMoves(r),
      copy = structuredClone(r);
    const result = reconstructReplayContext(r),
      move = result.dodgeMovements.get(c.final.id!)!;
    expect(move).toMatchObject({
      from: { x: 12, y: 2 },
      to: { x: 13, y: 3 },
      movementBefore: 6,
      movementAfter: 5,
      carriesBall: false,
      doMoveSourceId: c.doMove.id,
      outcomeSourceId: c.outcome.id
    });
    expect(result.preRollEvidence.get(probe.id!)).toMatchObject({
      actorCell: { x: 14, y: 3 },
      actorMovementRemaining: 4,
      actorDodgeMoveSourceId: c.final.id
    });
    expect(r).toEqual(copy);
    const report = LuckReportSchema.parse(analyzeReplayLuck(r));
    const terminal = report.events.find(
      (e) => e.metadata.sourceId === c.final.id
    )!;
    expect(terminal.metadata.dodgeMovement).toEqual(move);
    expect(terminal.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(explainMovementOutcome(terminal.metadata)).toContain(
      "5 movement points remained"
    );
    expect(
      report.events.find((e) => e.metadata.sourceId === c.outcome.id)
        ?.scoringStatus
    ).toBe("excluded");
  });
  it("prints the observed move in CLI text independently of the top-swing selection", () => {
    const dir = mkdtempSync(join(tmpdir(), "nufflizier-dodge-"));
    try {
      const path = join(dir, "source.xml");
      writeFileSync(
        path,
        lonerDriveXml(
          "terminal_dodge_success",
          "tests/fixtures/evidence/bb3-dodge-successors.json"
        )
      );
      const run = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          path,
          "--format",
          "text"
        ],
        { encoding: "utf8", timeout: 20000 }
      );
      expect(run.status).toBe(0);
      expect(run.stdout).toContain(
        "replay confirms this move after the successful Dodge skill reroll"
      );
      expect(run.stdout).toContain(
        "5 movement points remained after this step"
      );
      expect(run.stdout).toContain("observed movement adds no luck score");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("follows an explicitly held ball through both verified moves without pricing possession", () => {
    const r = replay(),
      c = chain(r),
      probe = probeAfterTwoMoves(r);
    const checkpoint = r.boardCheckpoints!.find(
      (p) =>
        p.afterSourceIndex ===
        reconstructReplayContext(r).preRollEvidence.get(c.original.id!)!
          .checkpointAfter
    )!;
    checkpoint.board!.ball = {
      cell: { x: 12, y: 2 },
      carrierId: 47,
      holderRosterIndex: 1,
      isHeld: true,
      possession: "held"
    };
    const result = reconstructReplayContext(r);
    expect(result.dodgeMovements.get(c.final.id!)).toMatchObject({
      carriesBall: true,
      movementAfter: 5
    });
    expect(result.preRollEvidence.get(probe.id!)).toMatchObject({
      actorCarriesBall: true,
      actorCell: { x: 14, y: 3 },
      actorMovementRemaining: 4
    });
    const report = LuckReportSchema.parse(analyzeReplayLuck(r));
    const terminal = report.events.find(
      (e) => e.metadata.sourceId === c.final.id
    )!;
    expect(explainMovementOutcome(terminal.metadata)).toContain(
      "carried ball followed"
    );
    expect(terminal.contextualImpact).toBeUndefined();
  });
  it("keeps missing current movement unknown through the actual chain", () => {
    const r = replay(),
      c = chain(r),
      probe = probeAfterTwoMoves(r);
    const checkpoint = r.boardCheckpoints!.find(
      (p) =>
        p.afterSourceIndex ===
        reconstructReplayContext(r).preRollEvidence.get(c.original.id!)!
          .checkpointAfter
    )!;
    checkpoint.board!.teams[1]!.players.find(
      (p) => p.id === 47
    )!.movementRemaining = null;
    const result = reconstructReplayContext(r);
    expect(result.dodgeMovements.get(c.final.id!)).toMatchObject({
      movementBefore: null,
      movementAfter: null
    });
    expect(
      result.preRollEvidence.get(probe.id!)?.actorMovementRemaining
    ).toBeUndefined();
    expect(LuckReportSchema.safeParse(analyzeReplayLuck(r)).success).toBe(true);
  });
  it("confirms the moved player's completion only when a teammate actually declares its next activation", () => {
    const r = replay(),
      c = chain(r),
      probe = probeAfterTwoMoves(r);
    const checkpoint = r.boardCheckpoints!.find(
      (p) =>
        p.afterSourceIndex ===
        reconstructReplayContext(r).preRollEvidence.get(c.original.id!)!
          .checkpointAfter
    )!;
    const teammate = checkpoint.board!.teams[1]!.players.find(
      (p) => p.id === 37
    )!;
    teammate.canAct = true; // Explicit synthetic availability; source omits this flag.
    const declaration = c.turn.events.find(
      (e) => e.sourceTag === "ResultUseAction" && e.playerId === "47"
    )!;
    const step = c.turn.events.find((e) => e.id === "source-18")!;
    const index = c.turn.events.indexOf(probe);
    const newStep: ReplayEvent = {
      ...step,
      id: "synthetic-teammate-step",
      sourceIndex: probe.sourceIndex,
      actionId: "synthetic-teammate",
      playerId: "37",
      stepActorId: "37",
      payload: {
        ...step.payload,
        PlayerId: 37,
        CellFrom: { X: teammate.cell.x, Y: teammate.cell.y },
        CellTo: { X: teammate.cell.x, Y: teammate.cell.y }
      }
    };
    const next: ReplayEvent = {
      ...declaration,
      id: "synthetic-teammate-declaration",
      sourceIndex: probe.sourceIndex! + 1,
      actionId: "synthetic-teammate",
      playerId: "37",
      stepActorId: "37"
    };
    for (const e of c.turn.events.slice(index + 1)) e.sourceIndex!++;
    for (const p of r.boardCheckpoints!)
      if (p.afterSourceIndex >= probe.sourceIndex!) p.afterSourceIndex++;
    c.turn.events.splice(index, 1, newStep, next);
    const result = reconstructReplayContext(r);
    expect(result.activationEnds.get(next.id!)).toMatchObject({
      kind: "ordinary_move_completed",
      actorId: "47",
      actorCell: { x: 14, y: 3 },
      followingPlayerId: "37",
      moveSourceId: "source-28"
    });
    expect(LuckReportSchema.safeParse(analyzeReplayLuck(r)).success).toBe(true);
  });
  it("retains the earlier pre-roll state and never resumes before the movement outcome", () => {
    const r = replay(),
      c = chain(r),
      baseline = reconstructReplayContext(r);
    const original = baseline.preRollEvidence.get(c.original.id!);
    c.turn.events = c.turn.events.filter(
      (e) => e.sourceIndex! <= c.doMove.sourceIndex!
    );
    const prefix = reconstructReplayContext(r);
    expect(prefix.preRollEvidence.get(c.original.id!)).toEqual(original);
    expect(prefix.dodgeMovements.size).toBe(0);
  });
  it("never restores the failed terminal source", () => {
    expect(
      reconstructReplayContext(replay("terminal_dodge_failure")).dodgeMovements
        .size
    ).toBe(0);
  });
  it.each(["skill", "replacement", "do_move", "outcome"] as const)(
    "an unknown message before %s breaks the saved frame",
    (stage) => {
      const r = replay(),
        c = chain(r),
        probe = probeAfterTwoMoves(r);
      const target = {
        skill: c.skill,
        replacement: c.final,
        do_move: c.doMove,
        outcome: c.outcome
      }[stage];
      const index = c.turn.events.indexOf(target);
      c.turn.events.splice(index, 0, {
        ...target,
        id: "unknown-interruption",
        sourceTag: "UnknownMutation",
        type: "unknown"
      });
      const result = reconstructReplayContext(r);
      expect(result.dodgeMovements.size).toBe(0);
      expect(result.preRollEvidence.has(probe.id!)).toBe(false);
    }
  );
  it.each([
    "original_status",
    "original_modifiers",
    "original_threshold",
    "original_extra_die",
    "skill_owner",
    "skill_unused",
    "skill_unknown_field",
    "replacement_threshold",
    "replacement_outcome",
    "replacement_face",
    "replacement_status",
    "do_move_unknown",
    "outcome_summary",
    "outcome_extra_summary",
    "outcome_tentacle",
    "outcome_pushback",
    "outcome_not_moved",
    "wrong_action",
    "wrong_owner",
    "turn_inferred"
  ] as const)("rejects %s without repairing from later success", (change) => {
    const r = replay(),
      c = chain(r),
      probe = probeAfterTwoMoves(r);
    if (change === "original_status") c.original.payload!.Status = 2;
    if (change === "original_modifiers")
      c.original.payload!.Modifiers = { Modifier: { Value: 1 } };
    if (change === "original_threshold") c.original.payload!.Requirement = 4;
    if (change === "original_extra_die")
      (c.original.payload!.Dice as { Die: unknown }).Die = [
        { DieType: 0, Value: 2 },
        { DieType: 0, Value: 2 }
      ];
    if (change === "skill_owner") c.skill.payload!.PlayerId = 46;
    if (change === "skill_unused") c.skill.payload!.Used = 0;
    if (change === "skill_unknown_field") c.skill.payload!.Mystery = 1;
    if (change === "replacement_threshold") {
      c.final.payload!.Requirement = 4;
      c.final.payload!.Difficulty = 4;
    }
    if (change === "replacement_outcome") c.final.payload!.Outcome = 0;
    if (change === "replacement_face")
      (c.final.payload!.Dice as { Die: { Value: number } }).Die.Value = 2;
    if (change === "replacement_status") c.final.payload!.Status = 1;
    if (change === "do_move_unknown") c.doMove.payload = { Mystery: 1 };
    if (change === "outcome_summary")
      c.outcome.payload!.Rolls = { RollSummary: { RollType: 1, Outcome: 1 } };
    if (change === "outcome_extra_summary")
      c.outcome.payload!.Rolls = {
        RollSummary: [
          { RollType: 2, Outcome: 1 },
          { RollType: 1, Outcome: 1 }
        ]
      };
    if (change === "outcome_tentacle") c.outcome.payload!.TentacleUsed = 1;
    if (change === "outcome_pushback")
      c.outcome.payload!.Pushbacks = { Pushback: { PlayerId: 1 } };
    if (change === "outcome_not_moved") c.outcome.payload!.Moved = 0;
    if (change === "wrong_action") c.final.actionId = "another-action";
    if (change === "wrong_owner") c.final.actorTeamId = "0";
    if (change === "turn_inferred") c.skill.actorTeamSource = "turn_inferred";
    const result = reconstructReplayContext(r);
    expect(result.dodgeMovements.size).toBe(0);
    expect(result.preRollEvidence.has(probe.id!)).toBe(false);
  });
  it.each(["same", "changed"] as const)(
    "a %s checkpoint between failure and replacement cannot repair the chain",
    (kind) => {
      const r = replay(),
        c = chain(r),
        probe = probeAfterTwoMoves(r);
      const before = r.boardCheckpoints!.find(
        (p) =>
          p.afterSourceIndex ===
          reconstructReplayContext(r).preRollEvidence.get(c.original.id!)!
            .checkpointAfter
      )!;
      const inserted = structuredClone(before);
      inserted.afterSourceIndex = c.skill.sourceIndex!;
      if (kind === "changed") inserted.board!.activeTeamIndex = 0;
      r.boardCheckpoints!.push(inserted);
      r.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
      const result = reconstructReplayContext(r);
      expect(result.dodgeMovements.size).toBe(0);
      expect(
        result.preRollEvidence.get(probe.id!)?.actorDodgeMoveSourceId
      ).toBeUndefined();
    }
  );
  it.each([
    "zero_budget",
    "invalid_budget",
    "prone",
    "mental",
    "missing_availability",
    "occupied_destination",
    "unknown_ball",
    "wrong_active"
  ] as const)("withholds a saved %s frame", (change) => {
    const r = replay(),
      c = chain(r),
      probe = probeAfterTwoMoves(r);
    const checkpoint = r.boardCheckpoints!.find(
      (p) =>
        p.afterSourceIndex ===
        reconstructReplayContext(r).preRollEvidence.get(c.original.id!)!
          .checkpointAfter
    )!;
    const board = checkpoint.board!,
      actor = board.teams[1]!.players.find((p) => p.id === 47)!;
    if (change === "zero_budget") actor.movementRemaining = 0;
    if (change === "invalid_budget") actor.movementRemaining = 17;
    if (change === "prone") actor.statusCode = 1;
    if (change === "mental") actor.mentalEffect = { providerSkillId: 51 };
    if (change === "missing_availability") actor.canAct = null;
    if (change === "occupied_destination")
      board.teams[0]!.players.find(
        (p) => p.pitchLocation === "on_pitch"
      )!.cell = { x: 13, y: 3 };
    if (change === "unknown_ball") board.ball.possession = "unknown";
    if (change === "wrong_active") board.activeTeamIndex = 0;
    const result = reconstructReplayContext(r);
    expect(result.dodgeMovements.size).toBe(0);
    expect(
      result.preRollEvidence.get(probe.id!)?.actorDodgeMoveSourceId
    ).toBeUndefined();
  });
  it.each([
    "declaration",
    "destination",
    "budget",
    "outcome",
    "do_move",
    "carrier"
  ] as const)("shared reports reject forged %s movement", (change) => {
    const r = replay(),
      report = analyzeReplayLuck(r);
    const move = report.events.find((e) => e.metadata.dodgeMovement)!.metadata
      .dodgeMovement!;
    if (change === "declaration")
      move.declarationSourceId = move.outcomeSourceId;
    if (change === "destination") move.to.x = 25;
    if (change === "budget") move.movementAfter = 6;
    if (change === "outcome") move.outcomeSourceId = move.doMoveSourceId;
    if (change === "do_move") move.doMoveSourceId = move.outcomeSourceId;
    if (change === "carrier") move.carriesBall = true;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
});
