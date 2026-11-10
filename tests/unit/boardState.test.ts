import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import {
  lastBoardCheckpointBefore,
  observeBoardCheckpoint
} from "@/domain/replay/boardState";
import { envelope, rollXml, sequence } from "../helpers/replay";

type Projection = {
  [tag: string]: null | string | Projection | (string | Projection)[];
};
type EventEvidence = {
  replayStep: number;
  eventIndex: number;
  projection: Projection;
};
function xml(projection: Projection): string {
  return Object.entries(projection)
    .map(([tag, values]) =>
      (Array.isArray(values) ? values : [values])
        .map(
          (value) =>
            `<${tag}>${value === null ? "" : typeof value === "string" ? value : xml(value)}</${tag}>`
        )
        .join("")
    )
    .join("");
}
function playback(source: string, id: string) {
  const evidence = JSON.parse(
    readFileSync(
      `tests/fixtures/evidence/bb3-ui-playback-${source}.json`,
      "utf8"
    )
  );
  const records: EventEvidence[] = evidence.cases.find(
    (c: { id: string }) => c.id === id
  ).eventRecords;
  const steps = Array.from(
    { length: Math.max(...records.map((r) => r.replayStep)) },
    () => [] as string[]
  );
  for (const r of records) {
    const children = steps[r.replayStep - 1]!;
    while (children.length <= r.eventIndex) children.push("<Clock/>");
    children[r.eventIndex] = xml(r.projection);
  }
  return parseReplayXml(
    envelope(
      steps
        .map((children) => `<ReplayStep>${children.join("")}</ReplayStep>`)
        .join("")
    )
  );
}
const source = {
  kind: "board",
  afterSourceIndex: 0,
  replayStep: 1,
  childIndex: 0
} as const;
function synthetic(overrides: Record<string, unknown> = {}) {
  return {
    ActiveTeam: 0,
    Period: 0,
    TurnsPerPeriod: 8,
    Ball: { Cell: { X: 4, Y: 9 }, Carrier: 5, IsHeld: 1 },
    ListTeams: {
      TeamState: [
        {
          GameTurn: 1,
          Data: { TeamId: 0 },
          ListPitchPlayers: {
            PlayerState: { Id: 5, Cell: { X: 4, Y: 9 }, CanAct: 1 }
          }
        },
        {
          GameTurn: 1,
          Data: { TeamId: 1 },
          ListPitchPlayers: {
            PlayerState: { Id: 40, Cell: { X: 5, Y: 9 }, CanAct: 1 }
          }
        }
      ]
    },
    ...overrides
  };
}

describe("NUF-016 ordered, explicitly observed board checkpoints", () => {
  it("preserves UI-096's held ball then clears unsupported possession when fields disappear", () => {
    const checkpoints = playback("025", "UI-096").boardCheckpoints!;
    expect(checkpoints.map((c) => [c.replayStep, c.childIndex])).toEqual([
      [401, 2],
      [402, 7]
    ]);
    expect(checkpoints[0]!.board!.ball).toMatchObject({
      carrierId: 5,
      isHeld: true,
      possession: "held",
      holderRosterIndex: 0
    });
    expect(checkpoints[1]!.board!.ball).toEqual({
      cell: { x: 4, y: 9 },
      carrierId: null,
      isHeld: null,
      possession: "unknown",
      holderRosterIndex: null
    });
    expect(checkpoints[0]!.board!.ball.carrierId).toBe(5);
  });
  it("does not interpret UI-098's stale Carrier as held possession during a pass", () => {
    const [before, intermediate, after] = playback(
      "016",
      "UI-098"
    ).boardCheckpoints!;
    expect(before!.board!.ball.possession).toBe("held");
    expect(intermediate!.board!.ball).toMatchObject({
      carrierId: 46,
      isHeld: null,
      possession: "unknown",
      holderRosterIndex: null,
      cell: { x: 6, y: 8 }
    });
    expect(after!.board!.ball).toMatchObject({
      carrierId: null,
      possession: "unknown"
    });
  });
  it("keeps UI-095's off-pitch CanAct1 separate from legal availability", () => {
    const checkpoints = playback("025", "UI-095").boardCheckpoints!;
    const players = checkpoints.map((c) =>
      c.board!.teams[1]!.players.find((p) => p.id === 40)!
    );
    expect(players.map((p) => p.cell)).toEqual([
      { x: 17, y: 14 },
      { x: 17, y: 15 },
      { x: -1, y: -1 }
    ]);
    expect(players.map((p) => p.pitchLocation)).toEqual([
      "on_pitch",
      "off_pitch",
      "off_pitch"
    ]);
    expect(players[2]).toMatchObject({
      canAct: true,
      tackleZone: true,
      statusCode: null,
      situationCode: 1
    });
  });
  it("preserves UI-099's disappearing CanAct and movement evidence as unknown", () => {
    const checkpoints = playback("016", "UI-099").boardCheckpoints!;
    const actor = (index: number) =>
      checkpoints[index]!.board!.teams[1]!.players.find((p) => p.id === 44)!;
    expect(actor(1)).toMatchObject({ canAct: true, movementRemaining: 5 });
    expect(actor(2)).toMatchObject({
      canAct: null,
      movementRemaining: null,
      cell: actor(1).cell
    });
    expect(
      checkpoints[2]!.board!.teams[1]!.players.find((p) => p.id === 45)!.canAct
    ).toBe(true);
    expect(checkpoints[2]!.board!.teams[1]!.gameTurn).toBe(8);
  });
  it("retains UI-084 Extra Time/turn20 without wrapping the cumulative clock at eight", () => {
    const board = playback("020", "UI-084").boardCheckpoints![0]!.board!;
    expect(board).toMatchObject({
      periodCode: 2,
      turnsPerPeriod: 8,
      activeTeamIndex: null
    });
    expect(board.teams.map((t) => t.gameTurn)).toEqual([20, 19]);
  });
  it("orders checkpoints around events without leaking a future snapshot into pre-roll evidence", () => {
    const b = (x: number) =>
      `<BoardState><Ball><Cell><X>${x}</X><Y>9</Y></Cell></Ball></BoardState>`;
    const replay = parseReplayXml(
      envelope(
        `<NotificationGameJoined><InitialBoardState><Ball><Carrier>5</Carrier></Ball></InitialBoardState></NotificationGameJoined>` +
          `<ReplayStep>${b(4)}${sequence([rollXml()])}${b(8)}</ReplayStep>`
      )
    );
    const roll = replay.turns
      .flatMap((t) => t.events)
      .find((e) => e.sourceTag === "ResultRoll")!;
    const checkpoints = replay.boardCheckpoints!;
    expect(checkpoints.map((c) => c.kind)).toEqual([
      "initial",
      "board",
      "board"
    ]);
    expect(
      lastBoardCheckpointBefore(checkpoints, roll.sourceIndex!)!.board!.ball
        .cell.x
    ).toBe(4);
    expect(
      lastBoardCheckpointBefore(
        checkpoints,
        checkpoints.at(-1)!.afterSourceIndex
      )!.board!.ball.cell.x
    ).toBe(4);
    expect(
      lastBoardCheckpointBefore(checkpoints, roll.sourceIndex! + 1)!.board!.ball
        .cell.x
    ).toBe(8);
    expect(
      replay.turns
        .flatMap((t) => t.events)
        .filter((e) => e.sourceTag === "BoardState")
    ).toHaveLength(0);
  });
  it.each([undefined, "1-3-0-0", "future"])(
    "does not accept state semantics for version %s",
    (version) => {
      expect(
        observeBoardCheckpoint(synthetic(), version, source)
      ).toMatchObject({ status: "unsupported_version", board: null });
    }
  );
  it("keeps omitted zeros, incomplete coordinates and invalid flags unknown", () => {
    const board = observeBoardCheckpoint(
      synthetic({
        ActiveTeam: "",
        Period: undefined,
        Ball: { Cell: { Y: 9 }, IsHeld: 2 }
      }),
      "1-4-0-0",
      source
    ).board!;
    expect(board).toMatchObject({ activeTeamIndex: null, periodCode: null });
    expect(board.ball).toMatchObject({
      cell: { x: null, y: 9 },
      isHeld: null,
      possession: "unknown"
    });
    const zeros = observeBoardCheckpoint(synthetic(), "1-4-0-0", source).board!;
    expect(zeros).toMatchObject({ activeTeamIndex: 0, periodCode: 0 });
    expect(zeros.teams[0]!.explicitTeamId).toBe(0);
  });
  it("rejects held possession when ownership, coordinates or off-pitch location conflict", () => {
    for (const mutate of [
      (raw: ReturnType<typeof synthetic>) => {
        raw.ListTeams.TeamState[1]!.ListPitchPlayers.PlayerState.Id = 5;
      },
      (raw: ReturnType<typeof synthetic>) => {
        raw.ListTeams.TeamState[0]!.ListPitchPlayers.PlayerState.Cell.X = 7;
      },
      (raw: ReturnType<typeof synthetic>) => {
        raw.ListTeams.TeamState[0]!.ListPitchPlayers.PlayerState.Cell = {
          X: -1,
          Y: -1
        };
      }
    ]) {
      const raw = synthetic();
      mutate(raw);
      const board = observeBoardCheckpoint(raw, "1-4-0-0", source).board!;
      expect(board.ball.possession).toBe("unknown");
      expect(board.issues).toContain("held_ball_not_reconciled");
    }
  });
  it("bounds malformed checkpoint collections and does not invent teams", () => {
    const raw = synthetic({
      ListTeams: {
        TeamState: [
          {
            ListPitchPlayers: {
              PlayerState: Array.from({ length: 65 }, () => ({ Id: 5 }))
            }
          },
          {}
        ]
      }
    });
    expect(
      observeBoardCheckpoint(raw, "1-4-0-0", source).board!.issues
    ).toContain("player_observation_limit");
    expect(observeBoardCheckpoint({}, "1-4-0-0", source).board).toMatchObject({
      teams: [],
      issues: ["expected_two_team_states"]
    });
    expect(lastBoardCheckpointBefore([], 1)).toBeUndefined();
  });
  it("does not admit incidental nested BoardState tags as game checkpoints", () => {
    const replay = parseReplayXml(
      envelope(
        "<Notes><BoardState><Period>1</Period></BoardState></Notes>" +
          "<ReplayStep><Notes><BoardState><Period>2</Period></BoardState></Notes></ReplayStep>" +
          "<InitialBoardState><Period>3</Period></InitialBoardState>"
      )
    );
    expect(replay.boardCheckpoints).toEqual([]);
  });
});
