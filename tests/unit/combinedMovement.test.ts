import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { findCombinedMovements } from "@/domain/replay/combinedMovement";
import { reconstructReplayContext } from "@/domain/replay/reconstructContext";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainMovementOutcome } from "@/domain/nufflizer/presentation";
import type { ReplayModel, ReplayEvent } from "@/domain/replay/types";
const evidence = "tests/fixtures/evidence/bb3-combined-movement.json";
const xml = (id = "combined_team_rush") => lonerDriveXml(id, evidence);
function source(id?: string) {
  const replay = parseReplayXml(xml(id)),
    [outcomeId, frame] = [...findCombinedMovements(replay)][0]!;
  const events = replay.turns.flatMap((t) => t.events),
    at = (id: string) => events.find((e) => e.id === id)!;
  const p = frame.proof,
    waiting = replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === p.checkpointAfter
    )!;
  return {
    replay,
    events,
    at,
    p,
    waiting,
    step: at(p.stepSourceId),
    rush: at(p.rushSourceId),
    dodge: at(p.dodgeSourceId),
    outcome: at(outcomeId),
    move: at(p.doMoveSourceId)
  };
}
function probeAfter(r: ReplayModel, end: ReplayEvent) {
  const probe: ReplayEvent = {
    ...end,
    id: "synthetic-combined-probe",
    sourceIndex: end.sourceIndex! + 1,
    sourceTag: "ResultRoll",
    type: "roll",
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
    if (c.afterSourceIndex >= end.sourceIndex!) c.afterSourceIndex++;
  for (const e of r.turns.flatMap((t) => t.events))
    if (e.sourceIndex! > end.sourceIndex!) e.sourceIndex!++;
  const t = r.turns.find((t) => t.events.includes(end))!;
  t.events.splice(t.events.indexOf(end) + 1, 0, probe);
  return probe;
}
describe("combined Rush/Dodge continuity and observed failure consequences", () => {
  it.each([
    ["combined_team_rush", 8, 1, 9, 2, false, 35 / 36, 2 / 3],
    ["combined_carrier", 3, 5, 2, 5, true, 5 / 6, 5 / 6],
    ["combined_pickup_carrier", 17, 6, 18, 7, true, 5 / 6, 5 / 6]
  ] as const)(
    "retains independent %s two-check movement without merging odds",
    (id, x, y, tx, ty, held, rushChance, dodgeChance) => {
      const s = source(id),
        probe = probeAfter(s.replay, s.outcome),
        copy = structuredClone(s.replay),
        ctx = reconstructReplayContext(s.replay);
      expect(ctx.combinedMovements.get(s.dodge.id!)).toMatchObject({
        from: { x, y },
        to: { x: tx, y: ty },
        dodgeSucceeded: true,
        movementBefore: null,
        movementAfter: null,
        carriedBallBefore: held
      });
      expect(ctx.preRollEvidence.get(probe.id!)).toMatchObject({
        actorCell: { x: tx, y: ty },
        actorCarriesBall: held,
        activationId: null,
        otherUsefulActivations: null
      });
      expect(ctx.preRollEvidence.get(probe.id!)?.actorTraits).toBeUndefined();
      expect(s.replay).toEqual(copy);
      const r = LuckReportSchema.parse(analyzeReplayLuck(s.replay)),
        dodge = r.events.find((e) => e.metadata.sourceId === s.dodge.id)!;
      expect(dodge.probabilitySuccess).toBeCloseTo(dodgeChance, 12);
      expect(
        r.events.find((e) => e.metadata.sourceId === s.rush.id)!
          .probabilitySuccess
      ).toBeCloseTo(rushChance, 12);
      expect(dodge.contextualImpact).toBeUndefined();
      expect(dodge.contextualBounds).toBeUndefined();
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      if (held)
        expect(ctx.preRollEvidence.get(probe.id!)?.carriedBallCell).toEqual({
          x: tx,
          y: ty
        });
    }
  );
  it("retains the raw omitted distant coordinate without assigning an activation", () => {
    const s = source(),
      p = s.p;
    expect(p.partialOccupancy).toEqual([
      { playerId: "40", cell: { x: 1, y: null } }
    ]);
    const c = JSON.parse(readFileSync(evidence, "utf8")).cases.find(
      (c: { id: string }) => c.id === "combined_team_rush"
    );
    const board = c.records.find(
      (r: { replayStep: number; projection?: { BoardState?: unknown } }) =>
        r.replayStep === 206 && r.projection?.BoardState
    ).projection.BoardState;
    const player =
      board.ListTeams[0].TeamState[1].ListPitchPlayers[0].PlayerState.find(
        (p: { Id: string[] }) => p.Id[0] === "40"
      );
    expect(player.Cell[0]).toEqual({ X: ["1"] });
    const report = analyzeNufflizerInput(xml()),
      e = report.events.find((e) => e.metadata.combinedMovement)!;
    expect(e.metadata.preRoll?.activationId ?? null).toBeNull();
    expect(explainMovementOutcome(e.metadata)).toContain(
      "omitted coordinates remain unknown"
    );
  });
  it("retains known zero without a second movement charge and keeps omitted possession null", () => {
    const s = source();
    s.waiting.board!.teams[1]!.players.find(
      (p) => p.id === 42
    )!.movementRemaining = 0;
    s.waiting.board!.ball = {
      ...s.waiting.board!.ball,
      isHeld: null,
      carrierId: null,
      possession: "unknown",
      holderRosterIndex: null
    };
    const ctx = reconstructReplayContext(s.replay),
      p = [...ctx.combinedMovements.values()][0]!;
    expect(p).toMatchObject({
      movementBefore: 0,
      movementAfter: 0,
      carriedBallBefore: null
    });
    expect(
      LuckReportSchema.safeParse(analyzeReplayLuck(s.replay)).success
    ).toBe(true);
  });
  it("does not restore before the completed summary or after a failed combined die", () => {
    const s = source();
    s.dodge.payload!.Outcome = 0;
    (s.dodge.payload!.Dice as { Die: { Value: number } }).Die.Value = 1;
    (
      s.outcome.payload!.Rolls as { RollSummary: { Outcome: number }[] }
    ).RollSummary[1]!.Outcome = 0;
    const probe = probeAfter(s.replay, s.outcome),
      ctx = reconstructReplayContext(s.replay);
    expect([...ctx.combinedMovements.values()][0]).toMatchObject({
      dodgeSucceeded: false,
      movementAfter: null
    });
    expect(ctx.preRollEvidence.has(probe.id!)).toBe(false);
    const report = LuckReportSchema.parse(analyzeReplayLuck(s.replay)),
      e = report.events.find((e) => e.metadata.combinedMovement)!;
    expect(explainMovementOutcome(e.metadata)).toContain(
      "does not establish a usable continued board"
    );
  });
  it("requires the final summary and never backfills the earlier Rush pre-state", () => {
    const s = source(),
      before = analyzeReplayLuck(s.replay).events.find(
        (e) => e.metadata.sourceId === s.rush.id
      )!.metadata.preRoll;
    s.replay.turns.forEach((t) => {
      t.events = t.events.filter(
        (e) => e.sourceIndex! < s.outcome.sourceIndex!
      );
    });
    expect(reconstructReplayContext(s.replay).combinedMovements.size).toBe(0);
    expect(
      analyzeReplayLuck(s.replay).events.find(
        (e) => e.metadata.sourceId === s.rush.id
      )!.metadata.preRoll
    ).toEqual(before);
  });
  it.each([
    "ambiguous_partial",
    "missing_partial",
    "complete_overlap",
    "occupied_to",
    "positive_budget",
    "prone",
    "spent",
    "actor_effect",
    "marker_friendly",
    "marker_far",
    "marker_zone",
    "marker_effect",
    "choice_gamer",
    "choice_declined",
    "inferred_owner",
    "wrong_role",
    "clock",
    "controller",
    "invalid_waiting",
    "unmarked_carrier",
    "unknown_message",
    "changed_step",
    "unknown_step",
    "unknown_cell",
    "modified_rush",
    "nonfresh_dodge",
    "skill_dodge",
    "different_dodge_target",
    "unknown_dodge",
    "nonempty_move",
    "reversed_summary",
    "missing_summary",
    "extra_summary",
    "tentacle",
    "pushbacks",
    "moved_false",
    "intervening_checkpoint"
  ] as const)("withholds a combined receipt for %s", (change) => {
    const s = source(),
      board = s.waiting.board!,
      actor = board.teams[1]!.players.find((p) => p.id === 42)!,
      partial = board.teams[1]!.players.find((p) => p.id === 40)!,
      marker = board.teams[0]!.players.find((p) => p.id === 3)!;
    if (change === "ambiguous_partial") partial.cell = { x: 9, y: null };
    if (change === "missing_partial") partial.cell = { x: null, y: null };
    if (change === "complete_overlap") partial.cell = { ...actor.cell };
    if (change === "occupied_to") marker.cell = { ...s.p.to };
    if (change === "positive_budget") actor.movementRemaining = 1;
    if (change === "prone") actor.statusCode = 1;
    if (change === "spent") actor.canAct = false;
    if (change === "actor_effect") actor.mentalEffect = { providerSkillId: 31 };
    if (change === "marker_friendly") {
      board.teams[0]!.players = board.teams[0]!.players.filter(
        (p) => p !== marker
      );
      board.teams[1]!.players.push(marker);
    }
    if (change === "marker_far") marker.cell = { x: 1, y: 1 };
    if (change === "marker_zone") marker.tackleZone = false;
    if (change === "marker_effect")
      marker.mentalEffect = { providerSkillId: 51 };
    if (change === "choice_gamer")
      s.at(s.p.decisionSourceId!).payload!.GamerId = 0;
    if (change === "choice_declined")
      s.at(s.p.decisionSourceId!).payload!.Used = 0;
    if (change === "inferred_owner") s.dodge.actorTeamSource = "turn_inferred";
    if (change === "wrong_role") s.dodge.actorTeamId = "0";
    if (change === "clock") board.teams[1]!.gameTurn!++;
    if (change === "controller") board.activeGamerId = 0;
    if (change === "invalid_waiting") s.waiting.board = null;
    if (change === "unmarked_carrier")
      s.events.find(
        (e) =>
          e.checkpointCarrier &&
          e.sourceIndex! < s.step.sourceIndex! &&
          e.sourceIndex! > s.p.checkpointAfter
      )!.checkpointCarrier = false;
    if (change === "unknown_message")
      s.at(s.p.decisionSourceId!).sourceTag = "UnknownMessage";
    if (change === "unknown_step") s.step.payload!.Unknown = 0;
    if (change === "unknown_cell")
      s.step.payload!.CellTo = { X: 9, Y: 2, Z: 0 };
    if (change === "changed_step") s.step.payload!.CellTo = { X: 10, Y: 2 };
    if (change === "modified_rush")
      s.rush.payload!.Modifiers = { Modifier: { Value: 1 } };
    if (change === "nonfresh_dodge") s.dodge.payload!.NewRoll = 0;
    if (change === "skill_dodge") s.dodge.payload!.Status = 2;
    if (change === "different_dodge_target") s.dodge.payload!.Difficulty = 4;
    if (change === "unknown_dodge") s.dodge.payload!.Unknown = 1;
    if (change === "nonempty_move") s.move.payload = { Unknown: 1 };
    const rows = (
      s.outcome.payload!.Rolls as { RollSummary: Record<string, unknown>[] }
    ).RollSummary;
    if (change === "reversed_summary") rows.reverse();
    if (change === "missing_summary") rows.pop();
    if (change === "extra_summary") rows.push({ ...rows[0] });
    if (change === "tentacle") s.outcome.payload!.TentacleUsed = 1;
    if (change === "pushbacks") s.outcome.payload!.Pushbacks = { PlayerId: 1 };
    if (change === "moved_false") s.outcome.payload!.Moved = 0;
    if (change === "intervening_checkpoint") {
      const cp = structuredClone(s.waiting);
      cp.afterSourceIndex = s.rush.sourceIndex!;
      s.replay.boardCheckpoints!.splice(3, 0, cp);
    }
    expect(findCombinedMovements(s.replay).size).toBe(0);
  });
  it.each([
    "rush",
    "choice",
    "gamer",
    "step",
    "outcome",
    "partial_self",
    "partial_axis",
    "partial_complete",
    "zone",
    "budget",
    "success",
    "invented_point"
  ] as const)("rejects forged combined %s report metadata", (change) => {
    const r = analyzeNufflizerInput(xml()),
      e = r.events.find((e) => e.metadata.combinedMovement)!,
      p = e.metadata.combinedMovement!;
    if (change === "rush") p.rushSourceId = p.dodgeSourceId;
    if (change === "choice") p.decisionSourceId = p.questionSourceId;
    if (change === "gamer") p.gamerId = 0;
    if (change === "step") p.stepSourceId = p.rushSourceId;
    if (change === "outcome") p.outcomeSourceId = p.doMoveSourceId;
    if (change === "partial_self")
      p.partialOccupancy[0]!.playerId = e.playerId!;
    if (change === "partial_axis") p.partialOccupancy[0]!.cell.x = p.to.x;
    if (change === "partial_complete") p.partialOccupancy[0]!.cell.y = 0;
    if (change === "zone") p.zonePenalty!.markers[0]!.cell.x = 1;
    if (change === "budget") p.movementAfter = 0;
    if (change === "success") p.dodgeSucceeded = false;
    if (change === "invented_point")
      e.contextualBounds = {
        policy: "dodge_skill_reroll",
        minimumMoves: 0,
        maximumMoves: 0,
        successChance: 2 / 3,
        lower: 0,
        upper: 0
      };
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    ["combined_failure_move", -2 / 5, 2 / 3],
    ["combined_failure_blitz", 3 / 20, 1 / 6]
  ] as const)(
    "reconciles independent %s Rush/Dodge/armor contributions once",
    (id, total, chance) => {
      const r = analyzeNufflizerInput(xml(id)),
        e = r.events.find(
          (e) => e.metadata.movementFall?.combinedRushSourceId
        )!,
        p = e.metadata.movementFall!;
      const rush = r.events.find(
          (e) => e.metadata.sourceId === p.combinedRushSourceId
        )!,
        damage = r.damageSteps.find((d) => d.actionId === p.damageActionId)!;
      expect(e.probabilitySuccess).toBeCloseTo(chance, 12);
      expect(rush.probabilitySuccess).toBeCloseTo(5 / 6, 12);
      expect(p.diceContribution).toBeCloseTo(total, 12);
      expect(p.diceContribution).toBeCloseTo(
        rush.weightedDelta + e.weightedDelta + damage.diceContribution,
        12
      );
      expect(p).toMatchObject({
        armorHeld: true,
        unscoredDamageRolls: 0,
        playerRemoved: false
      });
      expect(e.metadata.combinedMovement).toBeUndefined();
      expect(e.contextualImpact).toBeUndefined();
      expect(explainMovementOutcome(e.metadata)).toContain(
        "turnover and availability cost remain unquantified"
      );
      const replay = parseReplayXml(xml(id)),
        all = replay.turns.flatMap((t) => t.events),
        end = all.find((x) => x.sourceIndex === p.moveOutcomeSourceIndex)!;
      const probe = probeAfter(replay, end);
      expect(
        reconstructReplayContext(replay).preRollEvidence.has(probe.id!)
      ).toBe(false);
    }
  );
  it.each([
    "rush_face",
    "rush_role",
    "rush_actor",
    "summary",
    "damage_subject",
    "turnover",
    "dodge_payload",
    "move_payload",
    "outcome_payload",
    "outcome_pushback"
  ] as const)("withholds an observed fall link after %s", (change) => {
    const replay = parseReplayXml(xml("combined_failure_move")),
      events = replay.turns.flatMap((t) => t.events),
      r = analyzeReplayLuck(replay),
      p = r.events.find((e) => e.metadata.movementFall?.combinedRushSourceId)!
        .metadata.movementFall!;
    const rush = events.find((e) => e.id === p.combinedRushSourceId)!,
      outcome = events.find((e) => e.sourceIndex === p.moveOutcomeSourceIndex)!;
    if (change === "rush_face")
      (rush.payload!.Dice as { Die: { Value: number } }).Die.Value = 1;
    if (change === "rush_role") rush.actorTeamSource = "turn_inferred";
    if (change === "rush_actor") rush.playerId = "40";
    if (change === "summary")
      (
        outcome.payload!.Rolls as { RollSummary: { Outcome: number }[] }
      ).RollSummary[0]!.Outcome = 0;
    if (change === "damage_subject")
      events.find(
        (e) => e.sourceTag === "DamageStep" && e.actionId === p.damageActionId
      )!.targetId = "40";
    if (change === "dodge_payload")
      events.find(
        (e) => e.sourceIndex === outcome.sourceIndex! - 2
      )!.payload!.Future = 1;
    if (change === "move_payload")
      events.find((e) => e.sourceIndex === outcome.sourceIndex! - 1)!.payload =
        { Future: 1 };
    if (change === "outcome_payload") outcome.payload!.Future = 1;
    if (change === "outcome_pushback")
      outcome.payload!.Pushbacks = { PlayerId: 1 };
    if (change === "turnover")
      events.find((e) => e.sourceIndex === p.turnoverSourceIndex)!.reasonCode =
        4;
    expect(
      analyzeReplayLuck(replay).events.some(
        (e) => e.metadata.movementFall?.combinedRushSourceId
      )
    ).toBe(false);
  });
  it.each(["rush_source", "subtotal", "omitted_rush", "null_summary"] as const)(
    "rejects malformed or forged combined fall %s",
    (change) => {
      const replay = parseReplayXml(xml("combined_failure_move")),
        report = analyzeReplayLuck(replay),
        event = report.events.find(
          (e) => e.metadata.movementFall?.combinedRushSourceId
        )!,
        fall = event.metadata.movementFall!;
      if (change === "null_summary") {
        const outcome = replay.turns
          .flatMap((t) => t.events)
          .find((e) => e.sourceIndex === fall.moveOutcomeSourceIndex)!;
        outcome.payload!.Rolls = {
          RollSummary: [null, { RollType: 2, Outcome: 0 }]
        };
        expect(
          analyzeReplayLuck(replay).events.some(
            (e) => e.metadata.movementFall?.combinedRushSourceId
          )
        ).toBe(false);
        return;
      }
      if (change === "rush_source")
        fall.combinedRushSourceId = event.metadata.sourceId;
      if (change === "subtotal") fall.diceContribution++;
      if (change === "omitted_rush") delete fall.combinedRushSourceId;
      expect(LuckReportSchema.safeParse(report).success).toBe(false);
    }
  );
  it("does not mistake the recorded skill modifier for the fixed-zone policy", () => {
    const r = analyzeNufflizerInput(xml("combined_skill_excluded"));
    expect(r.events.some((e) => e.metadata.combinedMovement)).toBe(false);
  });
  it("[cli-worker] prints success and observed fall groups independently of top swings", () => {
    const dir = mkdtempSync(join(tmpdir(), "nufflizier-combined-"));
    try {
      for (const id of ["combined_team_rush", "combined_failure_blitz"]) {
        const file = join(dir, id + ".xml");
        writeFileSync(file, xml(id));
        const r = spawnSync(
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
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toContain(
          id === "combined_team_rush"
            ? "confirmed combined step moved the player"
            : "turnover and availability cost remain unquantified"
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
