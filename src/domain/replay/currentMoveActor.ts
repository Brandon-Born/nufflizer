import { sameActivationClock, type ActivationEnd } from "./activationEnds";
import {
  consistentNormalStandBy,
  type ReplayBoardCheckpoint
} from "./boardState";
import { plainPickupMoveOutcome } from "./pickupSuccessors";
import type { PlayerOwnershipIndex } from "./attribution";
import type { ObservedBoard } from "./boardState";
import { observedActorRoster } from "./observedActorRoster";
import type { ReplayEvent } from "./types";

// A local membership map for a declared ordinary Move and its deterministic
// stand-up/movement prefix. Never mutate parser attribution, promote dice or
// reaction/skill choices, or resolve an initial ownership conflict.
export function isDeterministicMoveResult(event: ReplayEvent): boolean {
  const empty = !event.payload || Object.keys(event.payload).length === 0;
  return (
    (event.sourceTag === "ResultNoRollSuccess" &&
      event.stepType === 7 &&
      empty) ||
    (event.sourceTag === "ResultDoMove" && event.stepType === 1 && empty) ||
    (event.stepType === 1 && plainPickupMoveOutcome(event))
  );
}

export function currentMoveActor(
  event: ReplayEvent,
  board: ObservedBoard | null,
  initial: PlayerOwnershipIndex,
  teamIds: readonly string[],
  continuingOrdinaryMove: boolean
): ReplayEvent {
  const starting =
    event.sourceTag === "ResultUseAction" &&
    event.actionCode === 1 &&
    event.stepType === 0;
  const continuation =
    continuingOrdinaryMove &&
    board?.activePlayerId === Number(event.playerId) &&
    isDeterministicMoveResult(event);
  const actor = event.playerId;
  if (
    (!starting && !continuation) ||
    !board ||
    board.stable !== true ||
    board.phaseCode !== 5 ||
    board.issues.length ||
    board.activeTeamIndex === null ||
    !actor ||
    !/^\d{1,12}$/.test(actor) ||
    event.stepActorId !== actor ||
    event.stepTag !== "PlayerStep" ||
    ![0, 1, 7].includes(event.stepType ?? -1) ||
    event.attributionConflict ||
    initial.ambiguousPlayerIds.has(actor) ||
    initial.playerToTeam.has(actor) ||
    (event.actorTeamSource !== undefined &&
      event.actorTeamSource !== "turn_inferred")
  )
    return event;
  const active = board.teams.find(
    (t) => t.rosterIndex === board.activeTeamIndex
  );
  if (active?.explicitTeamId === null || active?.explicitTeamId === undefined)
    return event;
  const teamId = String(active.explicitTeamId);
  const owner = observedActorRoster(board, Number(actor), teamId, teamIds);
  if (owner !== active || (event.teamId && event.teamId !== teamId))
    return event;
  // player_map describes this private current-snapshot map. The original
  // ReplayEvent remains unchanged; exported provenance retains the checkpoint.
  return { ...event, actorTeamId: teamId, actorTeamSource: "player_map" };
}

// Admit only the explicit same-step wait immediately before a compatible
// stable checkpoint. This carries completion provenance, not board fields.
export function preservesCurrentMoveEnd(
  event: ReplayEvent,
  board: ObservedBoard,
  checkpoint: ReplayBoardCheckpoint,
  following: ReplayBoardCheckpoint | undefined,
  previous:
    { moved: boolean; end: ActivationEnd; deterministic?: boolean } | undefined,
  epochs: ReadonlyMap<ReplayBoardCheckpoint, number>
): boolean {
  if (
    !previous?.moved ||
    previous.deterministic !== true ||
    event.sourceTag !== "EventRulesEngineStandBy" ||
    following?.kind !== "board" ||
    !following.board ||
    following.afterSourceIndex !== event.sourceIndex ||
    following.replayStep !== event.locator?.replayStep ||
    following.childIndex !== (event.locator?.childIndex ?? -2) + 1 ||
    epochs.get(checkpoint) !== epochs.get(following) ||
    !consistentNormalStandBy(event, board, following.board) ||
    !sameActivationClock(board, previous.end) ||
    !sameActivationClock(following.board, previous.end)
  )
    return false;
  return following.board.teams.some(
    (t) =>
      t.rosterIndex === previous.end.rosterIndex &&
      t.players.some(
        (p) =>
          String(p.id) === previous.end.actorId &&
          p.pitchLocation === "on_pitch" &&
          p.cell.x === previous.end.actorCell.x &&
          p.cell.y === previous.end.actorCell.y
      )
  );
}
