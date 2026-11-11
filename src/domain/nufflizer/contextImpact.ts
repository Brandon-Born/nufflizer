import type { PreRollEvidence } from "@/domain/replay/reconstructContext";

export const CONTEXT_MODEL_VERSION = "mobility-possession-5";
export type ContextPolicy = "declined_team_reroll" | "full_team_reroll";

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

  const components = {
    availableMoves: preRoll.otherUsefulActivations,
    possession: rollType === 4 ? POSSESSION_VALUE : 0,
    markedBounce:
      rollType === 4 ? preRoll.pickupBounceExposure! * MARKED_LANDING_VALUE : 0
  };
  const difference =
    components.availableMoves + components.possession + components.markedBounce;
  return {
    policy,
    components,
    difference,
    contribution: diceDeviation * difference
  };
}
