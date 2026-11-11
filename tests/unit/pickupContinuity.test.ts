import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { reconstructReplayContext } from "@/domain/replay/reconstructContext";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainMovementOutcome } from "@/domain/nufflizer/presentation";
import type { ReplayModel, ReplayEvent } from "@/domain/replay/types";
import { lonerDriveXml } from "../helpers/lonerDrive";
const replay = (id = "pickup_terminal_success") =>
  parseReplayXml(
    lonerDriveXml(id, "tests/fixtures/evidence/bb3-pickup-successors.json")
  );
function chain(r: ReplayModel) {
  const turn = r.turns.find((t) =>
    t.events.some(
      (e) => e.sourceTag === "ResultSkillUsage" && e.payload?.Skill === 61
    )
  )!;
  const i = turn.events.findIndex(
    (e) => e.sourceTag === "ResultSkillUsage" && e.payload?.Skill === 61
  );
  return {
    turn,
    original: turn.events[i - 1]!,
    skill: turn.events[i]!,
    final: turn.events[i + 1]!
  };
}
// Explicit synthetic movement/Rush probe before the source's next snapshot.
// No source holder, side, clock, trait or budget field is filled.
function followMove(r: ReplayModel) {
  const c = chain(r),
    index = c.turn.events.indexOf(c.final),
    base = c.final.sourceIndex!;
  const sourceStep = c.turn.events.find(
    (e) => e.sourceTag === "PlayerStep" && e.actionId === c.original.actionId
  )!;
  const sourceOutcome = c.turn.events.find(
    (e) =>
      e.sourceTag === "ResultMoveOutcome" && e.actionId === c.original.actionId
  )!;
  const sourceDoMove = c.turn.events.find(
    (e) => e.sourceTag === "ResultDoMove" && e.actionId === c.original.actionId
  )!;
  const step: ReplayEvent = {
    ...sourceStep,
    id: "synthetic-carrier-move",
    sourceIndex: base + 1,
    actionId: "synthetic-carrier-move",
    payload: {
      ...sourceStep.payload,
      CellFrom: { X: 11, Y: 10 },
      CellTo: { X: 10, Y: 10 }
    }
  };
  const doMove: ReplayEvent = {
    ...sourceDoMove,
    id: "synthetic-do-move",
    sourceIndex: base + 2,
    actionId: step.actionId
  };
  const outcome: ReplayEvent = {
    ...sourceOutcome,
    id: "synthetic-move-outcome",
    sourceIndex: base + 3,
    actionId: step.actionId
  };
  const next: ReplayEvent = {
    ...step,
    id: "synthetic-rush-step",
    sourceIndex: base + 4,
    actionId: "synthetic-rush",
    payload: {
      ...step.payload,
      CellFrom: { X: 10, Y: 10 },
      CellTo: { X: 9, Y: 10 }
    }
  };
  const probe: ReplayEvent = {
    ...c.final,
    id: "synthetic-rush",
    sourceIndex: base + 5,
    actionId: next.actionId,
    rollType: 1,
    payload: {
      Status: 1,
      NewRoll: 1,
      RollType: 1,
      Requirement: 2,
      Difficulty: 2,
      Outcome: 1,
      Dice: { Die: { DieType: 0, Value: 6 } }
    }
  };
  for (const e of r.turns.flatMap((t) => t.events))
    if (e.sourceIndex! > base) e.sourceIndex! += 5;
  for (const b of r.boardCheckpoints!)
    if (b.afterSourceIndex >= base) b.afterSourceIndex += 5;
  c.turn.events.splice(index + 1, 0, step, doMove, outcome, next, probe);
  return { probe, c };
}
describe("actual possession after a successful own Sure Hands replacement", () => {
  it("preserves the independent source's post-move budget and held-ball observation", () => {
    const r = replay(),
      c = chain(r),
      result = reconstructReplayContext(r),
      resolution = result.pickupResolutions.get(c.final.id!)!;
    expect(resolution).toMatchObject({
      cell: { x: 11, y: 10 },
      movementRemaining: 4
    });
    const report = LuckReportSchema.parse(analyzeReplayLuck(r)),
      final = report.events.find((e) => e.metadata.sourceId === c.final.id)!;
    expect(final.metadata.pickupResolution).toEqual(resolution);
    expect(final.metadata.preRoll?.actorCarriesBall).toBeNull();
    expect(final.metadata.preRoll?.carriedBallCell).toBeUndefined();
    expect(final.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(final.possessionBounds!.upper).toBeCloseTo(7 / 8, 12);
    expect(explainMovementOutcome(final.metadata)).toContain(
      "post-move budget stays at 4 movement points"
    );
    const evidence = JSON.parse(
      readFileSync("tests/fixtures/evidence/bb3-pickup-successors.json", "utf8")
    );
    const records = evidence.cases.find(
      (c: { id: string }) => c.id === "pickup_terminal_success"
    ).records;
    const after = records.find(
      (r: { replayStep: number; projection?: { BoardState?: unknown } }) =>
        r.replayStep === 99 && r.projection?.BoardState
    ).projection.BoardState;
    expect(after.Ball[0]).toMatchObject({ Carrier: ["2"], IsHeld: ["1"] });
    const actor =
      after.ListTeams[0].TeamState[0].ListPitchPlayers[0].PlayerState.find(
        (p: { Id: string[] }) => p.Id[0] === "2"
      );
    expect(actor.MovePoint).toEqual(["4"]);
  });
  it("carries the secured ball through later verified movement without spending the movement point twice", () => {
    const r = replay(),
      { probe, c } = followMove(r),
      copy = structuredClone(r),
      result = reconstructReplayContext(r);
    expect(result.preRollEvidence.get(probe.id!)).toMatchObject({
      actorCell: { x: 10, y: 10 },
      carriedBallCell: { x: 10, y: 10 },
      actorMovementRemaining: 3,
      actorCarriesBall: true,
      actorPickupSourceId: c.final.id,
      teamTurn: null,
      activeTeamId: null
    });
    expect(r).toEqual(copy);
    const report = LuckReportSchema.parse(analyzeReplayLuck(r));
    expect(
      report.events.find((e) => e.metadata.sourceId === probe.id)?.metadata
        .preRoll?.actorPickupSourceId
    ).toBe(c.final.id);
    expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
  });
  it("does not expose possession before the successful replacement exists", () => {
    const r = replay(),
      c = chain(r),
      before = reconstructReplayContext(r).preRollEvidence.get(c.original.id!);
    c.turn.events = c.turn.events.filter(
      (e) => e.sourceIndex! <= c.skill.sourceIndex!
    );
    const prefix = reconstructReplayContext(r);
    expect(prefix.pickupResolutions.size).toBe(0);
    expect(prefix.preRollEvidence.get(c.original.id!)).toEqual(before);
    expect(before?.actorCarriesBall).toBeNull();
  });
  it("leaves a failed Sure Hands replacement unavailable for actual-state continuation", () => {
    expect(
      reconstructReplayContext(replay("pickup_terminal_failure"))
        .pickupResolutions.size
    ).toBe(0);
  });
  it("preserves an omitted current movement budget instead of borrowing the after-board's4", () => {
    const r = replay(),
      c = chain(r),
      before = reconstructReplayContext(r).preRollEvidence.get(c.original.id!)!;
    const checkpoint = r.boardCheckpoints!.find(
      (b) => b.afterSourceIndex === before.checkpointAfter
    )!;
    checkpoint.board!.teams[0]!.players.find(
      (p) => p.id === 2
    )!.movementRemaining = null;
    const { probe } = followMove(r),
      result = reconstructReplayContext(r);
    expect(
      result.pickupResolutions.get(c.final.id!)?.movementRemaining
    ).toBeNull();
    expect(
      result.preRollEvidence.get(probe.id!)?.actorMovementRemaining
    ).toBeUndefined();
    expect(result.preRollEvidence.get(probe.id!)?.actorCarriesBall).toBe(true);
    expect(LuckReportSchema.safeParse(analyzeReplayLuck(r)).success).toBe(true);
  });
  it.each(["skill", "replacement"] as const)(
    "unknown mutation before %s breaks the saved physical frame",
    (stage) => {
      const r = replay(),
        { probe, c } = followMove(r),
        target = stage === "skill" ? c.skill : c.final,
        index = c.turn.events.indexOf(target);
      c.turn.events.splice(index, 0, {
        ...target,
        id: "unknown",
        type: "unknown",
        sourceTag: "UnknownMutation"
      });
      const result = reconstructReplayContext(r);
      expect(result.pickupResolutions.size).toBe(0);
      expect(result.preRollEvidence.has(probe.id!)).toBe(false);
    }
  );
  it.each([
    "first_status",
    "first_threshold",
    "first_modifiers",
    "skill_owner",
    "skill_unused",
    "skill_extra",
    "terminal_threshold",
    "terminal_face",
    "terminal_status",
    "terminal_modifiers",
    "terminal_extra",
    "different_action",
    "different_sequence",
    "different_owner",
    "turn_inferred"
  ] as const)(
    "rejects %s instead of recovering from later possession",
    (change) => {
      const r = replay(),
        { probe, c } = followMove(r);
      if (change === "first_status") c.original.payload!.Status = 2;
      if (change === "first_threshold") c.original.payload!.Requirement = 4;
      if (change === "first_modifiers")
        c.original.payload!.Modifiers = { Modifier: { Value: 1 } };
      if (change === "skill_owner") c.skill.payload!.PlayerId = 1;
      if (change === "skill_unused") c.skill.payload!.Used = 0;
      if (change === "skill_extra") c.skill.payload!.Unknown = 1;
      if (change === "terminal_threshold") {
        c.final.payload!.Requirement = 4;
        c.final.payload!.Difficulty = 4;
      }
      if (change === "terminal_face")
        (c.final.payload!.Dice as { Die: { Value: number } }).Die.Value = 2;
      if (change === "terminal_status") c.final.payload!.Status = 1;
      if (change === "terminal_modifiers")
        c.final.payload!.Modifiers = { Modifier: { Value: 1 } };
      if (change === "terminal_extra") c.final.payload!.Unknown = 1;
      if (change === "different_action") c.final.actionId = "another-action";
      if (change === "different_sequence")
        c.skill.sequenceId = "another-sequence";
      if (change === "different_owner") c.final.actorTeamId = "1";
      if (change === "turn_inferred") c.skill.actorTeamSource = "turn_inferred";
      const result = reconstructReplayContext(r);
      expect(result.pickupResolutions.size).toBe(0);
      expect(result.preRollEvidence.has(probe.id!)).toBe(false);
    }
  );
  it("an intervening matching checkpoint discards the pending chain", () => {
    const r = replay(),
      { probe, c } = followMove(r),
      before = reconstructReplayContext(r).preRollEvidence.get(c.original.id!)!;
    const b = structuredClone(
      r.boardCheckpoints!.find(
        (b) => b.afterSourceIndex === before.checkpointAfter
      )!
    );
    b.afterSourceIndex = c.skill.sourceIndex!;
    b.board!.activePlayerId = 2;
    r.boardCheckpoints!.push(b);
    r.boardCheckpoints!.sort((a, b) => a.afterSourceIndex - b.afterSourceIndex);
    const result = reconstructReplayContext(r);
    expect(result.pickupResolutions.size).toBe(0);
    expect(
      result.preRollEvidence.get(probe.id!)?.actorPickupSourceId
    ).toBeUndefined();
  });
  it.each([
    "declaration",
    "move",
    "cell",
    "budget",
    "checkpoint",
    "held_before",
    "carried_cell"
  ] as const)("shared reports reject forged %s possession", (change) => {
    const r = replay(),
      { probe, c } = followMove(r),
      report = analyzeReplayLuck(r),
      final = report.events.find((e) => e.metadata.sourceId === c.final.id)!,
      resolution = final.metadata.pickupResolution!;
    if (change === "declaration")
      resolution.declarationSourceId = resolution.moveOutcomeSourceId;
    if (change === "move")
      resolution.moveOutcomeSourceId = resolution.declarationSourceId;
    if (change === "cell") resolution.cell.x++;
    if (change === "budget") resolution.movementRemaining = 3;
    if (change === "checkpoint") resolution.checkpointAfter++;
    if (change === "held_before")
      final.metadata.preRoll!.actorCarriesBall = true;
    if (change === "carried_cell")
      report.events.find((e) => e.metadata.sourceId === probe.id)!.metadata
        .preRoll!.carriedBallCell!.x++;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
});
