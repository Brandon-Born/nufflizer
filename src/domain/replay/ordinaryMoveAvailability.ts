import type { ObservedBoard } from "./boardState";

export type OrdinaryMoveAvailability = {
  successDestination: { x: number; y: number };
  knownAvailablePlayerIds: string[];
  unknownPlayerIds: string[];
};
// One ordinary standing move per other player, after the checked mover has
// occupied its destination and vacated its origin. This is a bounded subset
// of useful actions, not general activation legality or a win-value model.
export function ordinaryMovesAfterSuccess(
  board: ObservedBoard,
  actorId: number,
  destination: { x: number; y: number }
): OrdinaryMoveAvailability | undefined {
  const active = board.teams.find(
    (t) => t.rosterIndex === board.activeTeamIndex
  );
  const all = board.teams.flatMap((t) => t.players);
  const actor = active?.players.find((p) => p.id === actorId);
  if (
    !active ||
    board.stable !== true ||
    board.phaseCode !== 5 ||
    !Number.isInteger(destination.x) ||
    !Number.isInteger(destination.y) ||
    destination.x < 0 ||
    destination.x > 25 ||
    destination.y < 0 ||
    destination.y > 14 ||
    !actor ||
    Math.max(
      Math.abs(actor.cell.x! - destination.x),
      Math.abs(actor.cell.y! - destination.y)
    ) !== 1 ||
    actor?.pitchLocation !== "on_pitch" ||
    all.some((p) => p.id === null || p.pitchLocation === "unknown")
  )
    return;
  const positions = all.filter((p) => p.pitchLocation === "on_pitch");
  const cells = positions.map((p) => (p.id === actorId ? destination : p.cell));
  const key = (p: { x: number | null; y: number | null }) => `${p.x},${p.y}`;
  const occupied = new Set(cells.map(key));
  if (occupied.size !== positions.length) return;
  const knownAvailablePlayerIds: string[] = [],
    unknownPlayerIds: string[] = [];
  for (const player of active.players) {
    if (
      player.id === actorId ||
      player.pitchLocation === "off_pitch" ||
      player.canAct === false ||
      (player.situationCode !== null && player.situationCode !== 0) ||
      (player.statusCode !== null && player.statusCode !== 0) ||
      player.movementRemaining === 0
    )
      continue;
    const free = [-1, 0, 1].some((dx) =>
      [-1, 0, 1].some((dy) => {
        const x = player.cell.x! + dx,
          y = player.cell.y! + dy;
        return (
          (dx !== 0 || dy !== 0) &&
          x >= 0 &&
          x <= 25 &&
          y >= 0 &&
          y <= 14 &&
          !occupied.has(key({ x, y }))
        );
      })
    );
    if (!free) continue;
    if (
      player.ordinaryMovePolicyKnown !== true ||
      player.canAct === null ||
      player.statusCode === null ||
      player.situationCode === null ||
      player.movementRemaining === null ||
      player.mentalEffect
    )
      unknownPlayerIds.push(String(player.id));
    else knownAvailablePlayerIds.push(String(player.id));
  }
  return {
    successDestination: destination,
    knownAvailablePlayerIds,
    unknownPlayerIds
  };
}
