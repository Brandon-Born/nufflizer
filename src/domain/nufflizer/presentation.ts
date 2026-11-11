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

export function explainContextCoverage(
  evidence: LuckReport["coverage"]["contextEvidence"]
): string {
  return `Contextual impact quantified for ${evidence.quantifiedCount} of ${evidence.rollCount} roll candidates. Pre-roll position observed for ${evidence.positionCount}, possession known for ${evidence.possessionCount}, and period with team turn known for ${evidence.clockCount}. Linked roll consequences observed for ${evidence.consequenceCount}.`;
}

export function formatPlayerObservation(
  event: LuckReport["events"][number]
): string {
  if (!event.playerId) return "Player unknown";
  return `Player ${event.playerId}${
    event.metadata.initialRosterName
      ? ` (initial roster: ${event.metadata.initialRosterName})`
      : ""
  }`;
}

export function formatPreRollPosition(
  context: LuckReport["events"][number]["metadata"]["preRoll"]
): string | null {
  const counter = context?.teamTurn ?? context?.scoringAttempt?.teamTurn;
  if (!context || counter === null || counter === undefined) return null;
  const period =
    context.period === "first_half"
      ? "First half"
      : context.period === "second_half"
        ? "Second half"
        : context.period === "extra_time"
          ? "Extra time"
          : null;
  return [
    period,
    (context.teamTurn === null ? "actor team turn " : "team turn ") + counter
  ]
    .filter(Boolean)
    .join(", ");
}

export function explainPreRollEvidence(
  context: LuckReport["events"][number]["metadata"]["preRoll"]
): string | null {
  const details: string[] = [];
  const traitNames = new Map([
    [30, "Block"],
    [7, "Dodge"],
    [57, "Tackle"],
    [63, "Thick Skull"],
    [59, "Stunty"]
  ]);
  for (const [role, traits] of [
    ["actor", context?.actorTraits],
    ["target", context?.targetTraits]
  ] as const) {
    const listed = [
      ...new Set([
        ...(traits?.innateSkills ?? []),
        ...(traits?.acquiredSkills ?? [])
      ])
    ].flatMap((code) => (traitNames.has(code) ? [traitNames.get(code)!] : []));
    if (listed.length)
      details.push(
        `The ${role}'s recorded player data lists ${listed.join(", ")}. Skill use needs its own action evidence.`
      );
  }
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
  if (context?.scoringAttempt) {
    const remaining = context.scoringAttempt.turnsRemaining;
    details.push(
      "The carrier was attempting to enter the opponent's end zone."
    );
    if (remaining !== null)
      details.push(
        remaining === 0
          ? "This was the actor team's last scheduled turn of the recorded period."
          : `The actor team had ${remaining} further scheduled turns in the recorded period.`
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

export function explainProGate(
  gate: LuckReport["events"][number]["metadata"]["proGate"]
): string | null {
  return gate
    ? `Pro ${gate.passed ? "passed" : "failed"} its recorded 3+ test. Four of six faces pass this test.`
    : null;
}

export function explainPickupBallChain(
  event: LuckReport["events"][number],
  teams: Pick<LuckReport["teams"][number], "teamId" | "teamName">[] = [],
  events: ReadonlyMap<string, LuckReport["events"][number]> = new Map()
): string | null {
  const chain = event.metadata.pickupBallChain;
  if (!chain) return null;
  const catches = chain.catchEventIds
    .map((id) => events.get(id))
    .filter((caught) => caught !== undefined)
    .map(
      (caught) =>
        `${formatPlayerObservation(caught)} ${caught.actualSuccess ? "succeeded on" : "failed"} the recorded catch.`
    )
    .join(" ");
  const totals = Object.entries(chain.diceByTeam)
    .map(
      ([id, value]) =>
        `${teams.find((team) => team.teamId === id)?.teamName ?? `Team ${id}`}: ${value.toFixed(2)}`
    )
    .join(", ");
  return `The failed pickup led to ${chain.bounceSourceIds.length} recorded bounce${chain.bounceSourceIds.length === 1 ? "" : "s"} and ${chain.catchEventIds.length} linked catch check${chain.catchEventIds.length === 1 ? "" : "s"}. ${catches ? catches + " " : ""}The last recorded landing was [${chain.endingCell.x}, ${chain.endingCell.y}]. Existing dice subtotals by team: ${totals}. These dice contributions are already included in the team totals. The cost of losing possession or the turn remains unquantified.`;
}
