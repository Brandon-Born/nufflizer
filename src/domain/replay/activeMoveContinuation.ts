import type { ObservedBoard } from "./boardState";
import { ordinaryMovesAfterSuccess } from "./ordinaryMoveAvailability";

export type ActiveMoveContinuation = {
  declarationSourceId: string;
  movementBefore: number | null;
  movementAfterSuccess: number | null;
  opponentMarking: "unmarked" | "marked" | "unknown";
  candidateDestination: { x: number; y: number };
  minimum: 0 | 1;
  maximum: 0 | 1;
};

// One further ordinary move without another Dodge or Rush. This prices an
// option in the existing activation, never all remaining movement or the
// tactical value of its destination. Missing budget/marking stays uncertain.
export function continuationOptionBounds(
  movementBefore: number | null,
  marking: ActiveMoveContinuation["opponentMarking"]
): Pick<ActiveMoveContinuation, "minimum" | "maximum"> {
  if ((movementBefore !== null && movementBefore <= 1) || marking === "marked")
    return { minimum: 0, maximum: 0 };
  return movementBefore !== null && marking === "unmarked"
    ? { minimum: 1, maximum: 1 }
    : { minimum: 0, maximum: 1 };
}

// Caller supplies only an ordinary Move declaration preserved by the reducer's
// continuous clock epoch and verified movement prefix. A fresh snapshot with
// omitted movement never borrows a prior budget.
export function activeMoveAfterDodge(
  board: ObservedBoard,
  actorId: number,
  destination: { x: number; y: number },
  declarationSourceId: string
): ActiveMoveContinuation | undefined {
  if (
    !declarationSourceId ||
    board.issues.length > 0 ||
    board.activePlayerId !== actorId ||
    board.pitchLayout === "small" ||
    !ordinaryMovesAfterSuccess(board, actorId, destination)
  )
    return;
  const active = board.teams.find(
    (t) => t.rosterIndex === board.activeTeamIndex
  )!;
  const actor = active.players.find((p) => p.id === actorId)!;
  if (active.explicitTeamId === null) return;
  if (
    actor.canAct !== true ||
    actor.mentalEffect ||
    (actor.statusCode !== null && actor.statusCode !== 0) ||
    (actor.situationCode !== null && actor.situationCode !== 0) ||
    (actor.movementRemaining !== null &&
      (!Number.isInteger(actor.movementRemaining) ||
        actor.movementRemaining < 0 ||
        actor.movementRemaining > 16))
  )
    return;
  const occupants = new Set(
    board.teams
      .flatMap((t) => t.players)
      .filter((p) => p.pitchLocation === "on_pitch" && p.id !== actorId)
      .map((p) => `${p.cell.x},${p.cell.y}`)
  );
  occupants.add(`${destination.x},${destination.y}`);
  const candidateDestination = [-1, 0, 1]
    .flatMap((dx) =>
      [-1, 0, 1]
        .filter((dy) => dx !== 0 || dy !== 0)
        .map((dy) => ({ x: destination.x + dx, y: destination.y + dy }))
    )
    .find(
      (p) =>
        p.x >= 0 &&
        p.x <= 25 &&
        p.y >= 0 &&
        p.y <= 14 &&
        !occupants.has(`${p.x},${p.y}`)
    );
  if (!candidateDestination) return;
  const adjacent = board.teams
    .filter((t) => t !== active)
    .flatMap((t) => t.players)
    .filter(
      (p) =>
        p.pitchLocation === "on_pitch" &&
        Math.max(
          Math.abs(p.cell.x! - destination.x),
          Math.abs(p.cell.y! - destination.y)
        ) === 1
    );
  const opponentMarking = adjacent.some((p) => p.tackleZone === true)
    ? "marked"
    : adjacent.some((p) => p.tackleZone === null)
      ? "unknown"
      : "unmarked";
  const movementBefore = actor.movementRemaining;
  return {
    declarationSourceId,
    movementBefore,
    movementAfterSuccess:
      movementBefore === null ? null : Math.max(0, movementBefore - 1),
    opponentMarking,
    candidateDestination,
    ...continuationOptionBounds(movementBefore, opponentMarking)
  };
}
