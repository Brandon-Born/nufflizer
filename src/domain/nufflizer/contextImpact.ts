import type { PreRollEvidence } from "@/domain/replay/reconstructContext";

export const CONTEXT_MODEL_VERSION = "mobility-possession-13";
export type ContextPolicy =
  | "declined_team_reroll"
  | "full_team_reroll"
  | "dodge_skill_reroll"
  | "sure_hands_reroll";

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
    policy === "sure_hands_reroll" ||
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
  if (
    rollType === 4 &&
    (preRoll.pickupBounceExposure === null ||
      preRoll.pickupSettlementKnown !== true)
  )
    return;
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

// Only own possession and marked loose-ball exposure: no activation, carrier
// continuation, opponent possession gain or scoring value is priced here.
// Pending catches/throw-ins remain [0,3]; their future dice are not scored now.
export function estimatePickupPossessionBounds(
  preRoll: PreRollEvidence | undefined,
  policy: ContextPolicy | undefined,
  deviation: number,
  successChance: number
) {
  if (policy !== "sure_hands_reroll" || !preRoll?.pickupSuccessors) return;
  let minimum = 0,
    maximum = 0;
  for (const branch of preRoll.pickupSuccessors.branches) {
    if (branch.kind !== "empty") {
      maximum += POSSESSION_VALUE + MARKED_LANDING_VALUE;
      continue;
    }
    if (branch.settlement === "loose")
      minimum +=
        POSSESSION_VALUE +
        (branch.marking === "marked" ? MARKED_LANDING_VALUE : 0);
    maximum +=
      POSSESSION_VALUE +
      (branch.marking !== "unmarked" ? MARKED_LANDING_VALUE : 0);
  }
  minimum /= 8;
  maximum /= 8;
  const endpoints = [deviation * minimum, deviation * maximum];
  return {
    policy,
    successChance,
    minimumDifference: minimum,
    maximumDifference: maximum,
    lower: Math.min(...endpoints) || 0,
    upper: Math.max(...endpoints) || 0
  };
}
