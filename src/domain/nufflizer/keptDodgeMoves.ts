import type { ReplayModel, ReplayEvent } from "@/domain/replay/types";
import type { PreRollEvidence } from "@/domain/replay/reconstructContext";
import type { ActivationEnd } from "@/domain/replay/activationEnds";
import { checkpointClockEpochs } from "@/domain/replay/boardState";
import {
  sameMovementActor,
  failedMovementOffer
} from "@/domain/replay/teamRerollMovement";
import { unmodifiedD6Check } from "@/domain/replay/numericCheck";
import { teamMovementContinuity } from "@/domain/replay/teamMovementContinuity";
import { findMovementFall } from "./movementConsequences";
import { estimateKeptDodgeMoveBounds } from "./contextImpact";
import type { LuckEvent } from "./types";
export type KeptDodgeContext = {
  declarationSourceId: string;
  questionSourceId: string;
  decisionSourceId: string;
  waitingCheckpointAfter: number;
  threshold: number;
};
function die(e: ReplayEvent) {
  return (e.payload?.Dice as { Die?: { Value?: number } } | undefined)?.Die
    ?.Value;
}
function cell(value: unknown) {
  const c = value as { X?: number; Y?: number } | undefined;
  return Number.isInteger(c?.X) && Number.isInteger(c?.Y)
    ? { x: c!.X!, y: c!.Y! }
    : undefined;
}
const same = (a: ReturnType<typeof cell>, b: ReturnType<typeof cell>) =>
  !!a && !!b && a.x === b.x && a.y === b.y;
// Qualify only the teammate component. Waiting observations corroborate the
// original frame; they never restore omitted playable state or fresh eligibility.
export function findKeptDodgeContexts(
  replay: ReplayModel,
  contexts: ReadonlyMap<string, PreRollEvidence>,
  ends: ReadonlyMap<string, ActivationEnd>
) {
  const found = new Map<string, KeptDodgeContext>();
  if (replay.replayVersion !== "1-4-0-0") return found;
  const all = replay.turns.flatMap((t) => t.events),
    byId = new Map(all.map((e) => [e.id, e])),
    at = new Map(all.map((e) => [e.sourceIndex, e]));
  const steps = new Map(
    all.filter((e) => e.sourceTag === "PlayerStep").map((e) => [e.actionId, e])
  );
  const checkpoints = replay.boardCheckpoints ?? [],
    epochs = checkpointClockEpochs(checkpoints),
    ordinal = new Map(checkpoints.map((c, i) => [c, i]));
  const before = (index: number) => {
    let lo = 0,
      hi = checkpoints.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (checkpoints[mid]!.afterSourceIndex < index) lo = mid + 1;
      else hi = mid;
    }
    return checkpoints[lo - 1];
  };
  const checkpointByIndex = new Map(
    checkpoints.map((c) => [c.afterSourceIndex, c])
  );
  for (const turn of replay.turns) {
    const fall = findMovementFall(turn);
    if (!fall || fall.skillOriginalId || fall.evidence.combinedRushSourceId)
      continue;
    const final = byId.get(fall.rollSourceId);
    if (!final?.id || final.sourceIndex === undefined || !final.playerId)
      continue;
    const choice = at.get(final.sourceIndex - 1),
      question = at.get(final.sourceIndex - 4),
      context = question?.id ? contexts.get(question.id) : undefined;
    const offer = question ? failedMovementOffer(question) : undefined;
    const declaration = context?.activationId
      ? byId.get(context.activationId)
      : undefined;
    const originalStep = question ? steps.get(question.actionId) : undefined,
      finalStep = steps.get(final.actionId);
    // Check the original-die shape with the shared strict validator, then
    // require the actual kept summary to be Status1/NewRoll0 below.
    const threshold = unmodifiedD6Check(
      { ...final, payload: { ...final.payload, NewRoll: 1 } },
      2,
      1,
      false
    );
    if (
      !threshold ||
      !question?.id ||
      !choice?.id ||
      !context?.ordinaryMoveAvailability?.unknownPlayerIds.length ||
      context.ordinaryMoveAvailability.unknownPlayerIds.length +
        context.ordinaryMoveAvailability.knownAvailablePlayerIds.length >=
        64 ||
      context.teamTurn === null ||
      context.actorCarriesBall !== false ||
      context.activeTeamId !== final.actorTeamId ||
      !context.movementCheckLinked ||
      !declaration?.id ||
      declaration.sourceIndex === undefined ||
      declaration.sourceTag !== "ResultUseAction" ||
      declaration.actionCode !== 1 ||
      declaration.payload?.Action !== 1 ||
      declaration.stepType !== 0 ||
      declaration.playerId !== final.playerId ||
      declaration.actorTeamId !== final.actorTeamId ||
      declaration.actorTeamSource === "turn_inferred" ||
      declaration.attributionConflict ||
      declaration.sourceIndex >= question.sourceIndex! ||
      offer?.family !== 2 ||
      offer.threshold !== threshold ||
      offer.markerPlayerIds.length ||
      offer.baseTarget !== threshold ||
      final.payload?.Status !== 1 ||
      final.payload.NewRoll !== 0 ||
      (
        question.payload?.RollInfos as
          { Dice?: { Die?: { Value?: number } } } | undefined
      )?.Dice?.Die?.Value !== die(final) ||
      choice.sourceTag !== "ResultTeamRerollUsage" ||
      choice.payload?.Used !== 0 ||
      choice.payload.GamerId !== question.payload?.GamerId ||
      Object.keys(choice.payload).some(
        (k) => !["Used", "GamerId"].includes(k)
      ) ||
      !sameMovementActor(final, question) ||
      !sameMovementActor(final, choice) ||
      ![originalStep, finalStep].every(
        (s) =>
          s?.sourceTag === "PlayerStep" &&
          s.stepType === 1 &&
          s.stepActorId === final.playerId &&
          s.payload?.Skill === 0 &&
          s.payload.IsEvaluation === 0 &&
          !s.attributionConflict
      ) ||
      !same(
        cell(originalStep!.payload?.CellFrom),
        cell(finalStep!.payload?.CellFrom)
      ) ||
      !same(
        cell(originalStep!.payload?.CellTo),
        cell(finalStep!.payload?.CellTo)
      ) ||
      !same(
        cell(originalStep!.payload?.CellFrom),
        context.actorCell ?? undefined
      ) ||
      !same(
        cell(originalStep!.payload?.CellTo),
        context.ordinaryMoveAvailability.successDestination
      )
    )
      continue;
    const original = checkpointByIndex.get(context.checkpointAfter),
      waiting = before(choice.sourceIndex!),
      declFrame = before(declaration.sourceIndex);
    if (
      !original ||
      !waiting ||
      !declFrame ||
      waiting.afterSourceIndex !== question.sourceIndex ||
      ordinal.get(waiting) !== ordinal.get(original)! + 1 ||
      epochs.get(original) !== epochs.get(declFrame)
    )
      continue;
    // Only completions the existing reducer still certifies in this clock
    // epoch may override stale CanAct/MovePoint observations at the wait.
    const completed = new Map(
      (context.endedActivationSourceIds ?? []).flatMap((id) => {
        const end = ends.get(id);
        return end?.kind === "ordinary_move_completed" &&
          end.teamId === final.actorTeamId &&
          end.teamTurn === context.teamTurn &&
          end.checkpointAfter <= context.checkpointAfter &&
          end.sourceIndex < question.sourceIndex!
          ? [[end.actorId, end.actorCell] as const]
          : [];
      })
    );
    const terminal = teamMovementContinuity(
      [original, waiting],
      context.checkpointAfter,
      question.sourceIndex!,
      choice.sourceIndex!,
      final.playerId,
      context.actorCell,
      context.ordinaryMoveAvailability,
      epochs,
      completed
    );
    if (terminal !== undefined)
      found.set(final.id, {
        declarationSourceId: declaration.id,
        questionSourceId: question.id,
        decisionSourceId: choice.id,
        waitingCheckpointAfter: terminal,
        threshold
      });
  }
  return found;
}
export function attachKeptDodgeMoves(
  proofs: ReadonlyMap<string, KeptDodgeContext>,
  events: ReadonlyMap<string, LuckEvent>
) {
  for (const [id, p] of proofs) {
    const e = events.get(id),
      m = e?.metadata;
    if (
      !e ||
      !m ||
      e.scoringStatus !== "scored" ||
      e.actualSuccess !== false ||
      m.rollType !== 2 ||
      m.rerollUsed !== false ||
      m.teamRerollsSpent !== 0 ||
      m.rerollResource !== undefined ||
      m.rerollSkill ||
      m.lonerGate ||
      m.proGate ||
      !m.movementFall ||
      m.movementFall.combinedRushSourceId ||
      m.rerollQuestionId !== p.questionSourceId ||
      m.rerollDecisionId !== p.decisionSourceId ||
      m.preRoll?.activationId !== p.declarationSourceId ||
      m.requirement !== p.threshold ||
      m.difficulty !== p.threshold ||
      (m.modifiers?.length ?? 0) !== 0 ||
      e.probabilitySuccess !== (7 - p.threshold) / 6 ||
      e.contextualImpact ||
      e.contextualBounds ||
      e.possessionBounds ||
      e.catchPossessionBounds
    )
      continue;
    e.contextualBounds = estimateKeptDodgeMoveBounds(
      m.preRoll,
      (7 - p.threshold) / 6,
      p.waitingCheckpointAfter
    );
  }
}
