// Installed BoardDataSkill IDs, independently paired with the 2020 rules:
// Pass p79, Animosity p81, Right Stuff p86, Stunty p86. These are not a
// certificate of legal activation or of any other skill/continuation policy.
export const BLOCK_NON_KNOCKDOWN_SKILLS = {
  47: "Pass",
  52: "Right Stuff",
  59: "Stunty",
  86: "Animosity (all teammates)",
  100: "Animosity (Orc Linemen)",
  101: "Animosity (Big 'Un Blockers)",
  102: "Animosity (Underworld Goblin Linemen)"
} as const;

export type BlockNonKnockdownSkill = keyof typeof BLOCK_NON_KNOCKDOWN_SKILLS;
export function isBlockNonKnockdownSkill(
  id: number
): id is BlockNonKnockdownSkill {
  return Object.hasOwn(BLOCK_NON_KNOCKDOWN_SKILLS, id);
}

export function blockNonKnockdownSkillReceipt(
  attacker: ReadonlySet<number>,
  defender: ReadonlySet<number>
) {
  const current = (skills: ReadonlySet<number>) =>
    Array.from(skills)
      .filter(isBlockNonKnockdownSkill)
      .sort((a, b) => a - b);
  const a = current(attacker),
    d = current(defender);
  return a.length || d.length
    ? {
        policy: "outside_current_pool_knockdowns" as const,
        attacker: a,
        defender: d
      }
    : undefined;
}
export type BlockNonKnockdownReceipt = NonNullable<
  ReturnType<typeof blockNonKnockdownSkillReceipt>
>;

export function explainBlockNonKnockdownSkills(
  receipt: BlockNonKnockdownReceipt | undefined
): string {
  if (!receipt) return "";
  const name = (ids: readonly BlockNonKnockdownSkill[]) =>
    ids.map((id) => BLOCK_NON_KNOCKDOWN_SKILLS[id]).join(", ");
  const roles = [
    receipt.attacker.length ? `attacker ${name(receipt.attacker)}` : null,
    receipt.defender.length ? `defender ${name(receipt.defender)}` : null
  ]
    .filter(Boolean)
    .join("; ");
  return ` Current skills classified separately: ${roles}. These skills affect passing, teammate throws, dodging or later injury, without changing this pool's immediate knockdown table. Those other effects are outside this component.`;
}
