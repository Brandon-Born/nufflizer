import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import { lastBoardCheckpointBefore } from "@/domain/replay/boardState";
import { observedActorRoster } from "@/domain/replay/observedActorRoster";
import { bounceAt } from "./ballConsequences";
import {
  knockedDownSubjects,
  type ObservedBlockConsequence
} from "./blockConsequences";
import type { LuckEvent } from "./types";

const resolutionTags = new Set([
  "QuestionBlockDice",
  "QuestionBlockSkillUsage",
  "ResultSkillUsage",
  "ResultTeamRerollUsage",
  "ResultBlockRoll",
  "QuestionPushBack",
  "ResultPushBack",
  "QuestionFollowUp",
  "ResultFollowUp",
  "ResultBlockOutcome"
]);
function sameCell(
  a: { x: number | null; y: number | null },
  b: { x: number; y: number }
) {
  return a.x === b.x && a.y === b.y;
}
function continuation(e: ReplayEvent, attacker: string, defender: string) {
  if (e.sourceTag === "Carrier" && e.checkpointCarrier) return true;
  return (
    !e.attributionConflict &&
    e.stepType === 6 &&
    e.stepActorId === attacker &&
    e.stepTargetId === defender &&
    (e.sourceTag === "PlayerStep"
      ? e.payload?.Skill === 0 && e.payload.IsEvaluation === 0
      : resolutionTags.has(e.sourceTag))
  );
}

// Link only the first recorded bounce after a qualified prone carrier and the
// existing adjacent damage prefix. This is observed aftermath, never an ex-ante
// possession model, a catch policy, a turnover inference or another dice score.
export function attachBlockBallReleases(
  replay: ReplayModel,
  sources: ReadonlyMap<string, LuckEvent>,
  consequences: readonly ObservedBlockConsequence[]
) {
  if (replay.replayVersion !== "1-4-0-0") return;
  const checkpoints = replay.boardCheckpoints ?? [],
    teamIds = replay.teams.map((t) => t.id);
  const allEvents = replay.turns.flatMap((t) => t.events);
  const locations = new Map(
    replay.turns.flatMap((t) =>
      t.events.flatMap((e, i) =>
        e.id ? [[e.id, { events: t.events, index: i }] as const] : []
      )
    )
  );
  for (const fact of consequences) {
    const pool = sources.get(fact.poolSourceId),
      location = locations.get(fact.finalSourceId);
    const block = pool?.metadata.block;
    if (!pool || pool.scoringStatus !== "scored" || !block || !location)
      continue;
    const { events, index } = location,
      final = events[index]!;
    if (final.sourceIndex === undefined) continue;
    const before = lastBoardCheckpointBefore(checkpoints, final.sourceIndex),
      board = before?.board;
    const holder = board?.ball.carrierId;
    const prone =
      fact.outcome === "wrestled_prone"
        ? [block.attackerId, block.defenderId]
        : knockedDownSubjects(fact.outcome, block.attackerId, block.defenderId);
    if (
      !board ||
      before!.status !== "observed" ||
      board.phaseCode !== 5 ||
      board.issues.length ||
      board.ball.isHeld !== true ||
      board.ball.possession !== "held" ||
      holder === null ||
      holder === undefined ||
      !prone.includes(String(holder)) ||
      final.sourceIndex - before!.afterSourceIndex > 256
    )
      continue;
    const holderId = String(holder),
      holderTeamId =
        holderId === block.attackerId ? pool.teamId : block.defenderTeamId;
    if (!holderTeamId || holderTeamId === "unresolved") continue;
    const roster = observedActorRoster(
      { ...board, activeTeamIndex: null },
      holder,
      holderTeamId,
      teamIds
    );
    const player = roster?.players.find((p) => p.id === holder);
    const { x, y } = board.ball.cell;
    if (
      !player ||
      player.pitchLocation !== "on_pitch" ||
      x === null ||
      y === null ||
      !sameCell(player.cell, { x, y }) ||
      board.ball.holderRosterIndex !== roster!.rosterIndex ||
      !allEvents
        .filter(
          (e) =>
            (e.sourceIndex ?? -1) > before!.afterSourceIndex &&
            (e.sourceIndex ?? Infinity) <= final.sourceIndex!
        )
        .every((e) => continuation(e, block.attackerId, block.defenderId))
    )
      continue;
    const bounce = bounceAt(events, fact.nextEventIndex, { x, y });
    const dicePayload = bounce?.roll.payload?.Dice as
      { Die?: Record<string, unknown> } | undefined;
    if (
      !bounce ||
      bounce.step.sequenceId !== final.sequenceId ||
      bounce.step.locator?.stepIndex !== fact.nextStepIndex ||
      bounce.step.sourceIndex !==
        (events[fact.nextEventIndex - 1]?.sourceIndex ?? -2) + 1 ||
      bounce.roll.sourceIndex !== bounce.step.sourceIndex! + 1 ||
      bounce.step.payload?.State !== 3 ||
      Object.keys(bounce.step.payload).some(
        (k) =>
          ![
            "IsEvaluation",
            "StepType",
            "CellFrom",
            "CellTo",
            "State",
            "BallId"
          ].includes(k)
      ) ||
      Object.keys(bounce.roll.payload ?? {}).some(
        (k) =>
          ![
            "Status",
            "Requirement",
            "Modifiers",
            "Dice",
            "Difficulty",
            "RollType",
            "Outcome",
            "NewRoll"
          ].includes(k)
      ) ||
      bounce.roll.payload?.Requirement !== 0 ||
      bounce.roll.payload.Difficulty !== 0 ||
      !dicePayload?.Die ||
      Array.isArray(dicePayload.Die) ||
      Object.keys(dicePayload).some((k) => k !== "Die") ||
      Object.keys(dicePayload.Die).some(
        (k) => k !== "DieType" && k !== "Value"
      ) ||
      (bounce.roll.payload.Modifiers !== "" &&
        bounce.roll.payload.Modifiers !== undefined)
    )
      continue;
    const reported = sources.get(bounce.roll.id!);
    if (
      !reported ||
      reported.scoringStatus !== "excluded" ||
      reported.metadata.rollType !== 25 ||
      reported.metadata.ballTravel
    )
      continue;
    // An immediate confirming snapshot may omit both holder flags. Preserve
    // those nulls. A later catch/bounce/choice is outside this first-motion link.
    const after = checkpoints.find(
      (c) => c.afterSourceIndex >= bounce.roll.sourceIndex!
    );
    const between = allEvents.filter(
      (e) =>
        (e.sourceIndex ?? -1) > bounce.roll.sourceIndex! &&
        (e.sourceIndex ?? Infinity) <= (after?.afterSourceIndex ?? -1)
    );
    const direct =
      after?.status === "observed" &&
      after.board &&
      after.board.phaseCode === 5 &&
      !after.board.issues.length &&
      after.replayStep === final.locator?.replayStep &&
      after.afterSourceIndex === bounce.roll.sourceIndex! + between.length &&
      between.length <= 2 &&
      between.every(
        (e) =>
          e.sourceTag === "EventRulesEngineStandBy" ||
          e.sourceTag === "EventEndTurn"
      );
    if (
      direct &&
      (after.board!.ball.isHeld === true ||
        after.board!.ball.carrierId !== null ||
        (after.board!.ball.cell.x !== null &&
          after.board!.ball.cell.x !== bounce.to.x) ||
        (after.board!.ball.cell.y !== null &&
          after.board!.ball.cell.y !== bounce.to.y))
    )
      continue;
    pool.metadata.blockBallRelease = {
      holderId,
      holderTeamId,
      beforeCheckpointAfter: before!.afterSourceIndex,
      from: bounce.from,
      to: bounce.to,
      bounceSourceId: bounce.roll.id!,
      ...(direct
        ? {
            after: {
              checkpointAfter: after!.afterSourceIndex,
              cell: { ...after!.board!.ball.cell },
              carrierId: after!.board!.ball.carrierId,
              isHeld: after!.board!.ball.isHeld
            }
          }
        : {})
    };
    reported.metadata.ballTravel = { from: bounce.from, to: bounce.to };
  }
}

// Public JSON cannot replay raw snapshots; reconcile every exported cross-link
// and physical invariant with the independently validated source rows instead.
export function validReportedBlockBallRelease(
  pool: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>
) {
  const release = pool.metadata.blockBallRelease,
    block = pool.metadata.block,
    resolution = pool.metadata.blockResolution;
  if (!release || !block || !resolution || pool.scoringStatus !== "scored")
    return false;
  const prone =
    resolution.outcome === "wrestled_prone"
      ? [block.attackerId, block.defenderId]
      : knockedDownSubjects(
          resolution.outcome,
          block.attackerId,
          block.defenderId
        );
  const final = block.finalSourceId
    ? sources.get(block.finalSourceId)
    : undefined;
  const bounce = sources.get(release.bounceSourceId),
    travel = bounce?.metadata.ballTravel;
  if (
    !final ||
    !bounce ||
    !travel ||
    !prone.includes(release.holderId) ||
    release.holderTeamId !==
      (release.holderId === block.attackerId
        ? pool.teamId
        : block.defenderTeamId) ||
    release.beforeCheckpointAfter >= (final.metadata.sourceIndex ?? -1) ||
    (final.metadata.sourceIndex ?? Infinity) - release.beforeCheckpointAfter >
      256 ||
    bounce.metadata.sourceTag !== "ResultRoll" ||
    bounce.metadata.rollType !== 25 ||
    bounce.metadata.stepType !== 3 ||
    bounce.scoringStatus !== "excluded" ||
    !sameCell(travel.from, release.from) ||
    !sameCell(travel.to, release.to) ||
    bounce.metadata.sequenceId !== final.metadata.sequenceId ||
    bounce.metadata.locator?.replayStep !==
      final.metadata.locator?.replayStep ||
    bounce.metadata.locator?.childIndex !==
      final.metadata.locator?.childIndex ||
    bounce.metadata.locator?.stepIndex !==
      (final.metadata.locator?.stepIndex ?? -100) +
        resolution.damageActionIds.length +
        1 ||
    (bounce.metadata.sourceIndex ?? -1) <=
      (final.metadata.sourceIndex ?? Infinity)
  )
    return false;
  const between = [...sources.values()].filter(
    (e) =>
      (e.metadata.sourceIndex ?? -1) >
        (final.metadata.sourceIndex ?? Infinity) &&
      (e.metadata.sourceIndex ?? Infinity) < (bounce.metadata.sourceIndex ?? -1)
  );
  if (
    between.some(
      (e) =>
        !resolution.damageActionIds.includes(e.metadata.actionId ?? "") &&
        !(
          e.metadata.sourceTag === "ResultMoveOutcome" &&
          e.metadata.actionId === final.metadata.actionId
        ) &&
        !(
          e.metadata.sourceTag === "BallStep" &&
          e.metadata.actionId === bounce.metadata.actionId
        )
    )
  )
    return false;
  if (
    release.after &&
    (release.after.checkpointAfter <
      (bounce.metadata.sourceIndex ?? Infinity) ||
      release.after.checkpointAfter > (bounce.metadata.sourceIndex ?? -1) + 2 ||
      release.after.isHeld === true ||
      (release.after.cell.x !== null &&
        release.after.cell.x !== release.to.x) ||
      (release.after.cell.y !== null &&
        release.after.cell.y !== release.to.y) ||
      release.after.carrierId !== null)
  )
    return false;
  return true;
}
