import type { ReplayModel } from "@/domain/replay/types";
import type { LuckEvent } from "./types";

export const CASUALTY_CATEGORIES = [
  "badly_hurt",
  "seriously_hurt",
  "serious_injury",
  "lasting_injury",
  "dead"
] as const;
const secondary = [
  "head_injury",
  "head_injury",
  "smashed_knee",
  "broken_arm",
  "neck_injury",
  "dislocated_shoulder"
] as const;
type FixedModifier = {
  kind: "decay" | "niggling_injury";
  playerId: number;
  skillId: number;
  modifierType: 27 | 31;
  effectId: -1;
  value: 1;
};
type Five = [number, number, number, number, number];
const object = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
const fields = (p: Record<string, unknown>, keys: string[]) =>
  Object.keys(p).every((k) => keys.includes(k));

// Only the witnessed automatic +1 vectors. An omitted list, unknown kind,
// wrong holder, repeated modifier or adaptive choice cannot certify a table.
function fixedModifiers(
  raw: unknown,
  subject: string
): FixedModifier[] | undefined {
  if (raw === "") return [];
  const p = object(raw);
  if (!p || !fields(p, ["Modifier"])) return;
  const entries = Array.isArray(p.Modifier) ? p.Modifier : [p.Modifier];
  if (!entries.length || entries.length > 2) return;
  const result: FixedModifier[] = [];
  for (const entry of entries) {
    const m = object(entry);
    if (
      !m ||
      !fields(m, ["PlayerId", "Skill", "Effect", "Value", "ModifierType"]) ||
      m.Effect !== -1 ||
      m.Value !== 1
    )
      return;
    const kind =
      m.ModifierType === 27 &&
      m.Skill === 81 &&
      Number.isSafeInteger(m.PlayerId) &&
      String(m.PlayerId) === subject
        ? "decay"
        : m.ModifierType === 31 && m.Skill === -1 && m.PlayerId === -1
          ? "niggling_injury"
          : undefined;
    if (!kind || result.some((r) => r.kind === kind)) return;
    result.push({
      kind,
      playerId: Number(m.PlayerId),
      skillId: Number(m.Skill),
      modifierType: m.ModifierType as 27 | 31,
      effectId: -1,
      value: 1
    });
  }
  return result;
}

// BB2020 printed61: D16 categories; p84 Decay and p61 niggling injury
// are fixed shifts of the primary D16, never of the secondary D6.
function category(face: number, shift: number) {
  const total = face + shift;
  return total <= 6
    ? 0
    : total <= 9
      ? 1
      : total <= 12
        ? 2
        : total <= 14
          ? 3
          : 4;
}
export function enumerateCasualtyTable(modifierTotal: number) {
  if (
    !Number.isInteger(modifierTotal) ||
    modifierTotal < 0 ||
    modifierTotal > 2
  )
    return;
  const counts: Five = [0, 0, 0, 0, 0];
  for (let d = 1; d <= 16; d++) counts[category(d, modifierTotal)]!++;
  return {
    counts,
    probabilities: counts.map((n) => n / 16) as Five,
    lastingInjuryCounts: [2, 1, 1, 1, 1] as Five,
    lastingInjuryProbabilities: [2 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6] as Five
  };
}
function observedChance(event: LuckEvent, shift: number) {
  const observation = event.metadata.casualtyObservation,
    dice = event.metadata.dice,
    types = event.metadata.dieTypes;
  if (
    !observation ||
    !dice ||
    !types ||
    dice.length < 1 ||
    dice.length > 2 ||
    dice.some((d, i) => !Number.isInteger(d) || d < 1 || d > (i ? 6 : 16)) ||
    types.length !== dice.length ||
    types.some((t, i) => t !== (i ? 0 : 4))
  )
    return;
  const index = category(dice[0]!, shift),
    table = enumerateCasualtyTable(shift)!;
  if (index === 3) {
    if (dice.length === 1 && observation.outcome === "lasting_injury")
      return table.probabilities[3];
    if (dice.length !== 2 || observation.outcome !== secondary[dice[1]! - 1])
      return;
    return (
      table.probabilities[3]! *
      (observation.outcome === "head_injury" ? 2 / 6 : 1 / 6)
    );
  }
  const expected =
    index === 0 && observation.recordKind === "apothecary_replacement"
      ? "no_injury"
      : CASUALTY_CATEGORIES[index];
  return dice.length === 1 && observation.outcome === expected
    ? table.probabilities[index]
    : undefined;
}
function build(event: LuckEvent, rawModifiers: unknown) {
  const modifiers = fixedModifiers(rawModifiers, event.playerId ?? "");
  if (!modifiers) return;
  const modifierTotal = modifiers.length,
    observedResultChance = observedChance(event, modifierTotal);
  if (observedResultChance === undefined) return;
  return {
    rules: "bb2020" as const,
    policy: "fixed_recorded_casualty_modifiers" as const,
    modifiers,
    modifierTotal,
    ...enumerateCasualtyTable(modifierTotal)!,
    observedResultChance
  };
}

// A conditional distribution of this draw with its recorded automatic vector.
// This does not certify effective traits, eligibility, an offer/selection policy,
// future treatment, recovery or useful availability. It adds no luck score.
export function attachCasualtyTables(
  replay: ReplayModel,
  sources: ReadonlyMap<string, LuckEvent>
) {
  for (const turn of replay.turns)
    for (const raw of turn.events) {
      const event = sources.get(raw.id ?? ""),
        o = event?.metadata.casualtyObservation;
      if (!event || !o || replay.replayVersion !== "1-4-0-0") continue;
      const roll =
        o.recordKind === "direct"
          ? raw.payload
          : object(
              raw.payload?.[
                o.recordKind === "apothecary_original" ? "RollInfos" : "NewRoll"
              ]
            );
      if (!roll || !Object.hasOwn(roll, "Modifiers")) continue;
      const table = build(event, roll.Modifiers);
      if (table) {
        event.metadata.casualtyTable = table;
        event.statusReason =
          "excluded: conditional casualty distribution is known; treatment policy and current-match value remain unverified";
      }
    }
}

export function validReportedCasualtyTable(event: LuckEvent) {
  const t = event.metadata.casualtyTable;
  if (!t) return true;
  if (
    !event.metadata.casualtyObservation ||
    event.scoringStatus !== "excluded" ||
    event.probabilitySuccess !== null ||
    event.actualSuccess !== null ||
    event.delta !== 0 ||
    event.weightedDelta !== 0 ||
    event.contextualImpact ||
    event.contextualBounds ||
    event.possessionBounds ||
    event.catchPossessionBounds
  )
    return false;
  const expected = build(
    event,
    t.modifiers.length
      ? {
          Modifier: t.modifiers.map((m) => ({
            PlayerId: m.playerId,
            Skill: m.skillId,
            Effect: m.effectId,
            Value: m.value,
            ModifierType: m.modifierType
          }))
        }
      : ""
  );
  return (
    !!expected &&
    t.rules === expected.rules &&
    t.policy === expected.policy &&
    t.modifierTotal === expected.modifierTotal &&
    t.observedResultChance === expected.observedResultChance &&
    [
      "modifiers",
      "counts",
      "probabilities",
      "lastingInjuryCounts",
      "lastingInjuryProbabilities"
    ].every(
      (k) =>
        JSON.stringify(t[k as keyof typeof t]) ===
        JSON.stringify(expected[k as keyof typeof expected])
    ) &&
    JSON.stringify(event.metadata.modifiers) ===
      JSON.stringify(t.modifiers.map((m) => m.value)) &&
    event.metadata.modifiersSum === t.modifierTotal
  );
}
