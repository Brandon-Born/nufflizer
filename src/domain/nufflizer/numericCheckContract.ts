import type { ReplayEvent } from "@/domain/replay/types";

// UI-002/006/008/009/014/093/094/097 and the installed roll enum agree on
// these identities. This admits recorded effective targets, not a general
// modifier calculator, pass accuracy model, or rule for other roll families.
export function numericCheckExclusion(
  replayVersion: string | undefined,
  event: ReplayEvent,
  verifiedTeamReroll: boolean
): string | undefined {
  if (
    event.sourceTag !== "ResultRoll" ||
    ![1, 2, 4, 7].includes(event.rollType ?? -1)
  )
    return undefined;
  if (replayVersion !== "1-4-0-0")
    return "unsupported replay version for verified numeric checks";
  const payload = event.payload;
  if (payload?.NewRoll !== 1)
    return "roll freshness is missing or is a repeated summary";
  if (payload.Status !== 1 && !(payload.Status === 2 && verifiedTeamReroll))
    return "replacement or unknown roll status requires a verified reroll policy";
  if (
    !Number.isInteger(payload.Difficulty) ||
    Number(payload.Difficulty) < 2 ||
    Number(payload.Difficulty) > 6
  )
    return "verified numeric checks require an explicit effective Difficulty from 2 through 6";
  if (payload.Outcome !== 0 && payload.Outcome !== 1)
    return "verified numeric checks require an explicit binary outcome";
  if (payload.Requirement !== undefined) {
    if (!Number.isSafeInteger(payload.Requirement))
      return "invalid base Requirement for numeric check";
    const container = payload.Modifiers as { Modifier?: unknown } | undefined;
    const nodes =
      container?.Modifier === undefined
        ? []
        : Array.isArray(container.Modifier)
          ? container.Modifier
          : [container.Modifier];
    let modifierSum = 0;
    for (const node of nodes) {
      const value = (node as { Value?: unknown } | null)?.Value;
      if (!Number.isSafeInteger(value)) return "invalid numeric check modifier";
      modifierSum += Number(value);
      if (!Number.isSafeInteger(modifierSum))
        return "numeric check modifier total is out of bounds";
    }
    const effective = Number(payload.Requirement) - modifierSum;
    // Only Catch has independently paired natural-one/negative-modifier-six
    // edge cases here. Other families' edge rules remain unsupported.
    if (event.rollType !== 7 && (effective < 2 || effective > 6))
      return "natural-roll edge outside this family's validated numeric scope";
    if (payload.Difficulty !== Math.max(2, Math.min(6, effective)))
      return "effective Difficulty contradicts Requirement and modifiers";
  }
  return undefined;
}
