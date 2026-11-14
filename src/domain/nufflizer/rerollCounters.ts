import type { ReplayBoardCheckpoint } from "@/domain/replay/boardState";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import { observedActorRoster } from "@/domain/replay/observedActorRoster";
import type { LuckEvent } from "./types";
import {
  recordedResourceEndNotifications,
  resourceEndIndex,
  resourceClockSegments,
  resourceClockSnapshotKey
} from "./rerollResourceFlow";

export type RerollCounterEvidence = NonNullable<
  LuckEvent["metadata"]["teamRerollCounter"]
>;
type Observation = RerollCounterEvidence["before"];
type Proof = RerollCounterEvidence & {
  gamerId: 0 | 1;
  canUseTeamReroll: boolean;
};

// These are explicit counter observations, not a resource simulator. Missing
// zero/defaults, free-reroll policies and phase resets are never supplied.
function observation(
  checkpoint: ReplayBoardCheckpoint | undefined,
  actor: ReplayEvent,
  gamer: 0 | 1,
  knownTeamIds: readonly string[]
): Observation | undefined {
  const board = checkpoint?.board;
  if (
    !checkpoint ||
    !board ||
    checkpoint.status !== "observed" ||
    board.issues.length ||
    board.phaseCode !== 5 ||
    board.activeGamerId !== gamer ||
    checkpoint.replayStep === null ||
    checkpoint.childIndex === null
  )
    return;
  const team = board.teams.find((t) => t.rosterIndex === board.activeTeamIndex);
  if (
    !team ||
    !actor.playerId ||
    !actor.actorTeamId ||
    observedActorRoster(
      board,
      Number(actor.playerId),
      actor.actorTeamId,
      knownTeamIds
    ) !== team ||
    team.explicitTeamId === null ||
    String(team.explicitTeamId) !== actor.actorTeamId ||
    team.rosterIndex !== gamer ||
    team.players.filter((p) => String(p.id) === actor.playerId).length !== 1 ||
    board.teams.some(
      (t) =>
        t !== team && t.players.some((p) => String(p.id) === actor.playerId)
    ) ||
    team.gameTurn === null ||
    team.gameTurn < 1 ||
    team.rerolls === null ||
    team.rerolls < 0 ||
    team.rerolls > 16 ||
    !Number.isInteger(team.rerolls) ||
    (board.periodCode !== null && ![0, 1, 2].includes(board.periodCode))
  )
    return;
  return {
    checkpointAfter: checkpoint.afterSourceIndex,
    replayStep: checkpoint.replayStep,
    childIndex: checkpoint.childIndex,
    teamId: String(team.explicitTeamId),
    teamTurn: team.gameTurn,
    periodCode: board.periodCode,
    count: team.rerolls
  };
}
function sameActor(a: ReplayEvent, b: ReplayEvent) {
  return (
    !!a.playerId &&
    a.playerId === b.playerId &&
    a.stepActorId === a.playerId &&
    b.stepActorId === a.playerId &&
    a.stepTag === "PlayerStep" &&
    b.stepTag === "PlayerStep" &&
    a.stepType === b.stepType &&
    a.targetId === b.targetId &&
    a.stepTargetId === b.stepTargetId &&
    !!a.actorTeamId &&
    a.actorTeamId === b.actorTeamId &&
    a.actorTeamSource !== "turn_inferred" &&
    b.actorTeamSource !== "turn_inferred" &&
    !a.attributionConflict &&
    !b.attributionConflict &&
    (!a.teamId || a.teamId === a.actorTeamId) &&
    (!b.teamId || b.teamId === b.actorTeamId)
  );
}

export function findRerollCounterEvidence(replay: ReplayModel) {
  const result = new Map<string, Proof>();
  if (replay.replayVersion !== "1-4-0-0") return result;
  const checkpoints = replay.boardCheckpoints ?? [];
  const knownTeamIds = replay.teams.map((t) => t.id);
  const events = replay.turns.flatMap((t) => t.events);
  const ends = recordedResourceEndNotifications(events),
    endIndex = resourceEndIndex(ends),
    segments = resourceClockSegments(checkpoints, ends);
  const clockBySource = new Map(checkpoints.map((cp, i) => [cp, segments[i]]));
  // A shared snapshot can include more than one decision (for example a Pro
  // choice followed by a team retry of that gate). It cannot independently
  // corroborate the decrement for either choice. Include malformed/unsupported
  // later choices as barriers too; never select only the understood spends.
  const nextChoices = new Map<ReplayEvent, ReplayEvent>();
  const previousChoices = new Map<ReplayEvent, ReplayEvent>();
  let nextChoice: ReplayEvent | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.sourceTag === "ResultTeamRerollUsage") {
      if (nextChoice) {
        nextChoices.set(e, nextChoice);
        previousChoices.set(nextChoice, e);
      }
      nextChoice = e;
    }
  }
  let cursor = 0,
    last: ReplayBoardCheckpoint | undefined;
  let step: ReplayEvent | undefined;
  let pending:
    | {
        question: ReplayEvent;
        before: Observation;
        gamer: 0 | 1;
        canUse: boolean;
        checkpoint: ReplayBoardCheckpoint;
      }
    | undefined;
  for (const event of events) {
    if (event.sourceIndex === undefined) {
      pending = undefined;
      continue;
    }
    while (
      cursor < checkpoints.length &&
      checkpoints[cursor]!.afterSourceIndex < event.sourceIndex
    )
      last = checkpoints[cursor++];
    if (event.sourceTag === "PlayerStep") step = event;
    if (
      event.sourceTag === "QuestionTeamRerollUsage" ||
      event.sourceTag === "QuestionBlockDice"
    ) {
      pending = undefined;
      const gamer = event.payload?.GamerId,
        canUse = event.payload?.CanUseTeamReroll;
      const blockOffer = event.sourceTag === "QuestionBlockDice";
      const fields = blockOffer
        ? [
            "RolledDiceIndexes",
            "Dice",
            "CanChoseDie",
            "GamerId",
            "DiceOutcomes",
            "CanUseTeamReroll",
            "AttackerChoice",
            "RollType",
            "RollStatus",
            "StModifiers",
            "Assists",
            "BrawlerDiceIndexes",
            "ProDiceIndexes",
            "StarSpecialRuleDiceIndexes"
          ]
        : [
            "GamerId",
            "CanUseProReroll",
            "CanUseTeamReroll",
            "StarSpecialRule",
            "RollInfos"
          ];
      if (
        !event.id ||
        !event.playerId ||
        step?.actionId !== event.actionId ||
        step?.payload?.IsEvaluation !== 0 ||
        (gamer !== 0 && gamer !== 1) ||
        (canUse !== 0 && canUse !== 1) ||
        Object.keys(event.payload ?? {}).some((k) => !fields.includes(k)) ||
        (blockOffer &&
          (event.payload?.AttackerChoice !== 1 ||
            event.payload.RollType !== 3 ||
            event.payload.RollStatus !== 1 ||
            event.payload.CanChoseDie !== 1 ||
            [
              "BrawlerDiceIndexes",
              "ProDiceIndexes",
              "StarSpecialRuleDiceIndexes"
            ].some(
              (k) => event.payload![k] !== undefined && event.payload![k] !== ""
            ) ||
            event.stepType !== 6)) ||
        event.stepTag !== "PlayerStep" ||
        event.stepActorId !== event.playerId ||
        event.actorTeamSource === "turn_inferred" ||
        event.attributionConflict ||
        (event.teamId && event.teamId !== event.actorTeamId)
      )
        continue;
      const before = observation(last, event, gamer, knownTeamIds);
      if (before)
        pending = {
          question: event,
          before,
          gamer,
          canUse: canUse === 1,
          checkpoint: last!
        };
      continue;
    }
    if (!pending) continue;
    if (event.sourceTag === "Carrier" && event.checkpointCarrier) continue;
    if (event.sourceTag === "PlayerStep" && sameActor(pending.question, event))
      continue;
    const p = event.payload,
      q = pending;
    pending = undefined;
    if (
      event.sourceTag !== "ResultTeamRerollUsage" ||
      !event.id ||
      step?.actionId !== event.actionId ||
      step?.payload?.IsEvaluation !== 0 ||
      !sameActor(q.question, event) ||
      p?.GamerId !== q.gamer ||
      (p.Used !== 0 && p.Used !== 1) ||
      (p.Used === 1 && !q.canUse) ||
      Object.keys(p).some((k) => !["GamerId", "Used"].includes(k))
    )
      continue;
    const current = observation(last, event, q.gamer, knownTeamIds);
    if (
      !current ||
      current.teamTurn !== q.before.teamTurn ||
      current.periodCode !== q.before.periodCode ||
      current.count !== q.before.count ||
      !last ||
      resourceClockSnapshotKey(q.checkpoint) !== resourceClockSnapshotKey(last)
    )
      continue;
    // Only the first following checkpoint may corroborate the decision. Never
    // skip an unknown observation or borrow a later turn's reset counter.
    const next = checkpoints[cursor];
    let after = observation(next, event, q.gamer, knownTeamIds);
    const previous = previousChoices.get(event);
    const previousIndexed =
      previous &&
      Number.isSafeInteger(previous.sourceIndex) &&
      previous.sourceIndex! >= 0;
    // A later menu snapshot can refresh the same count after an earlier
    // decision. Retain that actual receipt; an old equal value alone cannot
    // attribute a shared interval to this decision.
    const needsRefresh =
      (previousIndexed && previous.sourceIndex! > q.before.checkpointAfter) ||
      endIndex.crosses(q.before.checkpointAfter, current.checkpointAfter);
    const decisionBefore =
      needsRefresh &&
      !endIndex.unknown &&
      (!previous ||
        (previousIndexed &&
          current.checkpointAfter >= previous.sourceIndex!)) &&
      current.checkpointAfter > q.before.checkpointAfter
        ? current
        : undefined;
    const baseline = decisionBefore ?? q.before;
    if (
      previous &&
      (!previousIndexed || previous.sourceIndex! > baseline.checkpointAfter)
    )
      after = undefined;
    if (
      after &&
      (endIndex.unknown ||
        endIndex.crosses(baseline.checkpointAfter, next!.afterSourceIndex) ||
        clockBySource.get(last) !== clockBySource.get(next!))
    )
      after = undefined;
    const intervening = nextChoices.get(event);
    if (
      intervening &&
      (!Number.isSafeInteger(intervening.sourceIndex) ||
        intervening.sourceIndex! < 0 ||
        intervening.sourceIndex! <= (next?.afterSourceIndex ?? Infinity))
    )
      after = undefined;
    if (
      after &&
      (q.before.periodCode === null ||
        after.periodCode !== q.before.periodCode ||
        after.teamTurn !== q.before.teamTurn ||
        after.teamId !== q.before.teamId ||
        after.replayStep !== event.locator?.replayStep ||
        after.childIndex <= (event.locator?.childIndex ?? Infinity))
    )
      after = undefined;
    result.set(event.id, {
      questionSourceId: q.question.id!,
      spent: p.Used,
      before: q.before,
      ...(decisionBefore ? { decisionBefore } : {}),
      after,
      reconciliation: !after
        ? "after_unavailable"
        : after.count === q.before.count - p.Used
          ? "matched"
          : "mismatch",
      gamerId: q.gamer,
      canUseTeamReroll: q.canUse
    });
  }
  return result;
}

export function attachRerollCounterEvidence(
  proofs: ReadonlyMap<string, Proof>,
  sources: ReadonlyMap<string, LuckEvent>
) {
  for (const [source, proof] of proofs) {
    const decision = sources.get(source),
      question = sources.get(proof.questionSourceId);
    if (
      !decision ||
      !question ||
      decision.teamId !== proof.before.teamId ||
      question.teamId !== decision.teamId ||
      decision.playerId !== question.playerId ||
      decision.scoringStatus !== "excluded" ||
      (question.metadata.sourceTag === "QuestionBlockDice" &&
        (!question.metadata.block?.pool.attackerChooses ||
          question.metadata.block.chooserTeamId !== decision.teamId))
    )
      continue;
    const { gamerId, canUseTeamReroll, ...evidence } = proof;
    question.metadata.rerollOffer = {
      gamerId,
      canUseTeamReroll,
      decisionSourceId: source
    };
    decision.metadata.teamRerollDecision = { gamerId, used: proof.spent === 1 };
    decision.metadata.teamRerollCounter = evidence;
    decision.label = proof.spent
      ? "Recorded team reroll used"
      : canUseTeamReroll
        ? "Recorded team reroll declined"
        : "Recorded team reroll not used";
    decision.statusReason =
      "observed: team reroll decision and checkpoint counters; no additional random outcome or tactical value";
  }
}
