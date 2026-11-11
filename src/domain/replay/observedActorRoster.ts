import type { ObservedBoard } from "./boardState";

// Qualifies a recorded actor against current rosters without filling an
// omitted TeamId or ActiveTeam. The opposite known roster can disambiguate a
// missing actor-roster ID, but array order alone cannot establish ownership.
export function observedActorRoster(
  board: ObservedBoard,
  actorId: number,
  actingTeamId: string,
  knownTeamIds: readonly string[]
) {
  const owners = board.teams.filter((t) =>
    t.players.some((p) => p.id === actorId)
  );
  const owner = owners[0];
  const others = board.teams.filter((t) => t !== owner);
  const known = new Set(knownTeamIds);
  if (
    owners.length !== 1 ||
    !owner ||
    owner.players.filter((p) => p.id === actorId).length !== 1 ||
    others.length !== 1 ||
    known.size !== 2 ||
    !known.has(actingTeamId) ||
    board.teams.some(
      (t) => t.explicitTeamId !== null && !known.has(String(t.explicitTeamId))
    ) ||
    others.some(
      (t) =>
        t.explicitTeamId !== null && String(t.explicitTeamId) === actingTeamId
    ) ||
    (owner.explicitTeamId === null && others[0]!.explicitTeamId === null) ||
    (owner.explicitTeamId !== null &&
      String(owner.explicitTeamId) !== actingTeamId) ||
    (board.activeTeamIndex !== null &&
      board.activeTeamIndex !== owner.rosterIndex)
  )
    return;
  return owner;
}
