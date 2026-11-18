type RecordLike = Record<string, unknown>;
export type ObservedPlayerTraits = {
  dataPlayerId: number | null;
  playerTypeId: number | null;
  innateSkills: number[] | null;
  acquiredSkills: number[] | null;
};
function record(value: unknown): RecordLike | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : undefined;
}
function code(value: unknown): number | null {
  if (typeof value === "string" && /^\d{1,16}$/.test(value))
    value = Number(value);
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
function skills(
  data: RecordLike,
  field: string,
  item: string
): number[] | null {
  if (!Object.hasOwn(data, field)) return null;
  const value = data[field];
  if (value === "") return [];
  const container = record(value);
  if (!container || Object.keys(container).some((key) => key !== item))
    return null;
  const items =
    container[item] === undefined
      ? []
      : Array.isArray(container[item])
        ? container[item]
        : [container[item]];
  if (items.length > 64) return null;
  const codes = items.map(code);
  return codes.some((value) => value === null) ||
    new Set(codes).size !== codes.length
    ? null
    : (codes as number[]);
}

// Data is a current snapshot observation. Missing data/lists are unknown;
// neither initial roster skills nor another player's Data can fill them.
export function observePlayerTraits(
  value: unknown,
  playerId: number | null,
  teamId?: number | null
): ObservedPlayerTraits | null {
  const data = record(value);
  if (!data) return null;
  const dataPlayerId = code(data.Id);
  if (dataPlayerId !== null && dataPlayerId !== playerId) return null;
  const dataTeamId = code(data.TeamId);
  if (
    dataTeamId !== null &&
    teamId !== null &&
    teamId !== undefined &&
    dataTeamId !== teamId
  )
    return null;
  return {
    dataPlayerId,
    playerTypeId: code(data.IdPlayerTypes),
    innateSkills: skills(data, "InnateSkills", "InnateSkillsItem"),
    acquiredSkills: skills(data, "AcquiredSkills", "AcquiredSkillsItem")
  };
}

// A deliberately narrow fresh-snapshot eligibility contract. Other skill
// families and temporary effects require their own activation policies;
// missing Data or Effects cannot certify that those policies are absent.
const ORDINARY_MOVE_SKILLS = new Set([7, 30, 57, 68, 63, 59]);
export function ordinaryMovePolicyKnown(
  traits: ObservedPlayerTraits | null,
  playerId: number | null,
  effects: unknown
): boolean {
  return (
    playerId !== null &&
    traits?.dataPlayerId === playerId &&
    traits.innateSkills !== null &&
    traits.acquiredSkills !== null &&
    [...traits.innateSkills, ...traits.acquiredSkills].every((skill) =>
      ORDINARY_MOVE_SKILLS.has(skill)
    ) &&
    effects === ""
  );
}

// A distinct narrow policy for settling an empty ordinary bounce. It accepts
// only complete current passive skill lists and explicitly empty effects.
// Unknown/reactive skills/effects need their own ball-reaction contract.
const PLAIN_BALL_SKILLS = new Set([7, 30, 57, 68, 63, 59, 61, 6]);
// These apply to a separate action, check, or reroll decision. The learned
// lists can establish an empty first bounce only with current empty effects.
const OUTSIDE_EMPTY_PICKUP_BOUNCE = new Set([
  13, // Mighty Blow modifies armor or injury after a knockdown.
  31,
  84, // Bone Head and Animal Savagery gate a declaration.
  36, // Frenzy follows a Block outcome.
  49, // Prehensile Tail modifies a Dodge.
  64, // Throw Team-mate is a separate action.
  18,
  52, // Always Hungry and Right Stuff concern thrown players.
  19,
  27, // Regeneration and Dirty Player concern damage.
  26, // Dauntless changes strength for a block.
  33, // Disturbing Presence modifies a catch test if a catch is attempted.
  51, // Really Stupid gates a declaration.
  95, // Projectile Vomit is a separate special action.
  1008, // Loner (3+) gates a team reroll.
  44,
  47,
  86,
  100,
  101,
  102
]);

export function supportsSettledPickupTraits(traits: ObservedPlayerTraits) {
  return (
    traits.innateSkills !== null &&
    traits.acquiredSkills !== null &&
    [...traits.innateSkills, ...traits.acquiredSkills].every(
      (id) => PLAIN_BALL_SKILLS.has(id) || OUTSIDE_EMPTY_PICKUP_BOUNCE.has(id)
    )
  );
}
export function plainBallPolicyKnown(
  traits: ObservedPlayerTraits | null,
  playerId: number | null,
  effects: unknown
): boolean {
  return (
    playerId !== null &&
    traits?.dataPlayerId === playerId &&
    traits.innateSkills !== null &&
    traits.acquiredSkills !== null &&
    [...traits.innateSkills, ...traits.acquiredSkills].every((skill) =>
      PLAIN_BALL_SKILLS.has(skill)
    ) &&
    effects === ""
  );
}
