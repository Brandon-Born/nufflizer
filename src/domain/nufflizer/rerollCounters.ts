import type { ReplayBoardCheckpoint } from "@/domain/replay/boardState";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import { observedActorRoster } from "@/domain/replay/observedActorRoster";
import type { LuckEvent } from "./types";

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
  let cursor = 0,
    last: ReplayBoardCheckpoint | undefined;
  let step: ReplayEvent | undefined;
  let pending:
    | {
        question: ReplayEvent;
        before: Observation;
        gamer: 0 | 1;
        canUse: boolean;
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
    if (event.sourceTag === "QuestionTeamRerollUsage") {
      pending = undefined;
      const gamer = event.payload?.GamerId,
        canUse = event.payload?.CanUseTeamReroll;
      if (
        !event.id ||
        !event.playerId ||
        step?.actionId !== event.actionId ||
        step?.payload?.IsEvaluation !== 0 ||
        (gamer !== 0 && gamer !== 1) ||
        (canUse !== 0 && canUse !== 1) ||
        event.stepTag !== "PlayerStep" ||
        event.stepActorId !== event.playerId ||
        event.actorTeamSource === "turn_inferred" ||
        event.attributionConflict ||
        (event.teamId && event.teamId !== event.actorTeamId)
      )
        continue;
      const before = observation(last, event, gamer, knownTeamIds);
      if (before)
        pending = { question: event, before, gamer, canUse: canUse === 1 };
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
      current.count !== q.before.count
    )
      continue;
    // Only the first following checkpoint may corroborate the decision. Never
    // skip an unknown observation or borrow a later turn's reset counter.
    const next = checkpoints[cursor];
    let after = observation(next, event, q.gamer, knownTeamIds);
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
      decision.scoringStatus !== "excluded"
    )
      continue;
    const { gamerId, canUseTeamReroll, ...evidence } = proof;
    question.metadata.rerollOffer = { gamerId, canUseTeamReroll };
    decision.metadata.teamRerollDecision = { gamerId, used: proof.spent === 1 };
    decision.metadata.teamRerollCounter = evidence;
    decision.label = proof.spent
      ? "Recorded team reroll used"
      : "Recorded team reroll declined";
    decision.statusReason =
      "observed: team reroll decision and checkpoint counters; no additional random outcome or tactical value";
  }
}
