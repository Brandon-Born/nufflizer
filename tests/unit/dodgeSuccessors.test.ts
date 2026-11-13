import {
  ordinaryMovePolicyKnown,
  observePlayerTraits
} from "@/domain/replay/playerTraits";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ordinaryMovesAfterSuccess,
  ordinaryMovesAtPickup
} from "@/domain/replay/ordinaryMoveAvailability";
import { observeBoardCheckpoint } from "@/domain/replay/boardState";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { estimateNumericImpact } from "@/domain/nufflizer/contextImpact";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { lonerDriveXml } from "../helpers/lonerDrive";
const xml = (id: string) =>
  lonerDriveXml(id, "tests/fixtures/evidence/bb3-dodge-successors.json");
function board(kind: "vacated" | "occupied") {
  const player = (Id: number, X: number, Y: number) => ({
    Id,
    Cell: { X, Y },
    CanAct: 1,
    MovePoint: 5,
    Status: 0,
    Situation: 0,
    Data: { Id, InnateSkills: "", AcquiredSkills: "" },
    Effects: ""
  });
  return observeBoardCheckpoint(
    {
      IsStable: 1,
      CurrentPhase: 5,
      ActiveTeam: 0,
      ListTeams: {
        TeamState: [
          {
            Data: { TeamId: 0 },
            ListPitchPlayers: {
              PlayerState: [
                player(
                  10,
                  kind === "vacated" ? 1 : 2,
                  kind === "vacated" ? 0 : 1
                ),
                player(11, 0, 0)
              ]
            }
          },
          {
            Data: { TeamId: 1 },
            ListPitchPlayers: {
              PlayerState:
                kind === "vacated"
                  ? [player(40, 0, 1), player(41, 1, 1)]
                  : [player(40, 0, 1), player(41, 1, 0)]
            }
          }
        ]
      }
    },
    "1-4-0-0",
    { kind: "board", afterSourceIndex: 0, replayStep: 1, childIndex: 0 }
  ).board!;
}
describe("valid Dodge successor geometry and bounded ordinary-move context", () => {
  it("counts pickup opportunities at the reached square, without vacating or occupying an extra square", () => {
    const blocked = board("vacated"),
      open = board("occupied"),
      copy = structuredClone(open);
    expect(ordinaryMovesAtPickup(blocked, 10)).toEqual({
      knownAvailablePlayerIds: [],
      unknownPlayerIds: []
    });
    expect(ordinaryMovesAtPickup(open, 10)).toEqual({
      knownAvailablePlayerIds: ["11"],
      unknownPlayerIds: []
    });
    expect(open).toEqual(copy);
    open.teams[0]!.players[1]!.ordinaryMovePolicyKnown = false;
    expect(ordinaryMovesAtPickup(open, 10)).toEqual({
      knownAvailablePlayerIds: [],
      unknownPlayerIds: ["11"]
    });
    open.teams[0]!.players[1]!.canAct = false;
    expect(ordinaryMovesAtPickup(open, 10)).toEqual({
      knownAvailablePlayerIds: [],
      unknownPlayerIds: []
    });
  });
  it.each(["side", "phase", "position", "budget", "posture"] as const)(
    "pickup opportunities preserve %s uncertainty or restrictions",
    (change) => {
      const b = board("occupied"),
        p = b.teams[0]!.players[1]!;
      if (change === "side") b.activeTeamIndex = null;
      if (change === "phase") b.phaseCode = 3;
      if (change === "position") p.pitchLocation = "unknown";
      if (change === "budget") p.movementRemaining = 0;
      if (change === "posture") p.statusCode = 1;
      expect(ordinaryMovesAtPickup(b, 10)).toEqual(
        ["side", "phase", "position"].includes(change)
          ? undefined
          : { knownAvailablePlayerIds: [], unknownPlayerIds: [] }
      );
    }
  );
  it("vacating the only blocked exit creates an ordinary teammate move after success", () => {
    const b = board("vacated"),
      copy = structuredClone(b);
    expect(ordinaryMovesAfterSuccess(b, 10, { x: 2, y: 0 })).toEqual({
      successDestination: { x: 2, y: 0 },
      knownAvailablePlayerIds: ["11"],
      unknownPlayerIds: []
    });
    expect(b).toEqual(copy);
  });
  it("occupying the last free exit removes that teammate move from the successful successor", () => {
    expect(
      ordinaryMovesAfterSuccess(board("occupied"), 10, { x: 1, y: 1 })
    ).toEqual({
      successDestination: { x: 1, y: 1 },
      knownAvailablePlayerIds: [],
      unknownPlayerIds: []
    });
  });
  it.each([
    "availability",
    "posture",
    "situation",
    "movement",
    "mental"
  ] as const)("bounds an uncertain teammate without inventing %s", (change) => {
    const b = board("vacated"),
      p = b.teams[0]!.players[1]!;
    if (change === "availability") p.canAct = null;
    if (change === "posture") p.statusCode = null;
    if (change === "situation") p.situationCode = null;
    if (change === "movement") p.movementRemaining = null;
    if (change === "mental") p.mentalEffect = { providerSkillId: 51 };
    expect(ordinaryMovesAfterSuccess(b, 10, { x: 2, y: 0 })).toMatchObject({
      knownAvailablePlayerIds: [],
      unknownPlayerIds: ["11"]
    });
  });
  it.each(["destination", "occupied", "unknown_position", "phase"] as const)(
    "withholds a successor with %s contradiction",
    (change) => {
      const b = board("vacated");
      let destination = { x: 2, y: 0 };
      if (change === "destination") destination = { x: 26, y: 0 };
      if (change === "occupied") destination = { x: 1, y: 1 };
      if (change === "unknown_position")
        b.teams[1]!.players[0]!.pitchLocation = "unknown";
      if (change === "phase") b.phaseCode = 3;
      expect(ordinaryMovesAfterSuccess(b, 10, destination)).toBeUndefined();
    }
  );
  it.each([
    ["terminal_dodge_failure", 7, -16 / 3, 0, false],
    ["terminal_dodge_success", 9, 1 / 3, 10 / 3, true]
  ] as const)(
    "%s reconciles conditional terminal odds and raw unknown availability",
    (id, maximum, lower, upper, success) => {
      const r = analyzeNufflizerInput(xml(id)),
        event = r.events.find((e) => e.contextualBounds)!;
      expect(event.actualSuccess).toBe(success);
      expect(event.probabilitySuccess).toBeCloseTo(8 / 9, 12);
      expect(event.delta).toBeCloseTo(Number(success) - 4 / 3, 12);
      expect(event.contextualBounds).toMatchObject({
        minimumMoves: 0,
        maximumMoves: maximum,
        successChance: 2 / 3
      });
      expect(event.contextualBounds!.lower).toBeCloseTo(lower, 12);
      expect(event.contextualBounds!.upper).toBeCloseTo(upper, 12);
      expect(event.metadata.preRoll!.otherUsefulActivations).toBeNull();
      expect(
        event.metadata.preRoll!.ordinaryMoveAvailability!.unknownPlayerIds
      ).toEqual(
        id === "terminal_dodge_failure"
          ? ["37", "38", "41", "42", "43", "45", "49"]
          : ["37", "38", "39", "41", "42", "43", "44", "45", "49"]
      );
      expect(event.contextualImpact).toBeUndefined();
      expect(
        r.teams.every((t) => t.impactCount === 0 && t.impactScore === 0)
      ).toBe(true);
      expect(r.coverage.contextEvidence).toMatchObject({
        boundedCount: 1,
        quantifiedCount: 0
      });
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it("a complete-state continuation separates terminal context from both actual dice innovations", () => {
    const replay = parseReplayXml(xml("terminal_dodge_failure"));
    const original = analyzeReplayLuck(replay).events.find(
      (e) => e.contextualBounds
    )!;
    const availability = original.metadata.preRoll!.ordinaryMoveAvailability!;
    const checkpoint = replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === original.metadata.preRoll!.checkpointAfter
    )!;
    for (const team of checkpoint.board!.teams)
      for (const p of team.players)
        if (availability.unknownPlayerIds.includes(String(p.id))) {
          p.canAct = true;
          p.statusCode = 0;
          p.situationCode = 0;
          p.movementRemaining = 5;
          p.mentalEffect = null;
          p.ordinaryMovePolicyKnown = true;
          p.traits = {
            dataPlayerId: p.id,
            playerTypeId: null,
            innateSkills: [],
            acquiredSkills: []
          };
        }
    // Explicitly synthetic marking: all nearby opposing players have no
    // tackle zone, so the actor's own unrolled continuation is also known.
    const destination = availability.successDestination;
    for (const team of checkpoint.board!.teams)
      if (team.rosterIndex === 0)
        for (const p of team.players)
          if (
            p.pitchLocation === "on_pitch" &&
            Math.max(
              Math.abs(p.cell.x! - destination.x),
              Math.abs(p.cell.y! - destination.y)
            ) === 1
          )
            p.tackleZone = false;
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const event = r.events.find(
      (e) => e.metadata.sourceId === original.metadata.sourceId
    )!;
    expect(event.contextualBounds).toBeUndefined();
    expect(event.contextualImpact).toMatchObject({
      policy: "dodge_skill_reroll",
      difference: 8,
      components: { availableMoves: 7, activeContinuation: 1 },
      deviation: -2 / 3
    });
    expect(event.contextualImpact!.contribution).toBeCloseTo(-16 / 3, 12);
    expect(event.delta).toBeCloseTo(-4 / 3, 12);
    const context = event.metadata.preRoll;
    const values = [1, 2, 3, 4, 5, 6].map(
      (face) =>
        estimateNumericImpact(
          context,
          2,
          "dodge_skill_reroll",
          Number(face >= 3) - 2 / 3
        )!.contribution
    );
    expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
  });
  it.each([
    "range",
    "chance",
    "availability_ids",
    "original_die",
    "original_fractional",
    "terminal_face",
    "skill_owner",
    "skill_link",
    "overlap"
  ] as const)("rejects forged %s", (change) => {
    const r = analyzeNufflizerInput(xml("terminal_dodge_failure")),
      event = r.events.find((e) => e.contextualBounds)!;
    if (change === "range") event.contextualBounds!.lower--;
    if (change === "chance") event.contextualBounds!.successChance = 8 / 9;
    if (change === "availability_ids")
      event.metadata.preRoll!.ordinaryMoveAvailability!.unknownPlayerIds.push(
        event.playerId!
      );
    if (change === "original_die")
      r.events.find(
        (e) => e.metadata.sourceId === event.metadata.rerollOriginalId
      )!.metadata.dice = [6];
    if (change === "original_fractional")
      r.events.find(
        (e) => e.metadata.sourceId === event.metadata.rerollOriginalId
      )!.metadata.dice = [1.5];
    if (change === "terminal_face") event.metadata.dice = [6];
    if (change === "skill_owner")
      r.events.find(
        (e) => e.metadata.sourceId === event.metadata.rerollDecisionId
      )!.teamId = "0";
    if (change === "skill_link")
      event.metadata.rerollDecisionId = event.metadata.rerollOriginalId;
    if (change === "overlap")
      event.contextualImpact = {
        policy: "dodge_skill_reroll",
        components: { availableMoves: 7, possession: 0, markedBounce: 0 },
        difference: 7,
        deviation: -2 / 3,
        contribution: -14 / 3
      };
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    "missing_data",
    "missing_skills",
    "missing_effects",
    "unmodeled_skill",
    "activation_trait",
    "identity"
  ] as const)("fresh eligibility remains unknown for %s", (change) => {
    const data: Record<string, unknown> = {
      Id: 11,
      InnateSkills: "",
      AcquiredSkills: ""
    };
    let effects: unknown = "";
    if (change === "missing_skills") delete data.AcquiredSkills;
    if (change === "missing_effects") effects = undefined;
    if (change === "unmodeled_skill")
      data.InnateSkills = { InnateSkillsItem: 999 };
    if (change === "activation_trait")
      data.InnateSkills = { InnateSkillsItem: 51 };
    if (change === "identity") data.Id = 12;
    expect(
      ordinaryMovePolicyKnown(
        observePlayerTraits(change === "missing_data" ? undefined : data, 11),
        11,
        effects
      )
    ).toBe(false);
  });
  it("admitted ordinary skills require their own complete current lists and explicitly empty effects", () => {
    expect(
      ordinaryMovePolicyKnown(
        observePlayerTraits(
          {
            Id: 11,
            InnateSkills: { InnateSkillsItem: [30, 7] },
            AcquiredSkills: { AcquiredSkillsItem: 63 }
          },
          11
        ),
        11,
        ""
      )
    ).toBe(true);
  });
  it("a known small pitch does not regain standard move geometry when a later board omits the layout", () => {
    const replay = parseReplayXml(xml("terminal_dodge_failure"));
    replay.boardCheckpoints![0]!.board!.pitchLayout = "small";
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(r.events.some((e) => e.contextualBounds || e.contextualImpact)).toBe(
      false
    );
  });
  it.each(["evaluation", "special_skill"] as const)(
    "does not price an unverified %s movement successor",
    (change) => {
      const replay = parseReplayXml(xml("terminal_dodge_failure"));
      for (const turn of replay.turns)
        for (const step of turn.events)
          if (step.sourceTag === "PlayerStep" && step.stepType === 1) {
            if (change === "evaluation") step.payload!.IsEvaluation = 1;
            else step.payload!.Skill = 41;
          }
      const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
      expect(
        r.events.some((e) => e.contextualBounds || e.contextualImpact)
      ).toBe(false);
    }
  );
  it("future complete availability cannot backfill the earlier bound", () => {
    const replay = parseReplayXml(xml("terminal_dodge_failure"));
    const before = analyzeReplayLuck(replay).events.find(
      (e) => e.contextualBounds
    )!;
    for (const c of replay.boardCheckpoints!)
      if (c.afterSourceIndex > before.metadata.sourceIndex!)
        for (const team of c.board?.teams ?? [])
          for (const p of team.players) {
            p.canAct = true;
            p.statusCode = 0;
            p.situationCode = 0;
            p.movementRemaining = 5;
          }
    const after = LuckReportSchema.parse(analyzeReplayLuck(replay)).events.find(
      (e) => e.metadata.sourceId === before.metadata.sourceId
    )!;
    expect(after.contextualBounds).toEqual(before.contextualBounds);
    expect(after.metadata.preRoll).toEqual(before.metadata.preRoll);
  });
  it("reconciles the public source subset without manufacturing point estimates or whole-match verdicts", () => {
    let count = 0;
    for (const file of readdirSync("demo-replays").filter((f) =>
      f.endsWith(".bbr")
    )) {
      const r = analyzeNufflizerInput(
        readFileSync(`demo-replays/${file}`, "utf8")
      );
      count += r.events.filter((e) => e.contextualBounds?.policy === "dodge_skill_reroll").length;
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
    expect(count).toBe(10);
  }, 20000);
});
