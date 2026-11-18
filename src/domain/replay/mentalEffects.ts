import type { ObservedBoard } from "./boardState";

export type MentalTraitEffect = { providerSkillId: 31 | 51 };
export type MentalEffectEnd = MentalTraitEffect & {
  declarationSourceId: string;
  playerId: string;
};

export type ActivationSkill = 31 | 51 | 84;
export const ACTIVATION_ROLL_TYPE = { 31: 33, 51: 34, 84: 36 } as const;

export function readAnimalSavageryOffer(
  payload: Record<string, unknown> | undefined
) {
  if (
    !payload ||
    Object.keys(payload).length !== 2 ||
    (payload.GamerId !== 0 && payload.GamerId !== 1)
  )
    return;
  const victims = payload.VictimsIds;
  if (
    !victims ||
    typeof victims !== "object" ||
    Object.keys(victims).length !== 1 ||
    !("VictimsIdsItem" in victims)
  )
    return;
  const items = victims.VictimsIdsItem;
  const offered = Array.isArray(items) ? items : [items];
  if (
    offered.length < 1 ||
    offered.length > 8 ||
    !offered.every(
      (id) => typeof id === "number" && Number.isSafeInteger(id) && id >= 0
    ) ||
    new Set(offered).size !== offered.length
  )
    return;
  return { teamId: String(payload.GamerId), victimIds: offered.map(String) };
}

// Check the observed die against its effective target. An Animal Savagery
// modifier also needs its own verified Block or Blitz declaration.
export function mentalTraitTest(
  payload: Record<string, unknown> | undefined,
  provider: ActivationSkill,
  status: number,
  fresh: number
): boolean | null {
  const die = record(record(payload?.Dice)?.Die);
  const face = die?.Value;
  if (
    !payload ||
    payload.RollType !== ACTIVATION_ROLL_TYPE[provider] ||
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
  if (provider === 51 || provider === 84) {
    const mod = record(record(payload.Modifiers)?.Modifier);
    if (
      payload.Requirement !== 4 ||
      !(
        (payload.Difficulty === 4 && unmodified) ||
        (payload.Difficulty === 2 &&
          mod?.ModifierType === (provider === 51 ? 17 : 18) &&
          mod.Value === 2 &&
          mod.Skill === -1 &&
          mod.Effect === -1 &&
          (provider === 51
            ? typeof mod.PlayerId === "number"
            : mod.PlayerId === -1))
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
// Provider 84 has source evidence for the notification's holder only.
// Playable state still uses the separate 31/51 rule below.
export function recordedConfusedProvider(value: unknown): 31 | 51 | 84 | null {
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
    (provider === 31 ||
      provider === 51 ||
      (provider === 84 && effect.CharacModifiers === "")) &&
    durations &&
    Object.keys(durations).length === 1 &&
    Array.isArray(items) &&
    items.length === 2 &&
    numeric(items[0]) === 6 &&
    numeric(items[1]) === 1
    ? provider
    : null;
}

export function recordedMentalEffect(value: unknown): MentalTraitEffect | null {
  const provider = recordedConfusedProvider(value);
  return provider === 31 || provider === 51
    ? { providerSkillId: provider }
    : null;
}

export function observesOnlyAnimalSavageryEffect(value: unknown): boolean {
  const effects = record(value);
  return (
    !!effects &&
    Object.keys(effects).length === 1 &&
    recordedConfusedProvider(effects.PlayerEffect) === 84
  );
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
