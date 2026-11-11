import type { ObservedBoard } from "./boardState";

export type MentalTraitEffect = { providerSkillId: 31 | 51 };
export type MentalEffectEnd = MentalTraitEffect & {
  declarationSourceId: string;
  playerId: string;
};

// Only the observed unmodified Bone Head2+ and Really Stupid4+/assisted2+
// initial tests. This is a consistency check, not a scored reroll policy.
export function mentalTraitTest(
  payload: Record<string, unknown> | undefined,
  provider: 31 | 51,
  status: number,
  fresh: number
): boolean | null {
  const die = record(record(payload?.Dice)?.Die);
  const face = die?.Value;
  if (
    !payload ||
    payload.RollType !== (provider === 31 ? 33 : 34) ||
    payload.Status !== status ||
    payload.NewRoll !== fresh ||
    die?.DieType !== 0 ||
    typeof face !== "number" ||
    !Number.isInteger(face) ||
    face < 1 ||
    face > 6 ||
    (payload.Outcome !== 0 && payload.Outcome !== 1)
  )
    return null;
  const unmodified =
    payload.Modifiers === undefined || payload.Modifiers === "";
  if (
    provider === 31 &&
    !(payload.Requirement === 2 && payload.Difficulty === 2 && unmodified)
  )
    return null;
  if (provider === 51) {
    const mod = record(record(payload.Modifiers)?.Modifier);
    if (
      payload.Requirement !== 4 ||
      !(
        (payload.Difficulty === 4 && unmodified) ||
        (payload.Difficulty === 2 &&
          mod?.ModifierType === 17 &&
          mod.Value === 2 &&
          mod.Skill === -1 &&
          mod.Effect === -1 &&
          typeof mod.PlayerId === "number")
      )
    )
      return null;
  }
  const success = face >= (payload.Difficulty as number);
  return Number(success) === payload.Outcome ? success : null;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function numeric(value: unknown): number | undefined {
  if (typeof value === "string" && /^\d{1,16}$/.test(value))
    value = Number(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}
export function recordedMentalEffect(value: unknown): MentalTraitEffect | null {
  const effect = record(value);
  const durations = record(effect?.Durations);
  const provider = numeric(effect?.ProviderId);
  const items = durations?.DurationsItem;
  return effect &&
    Object.keys(effect).every((k) =>
      [
        "EffectId",
        "ProviderType",
        "ProviderId",
        "Durations",
        "CharacModifiers",
        "AdditionalSkills"
      ].includes(k)
    ) &&
    (effect.CharacModifiers === undefined || effect.CharacModifiers === "") &&
    (effect.AdditionalSkills === undefined || effect.AdditionalSkills === "") &&
    numeric(effect.EffectId) === 44 &&
    numeric(effect.ProviderType) === 4 &&
    (provider === 31 || provider === 51) &&
    durations &&
    Object.keys(durations).length === 1 &&
    Array.isArray(items) &&
    items.length === 2 &&
    numeric(items[0]) === 6 &&
    numeric(items[1]) === 1
    ? { providerSkillId: provider }
    : null;
}

// Each checkpoint must supply its own positive observation. Absence/malformed
// Effects never means expired, and this does not change activation availability.
export function observeMentalEffect(value: unknown): MentalTraitEffect | null {
  const effects = record(value);
  if (!effects || Object.keys(effects).some((k) => k !== "PlayerEffect"))
    return null;
  const values =
    effects.PlayerEffect === undefined
      ? []
      : Array.isArray(effects.PlayerEffect)
        ? effects.PlayerEffect
        : [effects.PlayerEffect];
  if (values.length > 64) return null;
  const candidates = values.filter((e) => numeric(record(e)?.EffectId) === 44);
  return candidates.length === 1 ? recordedMentalEffect(candidates[0]) : null;
}

export function applyObservedMentalEffects(
  board: ObservedBoard
): ObservedBoard {
  return {
    ...board,
    teams: board.teams.map((team) => ({
      ...team,
      players: team.players.map((player) =>
        player.mentalEffect && player.tackleZone !== true
          ? { ...player, tackleZone: false }
          : player
      )
    }))
  };
}
