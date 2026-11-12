import type { ReplayEvent } from "./types";

// This is an actual, unmodified recorded chain, not an eligibility or optional
// reroll policy. Extra modifiers, dice or unknown fields need their own policy.
export function unmodifiedD6Check(
  event: ReplayEvent,
  family: 1 | 2 | 4,
  status: 1 | 2,
  success: boolean
): number | undefined {
  const p = event.payload;
  if (
    event.sourceTag !== "ResultRoll" ||
    event.rollType !== family ||
    !p ||
    Object.keys(p).some(
      (k) =>
        ![
          "Status",
          "Requirement",
          "Dice",
          "Difficulty",
          "RollType",
          "Outcome",
          "NewRoll",
          "Modifiers"
        ].includes(k)
    ) ||
    p.Status !== status ||
    p.NewRoll !== 1 ||
    p.Outcome !== Number(success) ||
    p.RollType !== family ||
    p.Requirement !== p.Difficulty ||
    (p.Modifiers !== undefined && p.Modifiers !== "")
  )
    return;
  const dice = p.Dice as Record<string, unknown> | undefined;
  const die = dice?.Die as Record<string, unknown> | undefined;
  const target = p.Difficulty,
    face = die?.Value;
  if (
    !dice ||
    Object.keys(dice).join() !== "Die" ||
    !die ||
    Array.isArray(die) ||
    Object.keys(die).some((k) => k !== "DieType" && k !== "Value") ||
    die.DieType !== 0 ||
    typeof target !== "number" ||
    !Number.isInteger(target) ||
    target < 2 ||
    target > 6 ||
    typeof face !== "number" ||
    !Number.isInteger(face) ||
    face < 1 ||
    face > 6 ||
    face >= target !== success
  )
    return;
  return target;
}
