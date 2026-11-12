import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import { lastBoardCheckpointBefore } from "@/domain/replay/boardState";
import { observedActorRoster } from "@/domain/replay/observedActorRoster";
import { bounceAt } from "./ballConsequences";
import { estimateKeptCatchPossession } from "./contextImpact";
import { numericCheckExclusion } from "./numericCheckContract";
import type { LuckEvent } from "./types";

type Cell = { x: number; y: number };
function cell(value: unknown): Cell | undefined {
  const c = value as { X?: unknown; Y?: unknown } | undefined;
  return Number.isInteger(c?.X) &&
    Number.isInteger(c?.Y) &&
    Number(c?.X) >= 0 &&
    Number(c?.X) <= 25 &&
    Number(c?.Y) >= 0 &&
    Number(c?.Y) <= 14
    ? { x: Number(c!.X), y: Number(c!.Y) }
    : undefined;
}
const same = (a: Cell | undefined, b: Cell | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y;
const fields = (p: Record<string, unknown> | undefined, keys: string[]) =>
  !!p && Object.keys(p).every((k) => keys.includes(k));
const rollKeys = [
  "Status",
  "Requirement",
  "Modifiers",
  "Dice",
  "Difficulty",
  "RollType",
  "Outcome",
  "NewRoll"
];
function singleDie(p: Record<string, unknown> | undefined, type: 0 | 1) {
  const dice = p?.Dice as Record<string, unknown> | undefined;
  const die = dice?.Die as Record<string, unknown> | undefined;
  return (
    !!dice &&
    Object.keys(dice).join() === "Die" &&
    !Array.isArray(die) &&
    fields(die, ["DieType", "Value"]) &&
    die?.DieType === type &&
    Number.isInteger(die.Value) &&
    Number(die.Value) >= 1 &&
    Number(die.Value) <= (type === 0 ? 6 : 8)
  );
}
// Only the observed scatter + one opposing recorded modifier shape. Holding
// its effective target fixed does not certify current trait eligibility/range.
function recordedModifierPlayer(p: Record<string, unknown> | undefined) {
  const mods = p?.Modifiers as Record<string, unknown> | undefined;
  const nodes = mods?.Modifier as Record<string, unknown>[] | undefined;
  if (
    !mods ||
    Object.keys(mods).join() !== "Modifier" ||
    !Array.isArray(nodes) ||
    nodes.length !== 2
  )
    return;
  const [scatter, opponent] = nodes;
  if (
    !nodes.every(
      (n) =>
        fields(n, ["PlayerId", "Skill", "Effect", "Value", "ModifierType"]) &&
        n.Effect === -1 &&
        n.Value === -1
    ) ||
    scatter?.ModifierType !== 35 ||
    scatter.Skill !== -1 ||
    scatter.PlayerId !== -1 ||
    opponent?.ModifierType !== 27 ||
    opponent.Skill !== 33 ||
    !Number.isSafeInteger(opponent.PlayerId) ||
    Number(opponent.PlayerId) < 0
  )
    return;
  return Number(opponent.PlayerId);
}
function catchStep(e: ReplayEvent, actor: string, at: Cell, state: 1 | 2) {
  return (
    e.sourceTag === "PlayerStep" &&
    e.stepType === 4 &&
    e.stepActorId === actor &&
    e.payload?.PlayerId === Number(actor) &&
    e.payload.StepType === 4 &&
    e.payload.TargetId === -1 &&
    e.payload.Skill === 0 &&
    e.payload.IsEvaluation === 0 &&
    e.payload.State === state &&
    fields(e.payload, [
      "Probability",
      "PlayerId",
      "TargetId",
      "IsEvaluation",
      "StepType",
      "CellTo",
      "State",
      "CellFrom",
      "Skill"
    ]) &&
    same(cell(e.payload.CellFrom), at) &&
    same(cell(e.payload.CellTo), at)
  );
}
function owned(e: ReplayEvent, actor: string, team: string) {
  return (
    e.playerId === actor &&
    e.stepActorId === actor &&
    e.actorTeamId === team &&
    e.actorTeamSource !== "turn_inferred" &&
    !e.attributionConflict &&
    (!e.teamId || e.teamId === team) &&
    e.targetId === "-1"
  );
}
function retained(e: LuckEvent | undefined, type: 4 | 7) {
  return (
    e?.scoringStatus === "scored" &&
    e.actualSuccess === false &&
    e.metadata.probabilityPolicy === "single_attempt" &&
    e.metadata.rollType === type &&
    e.metadata.rerollUsed === false &&
    e.metadata.teamRerollsSpent === 0 &&
    e.metadata.rerollResource === undefined &&
    !!e.metadata.rerollQuestionId &&
    !!e.metadata.rerollDecisionId
  );
}

// A physical first-bounce bridge across two recorded waits. It deliberately
// does not restore an activation, eligibility, holder flags or a complete board.
// The envelope is before the ORIGINAL die under a fixed keep-on-failure policy,
// never a new random draw at the later decision/kept-result summary.
export function attachRetainedCatchPossession(
  replay: ReplayModel,
  sources: ReadonlyMap<string, LuckEvent>
) {
  if (replay.replayVersion !== "1-4-0-0") return;
  const checkpoints = replay.boardCheckpoints ?? [];
  const teamIds = replay.teams.map((t) => t.id);
  for (const turn of replay.turns) {
    const raw = turn.events;
    for (let i = 0; i + 9 < raw.length; i++) {
      const pickup = raw[i]!,
        openingStep = raw[i + 1]!,
        opening = raw[i + 2]!,
        start = raw[i + 3]!,
        question = raw[i + 4]!,
        continuation = raw[i + 5]!,
        decision = raw[i + 6]!,
        kept = raw[i + 7]!,
        following = raw[i + 9]!;
      const p = sources.get(pickup.id ?? ""),
        caught = sources.get(kept.id ?? ""),
        first = sources.get(opening.id ?? ""),
        next = sources.get(following.id ?? "");
      const group = p?.metadata.pickupBallChain,
        actor = kept.playerId,
        team = kept.actorTeamId;
      if (
        !retained(p, 4) ||
        !retained(caught, 7) ||
        !actor ||
        !team ||
        p?.teamId !== team ||
        caught?.teamId !== team ||
        !group ||
        group.catchEventIds[0] !== caught.id ||
        group.bounceSourceIds[0] !== opening.id ||
        group.bounceSourceIds[1] !== following.id ||
        !first?.metadata.ballTravel ||
        !next?.metadata.ballTravel ||
        caught.metadata.rerollQuestionId !== question.id ||
        caught.metadata.rerollDecisionId !== decision.id ||
        !pickup.sequenceId ||
        !kept.sequenceId ||
        pickup.sequenceId === kept.sequenceId ||
        raw
          .slice(i, i + 10)
          .some(
            (e, n) =>
              e.sourceIndex !== pickup.sourceIndex! + n ||
              e.sequenceId !== (n < 5 ? pickup.sequenceId : kept.sequenceId)
          )
      )
        continue;
      const at = first.metadata.ballTravel.to,
        origin = first.metadata.ballTravel.from;
      const a = bounceAt(raw, i + 1, origin),
        b = bounceAt(raw, i + 8, at);
      if (
        !a ||
        !b ||
        openingStep.actionId !== opening.actionId ||
        !same(a.to, at) ||
        !catchStep(start, actor, at, 1) ||
        !catchStep(continuation, actor, at, 2) ||
        start.actionId !== question.actionId ||
        continuation.actionId !== kept.actionId ||
        decision.actionId !== kept.actionId ||
        ![question, decision, kept].every((e) => owned(e, actor, team)) ||
        question.sourceTag !== "QuestionTeamRerollUsage" ||
        decision.sourceTag !== "ResultTeamRerollUsage" ||
        question.stepType !== 4 ||
        decision.stepType !== 4 ||
        kept.stepType !== 4 ||
        !fields(question.payload, [
          "GamerId",
          "CanUseProReroll",
          "CanUseTeamReroll",
          "StarSpecialRule",
          "RollInfos"
        ]) ||
        !fields(decision.payload, ["GamerId", "Used"]) ||
        decision.payload?.Used !== 0 ||
        ![0, 1].includes(Number(question.payload?.GamerId)) ||
        String(question.payload?.GamerId) !== team ||
        question.payload?.GamerId !== decision.payload?.GamerId ||
        question.payload?.CanUseTeamReroll !== 1 ||
        question.payload.CanUseProReroll !== 0 ||
        question.payload.StarSpecialRule !== -1
      )
        continue;
      const original = question.payload.RollInfos as
        Record<string, unknown> | undefined;
      if (
        !fields(original, rollKeys) ||
        !fields(kept.payload, rollKeys) ||
        !singleDie(original, 0) ||
        recordedModifierPlayer(original) === undefined ||
        original?.Status !== 1 ||
        original.NewRoll !== 1 ||
        original.RollType !== 7 ||
        original.Outcome !== 0 ||
        kept.payload?.Status !== 1 ||
        kept.payload.NewRoll !== 0 ||
        kept.payload.Outcome !== 0 ||
        kept.payload.RollType !== 7 ||
        numericCheckExclusion(
          replay.replayVersion,
          { ...kept, payload: original },
          false
        ) ||
        numericCheckExclusion(replay.replayVersion, kept, false, true) ||
        rollKeys
          .filter((k) => k !== "NewRoll")
          .some(
            (k) =>
              JSON.stringify(original[k]) !== JSON.stringify(kept.payload![k])
          )
      )
        continue;
      // Ordinary BallStep and recorded effective modifiers only. No new modifier
      // calculator or unchosen skill eligibility is inferred by this component.
      if (
        [openingStep, raw[i + 8]!].some(
          (e) =>
            !fields(e.payload, [
              "IsEvaluation",
              "StepType",
              "CellFrom",
              "CellTo",
              "State",
              "BallId",
              "Probability"
            ])
        ) ||
        [opening, following].some(
          (e) =>
            !fields(e.payload, rollKeys) ||
            !singleDie(e.payload, 1) ||
            e.payload?.Difficulty !== 0 ||
            e.payload.Requirement !== 0 ||
            (e.payload.Modifiers !== "" && e.payload.Modifiers !== undefined)
        )
      )
        continue;
      const before = lastBoardCheckpointBefore(
          checkpoints,
          pickup.sourceIndex!
        ),
        wait = lastBoardCheckpointBefore(checkpoints, decision.sourceIndex!);
      const board = before?.board,
        waiting = wait?.board;
      const pickupQuestion = sources.get(p!.metadata.rerollQuestionId!);
      if (
        !board ||
        !waiting ||
        before!.status !== "observed" ||
        wait!.status !== "observed" ||
        before!.afterSourceIndex !== pickupQuestion?.metadata.sourceIndex ||
        wait!.afterSourceIndex !== question.sourceIndex ||
        before!.replayStep !== pickupQuestion.metadata.locator?.replayStep ||
        before!.childIndex !==
          (pickupQuestion.metadata.locator?.childIndex ?? -2) + 1 ||
        wait!.replayStep !== question.locator?.replayStep ||
        wait!.childIndex !== (question.locator?.childIndex ?? -2) + 1 ||
        checkpoints.filter(
          (c) =>
            c.afterSourceIndex >= before!.afterSourceIndex &&
            c.afterSourceIndex < kept.sourceIndex!
        ).length !== 2 ||
        board.phaseCode !== 5 ||
        board.issues.length ||
        waiting.issues.length ||
        JSON.stringify({ ...board, ball: undefined }) !==
          JSON.stringify({ ...waiting, ball: undefined }) ||
        !same(cell({ X: board.ball.cell.x, Y: board.ball.cell.y }), origin) ||
        !same(cell({ X: waiting.ball.cell.x, Y: waiting.ball.cell.y }), at) ||
        [board, waiting].some(
          (x) => x.ball.carrierId !== null || x.ball.isHeld === true
        )
      )
        continue;
      const owner = observedActorRoster(board, Number(actor), team, teamIds),
        receiver = owner?.players.find((x) => x.id === Number(actor));
      const players = board.teams.flatMap((t) => t.players),
        onPitch = players.filter((x) => x.pitchLocation === "on_pitch");
      const modifierPlayer = recordedModifierPlayer(original);
      if (
        !board.teams.some(
          (t) =>
            t !== owner &&
            t.players.some(
              (p) => p.id === modifierPlayer && p.pitchLocation === "on_pitch"
            )
        ) ||
        !receiver ||
        receiver.pitchLocation !== "on_pitch" ||
        receiver.cell.x !== at.x ||
        receiver.cell.y !== at.y ||
        receiver.mentalEffect ||
        (receiver.statusCode !== null && receiver.statusCode !== 0) ||
        (receiver.situationCode !== null && receiver.situationCode !== 0) ||
        players.some((x) => x.id === null || x.pitchLocation === "unknown") ||
        new Set(players.map((x) => x.id)).size !== players.length ||
        new Set(onPitch.map((x) => `${x.cell.x},${x.cell.y}`)).size !==
          onPitch.length
      )
        continue;
      caught!.metadata.retainedCatchReaction = {
        pickupSourceId: pickup.id!,
        bounceSourceId: opening.id!,
        questionSourceId: question.id!,
        decisionSourceId: decision.id!,
        followingBounceSourceId: following.id!,
        beforeCheckpointAfter: before!.afterSourceIndex,
        waitingCheckpointAfter: wait!.afterSourceIndex
      };
      caught!.catchPossessionBounds = estimateKeptCatchPossession(
        caught!.probabilitySuccess!
      );
    }
  }
}
