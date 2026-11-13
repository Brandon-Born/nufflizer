import type { ReplayEvent } from "@/domain/replay/types";
import type { ObservedBoard, ObservedPlayer } from "@/domain/replay/boardState";
import { numericRerollPolicy } from "./numericRerollPolicy";
// Synthetic stationary Catch version of the independently recorded wait.
// Successes bypass the question; no second face is drawn when use is false.
export function catchResumePolicy(
  target = 3,
  first = 2,
  second = 6,
  use = true
) {
  const r = numericRerollPolicy({ family: 7, target, first, second, use });
  const at = { x: 12, y: 9 };
  const header = (
    phase: 1 | 3,
    source: number,
    replayStep: number
  ): ReplayEvent => ({
    type: "step",
    sourceTag: "PlayerStep",
    id: `source-${source}`,
    sourceIndex: source,
    actionId: `catch-${phase}`,
    sequenceId: `sequence-${phase}`,
    stepTag: "PlayerStep",
    stepType: 4,
    playerId: "42",
    stepActorId: "42",
    targetId: "-1",
    stepTargetId: "-1",
    actorTeamId: "0",
    actorTeamSource: "explicit",
    locator: { replayStep, childIndex: 1, stepIndex: 0 },
    payload: {
      Probability: 100,
      PlayerId: 42,
      TargetId: -1,
      IsEvaluation: 0,
      StepType: 4,
      CellFrom: { X: 12, Y: 9 },
      CellTo: { X: 12, Y: 9 },
      State: phase,
      Skill: 0
    }
  });
  if (first >= target) {
    const result = r.turns[0]!.events[0]!;
    result.id = "source-2";
    result.sourceIndex = 2;
    result.actionId = "catch-1";
    result.sequenceId = "sequence-1";
    r.turns[0]!.events = [header(1, 1, 1), result];
    r.turns[0]!.eventCount = 2;
    return r;
  }
  const [q, choice, final] = r.turns[0]!.events;
  q!.id = "source-2";
  q!.sourceIndex = 2;
  q!.actionId = "catch-1";
  q!.sequenceId = "sequence-1";
  const carrier = (id: number): ReplayEvent => ({
    type: "ball_state",
    sourceTag: "Carrier",
    id: `source-${id}`,
    sourceIndex: id,
    checkpointCarrier: true,
    carrierObject: "ball",
    playerId: "43",
    payload: { Carrier: "43" }
  });
  const control = (
    tag: string,
    id: number,
    childIndex: number
  ): ReplayEvent => ({
    type: "unknown",
    sourceTag: tag,
    id: `source-${id}`,
    sourceIndex: id,
    locator: { replayStep: 2, childIndex },
    payload: {}
  });
  for (const [i, e] of [choice!, final!].entries()) {
    e.id = `source-${8 + i}`;
    e.sourceIndex = 8 + i;
    e.actionId = "catch-3";
    e.sequenceId = "sequence-3";
    e.locator = { replayStep: 3, childIndex: 1, stepIndex: 0, messageIndex: i };
  }
  r.turns[0]!.events = [
    header(1, 1, 1),
    q!,
    carrier(3),
    control("EventGamersAreReady", 4, 1),
    control("EventStartActiveTimer", 5, 2),
    carrier(6),
    header(3, 7, 3),
    choice!,
    final!
  ];
  r.turns[0]!.eventCount = 9;
  const player = (id: number, x: number): ObservedPlayer => ({
    id,
    cell: { x, y: 9 },
    pitchLocation: "on_pitch",
    canAct: null,
    tackleZone: true,
    statusCode: null,
    situationCode: null,
    movementRemaining: null,
    mentalEffect: null,
    traits: null
  });
  const board: ObservedBoard = {
    stable: null,
    pitchLayout: "standard",
    periodCode: null,
    phaseCode: 5,
    turnsPerPeriod: 8,
    activeTeamIndex: 0,
    activeGamerId: 0,
    activePlayerId: 43,
    teams: [
      {
        rosterIndex: 0,
        explicitTeamId: 0,
        sideCode: 32,
        gameTurn: 3,
        touchdowns: null,
        rerolls: 1,
        players: [player(42, 12), player(43, 11)]
      },
      {
        rosterIndex: 1,
        explicitTeamId: 1,
        sideCode: 64,
        gameTurn: 2,
        touchdowns: null,
        rerolls: 2,
        players: [player(7, 9)]
      }
    ],
    ball: {
      cell: at,
      carrierId: 43,
      isHeld: null,
      possession: "unknown",
      holderRosterIndex: null
    },
    issues: []
  };
  r.boardCheckpoints = [
    {
      kind: "initial",
      status: "observed",
      afterSourceIndex: 0,
      replayStep: null,
      childIndex: null,
      board: structuredClone(board)
    },
    {
      kind: "board",
      status: "observed",
      afterSourceIndex: 2,
      replayStep: 1,
      childIndex: 2,
      board: structuredClone(board),
      dicePayload: {
        LastWeatherRoll: { Die: [{ Value: "2" }, { Value: "3" }] },
        LastKickOffEventRoll: { Die: [{ Value: "3" }, { Value: "3" }] }
      }
    },
    {
      kind: "board",
      status: "observed",
      afterSourceIndex: 5,
      replayStep: 2,
      childIndex: 3,
      board: structuredClone(board),
      dicePayload: {
        LastWeatherRoll: { Die: [{ Value: "2" }, { Value: "3" }] },
        LastKickOffEventRoll: { Die: [{ Value: "3" }, { Value: "3" }] }
      }
    }
  ];
  r.playerOwnershipKeys = ["0:42", "0:43", "1:7"];
  return r;
}
