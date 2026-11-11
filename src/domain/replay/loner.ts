import type { ReplayEvent } from "./types";

// Compiled skill identities plus GR-004's bracketed threshold rule. The public
// demos independently contain passing/failing3+ and4+ chains.2+/5+ lack the
// accepted replay examples here and are deliberately not generalized.
export function verifyLonerTest(
  skill: ReplayEvent | undefined,
  roll: ReplayEvent
): { skillId: 44 | 1008; threshold: 3 | 4; passed: boolean } | undefined {
  const skillId = skill?.payload?.Skill;
  const threshold = skillId === 1008 ? 3 : skillId === 44 ? 4 : undefined;
  const p = roll.payload;
  const die = (
    p?.Dice as { Die?: { DieType?: unknown; Value?: unknown } } | undefined
  )?.Die;
  if (
    !threshold ||
    skill?.sourceTag !== "ResultSkillUsage" ||
    skill.payload?.Used !== 1 ||
    roll.sourceTag !== "ResultRoll" ||
    roll.rollType !== 71 ||
    p?.Status !== 1 ||
    p.NewRoll !== 1 ||
    p.Requirement !== threshold ||
    p.Difficulty !== threshold ||
    (p.Modifiers !== undefined && p.Modifiers !== "") ||
    die?.DieType !== 0 ||
    typeof die.Value !== "number" ||
    !Number.isInteger(die.Value) ||
    die.Value < 1 ||
    die.Value > 6 ||
    p.Outcome !== Number(die.Value >= threshold)
  )
    return;
  return {
    skillId: skillId as 44 | 1008,
    threshold,
    passed: die.Value >= threshold
  };
}
