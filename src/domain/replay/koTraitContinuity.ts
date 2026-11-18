import type { ReplayEvent } from "./types";

type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as RecordValue)
    : undefined;
const fields = (v: RecordValue, keys: string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
const integer = (v: unknown, min = 0): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min;
function player(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^(0|[1-9]\d{0,15})$/.test(v) &&
    Number.isSafeInteger(Number(v))
  );
}

// The verified direct WakeUp/KO-recovery shape changes recovery state, not
// learned skill lists. This grants no owner, legal recovery, new seed, physical
// flag, effective skill or probability. The trait reducer gates replay version.
export function knownKoTraitTransition(e: ReplayEvent): boolean {
  const p = e.payload,
    loc = e.locator,
    dice = record(p?.Dice),
    die = record(dice?.Die);
  if (
    e.sourceTag !== "EventRoll" ||
    e.rollType !== 13 ||
    e.attributionConflict ||
    e.actionId !== undefined ||
    e.stepTag !== undefined ||
    e.stepType !== undefined ||
    !integer(e.sourceIndex, 1) ||
    e.id !== `source-${e.sourceIndex}` ||
    !integer(loc?.replayStep, 1) ||
    !integer(loc?.childIndex) ||
    loc?.stepIndex !== undefined ||
    loc.messageIndex !== undefined ||
    !p ||
    !fields(p, [
      "Requirement",
      "Difficulty",
      "RollType",
      "PlayerId",
      "TeamId",
      "Dice",
      "Modifiers",
      "Outcome"
    ]) ||
    p.RollType !== "13" ||
    p.Requirement !== "4" ||
    !player(p.PlayerId) ||
    p.PlayerId !== e.playerId ||
    (p.TeamId !== undefined && p.TeamId !== "0" && p.TeamId !== "1") ||
    !dice ||
    !fields(dice, ["Die"]) ||
    !die ||
    !fields(die, ["Value"]) ||
    typeof die.Value !== "string" ||
    !/^[1-6]$/.test(die.Value)
  )
    return false;
  const modifiers = record(p.Modifiers),
    modifier = record(modifiers?.Modifier);
  const normal =
    p.Difficulty === "4" && (p.Modifiers === undefined || p.Modifiers === "");
  const kegs =
    p.Difficulty === "3" &&
    !!modifiers &&
    fields(modifiers, ["Modifier"]) &&
    !!modifier &&
    fields(modifier, ["ModifierType", "Value"]) &&
    modifier.ModifierType === "20" &&
    modifier.Value === "1";
  return (
    (normal || kegs) &&
    p.Outcome === (Number(die.Value) >= Number(p.Difficulty) ? "1" : undefined)
  );
}

const knownDamageSources = new Set([0, 1, 2, 5, 7, 9, 13, 16]);

function sameStep(header: ReplayEvent, message: ReplayEvent, slot: number) {
  const at = header.locator,
    there = message.locator;
  return (
    !!at &&
    !!there &&
    !!header.actionId &&
    !!header.sequenceId &&
    message.actionId === header.actionId &&
    message.sequenceId === header.sequenceId &&
    there.replayStep === at.replayStep &&
    there.childIndex === at.childIndex &&
    there.stepIndex === at.stepIndex &&
    there.messageIndex === slot &&
    message.sourceIndex === header.sourceIndex! + slot + 1 &&
    !message.attributionConflict &&
    !message.executionExclusion
  );
}

function knownKoRemoval(events: readonly ReplayEvent[], i: number) {
  const event = events[i],
    injury = events[i - 1],
    p = event?.payload;
  const slot = event?.locator?.messageIndex;
  if (
    event?.sourceTag !== "ResultPlayerRemoval" ||
    !event.id ||
    !event.playerId ||
    !p ||
    p.PlayerId !== Number(event.playerId) ||
    p.Situation !== 2 ||
    p.Reason !== 0 ||
    p.Status !== 3 ||
    !fields(p, ["PlayerId", "Situation", "Reason", "Status"]) ||
    slot === undefined ||
    slot < 1 ||
    slot > 3 ||
    injury?.sourceTag !== "ResultInjuryRoll" ||
    injury.rollType !== 11 ||
    injury.payload?.Status !== 1 ||
    injury.payload.Outcome !== 2 ||
    injury.payload.Source !== event.damageSource ||
    !knownDamageSources.has(Number(event.damageSource))
  )
    return;
  const header = events[i - slot - 1],
    damage = header?.payload;
  if (
    header?.sourceTag !== "DamageStep" ||
    header.stepType !== 2 ||
    header.damageSource !== event.damageSource ||
    header.attributionConflict ||
    header.executionExclusion ||
    damage?.Applied !== 1 ||
    damage.IsEvaluation !== 0 ||
    damage.Skill !== 0 ||
    !fields(damage, [
      "Applied",
      "Probability",
      "Source",
      "PlayerId",
      "TargetId",
      "TeamId",
      "IsEvaluation",
      "StepType",
      "CellTo",
      "State",
      "CellFrom",
      "Skill"
    ]) ||
    [header, injury, event].some(
      (part) =>
        part.playerId !== event.playerId ||
        part.stepActorId !== event.playerId ||
        part.stepTargetId !== event.playerId
    ) ||
    !sameStep(header, injury, slot - 1) ||
    !sameStep(header, event, slot)
  )
    return;
  return header;
}

function pushedOffPitch(event: ReplayEvent, id: string) {
  const pushes = record(event.payload?.Pushbacks)?.ResultPushBack;
  const items = Array.isArray(pushes) ? pushes : [pushes];
  const hits = items
    .map(record)
    .filter((p) => p?.PushedPlayerId === Number(id));
  const from = record(hits[0]?.CellFrom),
    to = record(hits[0]?.CellTo);
  return hits.length === 1 &&
    hits[0]?.Resolution === 3 &&
    !!from &&
    !!to &&
    integer(from.X) &&
    from.X <= 25 &&
    integer(from.Y) &&
    from.Y <= 14 &&
    ((from.X === 0 && to.X === -1) ||
      (from.X === 25 && to.X === 26) ||
      (from.Y === 0 && to.Y === -1) ||
      (from.Y === 14 && to.Y === 15)) &&
    typeof to.X === "number" &&
    typeof to.Y === "number" &&
    Math.max(Math.abs(from.X - to.X), Math.abs(from.Y - to.Y)) === 1
    ? to
    : undefined;
}

// A crowd push can emit a reserves removal before the injury result. Preserve
// its seed only when the applied push and that immediate KO name the same player.
export function koRemovalStarts(events: readonly ReplayEvent[]) {
  const starts = new Set<string>();
  for (const [i, event] of events.entries()) {
    if (event.sourceTag !== "ResultPlayerRemoval") continue;
    const header = knownKoRemoval(events, i);
    if (!header || !event.id || !event.playerId) continue;
    starts.add(event.id);
    const reserves = events[i - 4],
      follow = events[i - 3],
      applied = events[i - 5];
    if (
      event.damageSource !== 2 ||
      event.locator?.messageIndex !== 1 ||
      reserves?.sourceTag !== "ResultPlayerRemoval" ||
      !reserves.id ||
      !applied ||
      reserves.playerId !== event.playerId ||
      reserves.attributionConflict ||
      reserves.executionExclusion ||
      reserves.payload?.PlayerId !== Number(event.playerId) ||
      reserves.payload.Situation !== 1 ||
      reserves.payload.Reason !== 1 ||
      reserves.payload.Status !== 0 ||
      !fields(reserves.payload, [
        "PlayerId",
        "Situation",
        "Reason",
        "Status"
      ]) ||
      applied.sourceTag !== "ResultBlockOutcome" ||
      follow?.sourceTag !== "ResultMoveOutcome" ||
      applied.stepType !== 6 ||
      follow.stepType !== 6 ||
      follow.executionExclusion ||
      applied.attributionConflict ||
      follow.attributionConflict ||
      !applied.actionId ||
      applied.actionId !== reserves.actionId ||
      applied.actionId !== follow.actionId ||
      applied.sequenceId !== header.sequenceId ||
      follow.sequenceId !== header.sequenceId ||
      applied.sourceIndex !== reserves.sourceIndex! - 1 ||
      follow.sourceIndex !== reserves.sourceIndex! + 1 ||
      header.sourceIndex !== follow.sourceIndex! + 1 ||
      header.locator?.stepIndex !== (follow.locator?.stepIndex ?? -2) + 1 ||
      header.locator?.replayStep !== follow.locator?.replayStep ||
      header.locator?.childIndex !== follow.locator?.childIndex
    )
      continue;
    const edge = pushedOffPitch(applied, event.playerId);
    const repeated = pushedOffPitch(follow, event.playerId);
    const hit = record(header.payload?.CellFrom),
      hitTo = record(header.payload?.CellTo);
    if (
      edge &&
      repeated &&
      repeated.X === edge.X &&
      repeated.Y === edge.Y &&
      hit &&
      hit.X === edge.X &&
      hit.Y === edge.Y &&
      hitTo &&
      hitTo.X === edge.X &&
      hitTo.Y === edge.Y
    )
      starts.add(reserves.id);
  }
  return starts;
}
