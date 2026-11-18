import { lastBoardCheckpointBefore } from "@/domain/replay/boardState";
import { isInertReplayControl } from "@/domain/replay/inertControls";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import { moveCell } from "@/domain/replay/scoreContinuity";
import type { PreRollEvidence } from "@/domain/replay/reconstructContext";
import { bounceAt } from "./ballConsequences";
import type { BounceCatchReaction } from "./catchPossession";
import type { LuckEvent } from "./types";

type PickupTurnEnd = NonNullable<LuckEvent["metadata"]["pickupTurnEnd"]>;
type BounceTurnEnd = Extract<PickupTurnEnd, { kind: "bounce" }>;

function gamer(value: unknown) {
  if (value === 0 || value === "0") return 0;
  if (value === 1 || value === "1") return 1;
  return null;
}

function followsWithTurnEnd(
  replay: ReplayModel,
  last: ReplayEvent,
  end?: ReplayEvent,
  phase?: ReplayEvent
) {
  const p = end?.payload,
    from = last.locator;
  return (
    !!end?.id &&
    end.sourceTag === "EventEndTurn" &&
    end.reasonCode === 2 &&
    String(p?.Reason) === "2" &&
    !!p &&
    Object.keys(p).every(
      (k) =>
        k === "Reason" || k === "NextPlayingGamer" || k === "FollowingTurnType"
    ) &&
    (p.NextPlayingGamer === undefined || gamer(p.NextPlayingGamer) !== null) &&
    (p.FollowingTurnType === undefined ||
      (String(p.FollowingTurnType) === "2" &&
        phase?.sourceTag === "EventNewGamePhase" &&
        String(phase.payload?.Phase) === "6" &&
        Object.keys(phase.payload ?? {}).length === 1 &&
        phase.sourceIndex === (end.sourceIndex ?? -2) + 1 &&
        phase.locator?.replayStep === end.locator?.replayStep &&
        phase.locator?.childIndex === (end.locator?.childIndex ?? -2) + 1)) &&
    last.sourceIndex !== undefined &&
    end.sourceIndex === last.sourceIndex + 1 &&
    from?.replayStep !== undefined &&
    from.childIndex !== undefined &&
    end.locator?.replayStep === from.replayStep &&
    end.locator.childIndex === from.childIndex + 1 &&
    end.locator.stepIndex === undefined &&
    !last.attributionConflict &&
    !last.executionExclusion &&
    lastBoardCheckpointBefore(replay.boardCheckpoints ?? [], end.sourceIndex)
      ?.afterSourceIndex !== last.sourceIndex
  );
}

function afterBounceTurnEnd(
  replay: ReplayModel,
  end: ReplayEvent,
  controls: readonly ReplayEvent[],
  landing: { x: number; y: number },
  nextGamerId: 0 | 1 | null
): BounceTurnEnd["snapshot"] {
  const [change, pause, timer, wait] = controls;
  const at = end.locator;
  if (
    !at ||
    at.replayStep === undefined ||
    at.childIndex === undefined ||
    end.sourceIndex === undefined ||
    change?.sourceTag !== "EventActiveGamerChanged" ||
    pause?.sourceTag !== "EventPauseActiveTimer" ||
    timer?.sourceTag !== "EventActiveTimerChanged" ||
    wait?.sourceTag !== "EventRulesEngineStandBy" ||
    !controls.every(
      (event, i) =>
        event.sourceIndex === end.sourceIndex! + i + 1 &&
        !event.attributionConflict &&
        !!event.locator &&
        event.locator.replayStep === at.replayStep &&
        event.locator.childIndex === at.childIndex! + i + 1 &&
        event.locator.stepIndex === undefined
    ) ||
    !Object.keys(change.payload ?? {}).every(
      (key) => key === "NewActiveGamer"
    ) ||
    !isInertReplayControl(pause) ||
    !isInertReplayControl(timer) ||
    String(wait.payload?.Phase) !== "5" ||
    !Object.keys(wait.payload ?? {}).every(
      (key) => key === "Phase" || key === "ActiveGamer"
    )
  )
    return;
  const checkpoint = lastBoardCheckpointBefore(
    replay.boardCheckpoints ?? [],
    wait.sourceIndex! + 1
  );
  const board = checkpoint?.board;
  if (
    checkpoint?.status !== "observed" ||
    checkpoint.afterSourceIndex !== wait.sourceIndex ||
    checkpoint.replayStep !== at.replayStep ||
    checkpoint.childIndex !== at.childIndex + 5 ||
    !board ||
    board.issues.length ||
    board.phaseCode !== 5 ||
    board.stable !== true ||
    board.ball.cell.x !== landing.x ||
    board.ball.cell.y !== landing.y ||
    board.ball.carrierId !== null ||
    board.ball.isHeld === true ||
    (board.activeGamerId !== null && gamer(board.activeGamerId) === null) ||
    [change.payload?.NewActiveGamer, wait.payload?.ActiveGamer].some(
      (value) =>
        value !== undefined &&
        (gamer(value) === null || gamer(value) !== board.activeGamerId)
    ) ||
    (nextGamerId !== null &&
      board.activeGamerId !== null &&
      board.activeGamerId !== nextGamerId)
  )
    return;
  return {
    checkpointAfter: checkpoint.afterSourceIndex,
    observedIsHeld: board.ball.isHeld,
    observedActiveGamerId: gamer(board.activeGamerId)
  };
}

// A matching direction and turn-end event establish what happened. The
// observed branch is never used to narrow the pre-roll range.
export function findPickupTurnEnds(
  replay: ReplayModel,
  reactions: ReadonlyMap<string, BounceCatchReaction>,
  contexts: ReadonlyMap<string, PreRollEvidence>
) {
  const result = new Map<string, PickupTurnEnd>();
  if (replay.replayVersion !== "1-4-0-0") return result;
  let header: ReplayEvent | undefined;
  const raw = replay.turns.flatMap((turn) => turn.events);
  for (const [i, event] of raw.entries()) {
    if (event.sourceTag === "PlayerStep") header = event;
    const id = event.id;
    if (!id) continue;
    const reaction = reactions.get(id);
    if (reaction) {
      const end = raw[i + 1];
      if (followsWithTurnEnd(replay, event, end))
        result.set(reaction.pickupSourceId, {
          kind: "catch",
          catchSourceId: id,
          endSourceId: end!.id!,
          ordinaryMoves: contexts.get(reaction.pickupSourceId)
            ?.pickupMoveAvailability
        });
      continue;
    }
    if (
      event.sourceTag !== "ResultRoll" ||
      event.rollType !== 4 ||
      event.payload?.Outcome !== 0 ||
      event.stepType !== 1 ||
      event.attributionConflict ||
      event.executionExclusion ||
      header?.stepType !== 1 ||
      header.payload?.IsEvaluation !== 0 ||
      !event.actionId ||
      event.actionId !== header.actionId ||
      event.stepActorId !== header.stepActorId ||
      event.sourceIndex === undefined
    )
      continue;
    const destination = moveCell(header.payload.CellTo);
    const bounce = destination && bounceAt(raw, i + 1, destination);
    const end = raw[i + 3];
    if (
      !bounce ||
      !followsWithTurnEnd(replay, bounce.roll, end, raw[i + 4]) ||
      bounce.step.sourceIndex !== event.sourceIndex + 1 ||
      bounce.roll.sourceIndex !== event.sourceIndex + 2 ||
      bounce.step.sequenceId !== event.sequenceId ||
      bounce.roll.locator?.replayStep !== event.locator?.replayStep ||
      bounce.roll.locator?.childIndex !== event.locator?.childIndex ||
      bounce.roll.locator?.stepIndex !== (event.locator?.stepIndex ?? -2) + 1 ||
      bounce.roll.locator?.messageIndex !== 0
    )
      continue;
    const nextGamerId = gamer(end!.payload?.NextPlayingGamer);
    result.set(id, {
      kind: "bounce",
      bounceSourceId: bounce.roll.id!,
      endSourceId: end!.id!,
      nextGamerId,
      snapshot: afterBounceTurnEnd(
        replay,
        end!,
        raw.slice(i + 4, i + 8),
        bounce.to,
        nextGamerId
      ),
      ordinaryMoves: contexts.get(id)?.pickupMoveAvailability
    });
  }
  return result;
}

export function attachPickupTurnEnds(
  proofs: ReadonlyMap<string, PickupTurnEnd>,
  sources: ReadonlyMap<string, LuckEvent>
) {
  for (const [source, proof] of proofs) {
    const pickup = sources.get(source),
      end = sources.get(proof.endSourceId);
    const chain = pickup?.metadata.pickupBallChain;
    if (
      !pickup ||
      end?.metadata.sourceTag !== "EventEndTurn" ||
      end.scoringStatus !== "excluded" ||
      !chain
    )
      continue;
    if (proof.kind === "catch") {
      const catchEvent = sources.get(proof.catchSourceId);
      if (
        catchEvent?.metadata.bounceCatchReaction?.pickupSourceId !== source ||
        catchEvent.actualSuccess !== true
      )
        continue;
    } else if (
      chain.bounceSourceIds.length !== 1 ||
      chain.bounceSourceIds[0] !== proof.bounceSourceId ||
      chain.catchEventIds.length !== 0
    )
      continue;
    pickup.metadata.pickupTurnEnd = proof;
    end.metadata.turnEndReason = 2;
    end.label = "Recorded turn ended after failed pickup";
    end.statusReason =
      "Recorded turnover after the pickup sequence. This event adds no luck score.";
  }
}
