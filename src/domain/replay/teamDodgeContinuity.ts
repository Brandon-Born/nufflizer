import {
  lastBoardCheckpointBefore,
  type ReplayBoardCheckpoint
} from "./boardState";

// A waiting snapshot does not become playable state. Compare its observations
// against the qualified original frame before valuing only teammate moves in
// the hypothetical successful terminal successor. No omitted field is filled.
export function teamDodgeContinuity(
  checkpoints: readonly ReplayBoardCheckpoint[],
  originalCheckpointAfter: number,
  questionIndex: number,
  decisionIndex: number,
  actorId: string,
  actorCell: { x: number; y: number } | null,
  candidates: { knownAvailablePlayerIds: string[]; unknownPlayerIds: string[] },
  epochs: ReadonlyMap<ReplayBoardCheckpoint, number>,
  completedMoves: ReadonlyMap<string, { x: number; y: number }> = new Map()
): number | undefined {
  const before = checkpoints.find(
    (c) => c.afterSourceIndex === originalCheckpointAfter
  );
  const waiting = lastBoardCheckpointBefore(checkpoints, decisionIndex);
  const a = before?.board,
    b = waiting?.board;
  if (
    !before ||
    !actorCell ||
    !waiting ||
    !a ||
    !b ||
    b.phaseCode !== 5 ||
    b.issues.length ||
    waiting.afterSourceIndex < questionIndex ||
    waiting.afterSourceIndex >= decisionIndex ||
    a.activeTeamIndex !== b.activeTeamIndex ||
    a.teams.length !== 2 ||
    b.teams.length !== 2 ||
    JSON.stringify(a.ball) !== JSON.stringify(b.ball)
  )
    return;
  if (epochs.get(before) !== epochs.get(waiting)) return;
  const uncertain = new Set(candidates.unknownPlayerIds);
  for (const team of a.teams) {
    const next = b.teams.find((t) => t.rosterIndex === team.rosterIndex);
    if (
      !next ||
      team.explicitTeamId !== next.explicitTeamId ||
      team.gameTurn !== next.gameTurn ||
      team.players.length !== next.players.length
    )
      return;
    for (const player of team.players) {
      const current = next.players.find((p) => p.id === player.id);
      if (!current) return;
      if (String(player.id) === actorId) {
        if (
          current.pitchLocation !== "on_pitch" ||
          current.cell.x !== actorCell.x ||
          current.cell.y !== actorCell.y
        )
          return;
        continue;
      }
      if (
        player.cell.x !== current.cell.x ||
        player.cell.y !== current.cell.y ||
        player.pitchLocation !== current.pitchLocation
      )
        return;
      const completed = completedMoves.get(String(player.id));
      if (completed) {
        if (
          current.cell.x !== completed.x ||
          current.cell.y !== completed.y ||
          current.pitchLocation !== "on_pitch" ||
          JSON.stringify({
            ...player,
            canAct: undefined,
            movementRemaining: undefined
          }) !==
            JSON.stringify({
              ...current,
              canAct: undefined,
              movementRemaining: undefined
            })
        )
          return;
        // Earlier prefix confirmation already spent this ordinary activation.
        // Raw CanAct/MovePoint omissions cannot make it an unused teammate.
        continue;
      }
      // An uncertain candidate already spans0..1; changed eligibility cannot
      // escape that envelope. A known/excluded player may not change policy.
      if (
        !uncertain.has(String(player.id)) &&
        JSON.stringify({ ...player, cell: undefined }) !==
          JSON.stringify({ ...current, cell: undefined })
      )
        return;
    }
  }
  return waiting.afterSourceIndex;
}
