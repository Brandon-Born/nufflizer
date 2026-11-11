import { unmodifiedD6Check } from "./numericCheck";
import type { ReplayEvent } from "./types";

export type ObservedDodgeMovement = {
  declarationSourceId: string;
  doMoveSourceId: string;
  outcomeSourceId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  movementBefore: number | null;
  movementAfter: number | null;
  carriesBall: boolean;
  checkpointAfter: number;
};

export function unmodifiedDodgeDie(
  event: ReplayEvent,
  status: 1 | 2,
  success: boolean
) {
  return unmodifiedD6Check(event, 2, status, success);
}

export function successfulDodgeMoveOutcome(event: ReplayEvent): boolean {
  const p = event.payload;
  if (
    event.sourceTag !== "ResultMoveOutcome" ||
    !p ||
    p.Moved !== 1 ||
    p.TentacleUsed !== 0 ||
    p.FumbleRooskieUsed !== 0 ||
    (p.Pushbacks !== undefined && p.Pushbacks !== "") ||
    Object.keys(p).some(
      (k) =>
        ![
          "Moved",
          "TentacleUsed",
          "FumbleRooskieUsed",
          "Rolls",
          "Pushbacks"
        ].includes(k)
    )
  )
    return false;
  const rolls = p.Rolls as Record<string, unknown> | undefined;
  const summary = rolls?.RollSummary as Record<string, unknown> | undefined;
  return (
    !!rolls &&
    Object.keys(rolls).join() === "RollSummary" &&
    !!summary &&
    !Array.isArray(summary) &&
    Object.keys(summary).length === 2 &&
    summary.RollType === 2 &&
    summary.Outcome === 1
  );
}
