import type { ReplayEvent } from "./types";

export type ObservedDodgeMovement = {
  declarationSourceId: string;
  doMoveSourceId: string;
  outcomeSourceId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  movementBefore: number | null;
  movementAfter: number | null;
  carriesBall: boolean;
  checkpointAfter: number;
};

// This is an actual, unmodified recorded chain, not an eligibility or optional
// reroll policy. Extra modifiers, dice or unknown fields need their own policy.
export function unmodifiedDodgeDie(
  event: ReplayEvent,
  status: 1 | 2,
  success: boolean
): number | undefined {
  const p = event.payload;
  if (
    event.sourceTag !== "ResultRoll" ||
    event.rollType !== 2 ||
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
    p.RollType !== 2 ||
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

export function successfulDodgeMoveOutcome(event: ReplayEvent): boolean {
  const p = event.payload;
  if (
    event.sourceTag !== "ResultMoveOutcome" ||
    !p ||
    p.Moved !== 1 ||
    p.TentacleUsed !== 0 ||
    p.FumbleRooskieUsed !== 0 ||
    (p.Pushbacks !== undefined && p.Pushbacks !== "") ||
    Object.keys(p).some(
      (k) =>
        ![
          "Moved",
          "TentacleUsed",
          "FumbleRooskieUsed",
          "Rolls",
          "Pushbacks"
        ].includes(k)
    )
  )
    return false;
  const rolls = p.Rolls as Record<string, unknown> | undefined;
  const summary = rolls?.RollSummary as Record<string, unknown> | undefined;
  return (
    !!rolls &&
    Object.keys(rolls).join() === "RollSummary" &&
    !!summary &&
    !Array.isArray(summary) &&
    Object.keys(summary).length === 2 &&
    summary.RollType === 2 &&
    summary.Outcome === 1
  );
}
