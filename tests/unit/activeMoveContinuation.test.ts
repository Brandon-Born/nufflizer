import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { activeMoveAfterDodge } from "@/domain/replay/activeMoveContinuation";
import { observeBoardCheckpoint } from "@/domain/replay/boardState";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { lonerDriveXml } from "../helpers/lonerDrive";
const xml = () =>
  lonerDriveXml(
    "terminal_dodge_success",
    "tests/fixtures/evidence/bb3-dodge-successors.json"
  );
function board(budget: number | null = 6) {
  const player = (Id: number, X: number, Y: number) => ({
    Id,
    Cell: { X, Y },
    CanAct: 1
  });
  return observeBoardCheckpoint(
    {
      IsStable: 1,
      CurrentPhase: 5,
      ActiveTeam: 0,
      ActivePlayer: 10,
      ListTeams: {
        TeamState: [
          {
            Data: { TeamId: 0 },
            GameTurn: 1,
            ListPitchPlayers: {
              PlayerState: [
                {
                  ...player(10, 5, 5),
                  ...(budget === null ? {} : { MovePoint: budget })
                },
                player(11, 3, 3)
              ]
            }
          },
          {
            Data: { TeamId: 1 },
            GameTurn: 1,
            ListPitchPlayers: { PlayerState: player(40, 9, 9) }
          }
        ]
      }
    },
    "1-4-0-0",
    { kind: "board", afterSourceIndex: 0, replayStep: 1, childIndex: 0 }
  ).board!;
}
const report = () => analyzeNufflizerInput(xml());
const terminal = (r: ReturnType<typeof report>) =>
  r.events.find((e) => e.contextualBounds)!;
describe("active ordinary Move continuation after a committed Dodge", () => {
  it("uses the active declaration and budget without certifying unused teammates' missing traits", () => {
    const b = board(),
      copy = structuredClone(b);
    const result = activeMoveAfterDodge(b, 10, { x: 6, y: 5 }, "declaration")!;
    expect(result).toMatchObject({
      movementBefore: 6,
      movementAfterSuccess: 5,
      opponentMarking: "unmarked",
      minimum: 1,
      maximum: 1
    });
    expect(
      Math.max(
        Math.abs(result.candidateDestination.x - 6),
        Math.abs(result.candidateDestination.y - 5)
      )
    ).toBe(1);
    expect(b.teams[0]!.players[1]!.ordinaryMovePolicyKnown).toBe(false);
    expect(b).toEqual(copy);
  });
  it.each([0, 1])(
    "leaves no further ordinary budget at %i before the checked step",
    (budget) => {
      expect(
        activeMoveAfterDodge(board(budget), 10, { x: 6, y: 5 }, "declaration")
      ).toMatchObject({ movementAfterSuccess: 0, minimum: 0, maximum: 0 });
    }
  );
  it("keeps an omitted budget unknown rather than zero", () => {
    expect(
      activeMoveAfterDodge(board(null), 10, { x: 6, y: 5 }, "declaration")
    ).toMatchObject({
      movementBefore: null,
      movementAfterSuccess: null,
      minimum: 0,
      maximum: 1
    });
  });
  it.each(["marked", "unknown"] as const)(
    "keeps %s opponent marking distinct",
    (mark) => {
      const b = board(),
        opponent = b.teams[1]!.players[0]!;
      opponent.cell = { x: 7, y: 5 };
      opponent.tackleZone = mark === "marked" ? true : null;
      expect(
        activeMoveAfterDodge(b, 10, { x: 6, y: 5 }, "declaration")
      ).toMatchObject({
        opponentMarking: mark,
        minimum: 0,
        maximum: mark === "marked" ? 0 : 1
      });
    }
  );
  it.each([
    "actor",
    "availability",
    "mental",
    "posture",
    "membership",
    "budget",
    "issues"
  ] as const)("withholds an unsupported %s continuation", (change) => {
    const b = board(),
      actor = b.teams[0]!.players[0]!;
    if (change === "actor") b.activePlayerId = 11;
    if (change === "availability") actor.canAct = null;
    if (change === "mental") actor.mentalEffect = { providerSkillId: 51 };
    if (change === "posture") actor.statusCode = 1;
    if (change === "membership") b.teams[0]!.explicitTeamId = null;
    if (change === "budget") actor.movementRemaining = 17;
    if (change === "issues") b.issues.push("contradictory_source");
    expect(
      activeMoveAfterDodge(b, 10, { x: 6, y: 5 }, "declaration")
    ).toBeUndefined();
  });
  it("reconciles the independently recorded two-move budget change without reading it into the pre-roll estimate", () => {
    const evidence = JSON.parse(
      readFileSync("tests/fixtures/evidence/bb3-dodge-successors.json", "utf8")
    );
    const c = evidence.cases.find(
      (c: { id: string }) => c.id === "terminal_dodge_success"
    );
    const before = c.records.find(
      (r: { replayStep: number; projection?: { BoardState?: unknown } }) =>
        r.replayStep === 93 && r.projection?.BoardState
    ).projection.BoardState;
    const after = c.records.find(
      (r: { replayStep: number; projection?: { BoardState?: unknown } }) =>
        r.replayStep === 94 && r.projection?.BoardState
    ).projection.BoardState;
    const player = (b: typeof before) =>
      b.ListTeams[0].TeamState[1].ListPitchPlayers[0].PlayerState.find(
        (p: { Id: string[] }) => p.Id[0] === "47"
      );
    expect([player(before).MovePoint, player(after).MovePoint]).toEqual([
      ["6"],
      ["4"]
    ]);
    const sequence = c.records.find(
      (r: { replayStep: number; steps?: unknown }) =>
        r.replayStep === 94 && r.steps
    ).steps;
    expect(
      sequence.map(
        (s: { step: { PlayerStep: { StepType: string[] } } }) =>
          s.step.PlayerStep.StepType
      )
    ).toEqual([["0"], ["1"], ["1"]]);
    expect(
      sequence[2].messages.map(
        (m: Record<string, unknown>) => Object.keys(m)[0]
      )
    ).toEqual(["ResultDoMove", "ResultMoveOutcome"]);
    const r = report(),
      event = terminal(r);
    expect(event.metadata.preRoll!.activeMoveContinuation).toMatchObject({
      movementBefore: 6,
      movementAfterSuccess: 5,
      opponentMarking: "unmarked",
      minimum: 1,
      maximum: 1
    });
    expect(event.contextualBounds!.lower).toBeCloseTo(1 / 3, 12);
    expect(event.contextualBounds!.upper).toBeCloseTo(10 / 3, 12);
    expect(event.metadata.preRoll!.otherUsefulActivations).toBeNull();
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
  });
  it("a later complete budget cannot backfill an omitted current budget", () => {
    const replay = parseReplayXml(xml()),
      event = terminal(analyzeReplayLuck(replay));
    const checkpoint = replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === event.metadata.preRoll!.checkpointAfter
    )!;
    checkpoint.board!.teams[1]!.players.find(
      (p) => String(p.id) === event.playerId
    )!.movementRemaining = null;
    const next = LuckReportSchema.parse(analyzeReplayLuck(replay)),
      changed = terminal(next);
    expect(changed.metadata.preRoll!.activeMoveContinuation).toMatchObject({
      movementBefore: null,
      movementAfterSuccess: null,
      minimum: 0,
      maximum: 1
    });
    expect(changed.contextualBounds!.lower).toBe(0);
    expect(changed.contextualBounds!.upper).toBeCloseTo(10 / 3, 12);
  });
  it("a changed and restored clock cannot repair the old ordinary Move declaration", () => {
    const replay = parseReplayXml(xml()),
      event = terminal(analyzeReplayLuck(replay));
    const checkpoint = replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === event.metadata.preRoll!.checkpointAfter
    )!;
    const declaration = replay.turns
      .flatMap((t) => t.events)
      .find(
        (e) =>
          e.id ===
          event.metadata.preRoll!.activeMoveContinuation!.declarationSourceId
      )!;
    const changed = structuredClone(checkpoint),
      restored = structuredClone(checkpoint);
    changed.afterSourceIndex = declaration.sourceIndex!;
    restored.afterSourceIndex = declaration.sourceIndex! + 1;
    changed.board!.activePlayerId = Number(event.playerId);
    restored.board!.activePlayerId = Number(event.playerId);
    changed.board!.teams[1]!.gameTurn = 3;
    replay.boardCheckpoints!.push(changed, restored);
    replay.boardCheckpoints!.sort(
      (a, b) => a.afterSourceIndex - b.afterSourceIndex
    );
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay)),
      after = terminal(r);
    expect(after.metadata.preRoll!.activeMoveContinuation).toBeUndefined();
    expect(after.contextualBounds!.lower).toBe(0);
  });
  it.each([
    "declaration",
    "owner",
    "budget_math",
    "marking_math",
    "bounds",
    "point_overlap"
  ] as const)("rejects forged %s", (change) => {
    const r = report(),
      event = terminal(r),
      continuation = event.metadata.preRoll!.activeMoveContinuation!;
    if (change === "declaration")
      continuation.declarationSourceId = event.metadata.rerollDecisionId!;
    if (change === "owner")
      r.events.find(
        (e) => e.metadata.sourceId === continuation.declarationSourceId
      )!.teamId = "0";
    if (change === "budget_math") continuation.movementAfterSuccess = 6;
    if (change === "marking_math") continuation.opponentMarking = "marked";
    if (change === "bounds")
      event.contextualBounds!.activeContinuation!.minimum = 0;
    if (change === "point_overlap")
      event.contextualImpact = {
        policy: "dodge_skill_reroll",
        components: {
          availableMoves: 9,
          activeContinuation: 1,
          possession: 0,
          markedBounce: 0
        },
        difference: 10,
        deviation: 1 / 3,
        contribution: 10 / 3
      };
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("removing the actual following move does not change the earlier continuation estimate", () => {
    const replay = parseReplayXml(xml()),
      before = terminal(analyzeReplayLuck(replay));
    for (const turn of replay.turns)
      turn.events = turn.events.filter(
        (e) => e.sourceIndex! <= before.metadata.sourceIndex!
      );
    replay.boardCheckpoints = replay.boardCheckpoints!.filter(
      (c) => c.afterSourceIndex < before.metadata.sourceIndex!
    );
    const after = terminal(LuckReportSchema.parse(analyzeReplayLuck(replay)));
    expect(after.metadata.preRoll!.activeMoveContinuation).toEqual(
      before.metadata.preRoll!.activeMoveContinuation
    );
    expect(after.contextualBounds).toEqual(before.contextualBounds);
  });
  it("does not borrow the ordinary Move continuation policy for a Blitz declaration", () => {
    const replay = parseReplayXml(xml()),
      before = terminal(analyzeReplayLuck(replay));
    const declaration = replay.turns
      .flatMap((t) => t.events)
      .find(
        (e) =>
          e.id ===
          before.metadata.preRoll!.activeMoveContinuation!.declarationSourceId
      )!;
    declaration.actionCode = 3;
    declaration.payload!.Action = 3;
    const event = terminal(LuckReportSchema.parse(analyzeReplayLuck(replay)));
    expect(event.metadata.preRoll!.activeMoveContinuation).toBeUndefined();
    expect(event.contextualBounds!.activeContinuation).toBeUndefined();
    expect(event.contextualBounds!.lower).toBe(0);
  });
});
