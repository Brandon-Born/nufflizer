import type { LuckEvent } from "./types";

// These overlapping counts describe recorded fields and supported calculations.
// Having one field does not establish a complete state or calibrated impact.
export function summarizeContextEvidence(events: readonly LuckEvent[]) {
  let rollCount = 0;
  let positionCount = 0;
  let possessionCount = 0;
  let clockCount = 0;
  let activationCount = 0;
  let quantifiedCount = 0;
  let boundedCount = 0;
  let consequenceCount = 0;
  const terminalTraitSources = new Set(
    events.flatMap((event) =>
      event.metadata.activationEnd?.rollSourceId
        ? [event.metadata.activationEnd.rollSourceId]
        : []
    )
  );
  for (const event of events) {
    if (!event.metadata.isRollCandidate) continue;
    rollCount++;
    const preRoll = event.metadata.preRoll;
    if (preRoll?.actorCell || event.metadata.bounceCatchReaction) positionCount++;
    if ((preRoll && preRoll.actorCarriesBall !== null) || event.metadata.bounceCatchReaction) possessionCount++;
    if (
      preRoll?.period &&
      (preRoll.teamTurn !== null || preRoll.scoringAttempt?.teamTurn != null)
    )
      clockCount++;
    if (preRoll?.activationId) activationCount++;
    if (event.contextualImpact !== undefined) quantifiedCount++;
    if (event.contextualBounds !== undefined || event.possessionBounds !== undefined || event.catchPossessionBounds !== undefined) boundedCount++;
    if (
      event.metadata.blockResolution ||
      event.metadata.movementFall ||
      event.metadata.dodgeMovement ||
      event.metadata.teamRerollMovement ||
      event.metadata.pickupResolution ||
      event.metadata.bounceCatchReaction ||
      event.metadata.movementTouchdown ||
      event.metadata.pickupBallChain ||
      event.metadata.activationLoss ||
      terminalTraitSources.has(event.metadata.sourceId ?? "")
    )
      consequenceCount++;
  }
  return {
    rollCount,
    positionCount,
    possessionCount,
    clockCount,
    activationCount,
    quantifiedCount,
    boundedCount,
    consequenceCount
  };
}
