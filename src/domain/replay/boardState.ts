import type { ReplayEvent } from "./types";
import { observeMentalEffect, type MentalTraitEffect } from "./mentalEffects";
// Observed checkpoints, not a simulator. Each snapshot replaces the previous
// observation: omitted fields are unknown, never defaults or carry-forwards.
import {
  ordinaryMovePolicyKnown,
  observePlayerTraits,
  type ObservedPlayerTraits
} from "./playerTraits";
type RecordLike = Record<string, unknown>;
export type ObservedCell = { x: number | null; y: number | null };
export type ObservedPlayer = {
  ordinaryMovePolicyKnown?: boolean;
  mentalEffect: MentalTraitEffect | null;
  traits: ObservedPlayerTraits | null;
  id: number | null;
  cell: ObservedCell;
  pitchLocation: "on_pitch" | "off_pitch" | "unknown";
  canAct: boolean | null;
  tackleZone: boolean | null;
  statusCode: number | null;
  situationCode: number | null;
  movementRemaining: number | null;
};
export type ObservedTeam = {
  rosterIndex: number;
  explicitTeamId: number | null;
  sideCode: number | null;
  gameTurn: number | null;
  touchdowns: number | null;
  rerolls: number | null;
  players: ObservedPlayer[];
};
export type ObservedBoard = {
  stable: boolean | null;
  pitchLayout: "standard" | "small" | null;
  periodCode: number | null;
  phaseCode: number | null;
  turnsPerPeriod: number | null;
  activeTeamIndex: number | null;
  activeGamerId: number | null;
  activePlayerId: number | null;
  teams: ObservedTeam[];
  ball: {
    cell: ObservedCell;
    carrierId: number | null;
    isHeld: boolean | null;
    possession: "held" | "not_held" | "unknown";
    holderRosterIndex: number | null;
  };
  issues: string[];
};
export type BoardCheckpointSource = {
  kind: "initial" | "board";
  // All these events have already occurred. This is NOT pre-roll state for
  // an event at this same index; intervening messages can change the board.
  afterSourceIndex: number;
  replayStep: number | null;
  childIndex: number | null;
};
export type ReplayBoardCheckpoint = BoardCheckpointSource & {
  status: "observed" | "unsupported_version";
  board: ObservedBoard | null;
};
function record(value: unknown): RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordLike)
    : {};
}
function array(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
function integer(value: unknown): number | null {
  if (typeof value === "string" && /^-?\d{1,16}$/.test(value))
    value = Number(value);
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}
function nonnegative(value: unknown): number | null {
  const n = integer(value);
  return n !== null && n >= 0 ? n : null;
}
function flag(value: unknown): boolean | null {
  const n = integer(value);
  return n === 1 ? true : n === 0 ? false : null;
}
function cell(value: unknown): ObservedCell {
  const raw = record(value);
  return { x: integer(raw.X), y: integer(raw.Y) };
}
function pitchLocation(c: ObservedCell): ObservedPlayer["pitchLocation"] {
  if (c.x === null || c.y === null) return "unknown";
  return c.x >= 0 && c.x <= 25 && c.y >= 0 && c.y <= 14
    ? "on_pitch"
    : "off_pitch";
}

function pitchLayout(raw: RecordLike): ObservedBoard["pitchLayout"] {
  if (flag(raw.UseSmallPitch) === true) return "small";
  if (flag(raw.UseSmallPitch) !== false) return null;
  const ends = array(record(raw.PitchZones).PitchZone)
    .map(record)
    .filter((zone) => integer(zone.ZoneType) === 1);
  const complete = [0, 25].every((x) =>
    ends.some((zone) => {
      const from = cell(zone.BottomLeft);
      const to = cell(zone.TopRight);
      return from.x === x && from.y === 0 && to.x === x && to.y === 14;
    })
  );
  return ends.length === 2 && complete ? "standard" : null;
}

export function observeBoardCheckpoint(
  payload: unknown,
  replayVersion: string | undefined,
  source: BoardCheckpointSource
): ReplayBoardCheckpoint {
  if (replayVersion !== "1-4-0-0")
    return { ...source, status: "unsupported_version", board: null };
  const raw = record(payload);
  const issues: string[] = [];
  const teamNodes = array(record(raw.ListTeams).TeamState);
  // Bound normalization independently of the upstream XML node/work limits.
  if (teamNodes.length !== 2) issues.push("expected_two_team_states");
  const teams =
    teamNodes.length === 2
      ? teamNodes.map((node, rosterIndex) => {
          const team = record(node);
          const playerNodes = array(record(team.ListPitchPlayers).PlayerState);
          if (playerNodes.length > 64) issues.push("player_observation_limit");
          const players =
            playerNodes.length > 64
              ? []
              : playerNodes.map((entry) => {
                  const p = record(entry);
                  const position = cell(p.Cell);
                  const mentalEffect = observeMentalEffect(p.Effects);
                  const traits = observePlayerTraits(
                    p.Data,
                    nonnegative(p.Id),
                    nonnegative(record(team.Data).TeamId)
                  );
                  if (mentalEffect && flag(p.TackleZone) === true)
                    issues.push("conflicting_tackle_zone_effect");
                  return {
                    mentalEffect,
                    traits,
                    ordinaryMovePolicyKnown: ordinaryMovePolicyKnown(
                      traits,
                      nonnegative(p.Id),
                      p.Effects
                    ),
                    id: nonnegative(p.Id),
                    cell: position,
                    pitchLocation: pitchLocation(position),
                    canAct: flag(p.CanAct),
                    tackleZone: flag(p.TackleZone),
                    statusCode: nonnegative(p.Status),
                    situationCode: nonnegative(p.Situation),
                    movementRemaining: nonnegative(p.MovePoint)
                  };
                });
          return {
            rosterIndex,
            explicitTeamId: nonnegative(record(team.Data).TeamId),
            sideCode: nonnegative(team.Side),
            gameTurn: nonnegative(team.GameTurn),
            touchdowns: nonnegative(team.Touchdown),
            rerolls: nonnegative(team.RerollNumber),
            players
          };
        })
      : [];
  const ball = record(raw.Ball);
  const ballCell = cell(ball.Cell);
  const carrierId = nonnegative(ball.Carrier);
  const isHeld = flag(ball.IsHeld);
  const owners = teams.flatMap((t) =>
    t.players
      .filter((p) => carrierId !== null && p.id === carrierId)
      .map((p) => ({ player: p, rosterIndex: t.rosterIndex }))
  );
  const holder = owners.length === 1 ? owners[0] : undefined;
  const heldConsistent =
    isHeld === true &&
    holder !== undefined &&
    holder.player.pitchLocation === "on_pitch" &&
    (holder.player.situationCode === null ||
      holder.player.situationCode === 0) &&
    holder.player.cell.x === ballCell.x &&
    holder.player.cell.y === ballCell.y;
  if (isHeld === true && !heldConsistent)
    issues.push("held_ball_not_reconciled");
  const ids = teams.flatMap((t) =>
    t.players.map((p) => p.id).filter((id) => id !== null)
  );
  if (new Set(ids).size !== ids.length) issues.push("duplicate_player_ids");
  return {
    ...source,
    status: "observed",
    board: {
      stable: flag(raw.IsStable),
      pitchLayout: pitchLayout(raw),
      periodCode: nonnegative(raw.Period),
      phaseCode: nonnegative(raw.CurrentPhase),
      turnsPerPeriod: nonnegative(raw.TurnsPerPeriod),
      activeTeamIndex: [0, 1].includes(integer(raw.ActiveTeam) ?? -1)
        ? integer(raw.ActiveTeam)
        : null,
      activeGamerId: nonnegative(raw.ActiveGamer),
      activePlayerId: nonnegative(raw.ActivePlayer),
      teams,
      ball: {
        cell: ballCell,
        carrierId,
        isHeld,
        possession: heldConsistent
          ? "held"
          : isHeld === false
            ? "not_held"
            : "unknown",
        holderRosterIndex: heldConsistent ? holder!.rosterIndex : null
      },
      issues
    }
  };
}

// Input is the parser's ordered timeline. This returns the last observation,
// with its source boundary, not a claim that it is still current at the roll.
export function lastBoardCheckpointBefore(
  checkpoints: readonly ReplayBoardCheckpoint[],
  sourceIndex: number
): ReplayBoardCheckpoint | undefined {
  let low = 0;
  let high = checkpoints.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (checkpoints[middle]!.afterSourceIndex < sourceIndex) low = middle + 1;
    else high = middle;
  }
  return low ? checkpoints[low - 1] : undefined;
}

// A matching final clock cannot repair an intervening changed/unknown clock.
// Stable may be false while a recorded reroll decision is pending; it is not
// itself a turn boundary. Build once, rather than scanning all boards per roll.
export function checkpointClockEpochs(
  checkpoints: readonly ReplayBoardCheckpoint[]
): ReadonlyMap<ReplayBoardCheckpoint, number> {
  const epochs = new Map<ReplayBoardCheckpoint, number>();
  let previous: string | undefined;
  let epoch = 0;
  for (const checkpoint of checkpoints) {
    const board = checkpoint.board;
    const signature =
      board && board.issues.length === 0
        ? JSON.stringify([
            board.phaseCode,
            board.periodCode,
            board.activeTeamIndex,
            board.teams.map((team) => [
              team.rosterIndex,
              team.explicitTeamId,
              team.gameTurn
            ])
          ])
        : "unknown";
    if (signature !== previous) epoch++;
    previous = signature;
    epochs.set(checkpoint, epoch);
  }
  return epochs;
}

// The sampled wait marker reports only phase/controller, not a board mutation.
// Keep unknown fields and contradictory/missing controller evidence unsupported.
export function consistentNormalStandBy(
  event: ReplayEvent,
  before: ObservedBoard,
  after: ObservedBoard
): boolean {
  const p = event.payload;
  const phase =
    typeof p?.Phase === "string" && /^\d+$/.test(p.Phase)
      ? Number(p.Phase)
      : p?.Phase;
  const gamer =
    typeof p?.ActiveGamer === "string" && /^\d+$/.test(p.ActiveGamer)
      ? Number(p.ActiveGamer)
      : p?.ActiveGamer;
  return (
    event.sourceTag === "EventRulesEngineStandBy" &&
    !!p &&
    Object.keys(p).every((k) => k === "Phase" || k === "ActiveGamer") &&
    phase === 5 &&
    before.phaseCode === 5 &&
    after.phaseCode === 5 &&
    (gamer === undefined
      ? before.activeGamerId === after.activeGamerId
      : (gamer === 0 || gamer === 1) &&
        before.activeGamerId === gamer &&
        after.activeGamerId === gamer)
  );
}
