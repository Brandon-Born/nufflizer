import type { LuckEventType, LuckReport } from "./types";
import { LuckEventTypeSchema } from "./reportSchema";

export function explainRerollCounter(
  event: LuckReport["events"][number],
  sources: ReadonlyMap<string,LuckReport["events"][number]> = new Map()
): string | null {
  const offer=event.metadata.rerollOffer ?? sources.get(event.metadata.block?.previousPoolSourceId ?? "")?.metadata.rerollOffer;
  const counter=event.metadata.teamRerollCounter ?? sources.get(event.metadata.rerollDecisionId ?? offer?.decisionSourceId ?? "")?.metadata.teamRerollCounter;
  if(!counter) return null;
  const before=counter.before,after=counter.after;
  const choice=counter.spent ? "The recorded decision used one team reroll." : "The recorded decision declined the reroll; no team reroll was spent on this decision.";
  const follow=after
    ? ` The next same-turn checkpoint records ${after.count}. The counter change from ${before.count} to ${after.count} ${counter.reconciliation === "matched" ? "matches this decision" : "does not match this single decision; resource consumption remains unreconciled"}.`
    : " The next same-turn counter is unknown. A missing counter is not treated as zero, and a later turn cannot fill it.";
  return `Last recorded team reroll counter before the offer: ${before.count} (ReplayStep ${before.replayStep}, child ${before.childIndex}). ${choice}${follow} These observations do not certify another reroll is legal. The cost of losing the reroll is not included in luck points.`;
}

export function formatActualOutcome(
  event: LuckReport["events"][number]
): string {
  if (event.actualSuccess === null) return "Unknown";
  if (event.metadata.block)
    return event.actualSuccess ? "Raw target met" : "Raw target missed";
  return event.actualSuccess ? "Success" : "Fail";
}

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
  return `Contextual impact quantified for ${evidence.quantifiedCount} of ${evidence.rollCount} roll candidates. Pre-roll position observed for ${evidence.positionCount}, possession known for ${evidence.possessionCount}, and period with team turn known for ${evidence.clockCount}. Linked roll consequences observed for ${evidence.consequenceCount}.${evidence.boundedCount ? ` Separate context ranges are available for ${evidence.boundedCount} ${evidence.boundedCount === 1 ? "check" : "checks"} for partial components; these are excluded from point totals.` : ""}`;
}

export function explainRecruitmentEvidence(
  records: LuckReport["recruitments"]
): string | null {
  if (!records.length) return null;
  const reused = records.filter((r) => r.previousPurchaseSourceId).length;
  return `Recorded mercenary purchase events: ${records.length}; linked roster observations: ${records.filter((r) => r.rosterTeamId !== null).length}. ${reused} ${reused === 1 ? "record reuses" : "records reuse"} an earlier player ID. Selected trait lists describe separate purchases; current skill eligibility remains unverified.`;
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
  for (const player of context?.suppressedTackleZones ?? [])
    details.push(
      `Player ${player.playerId} had no tackle zone under the recorded ${player.providerSkillId === 51 ? "Really Stupid" : "Bone Head"} effect at this checkpoint.`
    );
  if (context?.actorMentalEffectEnd)
    details.push(
      "The player's previous mental-trait effect ended earlier in this activation. That record alone does not establish tackle-zone recovery."
    );
  const ended = context?.endedActivationSourceIds?.length ?? 0;
  if (ended)
    details.push(
      `${ended} earlier player activation${ended === 1 ? " had" : "s had"} already ended in this team turn.`
    );
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
        ? "The player stood up earlier in this activation. Remaining movement is unknown because the stand-up cost timing is unverified."
        : `The player stood up earlier in this activation and had ${context.actorMovementRemaining} movement points at this roll.`
    );
  }
  if (context?.actorDodgeMoveSourceId) details.push(
    "An earlier successful Dodge skill reroll and its recorded move preserve this player's position and movement in the same activation."
  );
  if(context?.pickupSettlementKnown === false) details.push("Current skills or effects leave bounce reactions unresolved; empty squares alone cannot establish settled possession loss.");
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

function explainActiveContinuation(
  event: LuckReport["events"][number]
): string {
  const continuation = event.metadata.preRoll?.activeMoveContinuation;
  if (!continuation)
    return "The active player's continuation is outside this component.";
  if (continuation.minimum === 1)
    return `Success would also retain one further ordinary move in this activation without another Dodge or Rush (${continuation.movementBefore} movement points before this step, ${continuation.movementAfterSuccess} after success). This is one movement option, not the value of every remaining square.`;
  if (continuation.maximum === 1)
    return "The active player's further move without another Dodge or Rush is also uncertain (0 to 1 option): its budget or opponent marking is unknown.";
  return continuation.movementBefore !== null &&
    continuation.movementBefore <= 1
    ? "The recorded budget leaves no further ordinary move after success; possible Rushes are outside this component."
    : "The successful square is marked, so a further move would need another Dodge; that risky continuation is outside this component.";
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
    (impact.policy === "dodge_skill_reroll"
      ? explainActiveContinuation(event) + " "
      : "") +
    impact.contribution.toFixed(2) +
    (impact.policy === "dodge_skill_reroll"
      ? " context units for the terminal die after the Dodge reroll was committed, holding recorded modifiers fixed. The earlier failure remains outside this context component."
      : " context units under the recorded reroll policy.")
  );
}

export function explainContextBounds(
  event: LuckReport["events"][number]
): string | null {
  const catchBound=event.catchPossessionBounds;
  if(catchBound) return `The first bounce reached this recorded catcher after a failed pickup. At this fresh catch die, the recorded modifiers gave ${(catchBound.successChance*100).toFixed(1)}% raw success. A successful ordinary ball catch secures 2 provisional own-possession units here. Failed-catch rerolls, reactions and later bounces are unresolved, so their continuation value stays between 0 and 2. This successful die's possession component is therefore 0 to ${catchBound.upper.toFixed(2)} context units. The earlier pickup and bounce are outside this stage; later dice are not charged again. This is a possible-value envelope, not calibrated match impact. No midpoint or endpoint enters point totals, and no unchosen catch eligibility or failed-roll policy is certified.`;
  const possession=event.possessionBounds,successors=event.metadata.preRoll?.pickupSuccessors;
  if(possession && successors) {
    const empty=successors.branches.filter(b=>b.kind === "empty").length;
    const occupied=successors.branches.filter(b=>b.kind === "occupied").length;
    const outside=8-empty-occupied;
    return `With Sure Hands already committed, the terminal die had ${(possession.successChance*100).toFixed(1)}% success. A successful pickup holds the ball here. The eight equally likely initial bounce alternatives after failure include ${empty} empty, ${occupied} occupied and ${outside} off-pitch squares. Occupied squares need a catch; off-pitch results need a return. Neither is treated as lost or recovered possession. Empty-square settlement also stays uncertain when current reaction skills or effects are incomplete. Unknown tackle zones stay uncertain. This component values only retaining own possession (2 provisional units) and marked loose-ball exposure (up to 1); its difference is ${possession.minimumDifference.toFixed(2)} to ${possession.maximumDifference.toFixed(2)} and its contribution is ${possession.lower.toFixed(2)} to ${possession.upper.toFixed(2)} context units. It excludes remaining activations, opponent possession gain, scoring value, the earlier failed die and later catch/return dice. No midpoint or range endpoint enters point totals; this is not calibrated match impact.`;
  }
  const bound = event.contextualBounds;
  if (!bound) return null;
  return `After a successful Dodge, ${bound.minimumMoves} to ${bound.maximumMoves} other players could make an ordinary standing move; availability is incomplete for ${bound.maximumMoves - bound.minimumMoves} players. ${explainActiveContinuation(event)} With the Dodge reroll already committed, the terminal die had ${(bound.successChance * 100).toFixed(1)}% success under the recorded modifiers. Its ordinary-move contribution ranges from ${bound.lower.toFixed(2)} to ${bound.upper.toFixed(2)} context units. This is a possible-value range, not a confidence interval or a whole-action value. No midpoint is added to point totals; the earlier failure and other tactical consequences remain outside this component.`;
}

export function explainMovementOutcome(
  metadata: Pick<
    LuckReport["events"][number]["metadata"],
    "movementFall" | "movementTouchdown" | "dodgeMovement" | "pickupResolution" | "teamRerollMovement" | "pickupAfterMovement" | "combinedMovement"
  >
): string | null {
  const { movementFall: fall, movementTouchdown } = metadata;
  if(metadata.combinedMovement) {
    const p=metadata.combinedMovement;
    return `The Rush succeeded, then the following Dodge ${p.dodgeSucceeded?"succeeded":"failed"}. ${p.dodgeSucceeded?`The confirmed combined step moved the player from [${p.from.x}, ${p.from.y}] to [${p.to.x}, ${p.to.y}].`:"A failed combined step does not establish a usable continued board or a final player position."} ${p.dodgeSucceeded&&p.carriedBallBefore===true?"The explicitly held ball followed the player. ":p.carriedBallBefore===null?"Earlier ball possession remains unknown. ":""}${p.movementAfter===null?"Remaining ordinary movement stays unknown.":"The observed ordinary movement budget stays at zero; remaining Rush attempts are not inferred."} ${p.partialOccupancy.length?"Distant players' omitted coordinates remain unknown; their known axes rule out the two relevant squares. ":""}No ordinary activation, useful-action count or failed alternative is inferred. The Rush and Dodge keep their separate existing dice contributions; this combined-step receipt adds no luck score.`;
  }
  const teamMove=metadata.teamRerollMovement;
  if(teamMove) return `${movementTouchdown?"The replay records a touchdown immediately after this move. ":""}The successful team-rerolled ${teamMove.rollType===1?"Rush":"Dodge"} and its confirmed move advanced the player from [${teamMove.from.x}, ${teamMove.from.y}] to [${teamMove.to.x}, ${teamMove.to.y}]. ${teamMove.carriesBall===null?"Ball possession in the waiting snapshot remains unknown. ":teamMove.carriesBall?"The explicitly held ball followed the player. ":""}${teamMove.movementAfter===null?"The waiting snapshot omitted remaining movement; it stays unknown.":teamMove.rollType===1?"The observed ordinary movement budget stays at zero; remaining Rush attempts are not inferred.":`${teamMove.movementAfter} movement points remained after this step; the confirmed Dodge move used one point.`} ${teamMove.zonePenalty?`The recorded base ${teamMove.zonePenalty.baseTarget}+ check had ${teamMove.zonePenalty.markers.length} opposing tackle-zone penalty point${teamMove.zonePenalty.markers.length===1?"":"s"}; each recorded marker was observed beside the destination. `:""}Current player availability and omitted skills remain unknown. This actual movement adds no luck score; the existing two-attempt dice odds remain separate.`;
  if (movementTouchdown)
    return "The replay records a touchdown immediately after this move.";
  if(metadata.pickupAfterMovement) {
    const p=metadata.pickupAfterMovement;
    return `After the confirmed team-rerolled move reached [${p.cell.x}, ${p.cell.y}], the successful Sure Hands replacement secured the ball there. ${p.movementRemaining===null?"Remaining movement stays unknown.":`The post-move budget stays at ${p.movementRemaining}; the pickup consumes no second movement point.`} Earlier unknown possession is not changed. This observed possession adds no luck score or tactical value; failed-pickup alternatives remain unquantified.`;
  }
  if(metadata.pickupResolution) {
    const r=metadata.pickupResolution;
    return `The successful Sure Hands replacement secured the ball at [${r.cell.x}, ${r.cell.y}]. ${r.movementRemaining === null ? "Remaining movement is unknown." : `The post-move budget stays at ${r.movementRemaining} movement points.`} Later verified movement follows this carrier. This observed possession adds no luck score.`;
  }
  if (metadata.dodgeMovement) {
    const move = metadata.dodgeMovement;
    const budget = move.movementAfter === null ? "Remaining movement is unknown." : `${move.movementAfter} movement points remained after this step.`;
    return `The replay confirms this move after the successful Dodge skill reroll. ${budget}${move.carriesBall===null ? " Ball possession remains unknown." : move.carriesBall ? " The carried ball followed the player." : ""} This observed movement adds no luck score.`;
  }
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
  return `${fall.combinedRushSourceId?"The Rush succeeded before the following Dodge failed. ":""}${aftermath} Dice subtotal for ${fall.combinedRushSourceId?"both movement checks":"the movement check"} and scored damage: ${fall.diceContribution.toFixed(2)}.${unknown}${fall.combinedRushSourceId?" This references the existing contributions once. The turnover and availability cost remain unquantified; no final player position or extra luck score is inferred.":""}`;
}

export function explainBlockResolution(
  event: LuckReport["events"][number],
  teams: LuckReport["teams"],
  sources: ReadonlyMap<string, LuckReport["events"][number]>
): string | null {
  const resolution = event.metadata.blockResolution,
    block = event.metadata.block;
  if (!resolution || !block) return null;
  const outcome = {
    attacker_down: `attacker ${block.attackerId} was knocked down`,
    both_down: `attacker ${block.attackerId} and defender ${block.defenderId} were knocked down`,
    wrestled_prone: `attacker ${block.attackerId} and defender ${block.defenderId} went prone through Wrestle`,
    both_stay_up: "neither participant was knocked down by Both Down",
    push: `defender ${block.defenderId} was pushed`,
    defender_down: `defender ${block.defenderId} was knocked down`,
    defender_pushed_down: `defender ${block.defenderId} was pushed and knocked down`
  }[resolution.outcome];
  const names = new Map([
    [7, "Dodge"],
    [30, "Block"],
    [57, "Tackle"],
    [68, "Wrestle"]
  ]);
  const skills = resolution.skillSourceIds
    .map((id) => sources.get(id))
    .filter((e) => e !== undefined)
    .map(
      (e) =>
        `${names.get(e.metadata.skillUsage!.skillId)} by player ${e.playerId}`
    );
  const totals = teams.flatMap((team) =>
    Object.hasOwn(resolution.diceByTeam, team.teamId)
      ? [
          `${team.teamName}: ${resolution.diceByTeam[team.teamId]!.toFixed(2)} dice units`
        ]
      : []
  );
  return [
    `Recorded block resolution: ${outcome}.`,
    skills.length ? `Applied skills: ${skills.join(", ")}.` : null,
    resolution.outcome === "wrestled_prone"
      ? "Wrestle does not add a knockdown armor check; a separate ball consequence can still matter."
      : null,
    resolution.damageActionIds.length
      ? `${resolution.damageActionIds.length} immediately linked damage step${resolution.damageActionIds.length === 1 ? "" : "s"} retain each victim's team perspective.`
      : "No damage step is linked by this bounded contract.",
    `Terminal-pool and linked-damage subtotal: ${totals.join("; ")}. Earlier replaced pools remain separate.`,
    resolution.unscoredDamageRolls
      ? `${resolution.unscoredDamageRolls} damage roll${resolution.unscoredDamageRolls === 1 ? " has" : "s have"} unknown odds.`
      : null,
    "This references existing dice contributions once. Tactical value and turnover consequences remain unquantified."
  ]
    .filter(Boolean)
    .join(" ");
}

export function explainDriveEffectExpiry(
  event: LuckReport["events"][number]
): string | null {
  const expiry = event.metadata.driveEffectExpiry;
  return expiry
    ? `Player ${expiry.playerId}'s old ${expiry.providerSkillId === 51 ? "Really Stupid" : "Bone Head"} effect explicitly ended as setup began.${expiry.afterPitchLocation === "off_pitch" ? " The following setup snapshot places the player off the pitch." : ""} Playable availability and defensive coverage require their own evidence; setup flags add no luck score.`
    : null;
}

export function explainLonerGate(
  gate: LuckReport["events"][number]["metadata"]["lonerGate"]
): string | null {
  return gate
    ? `Loner ${gate.threshold}+ ${gate.passed ? "passed" : "failed"}. One team reroll was spent. ${gate.passed ? "Replacement dice need their own recorded evidence." : "The original result was kept; the gate granted no replacement dice."} The gate itself is unscored.`
    : null;
}

export function explainProGate(
  gate: LuckReport["events"][number]["metadata"]["proGate"]
): string | null {
  return gate
    ? `Pro ${gate.passed ? "passed" : "failed"} its recorded 3+ test. Four of six faces pass this test.`
    : null;
}

export function explainActivationLoss(
  event: LuckReport["events"][number]
): string | null {
  const end = event.metadata.activationEnd;
  if (end)
    return end.kind === "ordinary_move_completed"
      ? `Player ${end.actorId}'s ordinary Move activation ended when player ${end.followingPlayerId} started acting in recorded team turn ${end.teamTurn}. Its position and tackle zone are preserved.`
      : `Player ${end.actorId} lost the declared activation and tackle zone after ${end.kind === "bone_head" ? "Bone Head" : "Really Stupid"} failed. Player ${end.followingPlayerId} then acted in recorded team turn ${end.teamTurn}. The lost activation's tactical value remains unquantified.`;
  const loss = event.metadata.activationLoss;
  return loss
    ? `Player ${loss.actorId} lost the declared Block activation after Foul Appearance failed. Player ${loss.followingPlayerId} then acted in the same recorded team turn ${loss.teamTurn}. The tactical cost of the lost activation remains unquantified.`
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
  const end=event.metadata.pickupTurnEnd,moves=end?.ordinaryMoves;
  const opportunities=moves
    ? ` Before the pickup, ${moves.knownAvailablePlayerIds.length} to ${moves.knownAvailablePlayerIds.length+moves.unknownPlayerIds.length} other players had a possible ordinary move attempt; ${moves.unknownPlayerIds.length} have unresolved current eligibility. These are attempt opportunities, not guaranteed successes or a luck-value estimate.`
    : " Current-side movement opportunities remain unknown.";
  const aftermath=end ? ` The recorded team turn ended immediately after the successful catch.${opportunities} This observed ending does not establish a hypothetical failed-roll reroll policy.` : "";
  return `The failed pickup led to ${chain.bounceSourceIds.length} recorded bounce${chain.bounceSourceIds.length === 1 ? "" : "s"} and ${chain.catchEventIds.length} linked catch check${chain.catchEventIds.length === 1 ? "" : "s"}. ${catches ? catches + " " : ""}The last recorded landing was [${chain.endingCell.x}, ${chain.endingCell.y}]. Existing dice subtotals by team: ${totals}. These dice contributions are already included in the team totals.${aftermath} The full tactical cost of possession or the turn remains unquantified.`;
}
