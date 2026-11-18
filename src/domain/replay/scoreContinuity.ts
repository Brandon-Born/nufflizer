import {
  lastBoardCheckpointBefore,
  type ReplayBoardCheckpoint
} from "./boardState";
import { observedActorRoster } from "./observedActorRoster";
import { successfulSingleCheckMoveOutcome } from "./dodgeMovement";
import { unmodifiedD6Check } from "./numericCheck";
import { plainPickupMoveOutcome } from "./pickupSuccessors";
import {
  failedMovementOffer,
  offeredTeamRerollDie,
  sameMovementActor
} from "./teamRerollMovement";
import type { ReplayEvent } from "./types";

export type ScoreRoster = 0 | 1;
export type TouchdownReceipt = {
  sourceIndex: number;
  scorerId: number;
  roster: ScoreRoster;
  confirmedCheckpointAfter: number;
  observedScore: number;
};
type RawIndex = ReadonlyMap<number, ReplayEvent>;
type Cell = { x: number; y: number };
type GoalPossession = {
  step: ReplayEvent;
  destination: Cell;
  owner: NonNullable<ReturnType<typeof observedActorRoster>>;
};

export function moveCell(value: unknown): Cell | undefined {
  const c = value as { X?: unknown; Y?: unknown } | undefined;
  const x = c?.X,
    y = c?.Y;
  if (
    typeof x === "number" &&
    typeof y === "number" &&
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x <= 25 &&
    y >= 0 &&
    y <= 14
  )
    return { x, y };
}

export function sameObservedCell(
  a: { x: number | null; y: number | null } | undefined,
  b: Cell
) {
  return a?.x === b.x && a.y === b.y;
}

function appliedMove(
  raw: RawIndex,
  index: number,
  moveIndex: number,
  check?: 1 | 2
) {
  const step = raw.get(index),
    move = raw.get(moveIndex),
    outcome = raw.get(moveIndex + 1);
  const from = moveCell(step?.payload?.CellFrom),
    to = moveCell(step?.payload?.CellTo);
  if (
    step?.sourceTag !== "PlayerStep" ||
    step.stepType !== 1 ||
    step.payload?.Skill !== 0 ||
    step.payload.IsEvaluation !== 0 ||
    step.payload.TargetId !== -1 ||
    !step.actionId ||
    !step.playerId ||
    step.attributionConflict ||
    step.actorTeamSource === "turn_inferred" ||
    move?.sourceTag !== "ResultDoMove" ||
    Object.keys(move.payload ?? {}).length !== 0 ||
    !outcome ||
    !(check === undefined
      ? plainPickupMoveOutcome(outcome)
      : successfulSingleCheckMoveOutcome(outcome, check)) ||
    ![move, outcome].every(
      (row) =>
        row.actionId === step.actionId &&
        row.sequenceId === step.sequenceId &&
        row.playerId === step.playerId &&
        !row.attributionConflict
    ) ||
    !from ||
    !to ||
    Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) !== 1
  )
    return;
  return { step, from, to, nextIndex: moveIndex + 2 };
}

export function ordinaryAppliedMove(raw: RawIndex, index: number) {
  return appliedMove(raw, index, index + 1);
}

function checkedCarryMove(
  raw: RawIndex,
  index: number,
  checkpointAfter: number,
  roster: number
) {
  const step = raw.get(index)!;
  const first = raw.get(index + 1);
  if (!first) return;
  if (first.sourceTag === "ResultTeamRerollUsage") {
    const offer = raw.get(checkpointAfter);
    const originalStep = raw.get(checkpointAfter - 1);
    const result = raw.get(index + 2);
    const failed = offer && failedMovementOffer(offer);
    const from = moveCell(step.payload?.CellFrom),
      to = moveCell(step.payload?.CellTo);
    if (
      index !== checkpointAfter + 2 ||
      !offer ||
      failed?.family !== 1 ||
      !from ||
      !to ||
      originalStep?.sourceTag !== "PlayerStep" ||
      !sameObservedCell(moveCell(originalStep.payload?.CellFrom), from) ||
      !sameObservedCell(moveCell(originalStep.payload?.CellTo), to) ||
      first.payload?.Used !== 1 ||
      first.payload.GamerId !== roster ||
      offer.payload?.GamerId !== roster ||
      !result ||
      !sameMovementActor(offer, result) ||
      !sameMovementActor(first, result) ||
      result.actionId !== step.actionId ||
      unmodifiedD6Check(result, 1, 2, true) !== failed.threshold
    )
      return;
    return appliedMove(raw, index, index + 3, 1);
  }
  if (
    (first.rollType === 1 || first.rollType === 2) &&
    first.actionId === step.actionId &&
    sameMovementActor(step, first) &&
    unmodifiedD6Check(first, first.rollType, 1, true)
  )
    return appliedMove(raw, index, index + 2, first.rollType);
}

// Reproduce the observed carry from its last physical snapshot. These moves
// are evidence about a touchdown already recorded. They give no new odds or
// retry policy for a hypothetical failure.
function carryToGoal(
  raw: RawIndex,
  through: number,
  checkpoint: ReplayBoardCheckpoint,
  actor: number,
  teamIds: readonly string[]
): GoalPossession | undefined {
  const board = checkpoint.board;
  if (
    !board ||
    board.phaseCode !== 5 ||
    board.issues.length ||
    through - checkpoint.afterSourceIndex > 64
  )
    return;
  let index = checkpoint.afterSourceIndex + 1;
  const scorer = String(actor);
  const carrier = raw.get(index);
  if (carrier?.sourceTag === "Carrier") {
    if (
      !carrier.checkpointCarrier ||
      carrier.payload?.Carrier !== scorer ||
      board.ball.possession !== "held" ||
      board.ball.carrierId !== actor
    )
      return;
    index++;
  }
  const start = raw.get(index);
  if (
    !start?.actorTeamId ||
    start.playerId !== scorer ||
    start.attributionConflict ||
    start.actorTeamSource === "turn_inferred"
  )
    return;
  const owner = observedActorRoster(board, actor, start.actorTeamId, teamIds);
  const player = owner?.players.find((p) => p.id === actor);
  if (!owner || !player || player.cell.x === null || player.cell.y === null)
    return;
  let position = { x: player.cell.x, y: player.cell.y };
  let held =
    board.ball.possession === "held" &&
    board.ball.carrierId === actor &&
    board.ball.holderRosterIndex === owner.rosterIndex &&
    sameObservedCell(board.ball.cell, position);
  const canAcquire =
    !held &&
    board.ball.possession !== "held" &&
    board.ball.isHeld !== true &&
    board.ball.carrierId === null;
  if (!held && !canAcquire) return;
  if (start.sourceTag === "PlayerStep" && start.stepType === 0) {
    const declared = raw.get(index + 1);
    if (
      declared?.sourceTag !== "ResultUseAction" ||
      declared.payload?.Action !== 1 ||
      declared.actionId !== start.actionId ||
      declared.playerId !== scorer ||
      declared.actorTeamId !== start.actorTeamId ||
      declared.attributionConflict ||
      declared.actorTeamSource === "turn_inferred" ||
      start.payload?.Skill !== 0 ||
      start.payload.IsEvaluation !== 0 ||
      !sameObservedCell(moveCell(start.payload.CellFrom), position) ||
      !sameObservedCell(moveCell(start.payload.CellTo), position)
    )
      return;
    index += 2;
  }
  let last: ReturnType<typeof ordinaryAppliedMove>;
  while (index < through) {
    const move =
      ordinaryAppliedMove(raw, index) ??
      checkedCarryMove(
        raw,
        index,
        checkpoint.afterSourceIndex,
        owner.rosterIndex
      );
    if (
      !move ||
      move.step.playerId !== scorer ||
      move.step.actorTeamId !== start.actorTeamId ||
      move.step.sequenceId !== start.sequenceId ||
      !sameObservedCell(move.from, position) ||
      move.from.x === (owner.sideCode === 32 ? 25 : 0)
    )
      return;
    position = move.to;
    index = move.nextIndex;
    if (!held) {
      const pickup = raw.get(index);
      if (
        !pickup ||
        !sameMovementActor(move.step, pickup) ||
        pickup.actionId !== move.step.actionId ||
        !sameObservedCell(board.ball.cell, position) ||
        !unmodifiedD6Check(pickup, 4, 1, true)
      )
        return;
      held = true;
      index++;
    }
    last = move;
  }
  if (held && index === through && last)
    return { step: last.step, destination: last.to, owner };
}

function matchesStep(row: ReplayEvent | undefined, step: ReplayEvent) {
  return (
    row &&
    step.actionId &&
    row.actionId === step.actionId &&
    row.sequenceId === step.sequenceId &&
    row.playerId === step.playerId &&
    row.stepActorId === step.playerId &&
    row.actorTeamId === step.actorTeamId &&
    row.actorTeamSource !== "turn_inferred" &&
    !row.attributionConflict &&
    row.locator?.replayStep === step.locator?.replayStep &&
    row.locator?.childIndex === step.locator?.childIndex &&
    row.locator?.stepIndex === step.locator?.stepIndex
  );
}

function handoffToGoal(
  raw: RawIndex,
  through: number,
  checkpoint: ReplayBoardCheckpoint,
  actor: number,
  teamIds: readonly string[]
): GoalPossession | undefined {
  const board = checkpoint.board;
  if (!board || board.phaseCode !== 5 || board.issues.length) return;
  const start = raw.get(through - 6),
    declare = raw.get(through - 5),
    handoff = raw.get(through - 4),
    release = raw.get(through - 3),
    receiver = raw.get(through - 2),
    caught = raw.get(through - 1);
  const carrier = raw.get(checkpoint.afterSourceIndex + 1);
  const donor = board.ball.carrierId;
  if (
    through !== checkpoint.afterSourceIndex + 8 ||
    donor === null ||
    donor === actor ||
    board.ball.possession !== "held" ||
    carrier?.sourceTag !== "Carrier" ||
    !carrier.checkpointCarrier ||
    carrier.payload?.Carrier !== String(donor) ||
    start?.sourceTag !== "PlayerStep" ||
    start.stepType !== 0 ||
    start.playerId !== String(donor) ||
    start.stepTargetId !== "-1" ||
    declare?.sourceTag !== "ResultUseAction" ||
    declare.payload?.Action !== 5 ||
    handoff?.sourceTag !== "PlayerStep" ||
    handoff.stepType !== 5 ||
    handoff.playerId !== String(donor) ||
    handoff.stepTargetId !== String(actor) ||
    release?.sourceTag !== "ResultNoRollSuccess" ||
    Object.keys(release.payload ?? {}).length !== 0 ||
    receiver?.sourceTag !== "PlayerStep" ||
    receiver.stepType !== 4 ||
    receiver.playerId !== String(actor) ||
    receiver.stepTargetId !== "-1" ||
    !receiver.actorTeamId ||
    !caught ||
    !matchesStep(declare, start) ||
    !matchesStep(release, handoff) ||
    !matchesStep(caught, receiver) ||
    !unmodifiedD6Check(caught, 7, 1, true)
  )
    return;
  const origin = moveCell(handoff.payload?.CellFrom);
  const destination = moveCell(handoff.payload?.CellTo);
  if (
    !origin ||
    !destination ||
    Math.max(
      Math.abs(origin.x - destination.x),
      Math.abs(origin.y - destination.y)
    ) !== 1 ||
    ![start, handoff, receiver].every(
      (step, index) =>
        step.sequenceId &&
        step.sequenceId === receiver.sequenceId &&
        step.locator?.replayStep === receiver.locator?.replayStep &&
        step.locator?.childIndex === receiver.locator?.childIndex &&
        step.locator?.stepIndex === index &&
        step.stepActorId === step.playerId &&
        step.actorTeamId === receiver.actorTeamId &&
        step.actorTeamSource !== "turn_inferred" &&
        !step.attributionConflict &&
        step.payload?.Skill === 0 &&
        step.payload.IsEvaluation === 0 &&
        step.payload.State === 3 &&
        sameObservedCell(moveCell(step.payload.CellTo), destination) &&
        sameObservedCell(
          moveCell(step.payload.CellFrom),
          step === receiver ? destination : origin
        )
    )
  )
    return;
  const owner = observedActorRoster(
    board,
    actor,
    receiver.actorTeamId,
    teamIds
  );
  const donorRoster = observedActorRoster(
    board,
    donor,
    receiver.actorTeamId,
    teamIds
  );
  const receivingCell = owner?.players.find((p) => p.id === actor)?.cell;
  if (
    !owner ||
    owner !== donorRoster ||
    owner.rosterIndex !== board.ball.holderRosterIndex ||
    !sameObservedCell(board.ball.cell, origin) ||
    !sameObservedCell(
      donorRoster.players.find((p) => p.id === donor)?.cell,
      origin
    ) ||
    receivingCell?.y !== destination.y ||
    (receivingCell.x !== destination.x &&
      !(receivingCell.x === null && destination.x === 0))
  )
    return;
  return { step: receiver, destination, owner };
}

function replacementPickupToGoal(
  raw: RawIndex,
  through: number,
  checkpoint: ReplayBoardCheckpoint,
  actor: number,
  teamIds: readonly string[]
): GoalPossession | undefined {
  const board = checkpoint.board;
  const offer = raw.get(through - 4),
    step = raw.get(through - 3),
    use = raw.get(through - 2),
    result = raw.get(through - 1);
  if (
    !board ||
    board.phaseCode !== 5 ||
    board.issues.length ||
    board.ball.isHeld === true ||
    board.ball.possession === "held" ||
    board.ball.carrierId !== null ||
    board.ball.holderRosterIndex !== null ||
    checkpoint.afterSourceIndex !== through - 4 ||
    checkpoint.replayStep === null ||
    !offer ||
    step?.sourceTag !== "PlayerStep" ||
    !step.actorTeamId ||
    step.playerId !== String(actor) ||
    step.payload?.Skill !== 0 ||
    step.payload.IsEvaluation !== 0 ||
    step.payload.State !== 3 ||
    use?.sourceTag !== "ResultTeamRerollUsage" ||
    use.payload?.Used !== 1 ||
    !result ||
    !sameMovementActor(offer, step) ||
    !sameMovementActor(use, step) ||
    !sameMovementActor(result, step) ||
    !matchesStep(use, step) ||
    !matchesStep(result, step) ||
    offer.locator?.replayStep !== checkpoint.replayStep ||
    step.locator?.replayStep !== checkpoint.replayStep + 1
  )
    return;
  const owner = observedActorRoster(board, actor, step.actorTeamId, teamIds);
  const arrival = ordinaryAppliedMove(raw, through - 7);
  const original = offeredTeamRerollDie(offer);
  const threshold = original && unmodifiedD6Check(original, 4, 1, false);
  if (
    !owner ||
    !arrival ||
    !matchesStep(offer, arrival.step) ||
    !threshold ||
    unmodifiedD6Check(result, 4, 2, true) !== threshold ||
    offer.payload?.GamerId !== owner.rosterIndex ||
    use.payload.GamerId !== owner.rosterIndex ||
    !sameObservedCell(moveCell(step.payload.CellFrom), arrival.from) ||
    !sameObservedCell(moveCell(step.payload.CellTo), arrival.to) ||
    !sameObservedCell(board.ball.cell, arrival.to) ||
    !sameObservedCell(
      owner.players.find((p) => p.id === actor)?.cell,
      arrival.to
    )
  )
    return;
  return { step, destination: arrival.to, owner };
}

function touchdownAt(
  raw: RawIndex,
  index: number,
  checkpoints: readonly ReplayBoardCheckpoint[],
  teamIds: readonly string[]
) {
  const goal = raw.get(index)!,
    end = raw.get(index + 1),
    spp = raw.get(index - 1);
  const actor = Number(goal.payload?.PlayerId);
  const checkpoint = lastBoardCheckpointBefore(checkpoints, index - 1);
  const possession =
    checkpoint &&
    (carryToGoal(raw, index - 1, checkpoint, actor, teamIds) ??
      handoffToGoal(raw, index - 1, checkpoint, actor, teamIds) ??
      replacementPickupToGoal(raw, index - 1, checkpoint, actor, teamIds));
  if (
    !possession ||
    !possession.step.actorTeamId ||
    possession.step.playerId !== String(actor) ||
    spp?.sourceTag !== "ResultGainSpp" ||
    spp.playerId !== possession.step.playerId ||
    spp.actionId !== possession.step.actionId ||
    end?.sourceTag !== "EventEndTurn" ||
    end.reasonCode !== 4 ||
    goal.locator?.replayStep !== possession.step.locator?.replayStep ||
    goal.locator?.replayStep !== end.locator?.replayStep ||
    goal.locator?.childIndex !==
      (possession.step.locator?.childIndex ?? -2) + 1 ||
    end.locator?.childIndex !== (goal.locator?.childIndex ?? -2) + 1
  )
    return;
  const { owner, destination } = possession;
  const square = goal.payload?.Cell as { X?: unknown; Y?: unknown } | undefined;
  if (
    !(
      (owner.sideCode === 32 && destination.x === 25) ||
      (owner.sideCode === 64 && destination.x === 0)
    ) ||
    (square?.X !== String(destination.x) &&
      !(destination.x === 0 && square?.X === undefined)) ||
    square?.Y !== String(destination.y)
  )
    return;
  const confirmed = checkpoints.find((cp) => cp.afterSourceIndex >= index + 1);
  const observedScore = confirmed?.board?.teams[owner.rosterIndex]?.touchdowns;
  if (
    !confirmed ||
    confirmed.replayStep !== goal.locator?.replayStep ||
    observedScore == null
  )
    return;
  return {
    sourceIndex: index,
    scorerId: actor,
    roster: owner.rosterIndex as ScoreRoster,
    confirmedCheckpointAfter: confirmed.afterSourceIndex,
    observedScore
  };
}

// An omitted counter can retain the last proven score. Begin at an explicit
// 0–0 opening board, count confirmed touchdown sequences, and reject any
// contradictory counter or unpaired drive-end notice in the queried prefix.
export function scoreThrough(
  checkpoints: readonly ReplayBoardCheckpoint[],
  raw: RawIndex,
  through: number,
  teamIds: readonly string[]
) {
  const initial = checkpoints[0];
  if (
    initial?.kind !== "initial" ||
    initial.afterSourceIndex !== 0 ||
    initial.board?.phaseCode !== 0 ||
    initial.board.teams.length !== 2 ||
    initial.board.teams.some(
      (team, i) =>
        team.gameTurn !== 0 ||
        team.touchdowns !== 0 ||
        String(team.explicitTeamId) !== teamIds[i]
    )
  )
    return;
  const touchdowns: TouchdownReceipt[] = [];
  for (let index = 1; index <= through; index++) {
    const event = raw.get(index);
    if (!event) return;
    if (
      event.sourceTag === "EventEndTurn" &&
      event.reasonCode === 4 &&
      touchdowns.at(-1)?.sourceIndex !== index - 1
    )
      return;
    if (event.sourceTag !== "EventTouchdown") continue;
    const goal = touchdownAt(raw, index, checkpoints, teamIds);
    if (
      !goal ||
      goal.confirmedCheckpointAfter > through ||
      touchdowns.length >= 32
    )
      return;
    touchdowns.push(goal);
  }
  const scores: [number, number] = [0, 0];
  let cursor = 0;
  for (const cp of checkpoints) {
    if (cp.afterSourceIndex > through) break;
    while (
      (touchdowns[cursor]?.sourceIndex ?? Infinity) <= cp.afterSourceIndex
    ) {
      const goal = touchdowns[cursor++]!;
      if (++scores[goal.roster] !== goal.observedScore) return;
    }
    if (
      !cp.board ||
      cp.board.teams.length !== 2 ||
      cp.board.teams.some(
        (team, i) =>
          team.rosterIndex !== i ||
          (team.explicitTeamId !== null &&
            String(team.explicitTeamId) !== teamIds[i]) ||
          (team.touchdowns !== null && team.touchdowns !== scores[i])
      )
    )
      return;
  }
  return cursor === touchdowns.length ? { scores, touchdowns } : undefined;
}
