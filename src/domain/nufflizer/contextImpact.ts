import type { PreRollEvidence } from "@/domain/replay/reconstructContext";

export const CONTEXT_MODEL_VERSION = "mobility-possession-56";
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
export const PICKUP_POSSESSION_STAGES = [
  "sure_hands_reroll",
  "kept_pickup_possession",
  "team_pickup_possession"
] as const;
type PickupPossessionStage = (typeof PICKUP_POSSESSION_STAGES)[number];

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
    (policy === "full_team_reroll" ||
      preRoll.actorCarriesBall !== false ||
      !preRoll.movementCheckLinked)
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
  policy: ContextPolicy | PickupPossessionStage | undefined,
  deviation: number,
  successChance: number
) {
  if ((policy !== "sure_hands_reroll" && policy !== "kept_pickup_possession" && policy !== "team_pickup_possession") || !preRoll?.pickupSuccessors) return;
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

// Equal differences establish the component before the die, for either
// outcome. A pending reaction, return or unknown zone keeps it a range.
export function exactPickupPossession(
  bounds: NonNullable<ReturnType<typeof estimatePickupPossessionBounds>>,
  actualSuccess: boolean,
  waitingCheckpointAfter?: number
) {
  if (bounds.minimumDifference !== bounds.maximumDifference) return;
  const difference = bounds.minimumDifference;
  const deviation = Number(actualSuccess) - bounds.successChance;
  return {
    policy: "exact_pickup_possession" as const,
    stage: bounds.policy,
    waitingCheckpointAfter,
    successChance: bounds.successChance,
    components: {
      possession: POSSESSION_VALUE,
      markedBounce: difference - POSSESSION_VALUE
    } as const,
    difference,
    deviation,
    contribution: deviation * difference
  };
}

// Fresh successful catch only. Failure may continue through choices/rebounds;
// bound its own-possession continuation rather than inventing a fixed policy.
export function estimateFreshCatchPossession(successChance: number) {
  return {
    policy: "fresh_catch_failure_envelope",
    successChance,
    minimumDifference: 0,
    maximumDifference: 2,
    lower: 0,
    upper: POSSESSION_VALUE * (1 - successChance)
  } as const;
}

// Before the original Catch die, holding the recorded decline-on-failure
// policy fixed. The kept summary is not a fresh random stage at the decision.
// Later failure continuations remain anywhere in [0,2] own-possession units.
export function estimateKeptCatchPossession(successChance: number) {
  return {
    policy: "kept_catch_failure_envelope",
    successChance,
    minimumDifference: 0,
    maximumDifference: 2,
    lower: -POSSESSION_VALUE * successChance,
    upper: 0
  } as const;
}

// Teammate moves at a qualified original or replacement die. The caller
// verifies the recorded policy and the actual move or terminal self-fall.
// Reroll costs, actor continuation and possession have separate accounting.
function terminalTeamMoveBounds(
  preRoll: PreRollEvidence | undefined,
  actualSuccess: boolean,
  successChance: number,
  terminalCheckpointAfter: number,
  exact = false
) {
  const availability = preRoll?.ordinaryMoveAvailability;
  if (
    !preRoll?.actorCell ||
    preRoll.teamTurn === null ||
    preRoll.actorCarriesBall !== false ||
    !preRoll.movementCheckLinked ||
    !availability ||
    (availability.unknownPlayerIds.length === 0) !== exact
  )
    return;
  const minimumMoves = availability.knownAvailablePlayerIds.length;
  const maximumMoves = minimumMoves + availability.unknownPlayerIds.length;
  const deviation = Number(actualSuccess) - successChance;
  const endpoints = [deviation * minimumMoves, deviation * maximumMoves];
  return {
    terminalCheckpointAfter,
    successChance,
    minimumMoves,
    maximumMoves,
    lower: Math.min(...endpoints) || 0,
    upper: Math.max(...endpoints) || 0
  };
}

export function estimateExactTeamMoves(
  policy:
    | "team_reroll_terminal_moves"
    | "team_reroll_rush_moves"
    | "kept_dodge_terminal_moves"
    | "kept_rush_terminal_moves",
  preRoll: PreRollEvidence | undefined,
  actualSuccess: boolean,
  successChance: number,
  terminalCheckpointAfter: number
) {
  if (preRoll?.ordinaryMoveRosterComplete !== true) return;
  const exact = terminalTeamMoveBounds(
    preRoll, actualSuccess, successChance, terminalCheckpointAfter, true
  );
  if (!exact) return;
  return {
    policy,
    terminalCheckpointAfter,
    successChance,
    components: { availableMoves: exact.minimumMoves },
    difference: exact.minimumMoves,
    deviation: Number(actualSuccess) - successChance,
    contribution: exact.lower
  };
}


export function estimateTeamDodgeMoveBounds(
  ...args: Parameters<typeof terminalTeamMoveBounds>
) {
  const bounds = terminalTeamMoveBounds(...args);
  return bounds ? { policy: "team_reroll_terminal_moves" as const, ...bounds } : undefined;
}

// The same teammate-only unit at an unmodified committed Rush replacement.
// Ordinary-move proof excludes combined Dodge/Blitz/ball-value policies.
export function estimateTeamRushMoveBounds(
  ...args: Parameters<typeof terminalTeamMoveBounds>
) {
  const bounds = terminalTeamMoveBounds(...args);
  return bounds ? { policy: "team_reroll_rush_moves" as const, ...bounds } : undefined;
}


// Before the original Rush, holding the observed decline-on-failure policy
// fixed. Its kept summary is not a second random stage or a resource spend.
export function estimateKeptRushMoveBounds(
  preRoll: PreRollEvidence | undefined, successChance: number, terminalCheckpointAfter: number
) {
  const bounds=terminalTeamMoveBounds(preRoll,false,successChance,terminalCheckpointAfter);
  return bounds ? {policy:"kept_rush_terminal_moves" as const,...bounds} : undefined;
}


// Original unmodified Dodge under the recorded decline-on-failure policy.
// Only other-player moves; the actor, ball, reroll decision and damage stay separate.
export function estimateKeptDodgeMoveBounds(
  preRoll: PreRollEvidence | undefined,
  successChance: number,
  terminalCheckpointAfter: number
) {
  const bounds = terminalTeamMoveBounds(
    preRoll, false, successChance, terminalCheckpointAfter
  );
  return bounds
    ? { policy: "kept_dodge_terminal_moves" as const, ...bounds }
    : undefined;
}
