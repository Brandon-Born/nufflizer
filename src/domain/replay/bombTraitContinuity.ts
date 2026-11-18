import { findBombCatches } from "./bombCatch";
import { isInertReplayControl } from "./inertControls";
import { ownerAt, type OwnershipTimeline } from "./ownershipTimeline";
import type { ReplayEvent } from "./types";

type Cell = { x: number; y: number };
type Raw = Record<string, unknown>;
const record = (value: unknown): Raw | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Raw)
    : undefined;
const hasOnly = (value: Raw | undefined, keys: string[]) =>
  !!value && Object.keys(value).every((key) => keys.includes(key));
const id = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const items = (value: unknown) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

function cell(value: unknown): Cell | undefined {
  const point = record(value);
  if (
    hasOnly(point, ["X", "Y"]) &&
    id(point?.X) &&
    point.X <= 25 &&
    id(point.Y) &&
    point.Y <= 14
  )
    return { x: point.X, y: point.Y };
}

function sameCell(a: unknown, b: unknown) {
  const from = cell(a),
    to = cell(b);
  return !!from && !!to && from.x === to.x && from.y === to.y;
}

function isHeader(
  event: ReplayEvent | undefined,
  stepType: number,
  skill: number
): event is ReplayEvent {
  const p = event?.payload;
  return (
    event?.sourceTag === "PlayerStep" &&
    event.stepType === stepType &&
    p?.StepType === stepType &&
    p.Skill === skill &&
    p.IsEvaluation === 0 &&
    p.Probability === 100 &&
    (p.State === 1 || p.State === 2 || p.State === 3) &&
    id(p.PlayerId) &&
    String(p.PlayerId) === event.playerId &&
    event.stepActorId === event.playerId &&
    (p.TargetId === -1 || id(p.TargetId)) &&
    String(p.TargetId) === event.stepTargetId &&
    !!cell(p.CellFrom) &&
    !!cell(p.CellTo) &&
    hasOnly(p, [
      "Probability",
      "PlayerId",
      "TargetId",
      "TeamId",
      "IsEvaluation",
      "StepType",
      "CellFrom",
      "CellTo",
      "State",
      "Skill"
    ]) &&
    !!event.actionId &&
    !!event.sequenceId &&
    event.locator?.stepIndex !== undefined &&
    event.locator.messageIndex === undefined &&
    !event.attributionConflict &&
    !event.executionExclusion
  );
}

function samePacket(a: ReplayEvent, b: ReplayEvent) {
  return (
    a.sequenceId === b.sequenceId &&
    a.locator?.replayStep === b.locator?.replayStep &&
    a.locator?.childIndex === b.locator?.childIndex
  );
}

function message(
  header: ReplayEvent,
  event: ReplayEvent | undefined,
  slot: number,
  playerId = header.playerId
): event is ReplayEvent {
  return (
    !!event &&
    event.playerId === playerId &&
    event.actionId === header.actionId &&
    samePacket(header, event) &&
    event.locator?.stepIndex === header.locator?.stepIndex &&
    event.locator?.messageIndex === slot &&
    event.sourceIndex === header.sourceIndex! + slot + 1 &&
    !event.attributionConflict &&
    !event.executionExclusion
  );
}

function die(payload: Raw | undefined, family: number, fresh: 0 | 1) {
  const dice = record(payload?.Dice),
    face = record(dice?.Die);
  if (
    !hasOnly(payload, [
      "Status",
      "Requirement",
      "Modifiers",
      "Dice",
      "Difficulty",
      "RollType",
      "Outcome",
      "NewRoll"
    ]) ||
    !hasOnly(dice, ["Die"]) ||
    !hasOnly(face, ["DieType", "Value"]) ||
    !id(face?.Value) ||
    face.Value < 1 ||
    face.Value > 6 ||
    face.DieType !== 0 ||
    payload?.RollType !== family ||
    payload.NewRoll !== fresh ||
    (payload.Status !== 1 && payload.Status !== 2) ||
    !id(payload.Difficulty) ||
    !id(payload.Requirement) ||
    (payload.Outcome !== 0 && payload.Outcome !== 1)
  )
    return;
  return face.Value;
}

function roll(
  event: ReplayEvent,
  family: number,
  outcome: number,
  fresh: 0 | 1 = 1
) {
  const face = die(event.payload, family, fresh);
  const target = event.payload?.Difficulty;
  return (
    event.sourceTag === "ResultRoll" &&
    event.rollType === family &&
    event.payload?.Outcome === outcome &&
    face !== undefined &&
    id(target) &&
    target >= 2 &&
    target <= 6 &&
    Number(face >= target) === outcome
  );
}

// Waiting controls have no bearing on skill continuity. Never step past a
// gameplay notification or infer a continued action from its array position.
function afterWait(events: readonly ReplayEvent[], from: number) {
  for (let i = from; i < from + 10; i++) {
    const event = events[i];
    if (!event || event.attributionConflict || event.executionExclusion) return;
    const controller =
      event.sourceTag === "EventActiveGamerChanged" &&
      hasOnly(event.payload, ["NewActiveGamer"]) &&
      [undefined, "0", "1"].includes(
        event.payload?.NewActiveGamer as string | undefined
      );
    if (
      !isInertReplayControl(event) &&
      !controller &&
      !(event.sourceTag === "Carrier" && event.checkpointCarrier)
    )
      return i;
  }
}

function interceptorIds(
  event: ReplayEvent,
  throwingTeam: string,
  owners: OwnershipTimeline
) {
  const p = event.payload,
    lists = record(p?.InterceptorsIds),
    info = record(p?.Interceptors);
  if (
    event.sourceTag !== "QuestionInterceptors" ||
    !hasOnly(p, [
      "GamerId",
      "InterceptorsIds",
      "PassType",
      "Interceptors",
      "PassModifier"
    ]) ||
    !hasOnly(lists, ["InterceptorsIdsItem"]) ||
    !hasOnly(info, ["InterceptorInfos"]) ||
    (p?.GamerId !== 0 && p?.GamerId !== 1) ||
    String(p.GamerId) === throwingTeam ||
    p.PassType !== 4 ||
    p.PassModifier !== -3
  )
    return;
  const ids = items(lists?.InterceptorsIdsItem);
  const entries = items(info?.InterceptorInfos).map(record);
  if (
    !ids.length ||
    ids.length > 64 ||
    new Set(ids).size !== ids.length ||
    entries.length !== ids.length ||
    !ids.every(
      (value) =>
        id(value) && ownerAt(owners, String(value), event) === String(p.GamerId)
    ) ||
    entries.some(
      (entry, i) =>
        !hasOnly(entry, ["InterceptorId", "RollInfos"]) ||
        entry?.InterceptorId !== ids[i] ||
        !hasOnly(record(entry?.RollInfos), ["ResultRollEvaluation"]) ||
        record(record(entry?.RollInfos)?.ResultRollEvaluation)?.RollType !== 6
    )
  )
    return;
  return new Set(ids.map(String));
}

function readThrow(
  events: readonly ReplayEvent[],
  at: number,
  owners: OwnershipTimeline
) {
  const declaration = events[at]!,
    header = events[at - 1],
    first = events[at + 1];
  if (
    !isHeader(header, 0, 0) ||
    !message(header, declaration, 0) ||
    !hasOnly(declaration.payload, ["Action", "TeamId"]) ||
    declaration.payload?.Action !== 16 ||
    declaration.payload.TeamId !== 0 ||
    !isHeader(first, 32, 80) ||
    !samePacket(header, first) ||
    first.locator?.stepIndex !== header.locator!.stepIndex! + 1 ||
    first.playerId !== declaration.playerId ||
    !sameCell(first.payload?.CellFrom, header.payload?.CellFrom) ||
    !sameCell(first.payload?.CellTo, header.payload?.CellTo)
  )
    return;
  const thrower = first.playerId!;
  const team = ownerAt(owners, thrower, first);
  const draw = events[at + 2];
  if (team === undefined || !message(first, draw, 0)) return;
  const scope = [declaration, first];
  if (roll(draw, 5, 1))
    return { thrower, team, header: first, next: at + 3, slot: 1, scope };
  const offer = draw.payload,
    original = record(offer?.RollInfos);
  const firstFace = die(original, 5, 1);
  const target = original?.Difficulty;
  if (
    draw.sourceTag !== "QuestionTeamRerollUsage" ||
    !hasOnly(offer, [
      "GamerId",
      "CanUseProReroll",
      "CanUseTeamReroll",
      "StarSpecialRule",
      "RollInfos"
    ]) ||
    String(offer?.GamerId) !== team ||
    offer?.CanUseProReroll !== 0 ||
    offer.CanUseTeamReroll !== 1 ||
    offer.StarSpecialRule !== -1 ||
    original?.Outcome !== 0 ||
    firstFace === undefined ||
    !id(target) ||
    target < 2 ||
    target > 6 ||
    firstFace >= target
  )
    return;
  const resume = afterWait(events, at + 3);
  if (resume === undefined) return;
  const resumed = events[resume],
    choice = events[resume + 1];
  if (
    !isHeader(resumed, 32, 80) ||
    resumed.playerId !== thrower ||
    resumed.stepTargetId !== first.stepTargetId ||
    ownerAt(owners, thrower, resumed) !== team ||
    resumed.sequenceId === first.sequenceId ||
    resumed.locator!.replayStep !== first.locator!.replayStep! + 1 ||
    !sameCell(resumed.payload?.CellFrom, first.payload?.CellFrom) ||
    !message(resumed, choice, 0) ||
    choice.sourceTag !== "ResultTeamRerollUsage" ||
    !hasOnly(choice.payload, ["GamerId", "Used"]) ||
    String(choice.payload?.GamerId) !== team
  )
    return;
  scope.push(resumed);
  if (choice.payload?.Used === 0) {
    const kept = events[resume + 2],
      blast = events[resume + 3];
    if (
      !message(resumed, kept, 1) ||
      !roll(kept, 5, 0, 0) ||
      JSON.stringify(kept.payload) !==
        JSON.stringify({ ...original, NewRoll: 0 }) ||
      !sameCell(resumed.payload?.CellTo, resumed.payload?.CellFrom) ||
      !message(resumed, blast, 2) ||
      !sameCell(blast.payload?.Cell, resumed.payload?.CellFrom)
    )
      return;
    return {
      thrower,
      team,
      header: resumed,
      next: resume + 4,
      slot: 3,
      scope,
      blast
    };
  }
  const skill = events[resume + 2],
    gate = events[resume + 3],
    replacement = events[resume + 4];
  if (
    choice.payload?.Used !== 1 ||
    !sameCell(resumed.payload?.CellTo, first.payload?.CellTo) ||
    !message(resumed, skill, 1) ||
    skill.sourceTag !== "ResultSkillUsage" ||
    !hasOnly(skill.payload, ["PlayerId", "Skill", "Used"]) ||
    skill.payload?.PlayerId !== Number(thrower) ||
    skill.payload?.Skill !== 44 ||
    skill.payload.Used !== 1 ||
    !message(resumed, gate, 2) ||
    !roll(gate, 71, 1) ||
    gate.payload?.Difficulty !== 4 ||
    !message(resumed, replacement, 3) ||
    !roll(replacement, 5, 1) ||
    replacement.payload?.Difficulty !== original?.Difficulty
  )
    return;
  return { thrower, team, header: resumed, next: resume + 5, slot: 4, scope };
}

function readCatch(
  events: readonly ReplayEvent[],
  thrown: NonNullable<ReturnType<typeof readThrow>>,
  catches: ReturnType<typeof findBombCatches>,
  owners: OwnershipTimeline
) {
  let { next } = thrown;
  const question = events[next];
  if (question?.sourceTag === "QuestionInterceptors") {
    const eligible = interceptorIds(question, thrown.team, owners);
    if (!eligible || !message(thrown.header, question, thrown.slot)) return;
    const at = afterWait(events, next + 1);
    if (at === undefined) return;
    const attempt = events[at],
      result = events[at + 1];
    if (
      !isHeader(attempt, 29, 0) ||
      !eligible.has(attempt.playerId!) ||
      ownerAt(owners, attempt.playerId!, attempt) !==
        String(question.payload?.GamerId) ||
      !message(attempt, result, 0) ||
      !roll(result, 6, 0)
    )
      return;
    next = at + 2;
    thrown.scope.push(question);
  }
  const header = events[next],
    result = events[next + 1];
  if (
    !isHeader(header, 4, 0) ||
    header.playerId !== thrown.header.stepTargetId ||
    !sameCell(header.payload?.CellTo, thrown.header.payload?.CellTo) ||
    !message(header, result, 0)
  )
    return;
  const linked = result.id ? catches.get(result.id) : undefined;
  if (!linked || !roll(result, 7, Number(linked.caught))) return;
  if (!linked.starQuestionSourceId) {
    const blast = events[next + 2];
    return message(header, blast, 1) && blast.id === linked.explosionSourceId
      ? { blast, next: next + 3 }
      : undefined;
  }
  const star = events[next + 2],
    resumed = events[next + 5];
  const blast = events[next + 6],
    decision = events[next + 7];
  if (
    !message(header, star, 1, thrown.thrower) ||
    star.id !== linked.starQuestionSourceId ||
    !hasOnly(star.payload, [
      "GamerId",
      "PlayerId",
      "StarSpecialRule",
      "RollsInfos",
      "Skills"
    ]) ||
    String(star.payload?.GamerId) !== thrown.team ||
    star.payload?.PlayerId !== Number(thrown.thrower) ||
    star.payload?.RollsInfos !== "" ||
    star.payload.Skills !== "" ||
    !isHeader(resumed, 4, 0) ||
    !message(resumed, blast, 0) ||
    blast.id !== linked.explosionSourceId ||
    !message(resumed, decision, 1, thrown.thrower) ||
    !hasOnly(decision.payload, [
      "PlayerId",
      "StarSpecialRule",
      "Used",
      "TargetId"
    ]) ||
    decision.payload?.TargetId !== -1
  )
    return;
  thrown.scope.push(star, decision);
  return { blast, next: next + 8 };
}

// Only the linked bomb messages are admitted. Ordinary board, damage and
// removal processing still controls which current profiles can be used.
export function bombTraitTransitions(
  events: readonly ReplayEvent[],
  owners: OwnershipTimeline
) {
  const scopes = new Set<string>();
  if (
    !events.some(
      (event) =>
        event.sourceTag === "ResultUseAction" && event.actionCode === 16
    )
  )
    return scopes;
  const catches = findBombCatches(events, "1-4-0-0");
  for (const [i, event] of events.entries()) {
    if (event.sourceTag !== "ResultUseAction" || event.actionCode !== 16)
      continue;
    const thrown = readThrow(events, i, owners);
    if (!thrown) continue;
    const end = thrown.blast
      ? { blast: thrown.blast, next: thrown.next }
      : readCatch(events, thrown, catches, owners);
    const center = cell(end?.blast.payload?.Cell);
    if (
      !end ||
      !center ||
      end.blast.sourceTag !== "ResultBombExplosion" ||
      !hasOnly(end.blast.payload, ["Cell"])
    )
      continue;
    for (const source of [...thrown.scope, end.blast])
      if (source.id) scopes.add(source.id);
    for (let next = end.next; next < end.next + 16; next += 2) {
      const step = events[next],
        check = events[next + 1];
      if (
        !isHeader(step, 33, 0) ||
        !samePacket(end.blast, step) ||
        !sameCell(step.payload?.CellFrom, end.blast.payload?.Cell) ||
        !message(step, check, 0)
      )
        break;
      const target = cell(step.payload?.CellTo)!;
      const face = die(check.payload, 88, 1);
      if (
        Math.max(
          Math.abs(center.x - target.x),
          Math.abs(center.y - target.y)
        ) !== 1 ||
        check.sourceTag !== "ResultRoll" ||
        check.rollType !== 88 ||
        check.payload?.Difficulty !== 4 ||
        check.payload.Requirement !== 4 ||
        check.payload.Modifiers !== "" ||
        face === undefined ||
        check.payload.Outcome !== Number(face >= 4)
      )
        break;
      if (step.id) scopes.add(step.id);
    }
  }
  return scopes;
}
