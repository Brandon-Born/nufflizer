import type { CurrentTraitEvidence } from "@/domain/replay/traitContinuity";

// BB2020 Pass p79, Animosity p81, Right Stuff p86. These affect other
// actions. Stunty59 is deliberately absent: it changes this injury table.
export const OTHER_ACTION_INJURY_SKILLS = {
  47: "Pass",
  52: "Right Stuff",
  86: "Animosity (all teammates)",
  100: "Animosity (Orc Linemen)",
  101: "Animosity (Big 'Un Blockers)",
  102: "Animosity (Underworld Goblin Linemen)"
} as const;
export type OtherActionInjurySkill = keyof typeof OTHER_ACTION_INJURY_SKILLS;
export function isOtherActionInjurySkill(
  id: number
): id is OtherActionInjurySkill {
  return Object.hasOwn(OTHER_ACTION_INJURY_SKILLS, id);
}
export function injuryOtherActionScope(proof: CurrentTraitEvidence) {
  const t = proof.traits;
  if (t.innateSkills === null || t.acquiredSkills === null) return;
  const skills = [...new Set([...t.innateSkills, ...t.acquiredSkills])]
    .filter(isOtherActionInjurySkill)
    .sort((a, b) => a - b);
  return skills.length
    ? { policy: "outside_initial_injury_table" as const, skills }
    : undefined;
}
export function explainInjuryOtherActions(
  proof: CurrentTraitEvidence,
  role: string
) {
  const scope = injuryOtherActionScope(proof);
  return scope
    ? ` ${role} skills ${scope.skills.map((s) => OTHER_ACTION_INJURY_SKILLS[s]).join(", ")} affect other actions and leave this initial injury distribution unchanged.`
    : "";
}
