import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { PreRollEvidence } from "@/domain/replay/reconstructContext";
import {
  checkpointClockEpochs,
  consistentNormalStandBy
} from "@/domain/replay/boardState";
import { observedActorRoster } from "@/domain/replay/observedActorRoster";
import { unmodifiedD6Check } from "@/domain/replay/numericCheck";
import {
  failedMovementOffer,
  sameMovementActor,
  actualMoveGeometry
} from "@/domain/replay/teamRerollMovement";
import { plainPickupMoveOutcome } from "@/domain/replay/pickupSuccessors";
import { teamMovementContinuity } from "@/domain/replay/teamMovementContinuity";
import { findMovementFall } from "./movementConsequences";
import { estimateKeptRushMoveBounds } from "./contextImpact";
import type { LuckEvent } from "./types";

type Cell = { x: number; y: number };
export type RetainedRushContext = {
  declarationSourceId: string;
  declarationCheckpointAfter: number;
  resumeCheckpointAfter: number;
  successRushSourceId: string;
  doMoveSourceId: string;
  moveOutcomeSourceId: string;
  questionSourceId: string;
  decisionSourceId: string;
  waitingCheckpointAfter: number;
  from: Cell;
  via: Cell;
  destination: Cell;
};
const same = (a: Cell | undefined, b: Cell | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y;
function cell(value: unknown): Cell | undefined {
  const c = value as { X?: number; Y?: number } | undefined;
  return Number.isInteger(c?.X) &&
    Number.isInteger(c?.Y) &&
    c!.X! >= 0 &&
    c!.X! <= 25 &&
    c!.Y! >= 0 &&
    c!.Y! <= 14
    ? { x: c!.X!, y: c!.Y! }
    : undefined;
}
const empty = (e: ReplayEvent | undefined) =>
  !!e && (!e.payload || Object.keys(e.payload).length === 0);
function step(e: ReplayEvent | undefined, actor: string, type: 0 | 1) {
  return (
    !!e &&
    e.sourceTag === "PlayerStep" &&
    e.stepType === type &&
    e.playerId === actor &&
    e.stepActorId === actor &&
    !e.attributionConflict &&
    e.payload?.Skill === 0 &&
    e.payload.IsEvaluation === 0 &&
    e.payload.TargetId === -1 &&
    e.stepTargetId === "-1" &&
    Object.keys(e.payload).every((k) =>
      [
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
    )
  );
}
function singleRushSummary(value: unknown) {
  const rolls = value as Record<string, unknown> | undefined,
    summary = rolls?.RollSummary as Record<string, unknown> | undefined;
  return (
    !!rolls &&
    Object.keys(rolls).length === 1 &&
    !!summary &&
    !Array.isArray(summary) &&
    Object.keys(summary).length === 2 &&
    summary.RollType === 1 &&
    summary.Outcome === 1
  );
}
// A bounded source bridge, not a restoration of general activation/state.
// One deterministic ordinary Move frame, one adjacent fresh Rush success,
// then a declined original Rush with a verified terminal self-fall/turnover.
export function findRetainedRushContexts(
  replay: ReplayModel,
  contexts: ReadonlyMap<string, PreRollEvidence>
) {
  const found = new Map<string, RetainedRushContext>();
  if (replay.replayVersion !== "1-4-0-0") return found;
  const all = replay.turns.flatMap((t) => t.events),
    at = new Map(all.map((e) => [e.sourceIndex, e]));
  const byId = new Map(all.map((e) => [e.id, e]));
  const declarations = new Map<string, ReplayEvent>();
  let last: ReplayEvent | undefined;
  for (const e of all) {
    if (e.sourceTag === "ResultUseAction") last = e;
    if (e.id && last) declarations.set(e.id, last);
  }
  const checkpoints = replay.boardCheckpoints ?? [],
    epochs = checkpointClockEpochs(checkpoints);
  const ordinals = new Map(checkpoints.map((c, i) => [c, i]));
  const checkpointBefore = (sourceIndex: number) => {
    let lo = 0,
      hi = checkpoints.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (checkpoints[mid]!.afterSourceIndex < sourceIndex) lo = mid + 1;
      else hi = mid;
    }
    return checkpoints[lo - 1];
  };
  for (const turn of replay.turns) {
    const fall = findMovementFall(turn);
    if (!fall || fall.skillOriginalId || fall.evidence.combinedRushSourceId)
      continue;
    const final = byId.get(fall.rollSourceId);
    if (!final?.id || final.sourceIndex === undefined || !final.playerId)
      continue;
    const actor = final.playerId,
      index = final.sourceIndex,
      decision = at.get(index - 1),
      question = at.get(index - 4);
    const success = at.get(index - 8),
      doMove = at.get(index - 7),
      outcome = at.get(index - 6);
    const a = at.get(index - 9),
      b = at.get(index - 5),
      c = at.get(index - 2),
      context = question?.id ? contexts.get(question.id) : undefined;
    const offer = question ? failedMovementOffer(question) : undefined;
    if (
      !question?.id ||
      !decision?.id ||
      !success?.id ||
      !doMove?.id ||
      !outcome?.id ||
      !context?.ordinaryMoveAvailability ||
      context.actorCarriesBall !== false ||
      context.activeTeamId !== final.actorTeamId ||
      context.teamTurn === null ||
      !context.movementCheckLinked ||
      offer?.family !== 1 ||
      offer.threshold !== 2 ||
      decision.sourceTag !== "ResultTeamRerollUsage" ||
      decision.payload?.Used !== 0 ||
      decision.payload.GamerId !== question.payload?.GamerId ||
      Object.keys(decision.payload).some(
        (k) => !["Used", "GamerId"].includes(k)
      ) ||
      final.payload?.Status !== 1 ||
      final.payload.NewRoll !== 0 ||
      unmodifiedD6Check(
        { ...final, payload: { ...final.payload, NewRoll: 1 } },
        1,
        1,
        false
      ) !== 2 ||
      unmodifiedD6Check(success, 1, 1, true) !== 2 ||
      ![question, decision, success].every((e) =>
        sameMovementActor(final, e)
      ) ||
      !step(a, actor, 1) ||
      !step(b, actor, 1) ||
      !step(c, actor, 1) ||
      a!.actionId === b!.actionId ||
      a!.actionId !== success.actionId ||
      a!.actionId !== outcome.actionId ||
      a!.actionId !== doMove.actionId ||
      b!.actionId !== question.actionId ||
      c!.actionId !== final.actionId ||
      success.sequenceId !== question.sequenceId ||
      final.sequenceId === question.sequenceId ||
      doMove.sourceTag !== "ResultDoMove" ||
      !empty(doMove) ||
      (!plainPickupMoveOutcome(outcome) &&
        !(
          outcome.sourceTag === "ResultMoveOutcome" &&
          outcome.payload?.Moved === 1 &&
          outcome.payload.TentacleUsed === 0 &&
          outcome.payload.FumbleRooskieUsed === 0
        )) ||
      !singleRushSummary(outcome.payload?.Rolls) ||
      Object.keys(outcome.payload!).some(
        (k) =>
          ![
            "Moved",
            "TentacleUsed",
            "FumbleRooskieUsed",
            "Rolls",
            "Pushbacks"
          ].includes(k)
      ) ||
      (outcome.payload!.Pushbacks !== undefined &&
        outcome.payload!.Pushbacks !== "")
    )
      continue;
    const from = cell(a!.payload?.CellFrom),
      via = cell(a!.payload?.CellTo),
      destination = cell(b!.payload?.CellTo);
    if (
      !from ||
      !via ||
      !destination ||
      !same(via, cell(b!.payload?.CellFrom)) ||
      !same(via, cell(c!.payload?.CellFrom)) ||
      !same(destination, cell(c!.payload?.CellTo)) ||
      !same(via, context.actorCell ?? undefined)
    )
      continue;
    const resume = checkpointBefore(success.sourceIndex!),
      declaration = declarations.get(success.id);
    const before =
      declaration?.sourceIndex !== undefined
        ? checkpointBefore(declaration.sourceIndex)
        : undefined;
    if (
      !resume?.board ||
      !before?.board ||
      !declaration?.id ||
      declaration.sourceIndex === undefined ||
      ordinals.get(resume)! !== ordinals.get(before)! + 1 ||
      resume.board.teams.reduce((n, t) => n + t.players.length, 0) > 64 ||
      before.board.teams.reduce((n, t) => n + t.players.length, 0) > 64 ||
      resume.kind !== "board" ||
      before.kind !== "board" ||
      resume.afterSourceIndex !== context.checkpointAfter ||
      resume.afterSourceIndex !== success.sourceIndex! - 3 ||
      declaration.actionCode !== 1 ||
      declaration.payload?.Action !== 1 ||
      declaration.playerId !== actor ||
      declaration.actorTeamId !== final.actorTeamId ||
      declaration.actorTeamSource === "turn_inferred" ||
      declaration.attributionConflict ||
      !step(at.get(declaration.sourceIndex - 1), actor, 0) ||
      declaration.locator?.replayStep !== resume.replayStep ||
      question.locator?.replayStep !== resume.replayStep! + 1 ||
      epochs.get(before) !== epochs.get(resume) ||
      resume.board.stable !== true ||
      before.board.stable !== true ||
      resume.board.phaseCode !== 5 ||
      before.board.phaseCode !== 5 ||
      resume.board.activeTeamIndex !== before.board.activeTeamIndex ||
      resume.board.activePlayerId !== Number(actor) ||
      resume.board.issues.length ||
      before.board.issues.length ||
      JSON.stringify(before.board.ball) !== JSON.stringify(resume.board.ball)
    )
      continue;
    const unchanged = before.board.teams.every((t) => {
      const next = resume.board!.teams.find(
        (n) => n.rosterIndex === t.rosterIndex
      );
      return (
        !!next &&
        next.explicitTeamId === t.explicitTeamId &&
        next.gameTurn === t.gameTurn &&
        next.players.length === t.players.length &&
        t.players.every((p) => {
          const q = next.players.find((x) => x.id === p.id);
          return (
            !!q &&
            (String(p.id) === actor ||
              (p.pitchLocation === q.pitchLocation &&
                p.cell.x === q.cell.x &&
                p.cell.y === q.cell.y))
          );
        })
      );
    });
    if (!unchanged) continue;
    const owner = observedActorRoster(
      resume.board,
      Number(actor),
      final.actorTeamId!,
      replay.teams.map((t) => t.id)
    );
    const old = observedActorRoster(
      before.board,
      Number(actor),
      final.actorTeamId!,
      replay.teams.map((t) => t.id)
    );
    const player = owner?.players.find((p) => String(p.id) === actor),
      oldPlayer = old?.players.find((p) => String(p.id) === actor);
    if (
      !owner ||
      !old ||
      owner.rosterIndex !== resume.board.activeTeamIndex ||
      owner.rosterIndex !== question.payload?.GamerId ||
      owner.gameTurn !== context.teamTurn ||
      old.gameTurn !== owner.gameTurn ||
      oldPlayer?.canAct !== true ||
      oldPlayer.mentalEffect ||
      player?.mentalEffect ||
      player?.canAct === false ||
      (oldPlayer.statusCode !== null && oldPlayer.statusCode !== 0) ||
      (oldPlayer.situationCode !== null && oldPlayer.situationCode !== 0) ||
      (player?.statusCode !== null && player?.statusCode !== 0) ||
      (player?.situationCode !== null && player?.situationCode !== 0) ||
      !same(player?.cell as Cell, from) ||
      !actualMoveGeometry(resume.board, Number(actor), from, via) ||
      !actualMoveGeometry(
        {
          ...resume.board,
          teams: resume.board.teams.map((t) => ({
            ...t,
            players: t.players.map((p) =>
              p.id === Number(actor) ? { ...p, cell: via } : p
            )
          }))
        },
        Number(actor),
        via,
        destination
      )
    )
      continue;
    // A maximum of16 plain adjacent steps matches the reducer's bounded
    // movement domain. No roll/skill/stand-up/other declaration is inferred.
    if (resume.afterSourceIndex - declaration.sourceIndex > 16 * 3 + 1)
      continue;
    let position = cell(at.get(declaration.sourceIndex - 1)?.payload?.CellFrom),
      valid = !!position;
    const ownStart = cell(at.get(declaration.sourceIndex - 1)?.payload?.CellTo);
    if (!same(position, ownStart) || !same(position, oldPlayer?.cell as Cell))
      continue;
    let i = declaration.sourceIndex + 1,
      moves = 0;
    for (; i < resume.afterSourceIndex; i += 3) {
      const s = at.get(i),
        m = at.get(i + 1),
        o = at.get(i + 2),
        to = cell(s?.payload?.CellTo);
      if (
        !step(s, actor, 1) ||
        !same(position, cell(s!.payload?.CellFrom)) ||
        !to ||
        !position ||
        Math.max(Math.abs(to.x - position.x), Math.abs(to.y - position.y)) !==
          1 ||
        m?.sourceTag !== "ResultDoMove" ||
        !empty(m) ||
        !o ||
        !plainPickupMoveOutcome(o) ||
        ![m, o].every(
          (e) =>
            e.playerId === actor &&
            e.actionId === s!.actionId &&
            !e.attributionConflict &&
            e.actorTeamId === declaration.actorTeamId &&
            e.actorTeamSource !== "turn_inferred"
        )
      ) {
        valid = false;
        break;
      }
      if (
        !actualMoveGeometry(
          {
            ...before.board,
            teams: before.board.teams.map((t) => ({
              ...t,
              players: t.players.map((p) =>
                p.id === Number(actor) ? { ...p, cell: position! } : p
              )
            }))
          },
          Number(actor),
          position!,
          to
        )
      ) {
        valid = false;
        break;
      }
      position = to;
      moves++;
    }
    const wait = at.get(resume.afterSourceIndex);
    if (
      !valid ||
      moves < 1 ||
      moves > 16 ||
      i !== resume.afterSourceIndex ||
      !same(position, from) ||
      !wait ||
      !consistentNormalStandBy(wait, before.board, resume.board)
    )
      continue;
    const waiting = checkpointBefore(decision.sourceIndex!);
    if (
      !waiting ||
      waiting.afterSourceIndex !== question.sourceIndex ||
      ordinals.get(waiting) !== ordinals.get(resume)! + 1
    )
      continue;
    const terminal = teamMovementContinuity(
      [resume, waiting],
      context.checkpointAfter,
      question.sourceIndex!,
      decision.sourceIndex!,
      actor,
      context.actorCell,
      context.ordinaryMoveAvailability,
      epochs
    );
    if (terminal === undefined) continue;
    found.set(final.id, {
      declarationSourceId: declaration.id,
      declarationCheckpointAfter: before.afterSourceIndex,
      resumeCheckpointAfter: resume.afterSourceIndex,
      successRushSourceId: success.id,
      doMoveSourceId: doMove.id,
      moveOutcomeSourceId: outcome.id,
      questionSourceId: question.id,
      decisionSourceId: decision.id,
      waitingCheckpointAfter: terminal,
      from,
      via,
      destination
    });
  }
  return found;
}
export function attachRetainedRushMoves(
  proofs: ReadonlyMap<string, RetainedRushContext>,
  events: ReadonlyMap<string, LuckEvent>
) {
  for (const [source, proof] of proofs) {
    const e = events.get(source),
      m = e?.metadata;
    if (
      !e ||
      !m ||
      e.scoringStatus !== "scored" ||
      e.actualSuccess !== false ||
      m.rollType !== 1 ||
      m.rerollUsed !== false ||
      m.teamRerollsSpent !== 0 ||
      m.rerollResource !== undefined ||
      m.rerollSkill ||
      m.lonerGate ||
      m.proGate ||
      !m.movementFall ||
      m.movementFall.combinedRushSourceId ||
      m.rerollQuestionId !== proof.questionSourceId ||
      m.rerollDecisionId !== proof.decisionSourceId ||
      e.probabilitySuccess !== 5 / 6 ||
      e.contextualImpact ||
      e.contextualBounds ||
      e.possessionBounds ||
      e.catchPossessionBounds
    )
      continue;
    const bounds = estimateKeptRushMoveBounds(
      m.preRoll,
      5 / 6,
      proof.waitingCheckpointAfter
    );
    if (!bounds) continue;
    m.retainedRushContext = proof;
    e.contextualBounds = bounds;
    const outcome = events.get(proof.moveOutcomeSourceId),
      move = events.get(proof.doMoveSourceId);
    if (outcome) {
      outcome.label = "Recorded movement after a fresh Rush";
      outcome.statusReason =
        "The prior fresh Rush's confirmed move links the next original Rush to its observed square; it adds no die or context contribution.";
    }
    if (move) move.label = "Recorded move after a fresh Rush";
  }
}
