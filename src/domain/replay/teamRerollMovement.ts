import type { ReplayEvent } from "./types";
import { unmodifiedD6Check } from "./numericCheck";
import { recordedZoneD6Check, type RecordedZoneCheck } from "./zoneD6Check";
import type { ObservedBoard } from "./boardState";

type Cell = { x: number; y: number };
export type ObservedTeamRerollMovement = {
  rollType: 1 | 2;
  gamerId: 0 | 1;
  questionSourceId: string;
  decisionSourceId: string;
  declarationSourceId: string;
  doMoveSourceId: string;
  outcomeSourceId: string;
  originalCheckpointAfter: number;
  checkpointAfter: number;
  from: Cell;
  to: Cell;
  movementBefore: number | null;
  movementAfter: number | null;
  carriesBall: boolean | null;
  zonePenalty?: {
    baseTarget: number;
    markers: { playerId: string; cell: Cell }[];
  };
};
export function failedMovementOffer(
  event: ReplayEvent
): ({ family: 1 | 2 } & RecordedZoneCheck) | undefined {
  const p = event.payload,
    info = p?.RollInfos;
  if (
    event.sourceTag !== "QuestionTeamRerollUsage" ||
    p?.CanUseTeamReroll !== 1 ||
    (p.GamerId !== 0 && p.GamerId !== 1) ||
    !info ||
    typeof info !== "object" ||
    Array.isArray(info) ||
    Object.keys(p).some(
      (k) =>
        ![
          "GamerId",
          "CanUseTeamReroll",
          "CanUseProReroll",
          "StarSpecialRule",
          "RollInfos"
        ].includes(k)
    )
  )
    return;
  const family = (info as Record<string, unknown>).RollType;
  if (family !== 1 && family !== 2) return;
  const dieEvent = {
    ...event,
    sourceTag: "ResultRoll",
    rollType: family,
    payload: info as Record<string, unknown>
  };
  if (family === 2) {
    const check = recordedZoneD6Check(dieEvent, 2, 1, false);
    return check ? { family, ...check } : undefined;
  }
  const threshold = unmodifiedD6Check(dieEvent, 1, 1, false);
  return threshold
    ? { family, threshold, baseTarget: threshold, markerPlayerIds: [] }
    : undefined;
}
export function sameMovementActor(a: ReplayEvent, b: ReplayEvent) {
  return (
    !!a.playerId &&
    a.playerId === b.playerId &&
    a.stepActorId === a.playerId &&
    b.stepActorId === a.playerId &&
    a.stepTag === "PlayerStep" &&
    b.stepTag === "PlayerStep" &&
    a.stepType === 1 &&
    b.stepType === 1 &&
    a.targetId === "-1" &&
    b.targetId === "-1" &&
    a.stepTargetId === "-1" &&
    b.stepTargetId === "-1" &&
    !!a.actorTeamId &&
    a.actorTeamId === b.actorTeamId &&
    a.actorTeamSource !== "turn_inferred" &&
    b.actorTeamSource !== "turn_inferred" &&
    !a.attributionConflict &&
    !b.attributionConflict &&
    (!a.teamId || a.teamId === a.actorTeamId) &&
    (!b.teamId || b.teamId === b.actorTeamId)
  );
}

export function actualMoveGeometry(
  board: ObservedBoard,
  actorId: number,
  from: Cell,
  to: Cell
) {
  const players = board.teams.flatMap((t) => t.players),
    positions = players.filter((p) => p.pitchLocation === "on_pitch");
  return (
    positions.every(
      (p) =>
        p.cell.x !== null &&
        p.cell.y !== null &&
        Number.isInteger(p.cell.x) &&
        Number.isInteger(p.cell.y) &&
        p.cell.x >= 0 &&
        p.cell.x <= 25 &&
        p.cell.y >= 0 &&
        p.cell.y <= 14
    ) &&
    to.x >= 0 &&
    to.x <= 25 &&
    to.y >= 0 &&
    to.y <= 14 &&
    Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1 &&
    new Set(positions.map((p) => `${p.cell.x},${p.cell.y}`)).size ===
      positions.length &&
    players.every(
      (p) =>
        p.id !== null &&
        p.pitchLocation !== "unknown" &&
        (p.pitchLocation === "off_pitch" ||
          (p.id === actorId
            ? p.cell.x === from.x && p.cell.y === from.y
            : p.cell.x !== to.x || p.cell.y !== to.y))
    )
  );
}
