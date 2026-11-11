import type { LuckEventType, LuckReport } from "./types";
import { LuckEventTypeSchema } from "./reportSchema";

export function scoredEvidenceForTeam(
  report: Pick<LuckReport, "events">,
  teamId: string
) {
  const byType = Object.fromEntries(
    LuckEventTypeSchema.options.map((type) => [type, 0])
  ) as Record<LuckEventType, number>;
  let total = 0;
  for (const event of report.events)
    if (event.teamId === teamId && event.scoringStatus === "scored") {
      total++;
      byType[event.type]++;
    }
  return { total, byType };
}
// An empty sum is mathematically zero, but it is not measured even luck.
export function formatDiceContribution(
  value: number,
  scoredCount: number,
  digits = 2
): string {
  return scoredCount ? value.toFixed(digits) : "Not scored";
}

export function formatPreRollPosition(
  context: LuckReport["events"][number]["metadata"]["preRoll"]
): string | null {
  if (!context || context.teamTurn === null) return null;
  const period =
    context.period === "first_half"
      ? "First half"
      : context.period === "second_half"
        ? "Second half"
        : context.period === "extra_time"
          ? "Extra time"
          : null;
  return [period, "team turn " + context.teamTurn].filter(Boolean).join(", ");
}

export function explainPreRollEvidence(
  context: LuckReport["events"][number]["metadata"]["preRoll"]
): string | null {
  const details: string[] = [];
  if (context?.actorStandUpSourceIndex !== undefined) {
    details.push(
      context.actorMovementRemaining === undefined
        ? "The player stood up earlier in this activation."
        : `The player stood up earlier in this activation and had ${context.actorMovementRemaining} movement points at this roll.`
    );
  }
  if (context?.actorPickupSourceId) {
    details.push(
      "The player was carrying the ball they picked up earlier in this activation."
    );
  }
  if (context?.teammateCarrierMove) {
    details.push(
      context.teammateCarrierMove.effect === "approach"
        ? "This move would put the dodging player next to their ball carrier."
        : "This move would take the dodging player away from their ball carrier."
    );
  }
  return details.length > 0 ? details.join(" ") : null;
}

export function explainContextImpact(
  event: LuckReport["events"][number]
): string | null {
  const impact = event.contextualImpact;
  if (!impact) return null;
  const { availableMoves, possession, markedBounce } = impact.components;
  return (
    [
      "Failure would end the turn with " +
        availableMoves +
        " other standing teammates still able to move",
      possession ? "success would secure the ball" : null,
      possession
        ? Math.round(markedBounce * 100) +
          "% of eligible bounce squares are marked by an opponent"
        : null
    ]
      .filter(Boolean)
      .join("; ") +
    ". " +
    impact.contribution.toFixed(2) +
    " context units under the recorded reroll policy."
  );
}

export function explainMovementOutcome(
  metadata: Pick<
    LuckReport["events"][number]["metadata"],
    "movementFall" | "movementTouchdown"
  >
): string | null {
  const { movementFall: fall, movementTouchdown } = metadata;
  if (movementTouchdown)
    return "The replay records a touchdown immediately after this move.";
  if (!fall) return null;
  const aftermath = [
    "The player fell and the turn ended.",
    fall.armorHeld === true
      ? "Armor held."
      : fall.armorHeld === false
        ? "Armor broke."
        : null,
    fall.playerRemoved ? "The player was removed from the pitch." : null
  ]
    .filter(Boolean)
    .join(" ");
  const unknown = fall.unscoredDamageRolls
    ? ` Damage rolls without verified odds: ${fall.unscoredDamageRolls}.`
    : "";
  return `${aftermath} Dice subtotal for the movement check and scored damage: ${fall.diceContribution.toFixed(2)}.${unknown}`;
}
