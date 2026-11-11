import type { ReplayEvent } from "./types";
import type { ObservedBoard } from "./boardState";

// Public BallStep/25 source observations identify all eight D8 offsets.
const OFFSETS = [
  [-1, 1],
  [0, 1],
  [1, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [0, -1],
  [1, -1]
] as const;
export function bounceDestination(
  direction: number,
  from: { x: number; y: number }
) {
  const offset = Number.isInteger(direction)
    ? OFFSETS[direction - 1]
    : undefined;
  return offset ? { x: from.x + offset[0], y: from.y + offset[1] } : undefined;
}
type Cell = { x: number; y: number };
export type PickupBounceSuccessors = {
  declarationSourceId: string;
  moveOutcomeSourceId: string;
  origin: Cell;
  actorRosterIndex: number;
  branches: ({ direction: number; destination: Cell } & (
    | {
        kind: "empty";
        marking: "marked" | "unmarked" | "unknown";
        settlement: "loose" | "reaction_unknown";
      }
    | { kind: "occupied"; playerId: string; rosterIndex: number }
    | { kind: "out_of_bounds" }
  ))[];
};

// Candidate geometry only. An admitted original-failure/own-Sure-Hands chain
// establishes the later pending-pickup stage; this never fills omitted holder
// flags in the original checkpoint or asserts a catch/throw-in result.
export function pickupBounceSuccessors(
  board: ObservedBoard,
  actorId: number,
  declarationSourceId: string,
  moveOutcomeSourceId: string,
  actingTeamId: string,
  knownTeamIds: readonly string[]
): PickupBounceSuccessors | undefined {
  const teams = board.teams.filter((t) =>
    t.players.some((p) => p.id === actorId)
  );
  const owner = teams[0],
    actor = owner?.players.find((p) => p.id === actorId);
  const knownTeams = new Set(knownTeamIds);
  const others = board.teams.filter((t) => t !== owner);
  // Qualify ownership by the two replay teams and current roster identities.
  // Never assign the omitted roster ID a default from its array position.
  if (
    knownTeams.size !== 2 ||
    !knownTeams.has(actingTeamId) ||
    others.length !== 1 ||
    board.teams.some(
      (t) =>
        t.explicitTeamId !== null && !knownTeams.has(String(t.explicitTeamId))
    ) ||
    others.some(
      (t) =>
        t.explicitTeamId !== null && String(t.explicitTeamId) === actingTeamId
    ) ||
    (owner?.explicitTeamId === null && others[0]!.explicitTeamId === null)
  )
    return;
  const all = board.teams.flatMap((t) => t.players);
  if (
    !declarationSourceId ||
    !moveOutcomeSourceId ||
    teams.length !== 1 ||
    !actingTeamId ||
    !owner ||
    (owner.explicitTeamId !== null &&
      String(owner.explicitTeamId) !== actingTeamId) ||
    board.issues.length ||
    board.phaseCode !== 5 ||
    board.stable !== true ||
    board.pitchLayout === "small" ||
    board.activePlayerId !== actorId ||
    (board.activeTeamIndex !== null &&
      board.activeTeamIndex !== owner.rosterIndex) ||
    !actor ||
    actor.pitchLocation !== "on_pitch" ||
    actor.canAct === false ||
    actor.mentalEffect ||
    (actor.statusCode !== null && actor.statusCode !== 0) ||
    (actor.situationCode !== null && actor.situationCode !== 0) ||
    board.ball.possession === "held" ||
    board.ball.isHeld === true ||
    board.ball.carrierId !== null ||
    board.ball.cell.x !== actor.cell.x ||
    board.ball.cell.y !== actor.cell.y ||
    all.some((p) => p.id === null || p.pitchLocation === "unknown")
  )
    return;
  const positions = all.filter((p) => p.pitchLocation === "on_pitch");
  if (
    new Set(positions.map((p) => `${p.cell.x},${p.cell.y}`)).size !==
    positions.length
  )
    return;
  const origin = { x: actor.cell.x!, y: actor.cell.y! };
  const opponents = board.teams
    .filter((t) => t !== owner)
    .flatMap((t) => t.players)
    .filter((p) => p.pitchLocation === "on_pitch");
  const branches: PickupBounceSuccessors["branches"] = [];
  for (let direction = 1; direction <= 8; direction++) {
    const destination = bounceDestination(direction, origin)!;
    const base = { direction, destination };
    if (
      destination.x < 0 ||
      destination.x > 25 ||
      destination.y < 0 ||
      destination.y > 14
    ) {
      branches.push({ ...base, kind: "out_of_bounds" });
      continue;
    }
    const occupant = positions.find(
      (p) => p.cell.x === destination.x && p.cell.y === destination.y
    );
    if (occupant) {
      const team = board.teams.find((t) => t.players.includes(occupant));
      if (!team) return;
      branches.push({
        ...base,
        kind: "occupied",
        playerId: String(occupant.id),
        rosterIndex: team.rosterIndex
      });
      continue;
    }
    const adjacent = opponents.filter(
      (p) =>
        Math.max(
          Math.abs(p.cell.x! - destination.x),
          Math.abs(p.cell.y! - destination.y)
        ) === 1
    );
    branches.push({
      ...base,
      kind: "empty",
      settlement: plainBounceSettlementKnown(board)
        ? "loose"
        : "reaction_unknown",
      marking: adjacent.some((p) => p.tackleZone === true)
        ? "marked"
        : adjacent.some((p) => p.tackleZone === null)
          ? "unknown"
          : "unmarked"
    });
  }
  return {
    declarationSourceId,
    moveOutcomeSourceId,
    origin,
    actorRosterIndex: owner.rosterIndex,
    branches
  };
}

export function plainPickupMoveOutcome(event: ReplayEvent) {
  const p = event.payload;
  return (
    event.sourceTag === "ResultMoveOutcome" &&
    !!p &&
    p.Moved === 1 &&
    p.TentacleUsed === 0 &&
    p.FumbleRooskieUsed === 0 &&
    (p.Rolls === undefined || p.Rolls === "") &&
    (p.Pushbacks === undefined || p.Pushbacks === "") &&
    Object.keys(p).every((k) =>
      [
        "Moved",
        "TentacleUsed",
        "FumbleRooskieUsed",
        "Rolls",
        "Pushbacks"
      ].includes(k)
    )
  );
}

export function plainBounceSettlementKnown(board: ObservedBoard): boolean {
  return board.teams
    .flatMap((t) => t.players)
    .filter((p) => p.pitchLocation !== "off_pitch")
    .every(
      (p) =>
        p.pitchLocation === "on_pitch" &&
        p.plainBallPolicyKnown === true &&
        !p.mentalEffect
    );
}
