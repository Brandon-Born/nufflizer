import type { ReplayEvent, ReplayModel } from "./types";
import type { ObservedBoard, ReplayBoardCheckpoint } from "./boardState";
import { checkpointClockEpochs } from "./boardState";
import { failedMovementOffer, sameMovementActor } from "./teamRerollMovement";
import { unmodifiedD6Check } from "./numericCheck";
import { observedActorRoster } from "./observedActorRoster";
import { observedZoneMarkers, recordedZoneD6Check } from "./zoneD6Check";

type Cell = { x: number; y: number };
type PartialCell = { x: number | null; y: number | null };
export type CombinedMovement = {
  stepSourceId: string;
  policy: "fresh_rush_then_dodge" | "team_rush_then_dodge";
  questionSourceId?: string;
  decisionSourceId?: string;
  gamerId?: 0 | 1;
  rushSourceId: string;
  dodgeSourceId: string;
  doMoveSourceId: string;
  outcomeSourceId: string;
  originalCheckpointAfter: number;
  checkpointAfter: number;
  from: Cell;
  to: Cell;
  movementBefore: 0 | null;
  movementAfter: 0 | null;
  carriedBallBefore: boolean | null;
  dodgeSucceeded: boolean;
  partialOccupancy: { playerId: string; cell: PartialCell }[];
  zonePenalty?: {
    baseTarget: number;
    markers: { playerId: string; cell: Cell }[];
  };
};
type Frame = {
  board: ObservedBoard;
  checkpointAfter: number;
  from: Cell;
  to: Cell;
  partialOccupancy: CombinedMovement["partialOccupancy"];
};
function cell(value: unknown): Cell | undefined {
  const p = value as { X?: unknown; Y?: unknown } | undefined;
  return Number.isInteger(p?.X) &&
    p !== null &&
    typeof p === "object" &&
    !Array.isArray(p) &&
    Object.keys(p).every((k) => k === "X" || k === "Y") &&
    Number.isInteger(p?.Y) &&
    Number(p?.X) >= 0 &&
    Number(p?.X) <= 25 &&
    Number(p?.Y) >= 0 &&
    Number(p?.Y) <= 14
    ? { x: Number(p!.X), y: Number(p!.Y) }
    : undefined;
}
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const excludes = (a: PartialCell, b: Cell) =>
  (a.x !== null && a.x !== b.x) || (a.y !== null && a.y !== b.y);

// Missing coordinates stay null. A distant known axis can rule out the two
// relevant squares without supplying a full position or global availability.
function frame(
  board: ObservedBoard | null | undefined,
  checkpointAfter: number,
  step: ReplayEvent,
  teams: readonly string[]
): Frame | undefined {
  const from = cell(step.payload?.CellFrom),
    to = cell(step.payload?.CellTo);
  if (
    !board ||
    !step.id ||
    !step.actionId ||
    !step.sequenceId ||
    step.sourceIndex === undefined ||
    board.issues.length ||
    board.phaseCode !== 5 ||
    board.pitchLayout === "small" ||
    !from ||
    !to ||
    Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) !== 1 ||
    !sameMovementActor(step, step) ||
    step.payload?.Skill !== 0 ||
    step.payload.IsEvaluation !== 0 ||
    Object.keys(step.payload).some(
      (k) =>
        ![
          "Probability",
          "PlayerId",
          "TargetId",
          "IsEvaluation",
          "StepType",
          "CellTo",
          "State",
          "CellFrom",
          "Skill"
        ].includes(k)
    ) ||
    board.activePlayerId !== Number(step.playerId)
  )
    return;
  const owner = observedActorRoster(
      board,
      Number(step.playerId),
      step.actorTeamId!,
      teams
    ),
    actor = owner?.players.find((p) => String(p.id) === step.playerId);
  if (
    !owner ||
    (board.activeGamerId !== null &&
      board.activeGamerId !== owner.rosterIndex) ||
    !actor ||
    actor.pitchLocation !== "on_pitch" ||
    actor.cell.x !== from.x ||
    actor.cell.y !== from.y ||
    actor.canAct === false ||
    actor.mentalEffect ||
    (actor.statusCode !== null && actor.statusCode !== 0) ||
    (actor.situationCode !== null && actor.situationCode !== 0) ||
    (actor.movementRemaining !== null && actor.movementRemaining !== 0)
  )
    return;
  const partialOccupancy: CombinedMovement["partialOccupancy"] = [],
    occupied = new Set<string>(),
    ids = new Set<number>();
  for (const p of board.teams.flatMap((t) => t.players)) {
    if (p.id === null || ids.has(p.id)) return;
    ids.add(p.id);
    if (p.pitchLocation === "off_pitch") continue;
    if (p.cell.x !== null && p.cell.y !== null) {
      if (
        p.pitchLocation !== "on_pitch" ||
        p.cell.x < 0 ||
        p.cell.x > 25 ||
        p.cell.y < 0 ||
        p.cell.y > 14
      )
        return;
      const key = `${p.cell.x},${p.cell.y}`;
      if (occupied.has(key)) return;
      occupied.add(key);
    } else {
      if (
        (p.cell.x !== null && (p.cell.x < 0 || p.cell.x > 25)) ||
        (p.cell.y !== null && (p.cell.y < 0 || p.cell.y > 14)) ||
        !excludes(p.cell, from) ||
        !excludes(p.cell, to)
      )
        return;
      partialOccupancy.push({ playerId: String(p.id), cell: { ...p.cell } });
    }
    if (
      String(p.id) !== step.playerId &&
      (!excludes(p.cell, from) || !excludes(p.cell, to))
    )
      return;
  }
  return { board, checkpointAfter, from, to, partialOccupancy };
}
function outcome(event: ReplayEvent, dodgeSucceeded: boolean) {
  const p = event.payload,
    rolls = p?.Rolls as { RollSummary?: Record<string, unknown>[] } | undefined,
    rows = rolls?.RollSummary;
  return (
    event.sourceTag === "ResultMoveOutcome" &&
    p?.Moved === 1 &&
    p.TentacleUsed === 0 &&
    p.FumbleRooskieUsed === 0 &&
    (p.Pushbacks === undefined || p.Pushbacks === "") &&
    Object.keys(p).every((k) =>
      [
        "Moved",
        "TentacleUsed",
        "FumbleRooskieUsed",
        "Rolls",
        "Pushbacks"
      ].includes(k)
    ) &&
    !!rolls &&
    Object.keys(rolls).join() === "RollSummary" &&
    Array.isArray(rows) &&
    rows.length === 2 &&
    rows.every((r) => r && !Array.isArray(r) && Object.keys(r).length === 2) &&
    rows[0]!.RollType === 1 &&
    rows[0]!.Outcome === 1 &&
    rows[1]!.RollType === 2 &&
    rows[1]!.Outcome === Number(dodgeSucceeded)
  );
}

// Independent prefix observer. A candidate starts only at a fresh checkpoint,
// and restoration is returned only at the completed source outcome. Earlier
// unresolved activation choices never become an ordinary Move declaration.
export function findCombinedMovements(replay: ReplayModel) {
  const result = new Map<
    string,
    { proof: CombinedMovement; board: ObservedBoard; step: ReplayEvent }
  >();
  if (replay.replayVersion !== "1-4-0-0") return result;
  const checkpoints = replay.boardCheckpoints ?? [],
    epochs = checkpointClockEpochs(checkpoints),
    teams = replay.teams.map((t) => t.id);
  let cursor = 0,
    checkpoint: ReplayBoardCheckpoint | undefined,
    fresh = false,
    small = false;
  let step: ReplayEvent | undefined,
    freshStep = false;
  let pending:
    | {
        stage: "choice" | "rush" | "dodge" | "do_move" | "outcome";
        origin: Frame;
        frame: Frame;
        step: ReplayEvent;
        epoch: number;
        question?: ReplayEvent;
        choice?: ReplayEvent;
        rush?: ReplayEvent;
        dodge?: ReplayEvent;
        doMove?: ReplayEvent;
        succeeded?: boolean;
        zonePenalty?: CombinedMovement["zonePenalty"];
      }
    | undefined;
  for (const e of replay.turns.flatMap((t) => t.events)) {
    if (e.sourceIndex === undefined) continue;
    while (
      cursor < checkpoints.length &&
      checkpoints[cursor]!.afterSourceIndex < e.sourceIndex
    ) {
      checkpoint = checkpoints[cursor++]!;
      fresh = true;
      if (checkpoint.board?.pitchLayout === "small") small = true;
      if (
        pending &&
        (pending.stage !== "choice" || pending.epoch !== epochs.get(checkpoint))
      )
        pending = undefined;
      if (
        pending &&
        !frame(
          checkpoint.board,
          checkpoint.afterSourceIndex,
          pending.step,
          teams
        )
      )
        pending = undefined;
    }
    if (pending?.stage === "choice") {
      if (e.sourceTag === "Carrier" && e.checkpointCarrier) continue;
      if (
        e.sourceTag === "PlayerStep" &&
        sameMovementActor(pending.step, e) &&
        same(
          cell(e.payload?.CellFrom) ?? { x: -1, y: -1 },
          pending.origin.from
        ) &&
        same(cell(e.payload?.CellTo) ?? { x: -1, y: -1 }, pending.origin.to) &&
        fresh &&
        !small
      ) {
        const next = frame(
          checkpoint?.board,
          checkpoint!.afterSourceIndex,
          e,
          teams
        );
        if (next) {
          pending.frame = next;
          pending.step = e;
          fresh = false;
          continue;
        }
      }
      if (
        e.sourceTag === "ResultTeamRerollUsage" &&
        e.id &&
        e.payload?.Used === 1 &&
        e.payload.GamerId === pending.question!.payload?.GamerId &&
        Object.keys(e.payload).every((k) => ["GamerId", "Used"].includes(k)) &&
        sameMovementActor(pending.step, e) &&
        e.actionId === pending.step.actionId &&
        e.sequenceId === pending.step.sequenceId &&
        e.sourceIndex === pending.step.sourceIndex! + 1 &&
        pending.frame.checkpointAfter >= pending.question!.sourceIndex!
      ) {
        pending.choice = e;
        pending.stage = "rush";
        continue;
      }
      pending = undefined;
    }
    if (pending) {
      const last =
        pending.doMove ?? pending.dodge ?? pending.rush ?? pending.choice!;
      const chain =
        !!e.id &&
        sameMovementActor(pending.step, e) &&
        e.actionId === pending.step.actionId &&
        e.sequenceId === pending.step.sequenceId &&
        e.sourceIndex === last.sourceIndex! + 1;
      if (
        chain &&
        pending.stage === "rush" &&
        unmodifiedD6Check(e, 1, 2, true) ===
          (pending.question!.payload!.RollInfos as { Difficulty: number })
            .Difficulty
      ) {
        pending.rush = e;
        pending.stage = "dodge";
        continue;
      }
      if (
        chain &&
        pending.stage === "dodge" &&
        (e.payload?.Outcome === 0 || e.payload?.Outcome === 1)
      ) {
        const check = recordedZoneD6Check(e, 2, 1, e.payload.Outcome === 1),
          owner = observedActorRoster(
            pending.frame.board,
            Number(e.playerId),
            e.actorTeamId!,
            teams
          );
        const markers =
          check && owner
            ? observedZoneMarkers(
                pending.frame.board,
                e.playerId!,
                owner.rosterIndex,
                check,
                pending.frame.to
              )
            : undefined;
        if (check && markers) {
          pending.dodge = e;
          pending.succeeded = e.payload.Outcome === 1;
          pending.stage = "do_move";
          if (markers.length)
            pending.zonePenalty = { baseTarget: check.baseTarget, markers };
          continue;
        }
      }
      if (
        chain &&
        pending.stage === "do_move" &&
        e.sourceTag === "ResultDoMove" &&
        (!e.payload || Object.keys(e.payload).length === 0)
      ) {
        pending.doMove = e;
        pending.stage = "outcome";
        continue;
      }
      if (
        chain &&
        pending.stage === "outcome" &&
        outcome(e, pending.succeeded!)
      ) {
        const f = pending.frame,
          actor = Number(e.playerId),
          ball = f.board.ball;
        result.set(e.id!, {
          step: pending.step,
          board: f.board,
          proof: {
            stepSourceId: pending.step.id!,
            policy: pending.question
              ? "team_rush_then_dodge"
              : "fresh_rush_then_dodge",
            ...(pending.question
              ? {
                  questionSourceId: pending.question.id!,
                  decisionSourceId: pending.choice!.id!,
                  gamerId: pending.question.payload!.GamerId as 0 | 1
                }
              : {}),
            rushSourceId: pending.rush!.id!,
            dodgeSourceId: pending.dodge!.id!,
            doMoveSourceId: pending.doMove!.id!,
            outcomeSourceId: e.id!,
            originalCheckpointAfter: pending.origin.checkpointAfter,
            checkpointAfter: f.checkpointAfter,
            from: f.from,
            to: f.to,
            movementBefore: f.board.teams
              .flatMap((t) => t.players)
              .find((p) => p.id === actor)!.movementRemaining as 0 | null,
            movementAfter: pending.succeeded
              ? (f.board.teams
                  .flatMap((t) => t.players)
                  .find((p) => p.id === actor)!.movementRemaining as 0 | null)
              : null,
            carriedBallBefore:
              ball.possession === "unknown"
                ? null
                : ball.possession === "held" && ball.carrierId === actor,
            dodgeSucceeded: pending.succeeded!,
            partialOccupancy: f.partialOccupancy,
            ...(pending.zonePenalty ? { zonePenalty: pending.zonePenalty } : {})
          }
        });
        pending = undefined;
        continue;
      }
      pending = undefined;
    }
    if (e.sourceTag === "Carrier" && e.checkpointCarrier) continue;
    if (e.sourceTag === "PlayerStep") {
      step = e;
      freshStep = fresh;
      fresh = false;
      continue;
    }
    if (
      step &&
      freshStep &&
      e.sourceIndex === step.sourceIndex! + 1 &&
      !small &&
      checkpoint?.board?.stable === true &&
      sameMovementActor(step, e)
    ) {
      const f = frame(
        checkpoint.board,
        checkpoint.afterSourceIndex,
        step,
        teams
      );
      if (f) {
        const offer = failedMovementOffer(e);
        if (
          e.id &&
          offer?.family === 1 &&
          e.payload?.GamerId ===
            observedActorRoster(
              f.board,
              Number(e.playerId),
              e.actorTeamId!,
              teams
            )?.rosterIndex
        ) {
          pending = {
            stage: "choice",
            origin: f,
            frame: f,
            step,
            epoch: epochs.get(checkpoint)!,
            question: e
          };
          freshStep = false;
          continue;
        }
        if (e.id && unmodifiedD6Check(e, 1, 1, true)) {
          pending = {
            stage: "dodge",
            origin: f,
            frame: f,
            step,
            epoch: epochs.get(checkpoint)!,
            rush: e
          };
          freshStep = false;
          continue;
        }
      }
    }
    fresh = false;
    freshStep = false;
  }
  return result;
}
