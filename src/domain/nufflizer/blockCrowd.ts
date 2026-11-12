import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import {
  checkpointClockEpochs,
  lastBoardCheckpointBefore
} from "@/domain/replay/boardState";
import { observedActorRoster } from "@/domain/replay/observedActorRoster";
import type { ObservedBlockConsequence } from "./blockConsequences";
import type { LuckEvent } from "./types";

type Cell = { x: number; y: number };
function cell(value: unknown): Cell | undefined {
  const c = value as { X?: unknown; Y?: unknown } | undefined;
  return Number.isSafeInteger(c?.X) && Number.isSafeInteger(c?.Y)
    ? { x: Number(c!.X), y: Number(c!.Y) }
    : undefined;
}
const same = (a: Cell | undefined, b: Cell | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y;
const fields = (p: Record<string, unknown> | undefined, keys: string[]) =>
  !!p && Object.keys(p).every((k) => keys.includes(k));
export const pitchCell = (c: Cell) =>
  c.x >= 0 && c.x <= 25 && c.y >= 0 && c.y <= 14;
export const crowdCell = (c: Cell) =>
  ((c.x === -1 || c.x === 26) && c.y >= 0 && c.y <= 14) ||
  ((c.y === -1 || c.y === 15) && c.x >= 0 && c.x <= 25);
function removal(e: ReplayEvent | undefined, subject: string, reason: 0 | 1) {
  return (
    e?.sourceTag === "ResultPlayerRemoval" &&
    e.playerId === subject &&
    !e.attributionConflict &&
    e.payload?.PlayerId === Number(subject) &&
    e.payload.Reason === reason &&
    fields(e.payload, ["PlayerId", "Situation", "Reason", "Status"]) &&
    (reason === 1
      ? e.payload.Situation === 1 && e.payload.Status === 0
      : (e.payload.Situation === 1 && e.payload.Status === 0) ||
        (e.payload.Situation === 2 && e.payload.Status === 3))
  );
}
function injury(e: ReplayEvent | undefined, subject: string) {
  const p = e?.payload,
    d = p?.Dice as
      { Die?: { DieType?: unknown; Value?: unknown }[] } | undefined;
  return (
    e?.sourceTag === "ResultInjuryRoll" &&
    e.playerId === subject &&
    e.targetId === subject &&
    !e.attributionConflict &&
    e.damageSource === 2 &&
    e.rollType === 11 &&
    e.stepType === 2 &&
    p?.Source === 2 &&
    p.Status === 1 &&
    p.RollType === 11 &&
    (p.Outcome === 0 || p.Outcome === 2) &&
    fields(p, [
      "Status",
      "Modifiers",
      "Dice",
      "Source",
      "RollType",
      "Outcome"
    ]) &&
    (p.Modifiers === "" || p.Modifiers === undefined) &&
    !!d &&
    Object.keys(d).join() === "Die" &&
    Array.isArray(d.Die) &&
    d.Die.length === 2 &&
    d.Die.every(
      (x) =>
        fields(x as Record<string, unknown>, ["DieType", "Value"]) &&
        x.DieType === 0 &&
        Number.isInteger(x.Value) &&
        Number(x.Value) >= 1 &&
        Number(x.Value) <= 6
    )
  );
}

// Observed direct-defender crowd aftermath only. No hypothetical push choice,
// injury distribution, general removal-reason rule or playable-board restoration.
export function attachBlockCrowd(
  replay: ReplayModel,
  sources: ReadonlyMap<string, LuckEvent>,
  consequences: readonly ObservedBlockConsequence[]
) {
  if (replay.replayVersion !== "1-4-0-0") return;
  const checkpoints = replay.boardCheckpoints ?? [],
    epochs = checkpointClockEpochs(checkpoints),
    teamIds = replay.teams.map((t) => t.id);
  const raw = new Map(
    replay.turns
      .flatMap((t) => t.events)
      .flatMap((e) => (e.id ? [[e.id, e] as const] : []))
  );
  for (const fact of consequences) {
    const pool = sources.get(fact.poolSourceId),
      final = raw.get(fact.finalSourceId);
    if (
      pool?.scoringStatus !== "scored" ||
      !pool.metadata.block ||
      !final ||
      !["push", "defender_pushed_down"].includes(fact.outcome)
    )
      continue;
    const { attackerId, defenderId, defenderTeamId } = pool.metadata.block;
    if (!defenderTeamId || defenderTeamId === pool.teamId) continue;
    const pbs = final.payload?.Pushbacks as
      { ResultPushBack?: Record<string, unknown> } | undefined;
    const p = pbs?.ResultPushBack,
      from = cell(p?.CellFrom),
      to = cell(p?.CellTo);
    if (
      !pbs ||
      Object.keys(pbs).join() !== "ResultPushBack" ||
      Array.isArray(p) ||
      !from ||
      !to ||
      !pitchCell(from) ||
      !crowdCell(to) ||
      Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) !== 1 ||
      p?.PushedPlayerId !== Number(defenderId) ||
      p.Resolution !== 3 ||
      !fields(p, ["CellFrom", "CellTo", "Resolution", "PushedPlayerId"])
    )
      continue;
    const turn = replay.turns.find((t) => t.events.includes(final))!;
    const index = turn.events.indexOf(final),
      prefix = turn.events.slice(Math.max(0, index - 256), index);
    const pushes = prefix.filter(
      (e) =>
        (e.sourceIndex ?? -1) > (pool.metadata.sourceIndex ?? Infinity) &&
        e.sourceTag === "ResultPushBack" &&
        e.stepType === 6 &&
        e.stepActorId === attackerId &&
        e.stepTargetId === defenderId &&
        !e.attributionConflict &&
        JSON.stringify(e.payload) === JSON.stringify(p)
    );
    if (pushes.length !== 1) continue;
    const push = pushes[0]!,
      initial = turn.events[index + 1];
    let next = index + 2;
    if (
      !removal(initial, defenderId, 1) ||
      initial?.actionId !== final.actionId ||
      initial.actorTeamId !== defenderTeamId ||
      initial.actorTeamSource === "turn_inferred"
    )
      continue;
    const move = turn.events[next];
    if (move?.sourceTag === "ResultMoveOutcome") {
      if (
        move.actionId !== final.actionId ||
        move.playerId !== attackerId ||
        move.attributionConflict ||
        move.payload?.Moved !== 0 ||
        move.payload.TentacleUsed !== 0 ||
        move.payload.FumbleRooskieUsed !== 0 ||
        (move.payload.Rolls !== "" && move.payload.Rolls !== undefined) ||
        JSON.stringify(move.payload.Pushbacks) !==
          JSON.stringify(final.payload?.Pushbacks) ||
        !fields(move.payload, [
          "TentacleUsed",
          "Moved",
          "Rolls",
          "Pushbacks",
          "FumbleRooskieUsed"
        ])
      )
        continue;
      next++;
    }
    const step = turn.events[next]!,
      a = turn.events[next + 1],
      b = turn.events[next + 2],
      end = turn.events[next + 3];
    const wound = injury(a, defenderId)
      ? a
      : injury(b, defenderId)
        ? b
        : undefined;
    const terminal = wound === a ? b : a;
    if (
      !step ||
      !wound ||
      !terminal ||
      !removal(terminal, defenderId, 0) ||
      step.sourceTag !== "DamageStep" ||
      step.stepType !== 2 ||
      step.damageSource !== 2 ||
      step.playerId !== defenderId ||
      step.targetId !== defenderId ||
      step.actorTeamId !== defenderTeamId ||
      step.actorTeamSource === "turn_inferred" ||
      step.attributionConflict ||
      step.payload?.Applied !== 1 ||
      step.payload.IsEvaluation !== 0 ||
      step.payload.Skill !== 0 ||
      step.payload.State !== 2 ||
      !same(cell(step.payload.CellFrom), to) ||
      !same(cell(step.payload.CellTo), to) ||
      !fields(step.payload, [
        "Applied",
        "Probability",
        "Source",
        "PlayerId",
        "TargetId",
        "IsEvaluation",
        "StepType",
        "CellTo",
        "State",
        "CellFrom",
        "Skill"
      ]) ||
      step.locator?.stepIndex !== (final.locator?.stepIndex ?? -2) + 1 ||
      [wound, terminal].some(
        (e) =>
          e.actionId !== step.actionId ||
          e.actorTeamId !== defenderTeamId ||
          e.actorTeamSource === "turn_inferred"
      ) ||
      turn.events
        .slice(index, index + (next - index) + 3)
        .some(
          (e, n) =>
            e.sourceIndex !== final.sourceIndex! + n ||
            e.sequenceId !== final.sequenceId
        )
    )
      continue;
    const before = lastBoardCheckpointBefore(checkpoints, push.sourceIndex!),
      after = checkpoints.find(
        (c) =>
          c.afterSourceIndex >=
          Math.max(wound.sourceIndex!, terminal.sourceIndex!)
      );
    const board = before?.board,
      post = after?.board;
    if (
      !board ||
      !post ||
      before!.status !== "observed" ||
      after!.status !== "observed" ||
      board.phaseCode !== 5 ||
      post.phaseCode !== 5 ||
      board.issues.length ||
      post.issues.length ||
      epochs.get(before!) !== epochs.get(after!) ||
      after!.replayStep !== final.locator?.replayStep ||
      (after!.afterSourceIndex !==
        Math.max(wound.sourceIndex!, terminal.sourceIndex!) &&
        (end?.sourceTag !== "EventRulesEngineStandBy" ||
          !fields(end.payload, ["Phase", "ActiveGamer"]) ||
          Number(end.payload?.Phase) !== 5 ||
          after!.afterSourceIndex !== end.sourceIndex ||
          (end.payload?.ActiveGamer !== undefined &&
            Number(end.payload.ActiveGamer) !== post.activeGamerId))) ||
      after!.childIndex !== (final.locator?.childIndex ?? -2) + 2 ||
      checkpoints.some(
        (c) =>
          c.afterSourceIndex >
            Math.max(wound.sourceIndex!, terminal.sourceIndex!) &&
          c.afterSourceIndex < after!.afterSourceIndex
      )
    )
      continue;
    // Controller belongs to the blocker; victim ownership is qualified against
    // the same current rosters without treating the victim as active controller.
    if (
      !observedActorRoster(board, Number(attackerId), pool.teamId, teamIds) ||
      !observedActorRoster(post, Number(attackerId), pool.teamId, teamIds)
    )
      continue;
    const owner = (x: typeof board) =>
      observedActorRoster(
        { ...x, activeTeamIndex: null },
        Number(defenderId),
        defenderTeamId,
        teamIds
      );
    const previous = owner(board)?.players.find(
        (p) => String(p.id) === defenderId
      ),
      current = owner(post)?.players.find((p) => String(p.id) === defenderId);
    if (
      !previous ||
      !current ||
      previous.cell.x !== from.x ||
      previous.cell.y !== from.y ||
      previous.pitchLocation !== "on_pitch" ||
      current.cell.x !== -1 ||
      current.cell.y !== -1 ||
      current.pitchLocation !== "off_pitch" ||
      current.situationCode !== terminal.payload?.Situation ||
      (current.statusCode !== null &&
        current.statusCode !== terminal.payload?.Status)
    )
      continue;
    const pushReport = sources.get(push.id!),
      startReport = sources.get(initial!.id!),
      lastReport = sources.get(terminal.id!),
      injuryReport = sources.get(wound.id!);
    if (
      !pushReport ||
      !startReport ||
      !lastReport ||
      !injuryReport ||
      injuryReport.scoringStatus !== "excluded" ||
      !injuryReport.metadata.isRollCandidate ||
      [pushReport, startReport, lastReport, injuryReport].some(
        (e) => e.playerId !== defenderId || e.teamId !== defenderTeamId
      )
    )
      continue;
    pool.metadata.blockCrowd = {
      pushSourceId: push.id!,
      initialRemovalSourceId: initial!.id!,
      finalRemovalSourceId: terminal.id!,
      injurySourceId: wound.id!,
      subjectId: defenderId,
      subjectTeamId: defenderTeamId,
      from,
      to,
      damageActionId: step.actionId!,
      beforeCheckpointAfter: before!.afterSourceIndex,
      after: {
        checkpointAfter: after!.afterSourceIndex,
        cell: { x: -1, y: -1 },
        situationCode: current.situationCode as 1 | 2,
        statusCode: current.statusCode,
        canAct: current.canAct,
        tackleZone: current.tackleZone
      }
    };
    pushReport.metadata.crowdPush = {
      playerId: defenderId,
      from,
      to,
      resolution: 3
    };
    for (const [r, e] of [
      [startReport, initial!],
      [lastReport, terminal]
    ] as const)
      r.metadata.crowdRemoval = {
        reason: Number(e.payload!.Reason) as 0 | 1,
        situation: Number(e.payload!.Situation) as 1 | 2,
        status: Number(e.payload!.Status) as 0 | 3
      };
    injuryReport.statusReason =
      "excluded: observed crowd injury; the applicable trait-dependent distribution remains unverified";
    injuryReport.explainability.target = "trait-dependent crowd injury outcome";
    injuryReport.explainability.inputsSummary = `Observed 2D6 crowd injury [${injuryReport.metadata.dice!.join(", ")}]; outcome table unverified, no odds assigned.`;
    injuryReport.metadata.normalizationFlags =
      injuryReport.metadata.normalizationFlags?.filter(
        (f) => f !== "missing_target_threshold"
      );
    injuryReport.metadata.normalizationNotes =
      injuryReport.metadata.normalizationNotes?.filter(
        (n) => n !== "difficulty and requirement were both missing"
      );
    startReport.label = "Recorded crowd removal stage";
    lastReport.label = "Recorded crowd removal stage";
    startReport.statusReason =
      "A first removal stage follows this verified direct crowd push; no random outcome is added.";
    lastReport.statusReason =
      "The same player's subsequent removal state is linked to the crowd injury and off-pitch checkpoint; no second injury is added.";
    injuryReport.metadata.damage = {
      subjectId: defenderId,
      subjectTeamId: defenderTeamId,
      sourceCode: 2,
      perspective: "subject_team",
      chainActionId: step.actionId!,
      crowd: { poolSourceId: fact.poolSourceId }
    };
  }
}

// Public reconciliation checks source roles/order and already-retained facts.
// Raw replay/checkpoint admission above remains separate from JSON validation.
export function validReportedBlockCrowd(
  pool: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  sourceCount: number
) {
  const c = pool.metadata.blockCrowd,
    b = pool.metadata.block,
    r = pool.metadata.blockResolution;
  if (
    !c ||
    !b ||
    !r ||
    pool.scoringStatus !== "scored" ||
    c.subjectId !== b.defenderId ||
    c.subjectTeamId !== b.defenderTeamId ||
    c.subjectTeamId === pool.teamId ||
    !["push", "defender_pushed_down"].includes(r.outcome) ||
    !r.damageActionIds.includes(c.damageActionId) ||
    r.damageActionIds.length !== 1 ||
    !pitchCell(c.from) ||
    !crowdCell(c.to) ||
    Math.max(Math.abs(c.to.x - c.from.x), Math.abs(c.to.y - c.from.y)) !== 1
  )
    return false;
  const push = sources.get(c.pushSourceId),
    initial = sources.get(c.initialRemovalSourceId),
    last = sources.get(c.finalRemovalSourceId),
    wound = sources.get(c.injurySourceId),
    final = sources.get(b.finalSourceId ?? "");
  if (
    !push ||
    !initial ||
    !last ||
    !wound ||
    !final ||
    push.metadata.sourceTag !== "ResultPushBack" ||
    initial.metadata.sourceTag !== "ResultPlayerRemoval" ||
    last.metadata.sourceTag !== "ResultPlayerRemoval" ||
    wound.metadata.sourceTag !== "ResultInjuryRoll" ||
    wound.scoringStatus !== "excluded" ||
    !wound.metadata.isRollCandidate ||
    wound.metadata.rollType !== 11 ||
    wound.metadata.stepType !== 2 ||
    wound.probabilitySuccess !== null ||
    wound.actualSuccess !== null ||
    wound.weightedDelta !== 0 ||
    wound.delta !== 0 ||
    wound.contextualImpact ||
    wound.contextualBounds ||
    wound.possessionBounds ||
    wound.catchPossessionBounds ||
    wound.metadata.damage?.crowd?.poolSourceId !== pool.metadata.sourceId ||
    wound.metadata.damage?.sourceCode !== 2 ||
    wound.metadata.actionId !== c.damageActionId ||
    wound.metadata.dice?.length !== 2 ||
    wound.metadata.dice.some((x) => !Number.isInteger(x) || x < 1 || x > 6) ||
    wound.metadata.dieTypes?.join() !== "0,0" ||
    (wound.metadata.modifiers?.length ?? 0) !== 0 ||
    ![0, 2].includes(wound.metadata.outcomeCode ?? -1)
  )
    return false;
  const stage = [...sources.values()].filter(
    (e) =>
      e.metadata.actionId === c.damageActionId &&
      (e.type === "injury" || e.type === "armor_break")
  );
  if (stage.length !== 2 || !stage.includes(wound) || !stage.includes(last))
    return false;
  const start = initial.metadata.crowdRemoval,
    end = last.metadata.crowdRemoval,
    travel = push.metadata.crowdPush;
  if (
    !start ||
    !end ||
    !travel ||
    travel.playerId !== c.subjectId ||
    travel.resolution !== 3 ||
    !same(travel.from, c.from) ||
    !same(travel.to, c.to) ||
    start.reason !== 1 ||
    start.situation !== 1 ||
    start.status !== 0 ||
    end.reason !== 0 ||
    !(
      (end.situation === 1 && end.status === 0) ||
      (end.situation === 2 && end.status === 3)
    ) ||
    c.after.situationCode !== end.situation ||
    (c.after.statusCode !== null && c.after.statusCode !== end.status) ||
    [push, initial, last, wound].some(
      (e) =>
        e.playerId !== c.subjectId ||
        e.teamId !== c.subjectTeamId ||
        e.metadata.targetId !== c.subjectId
    ) ||
    [push, initial, last].some(
      (e) =>
        e.scoringStatus !== "excluded" ||
        e.metadata.isRollCandidate ||
        e.weightedDelta !== 0
    ) ||
    push.metadata.stepType !== 6 ||
    initial.metadata.stepType !== 6 ||
    last.metadata.stepType !== 2 ||
    initial.metadata.actionId !== final.metadata.actionId ||
    last.metadata.actionId !== c.damageActionId ||
    [initial, last, wound].some(
      (e) =>
        e.metadata.sequenceId !== final.metadata.sequenceId ||
        e.metadata.locator?.replayStep !== final.metadata.locator?.replayStep ||
        e.metadata.locator?.childIndex !== final.metadata.locator?.childIndex
    ) ||
    last.metadata.locator?.stepIndex !==
      (final.metadata.locator?.stepIndex ?? -2) + 1 ||
    wound.metadata.locator?.stepIndex !== last.metadata.locator?.stepIndex ||
    push.metadata.sourceIndex === undefined ||
    final.metadata.sourceIndex === undefined ||
    initial.metadata.sourceIndex !== final.metadata.sourceIndex + 1 ||
    last.metadata.sourceIndex === undefined ||
    wound.metadata.sourceIndex === undefined ||
    push.metadata.sourceIndex >= final.metadata.sourceIndex ||
    c.beforeCheckpointAfter >= push.metadata.sourceIndex ||
    c.beforeCheckpointAfter < (pool.metadata.sourceIndex ?? Infinity) ||
    Math.abs(last.metadata.sourceIndex - wound.metadata.sourceIndex) !== 1
  )
    return false;
  const first = Math.min(last.metadata.sourceIndex, wound.metadata.sourceIndex),
    terminal = Math.max(last.metadata.sourceIndex, wound.metadata.sourceIndex);
  return (
    [2, 3].includes(first - initial.metadata.sourceIndex) &&
    c.after.checkpointAfter >= terminal &&
    c.after.checkpointAfter <= terminal + 1 &&
    c.after.checkpointAfter <= sourceCount
  );
}
