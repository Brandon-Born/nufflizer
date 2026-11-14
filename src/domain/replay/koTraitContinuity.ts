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
