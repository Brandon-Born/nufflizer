import type { ReplayEvent } from "./types";
import { unmodifiedD6Check } from "./numericCheck";

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
  carriesBall: boolean;
};
export function failedMovementOffer(
  event: ReplayEvent
): { family: 1 | 2; threshold: number } | undefined {
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
  const threshold = unmodifiedD6Check(
    {
      ...event,
      sourceTag: "ResultRoll",
      rollType: family,
      payload: info as Record<string, unknown>
    },
    family,
    1,
    false
  );
  return threshold ? { family, threshold } : undefined;
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
