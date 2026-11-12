import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { reconstructReplayContext } from "@/domain/replay/reconstructContext";
import { recordedZoneD6Check } from "@/domain/replay/zoneD6Check";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainMovementOutcome } from "@/domain/nufflizer/presentation";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";

const path = "tests/fixtures/evidence/bb3-team-reroll-movement.json";
const xml = (id = "team_dodge_zone_pickup") => lonerDriveXml(id, path);
function source(id?: string) {
  const replay = parseReplayXml(xml(id)),
    context = reconstructReplayContext(replay);
  const [movementSourceId, movement] = [
    ...context.teamRerollMovements.entries()
  ][0]!;
  const events = replay.turns.flatMap((t) => t.events),
    at = (id: string) => events.find((e) => e.id === id)!;
  const waiting = replay.boardCheckpoints!.find(
    (c) => c.afterSourceIndex === movement.checkpointAfter
  )!;
  const final = at(movementSourceId),
    question = at(movement.questionSourceId),
    outcome = at(movement.outcomeSourceId);
  return {
    replay,
    context,
    events,
    at,
    waiting,
    movement,
    final,
    question,
    outcome
  };
}
function probeAfter(r: ReplayModel, end: ReplayEvent) {
  const probe: ReplayEvent = {
    ...end,
    id: "synthetic-after-transition",
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
describe("fixed recorded zones and reached-square pickup consequences", () => {
  it.each([
    ["team_dodge_zone_move", 3, 4, 2, 1, "4", 10, 1, 10, 0],
    ["team_dodge_zone_pickup", 2, 3, 1, 0, "42", 16, 5, 17, 6]
  ] as const)(
    "reconciles actual %s geometry, fixed penalty and cost",
    (id, base, target, before, after, marker, mx, my, x, y) => {
      const r = analyzeNufflizerInput(xml(id)),
        e = r.events.find((e) => e.metadata.teamRerollMovement)!;
      expect(e.metadata.teamRerollMovement).toMatchObject({
        movementBefore: before,
        movementAfter: after,
        to: { x, y },
        zonePenalty: {
          baseTarget: base,
          markers: [{ playerId: marker, cell: { x: mx, y: my } }]
        }
      });
      expect(e.metadata.requirement).toBe(base);
      expect(e.metadata.difficulty).toBe(target);
      expect(e.metadata.modifiers).toEqual([-1]);
      expect(e.probabilitySuccess).toBeCloseTo(1 - ((target - 1) / 6) ** 2, 12);
      expect(explainMovementOutcome(e.metadata)).toContain(
        "each recorded marker was observed beside the destination"
      );
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(e.contextualImpact).toBeUndefined();
      expect(e.contextualBounds).toBeUndefined();
    }
  );
  it("preserves source omissions through the earlier own Dodge without inventing availability", () => {
    const s = source(),
      [id, proof] = [...s.context.dodgeMovements.entries()][0]!;
    expect(proof).toMatchObject({
      movementBefore: 5,
      movementAfter: 4,
      carriesBall: null,
      from: { x: 17, y: 1 },
      to: { x: 18, y: 2 }
    });
    const r = LuckReportSchema.parse(analyzeReplayLuck(s.replay)),
      own = r.events.find((e) => e.metadata.sourceId === id)!;
    expect(own.metadata.preRoll).toMatchObject({
      activeTeamId: null,
      teamTurn: null,
      actorCarriesBall: null
    });
    expect(own.contextualBounds).toBeUndefined();
    expect(own.contextualImpact).toBeUndefined();
    expect(s.waiting.board!.teams[0]!.explicitTeamId).toBeNull();
    expect(s.waiting.board!.activeTeamIndex).toBeNull();
    expect(s.waiting.board!.stable).toBeNull();
    expect(s.context.preRollEvidence.get(s.question.id!)!.actorCell).toEqual({
      x: 17,
      y: 5
    });
  });
  it("matches independent raw before/after cells, modifiers and held-ball records", () => {
    const c = JSON.parse(readFileSync(path, "utf8")).cases.find(
      (c: { id: string }) => c.id === "team_dodge_zone_pickup"
    );
    const waiting = c.records.find(
      (r: { replayStep: number; projection?: { BoardState?: unknown } }) =>
        r.replayStep === 400 && r.projection?.BoardState
    ).projection.BoardState;
    const after = c.records.find(
      (r: { replayStep: number; projection?: { BoardState?: unknown } }) =>
        r.replayStep === 401 && r.projection?.BoardState
    ).projection.BoardState;
    expect(waiting.ActiveTeam).toBeUndefined();
    expect(waiting.ListTeams[0].TeamState[0].Data[0].TeamId).toBeUndefined();
    expect(waiting.Ball[0].IsHeld).toBeUndefined();
    expect(waiting.Ball[0].Carrier).toBeUndefined();
    const actor = (b: typeof waiting) =>
      b.ListTeams[0].TeamState[0].ListPitchPlayers[0].PlayerState.find(
        (p: { Id: string[] }) => p.Id[0] === "6"
      );
    expect(actor(waiting)).toMatchObject({
      Cell: [{ X: ["17"], Y: ["5"] }],
      MovePoint: ["1"]
    });
    expect(actor(after).Cell).toEqual([{ X: ["17"], Y: ["6"] }]);
    expect(after.Ball[0]).toMatchObject({ Carrier: ["6"], IsHeld: ["1"] });
    const { question } = source();
    expect(question.payload!.RollInfos).toMatchObject({
      Requirement: 2,
      Difficulty: 3,
      Modifiers: {
        Modifier: {
          PlayerId: 42,
          Skill: -1,
          Effect: -1,
          Value: -1,
          ModifierType: 3
        }
      }
    });
  });
  it("secures actual possession at the reached square without charging movement twice", () => {
    const s = source(),
      [id, proof] = [...s.context.pickupsAfterMovement.entries()][0]!;
    const probe = probeAfter(s.replay, s.at(id)),
      copy = structuredClone(s.replay),
      ctx = reconstructReplayContext(s.replay);
    expect(proof).toMatchObject({
      cell: { x: 17, y: 6 },
      movementRemaining: 0,
      check: { threshold: 3, baseTarget: 2, markerPlayerIds: ["42"] }
    });
    expect(ctx.preRollEvidence.get(probe.id!)).toMatchObject({
      actorCell: { x: 17, y: 6 },
      actorCarriesBall: true,
      carriedBallCell: { x: 17, y: 6 },
      actorMovementRemaining: 0,
      actorPickupSourceId: id,
      activeTeamId: null,
      teamTurn: null
    });
    expect(
      ctx.preRollEvidence.get(proof.originalSourceId)?.actorCarriesBall
    ).toBeNull();
    expect(s.replay).toEqual(copy);
    const r = LuckReportSchema.parse(analyzeReplayLuck(s.replay)),
      pickup = r.events.find((e) => e.metadata.sourceId === id)!;
    expect(pickup.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(pickup.delta).toBeCloseTo(1 / 9, 12);
    expect(pickup.possessionBounds).toBeUndefined();
    expect(pickup.contextualImpact).toBeUndefined();
    expect(explainMovementOutcome(pickup.metadata)).toContain(
      "pickup consumes no second movement point"
    );
  });
  it("keeps an omitted waiting budget unknown through both actual transitions", () => {
    const s = source(),
      p = s.waiting.board!.teams[0]!.players.find((p) => p.id === 6)!;
    p.movementRemaining = null;
    const c = reconstructReplayContext(s.replay);
    expect([...c.teamRerollMovements.values()][0]!.movementAfter).toBeNull();
    expect(
      [...c.pickupsAfterMovement.values()][0]!.movementRemaining
    ).toBeNull();
    expect(
      LuckReportSchema.safeParse(analyzeReplayLuck(s.replay)).success
    ).toBe(true);
  });
  it.each([
    "team_dodge_zone_failure",
    "team_dodge_zone_combined_excluded",
    "team_dodge_zone_declined_failure",
    "team_dodge_skill_modifier_excluded"
  ])("withholds unsupported source %s", (id) => {
    const r = analyzeNufflizerInput(xml(id));
    expect(r.events.some((e) => e.metadata.teamRerollMovement)).toBe(false);
    expect(r.events.some((e) => e.metadata.pickupAfterMovement)).toBe(false);
  });
  it("keeps the combined and declined source classifications independently distinct", () => {
    const all = JSON.parse(readFileSync(path, "utf8")).cases;
    const messages = (id: string) =>
      all
        .find((c: { id: string }) => c.id === id)
        .records.flatMap(
          (r: { steps?: { messages: Record<string, unknown>[] }[] }) =>
            (r.steps ?? []).flatMap((s) => s.messages)
        );
    const combined = messages("team_dodge_zone_combined_excluded"),
      declined = messages("team_dodge_zone_declined_failure");
    expect(
      combined.some(
        (m: Record<string, unknown>) =>
          !!m.ResultMoveOutcome &&
          JSON.stringify(m.ResultMoveOutcome).includes('"RollType":["1"]') &&
          !!m.ResultMoveOutcome &&
          JSON.stringify(m.ResultMoveOutcome).includes('"RollType":["2"]')
      )
    ).toBe(true);
    expect(
      combined.find((m: Record<string, unknown>) => m.ResultTeamRerollUsage)
        ?.ResultTeamRerollUsage
    ).toMatchObject({ Used: ["1"] });
    expect(
      declined.find((m: Record<string, unknown>) => m.ResultTeamRerollUsage)
        ?.ResultTeamRerollUsage
    ).toMatchObject({ Used: ["0"] });
    expect(
      declined.some(
        (m: Record<string, unknown>) =>
          !!m.ResultMoveOutcome &&
          JSON.stringify(m.ResultMoveOutcome).includes('"RollType":["1"]')
      )
    ).toBe(false);
  });
  it.each([
    "kind",
    "value",
    "skill",
    "effect",
    "unknown_field",
    "missing_field",
    "duplicate",
    "natural_edge",
    "contradictory_target",
    "extra_die"
  ] as const)("rejects unsupported fixed penalty %s", (change) => {
    const s = source(),
      e = structuredClone(s.final),
      p = e.payload!,
      m = (p.Modifiers as { Modifier: Record<string, unknown> }).Modifier;
    if (change === "kind") m.ModifierType = 27;
    if (change === "value") m.Value = 1;
    if (change === "skill") m.Skill = 83;
    if (change === "effect") m.Effect = 1;
    if (change === "unknown_field") m.Unmodeled = 0;
    if (change === "missing_field") delete m.Effect;
    if (change === "duplicate") p.Modifiers = { Modifier: [m, { ...m }] };
    if (change === "natural_edge") {
      p.Requirement = 6;
      p.Difficulty = 6;
    }
    if (change === "contradictory_target") p.Difficulty = 4;
    if (change === "extra_die")
      (p.Dice as { Die: unknown }).Die = [
        { DieType: 0, Value: 3 },
        { DieType: 0, Value: 3 }
      ];
    expect(recordedZoneD6Check(e, 2, 2, true)).toBeUndefined();
  });
  it.each([
    "friendly_marker",
    "missing_marker",
    "distant_marker",
    "suppressed_zone",
    "mental_effect",
    "prone_marker",
    "replacement_marker",
    "replacement_base",
    "owner_conflict",
    "both_ids_missing",
    "unknown_own_prefix",
    "no_current_action"
  ] as const)("does not restore movement after %s", (change) => {
    const s = source(),
      marker = s.waiting.board!.teams[1]!.players.find((p) => p.id === 42)!;
    if (change === "friendly_marker") {
      s.waiting.board!.teams[1]!.players =
        s.waiting.board!.teams[1]!.players.filter((p) => p !== marker);
      s.waiting.board!.teams[0]!.players.push(marker);
    }
    if (change === "missing_marker")
      s.waiting.board!.teams[1]!.players =
        s.waiting.board!.teams[1]!.players.filter((p) => p !== marker);
    if (change === "distant_marker") marker.cell = { x: 1, y: 1 };
    if (change === "suppressed_zone") marker.tackleZone = false;
    if (change === "mental_effect")
      marker.mentalEffect = { providerSkillId: 31 };
    if (change === "prone_marker") marker.statusCode = 1;
    if (change === "replacement_marker")
      (
        s.final.payload!.Modifiers as { Modifier: { PlayerId: number } }
      ).Modifier.PlayerId = 43;
    if (change === "replacement_base") {
      s.final.payload!.Requirement = 3;
      s.final.payload!.Difficulty = 4;
    }
    if (change === "owner_conflict")
      s.waiting.board!.teams[1]!.explicitTeamId = 0;
    if (change === "both_ids_missing")
      s.waiting.board!.teams[1]!.explicitTeamId = null;
    if (change === "unknown_own_prefix")
      s.events.find(
        (e) => e.sourceTag === "ResultSkillUsage" && e.payload?.Skill === 7
      )!.sourceTag = "UnknownMessage";
    if (change === "no_current_action")
      s.at(s.movement.declarationSourceId).actionCode = 3;
    const c = reconstructReplayContext(s.replay);
    expect(c.teamRerollMovements.size).toBe(0);
    expect(c.pickupsAfterMovement.size).toBe(0);
  });
  it.each([
    "failed_terminal",
    "skill_declined",
    "skill_actor",
    "skill_unknown",
    "changed_modifier",
    "changed_target",
    "unknown_original",
    "checkpoint",
    "held_other",
    "wrong_ball_cell"
  ] as const)("withholds the pickup after %s", (change) => {
    const s = source(),
      [id, p] = [...s.context.pickupsAfterMovement.entries()][0]!,
      final = s.at(id),
      skill = s.at(p.skillSourceId),
      original = s.at(p.originalSourceId);
    if (change === "failed_terminal") {
      final.payload!.Outcome = 0;
      (final.payload!.Dice as { Die: { Value: number } }).Die.Value = 2;
    }
    if (change === "skill_declined") skill.payload!.Used = 0;
    if (change === "skill_actor") skill.payload!.PlayerId = 5;
    if (change === "skill_unknown") skill.payload!.Future = 1;
    if (change === "changed_modifier")
      (
        final.payload!.Modifiers as { Modifier: { PlayerId: number } }
      ).Modifier.PlayerId = 43;
    if (change === "changed_target") {
      final.payload!.Requirement = 3;
      final.payload!.Difficulty = 4;
    }
    if (change === "unknown_original") original.payload!.Future = 1;
    if (change === "checkpoint") {
      const c = structuredClone(s.waiting);
      c.afterSourceIndex = original.sourceIndex!;
      s.replay.boardCheckpoints!.splice(3, 0, c);
    }
    if (change === "held_other") {
      s.waiting.board!.ball.possession = "held";
      s.waiting.board!.ball.carrierId = 5;
      s.waiting.board!.ball.isHeld = true;
    }
    if (change === "wrong_ball_cell")
      s.waiting.board!.ball.cell = { x: 1, y: 1 };
    const probe = probeAfter(s.replay, final),
      c = reconstructReplayContext(s.replay);
    expect(c.pickupsAfterMovement.size).toBe(0);
    if (!["held_other", "wrong_ball_cell"].includes(change))
      expect(c.preRollEvidence.has(probe.id!)).toBe(false);
  });
  it.each([
    "marker_position",
    "marker_count",
    "base",
    "unknown_carry",
    "pickup_source",
    "pickup_cost",
    "pickup_cell",
    "pickup_skill",
    "pickup_marker",
    "pickup_point"
  ] as const)("rejects forged report %s", (change) => {
    const r = analyzeNufflizerInput(xml()),
      movement = r.events.find((e) => e.metadata.teamRerollMovement)!.metadata
        .teamRerollMovement!,
      pickup = r.events.find((e) => e.metadata.pickupAfterMovement)!,
      p = pickup.metadata.pickupAfterMovement!;
    if (change === "marker_position")
      movement.zonePenalty!.markers[0]!.cell = { x: 1, y: 1 };
    if (change === "marker_count")
      movement.zonePenalty!.markers.push({
        ...movement.zonePenalty!.markers[0]!
      });
    if (change === "base") movement.zonePenalty!.baseTarget = 3;
    if (change === "unknown_carry")
      r.events.find(
        (e) => e.metadata.dodgeMovement
      )!.metadata.dodgeMovement!.carriesBall = false;
    if (change === "pickup_source") p.movementSourceId = p.originalSourceId;
    if (change === "pickup_cost") p.movementRemaining = 1;
    if (change === "pickup_cell") p.cell.x++;
    if (change === "pickup_skill") p.skillSourceId = p.originalSourceId;
    if (change === "pickup_marker") p.check.markerPlayerIds = ["43"];
    if (change === "pickup_point")
      pickup.possessionBounds = {
        policy: "sure_hands_reroll",
        successChance: 2 / 3,
        minimumDifference: 0,
        maximumDifference: 2,
        lower: 0,
        upper: 2 / 3
      };
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("exports the observed pickup through CLI text independently of selected swings", () => {
    const dir = mkdtempSync(join(tmpdir(), "nufflizier-zone-"));
    try {
      const file = join(dir, "source.xml");
      writeFileSync(file, xml());
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
      expect(r.stdout).toContain("pickup consumes no second movement point");
      expect(r.stdout).toContain(
        "failed-pickup alternatives remain unquantified"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
