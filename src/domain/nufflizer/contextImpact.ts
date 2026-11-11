import type { PreRollEvidence } from "@/domain/replay/reconstructContext";

export const CONTEXT_MODEL_VERSION = "mobility-possession-11";
export type ContextPolicy =
  "declined_team_reroll" | "full_team_reroll" | "dodge_skill_reroll";

// Unit: one other standing teammate with a legal ordinary move. Possession
// and the threat of a marked landing are explicit heuristic weights, not
// changes in touchdown or win probability.
const POSSESSION_VALUE = 2;
const MARKED_LANDING_VALUE = 1;

export function estimateNumericImpact(
  preRoll: PreRollEvidence | undefined,
  rollType: number | undefined,
  policy: ContextPolicy | undefined,
  diceDeviation: number
) {
  if (
    !policy ||
    !preRoll ||
    preRoll.teamTurn === null ||
    preRoll.otherUsefulActivations === null ||
    !preRoll.actorCell
  )
    return;
  if (
    rollType === 2 &&
    (preRoll.actorCarriesBall !== false || !preRoll.movementCheckLinked)
  )
    return;
  if (rollType === 4 && preRoll.pickupBounceExposure === null) return;
  if (rollType !== 2 && rollType !== 4) return;

  if (policy === "dodge_skill_reroll" && rollType !== 2) return;
  if (
    rollType === 2 &&
    (!preRoll.ordinaryMoveAvailability ||
      preRoll.ordinaryMoveAvailability.unknownPlayerIds.length ||
      preRoll.ordinaryMoveAvailability.knownAvailablePlayerIds.length !==
        preRoll.otherUsefulActivations)
  )
    return;
  const continuation =
    policy === "dodge_skill_reroll"
      ? preRoll.activeMoveContinuation
      : undefined;
  if (continuation && continuation.minimum !== continuation.maximum) return;
  const components = {
    availableMoves: preRoll.otherUsefulActivations,
    ...(continuation ? { activeContinuation: continuation.minimum } : {}),
    possession: rollType === 4 ? POSSESSION_VALUE : 0,
    markedBounce:
      rollType === 4 ? preRoll.pickupBounceExposure! * MARKED_LANDING_VALUE : 0
  };
  const difference =
    components.availableMoves +
    components.possession +
    components.markedBounce +
    (components.activeContinuation ?? 0);
  return {
    policy,
    components,
    difference,
    deviation: diceDeviation,
    contribution: diceDeviation * difference
  };
}

// Availability bounds are possible values of the existing ordinary-move
// component, not confidence intervals. Never substitute a midpoint or put a
// partial bound into the report's exact point totals.
export function estimateDodgeImpactBounds(
  preRoll: PreRollEvidence | undefined,
  policy: ContextPolicy | undefined,
  diceDeviation: number,
  successChance: number
) {
  const availability = preRoll?.ordinaryMoveAvailability;
  if (
    policy !== "dodge_skill_reroll" ||
    !preRoll?.actorCell ||
    preRoll.teamTurn === null ||
    preRoll.actorCarriesBall !== false ||
    !preRoll.movementCheckLinked ||
    !availability ||
    (!availability.unknownPlayerIds.length &&
      (!preRoll.activeMoveContinuation ||
        preRoll.activeMoveContinuation.minimum ===
          preRoll.activeMoveContinuation.maximum))
  )
    return;
  const minimum = availability.knownAvailablePlayerIds.length,
    maximum = minimum + availability.unknownPlayerIds.length;
  const continuation = preRoll.activeMoveContinuation;
  const values = [
    diceDeviation * (minimum + (continuation?.minimum ?? 0)),
    diceDeviation * (maximum + (continuation?.maximum ?? 0))
  ];
  return {
    policy,
    successChance,
    ...(continuation
      ? {
          activeContinuation: {
            minimum: continuation.minimum,
            maximum: continuation.maximum
          }
        }
      : {}),
    minimumMoves: minimum,
    maximumMoves: maximum,
    lower: Math.min(...values) === 0 ? 0 : Math.min(...values),
    upper: Math.max(...values) === 0 ? 0 : Math.max(...values)
  };
}
