import type { ContextComponentSummary } from "./contextComponents";
import { recordedInjuryName } from "./injuryObservation";
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

export const PARTIAL_CONTEXT_SCOPE =
  "This is an arithmetic sum of the reported model components only. Missing or unmodeled consequences remain outside it. It is not a whole-match luck range, a confidence interval or a basis for ranking the teams. No midpoint or endpoint enters point scores.";
export function formatContextComponentSum(
  summary: Pick<ContextComponentSummary, "bounds" | "componentCount">
): string {
  return summary.bounds
    ? `${summary.bounds.lower.toFixed(2)} to ${summary.bounds.upper.toFixed(2)} provisional context units across ${summary.componentCount} reported component${summary.componentCount === 1 ? "" : "s"}`
    : "No supported context components";
}

export function formatExpectedOutcome(event: LuckReport["events"][number]): string {
  return event.metadata.injuryScoring ? "Categorical" : event.probabilitySuccess === null
    ? "Unknown" : `${(event.probabilitySuccess * 100).toFixed(1)}%`;
}

export function formatActualOutcome(
  event: LuckReport["events"][number]
): string {
  if(event.metadata.injuryObservation) return `${recordedInjuryName(event.metadata.injuryObservation.outcome)} (recorded)`;
  if (event.actualSuccess === null) return "Unknown";
  if (event.metadata.block)
    return event.actualSuccess ? "Raw target met" : "Raw target missed";
  return event.actualSuccess ? "Success" : "Fail";
}

export function explainDiceCensus(
  evidence: LuckReport["coverage"]["diceRecords"]
): string {
  return `Dice-field coverage: ${evidence.coveredCount} covered, ${evidence.unscoredCount} unscored, ${evidence.unresolvedCount} with unresolved identity, ${evidence.summaryCount} linked copies and ${evidence.nonrandomCount} no-roll placeholders (${evidence.eventRecordCount} event fields + ${evidence.snapshotRecordCount} snapshot fields; ${evidence.recordCount} total; ${evidence.malformedCount} malformed). This counts recorded dice groups, not individual dice, independent opportunities or confidence in the match verdict.`;
}
export function explainObservedDice(
  event: LuckReport["events"][number],
  records: ReadonlyMap<string, LuckReport["diceRecords"][number]> = new Map()
): string | null {
  const record = records.get(event.metadata.diceEvidenceId ?? "");
  if (record)
    return `Recorded dice field ${record.path.join(".")}: ${record.dice.map((d) => d.value ?? "unknown").join(", ") || "empty"}. ${record.quality === "complete" ? "A value and type are recorded for every die" : record.quality === "incomplete" ? "Some dice fields are missing" : "Some recorded dice fields are invalid"}; ${record.disposition === "unresolved" ? "whether this is a new outcome or a copy remains unresolved" : "this observed roll has no accepted probability or value model"}. Actual success and luck remain unknown.`;
  const r = event.metadata.observedReroll,
    team = event.metadata.teamDiceIdentity;
  if (r)
    return `Recorded ${r.kind === "star" ? "star" : "Pass skill"} reroll: original die ${r.originalDie}, ${r.used ? `used; replacement die ${r.finalDie} is a new draw even if its face matches` : `declined; die ${r.finalDie} repeats the original`}. This identifies the observed dice and choice, not reroll eligibility, success odds or tactical value. No luck score is added.`;
  if (team)
    return `Recorded team-reroll decision ${team.teamUsed ? "used" : "declined"}: original die ${team.originalDie}, final die ${team.finalDie}; ${team.replacementRolled ? "a replacement was rolled" : "the original was retained"}.${team.gateSourceId ? ` A separate ${team.gateSkillId === 50 ? "Pro" : "Loner"} gate ${team.gatePassed ? "passed" : "failed"}.` : ""} This is dice identity evidence; resource eligibility and probability/value remain unverified. No luck score is added.`;
  return null;
}

export function explainInjuryObservation(event:LuckReport["events"][number]):string|null {
  const observation=event.metadata.injuryObservation;
  if(!observation)return null;
  const table=explainInjuryTable(event);
  const scored=event.metadata.injuryScoring;
  if(scored) return `The recorded injury result for player ${observation.subjectId} is ${recordedInjuryName(observation.outcome)}. The replay establishes an unmodified initial injury roll after ${scored.cause.kind === "block" ? "the applied block" : "the failed movement check"}. Compared with the same fair injury table, ${(scored.moreSevereChance*100).toFixed(1)}% of results are more severe, ${(scored.lessSevereChance*100).toFixed(1)}% less severe, and ${(scored.sameSeverityChance*100).toFixed(1)}% in the same tier. Raw injury luck is the more-severe chance minus the less-severe chance, weighted by ${event.explainability.weight}. Positive favors the injured player's team. Badly Hurt and a pending Casualty roll share one tier; later league damage is not priced. Treatment, recovery and match impact remain separate. ${table ?? ""}`;
  return `The recorded injury result for player ${observation.subjectId} is ${recordedInjuryName(observation.outcome)}. This is a categorical observation, not a success or failure check. ${table ? "The separate table describes the original injury roll with no modifier. Modifier choice and treatment can change the applied result; their full policy and luck value are not established, so no luck contribution is assigned." : "Its odds depend on the applicable injury table, current traits and modifiers; those are not verified here, so no luck contribution is assigned."} This result does not establish final posture, removal, recovery or availability after treatment. Later mitigation and state observations remain separate evidence.${table ? ` ${table}` : ""}`;
}

export function explainInjuryTable(event:LuckReport["events"][number]):string|null {
  const table=event.metadata.injuryTable;
  if(!table)return null;
  const names=["Stunned","KO","Badly Hurt","Casualty"];
  const odds=table.counts.map((n,i)=>`${names[i]} ${n}/36 (${(100*n/36).toFixed(1)}%)`).join(", ");
  return `Conditional unmodified injury table for player ${event.playerId}: ${table.stunty ? "Stunty" : "ordinary"}${table.thickSkull ? " with Thick Skull" : ""}; ${odds}. This enumerates 36 fair 2D6 results with no injury modifier, using complete traits observed at source ${table.traitEvidence.observedCheckpointAfter} and continued to checkpoint ${table.traitEvidence.currentCheckpointAfter}. It is conditional on reaching this injury roll, before treatment or recovery. ${event.metadata.injuryScoring ? "A separate source-qualified receipt establishes the unmodified initial-roll policy and its categorical dice contribution. It does not establish final availability or match impact." : "It does not certify modifier eligibility or the coach's actual policy, final availability, or match impact; no luck score is added."}`;
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

export function explainBlockPush(
  event: LuckReport["events"][number],
): string | null {
  const model = event.metadata.blockPush;
  if (model?.status === "unsupported") {
    const reasons = {
      missing_current_state:
        "current positions or standard-pitch configuration are incomplete",
      unknown_push_policy:
        "current push/follow-up skills or effects are unknown or outside this policy",
      source_choice_mismatch:
        "the recorded menu or addressed slot does not match the ordinary model",
      unverified_push_chain: "the source displacement chain does not reconcile",
      unverified_source_order:
        "the position frame is interrupted by an unverified transition",
      cyclic_chain: "a cyclic chain is outside the verified scope",
      branch_limit: "the full alternative tree exceeds the bounded model",
    };
    return `Ordinary push alternatives not modeled: ${reasons[model.reason]}. The existing block dice score is separate; missing alternatives add no tactical value.`;
  }
  if (model?.status === "modeled") {
    const selected = model.branches[model.selectedBranch]!,
      moves = selected.moves
        .map(
          (m) =>
            `player ${m.playerId} [${m.from.x},${m.from.y}] to [${m.to.x},${m.to.y}]${m.destination === "crowd" ? " into the crowd" : ""}`,
        )
        .join("; ");
    return `After die selection, the recorded menu offers ${model.destinations.length} destination squares. The ordinary model has ${model.branches.length} position branches, including follow-up or staying put. Recorded displacement: ${moves}; the blocker ${selected.follow ? "followed" : "stayed put"}. These coach choices carry no random probability or extra luck score. Positions use checkpoint ${model.checkpointAfter}, with standard-pitch configuration established at ${model.pitchCheckpointAfter}; this is not pre-roll leverage. Ball/terrain reactions, knockdown/damage, injury, turnover and tactical value remain outside this position-only model.`;
  }
  const q = event.metadata.pushQuestion;
  if (q)
    return `Observed push menu addressed to slot ${q.gamerId}: ${q.offered.map((c) => `[${c.x},${c.y}]`).join(", ")}. The copied block die adds no random outcome. A recorded menu alone does not establish current skill eligibility or a tactical score.`;
  const r = event.metadata.pushResult;
  if (r)
    return `Recorded push of player ${r.playerId}: [${r.from.x},${r.from.y}] to [${r.to.x},${r.to.y}]. This displacement adds no random outcome or extra luck score.`;
  return null;
}

// Roster identity is independent of skill, activation and tactical-state proof.
export function explainOwnership(
  event: LuckReport["events"][number]
): string | null {
  const {
    ownership: p,
    ownershipConflict: c,
    identityMutation: m
  } = event.metadata;
  if (c) {
    const reason = {
      initial_overlap: "both initial rosters list this ID",
      current_roster_conflict:
        "current membership contradicts the earlier roster",
      pending_identity:
        "a replacement or removal has no qualified following identity",
      invalid_current_identity:
        "current roster or player identity fields conflict",
      unverified_transition:
        "an unknown transition interrupts ownership evidence"
    }[c.reason];
    return `Ownership unresolved for ${c.role} player ${c.playerId}: ${reason}. This outcome stays in coverage and adds no luck score.`;
  }
  if (m)
    return `Recorded ${m.operation === "purchase" ? "purchase" : "removal"} for player ${m.playerId}. The buyer identifier is separate from roster team and choice-controller slots; it does not establish ownership.`;
  if (!p) return null;
  const role = p.role === "subject" ? "affected player" : "actor";
  const describe = (q: typeof p | NonNullable<typeof p.defender>) =>
    q.basis === "initial_roster"
      ? "the initial roster"
      : q.basis === "explicit_team"
        ? "the explicit source team field"
        : q.basis === "confirmed_recruitment"
          ? `a recorded recruitment and its first qualified roster observation (${q.identitySourceId})`
          : `a current roster observation before this outcome`;
  return `Ownership: ${role} player ${p.playerId ?? "unknown"} belongs to team ${p.teamId}, established by ${describe(p)}.${p.defender ? ` Defender player ${p.defender.playerId} belongs to opposing team ${p.defender.teamId}, established by ${describe(p.defender)}.` : ""}${event.metadata.block ? ` The ${event.metadata.block.pool.attackerChooses ? "attacker" : "defender"} controls this block choice; the dice score uses the attacker's perspective.` : p.role === "subject" ? " Damage and recovery use the affected player's team perspective." : ""} Ownership alone does not establish current skills, usable activations or tactical value.`;
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
  if(catchBound?.policy === "kept_catch_failure_envelope") return `The first bounce reached this recorded catcher after a failed pickup. Before the original Catch die, the recorded modifiers gave ${(catchBound.successChance*100).toFixed(1)}% success. Holding the recorded decline-on-failure policy fixed, a success secures 2 provisional own-possession units; later failure continuations remain between 0 and 2. This failed original die therefore has a possession component of ${catchBound.lower.toFixed(2)} to 0 context units. The kept summary after declining the team reroll is the same die, not another random outcome. This component prices neither the choice nor a spent resource. Earlier pickup and bounce dice and later bounces are not charged again. No midpoint or endpoint enters point totals; this possible-value envelope is not calibrated match impact and does not certify unchosen skills or restore missing state.`;
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
  if (bound.policy === "kept_dodge_terminal_moves") return `Before the original Dodge die, hold the recorded decline-on-failure policy fixed. Its ${(bound.successChance*100).toFixed(1)}% success chance and terminal failure leave ${bound.minimumMoves} to ${bound.maximumMoves} possible other ordinary moves at stake. This teammate-move component is ${bound.lower.toFixed(2)} to ${bound.upper.toFixed(2)} provisional context units. Current eligibility is incomplete. The kept failure repeats the original die, not a replacement draw; no team reroll was spent. The active player's continuation, ball/scoring, resource decision and later damage values are outside this component. The observed fall and known-damage dice subtotal remain separate evidence. No midpoint or endpoint enters point totals; this is not calibrated whole-match impact.`;
  if (bound.policy === "kept_rush_terminal_moves") {
    const p = event.metadata.retainedRushContext;
    const bridge = p
      ? `The preceding fresh Rush moved this player from [${p.from.x},${p.from.y}] to [${p.via.x},${p.via.y}], before this next attempt toward [${p.destination.x},${p.destination.y}].`
      : "The preceding fresh Rush already moved the player to this square.";
    return `Before the original Rush die, hold the recorded decline-on-failure policy fixed. Its 83.3% success chance and terminal failure leave ${bound.minimumMoves} to ${bound.maximumMoves} possible other ordinary moves at stake. ${bridge} Its successful die is scored separately. The kept failure repeats the original die, not a new random draw. This teammate-move component is ${bound.lower.toFixed(2)} to ${bound.upper.toFixed(2)} provisional context units. Current eligibility is incomplete; the earlier success, resource decision, actor continuation, ball/scoring and later damage values are outside it. The recorded fall, damage and turnover remain separate evidence. No midpoint or endpoint enters point totals; this is not calibrated whole-match impact.`;
  }
  if(bound.policy === "team_reroll_terminal_moves" || bound.policy === "team_reroll_rush_moves") return `With the team reroll already spent, this replacement ${bound.policy === "team_reroll_rush_moves" ? "Rush" : "Dodge"} die had ${(bound.successChance*100).toFixed(1)}% success. Its successful successor leaves ${bound.minimumMoves} to ${bound.maximumMoves} other players with an ordinary standing move; their current eligibility is incomplete. Terminal failure ends the team turn. This teammate-move component is ${bound.lower.toFixed(2)} to ${bound.upper.toFixed(2)} provisional context units, using only this die's outcome minus its single-die chance. The earlier failed die, spent resource, active player's continuation, ball and scoring value, and later damage dice are outside this component. The actual move or self-fall/turnover is source-linked separately. No midpoint or endpoint enters point totals; this possible-value range is not calibrated match impact.${bound.policy === "team_reroll_rush_moves" ? " This slice admits only verified successful ordinary Rush replacements. Missing failures and other policies prevent a complete team comparison." : ""}`;
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
    event.metadata.blockCrowd
      ? `This block pushed defender ${event.metadata.blockCrowd.subjectId} from [${event.metadata.blockCrowd.from.x},${event.metadata.blockCrowd.from.y}] off pitch to [${event.metadata.blockCrowd.to.x},${event.metadata.blockCrowd.to.y}]. Two removal records are stages for that one player, not two injuries. The linked crowd injury has unknown odds; this verified prefix contains no armor roll. The confirming snapshot places the player off pitch; other recorded activity flags do not establish availability. Omitted posture remains unknown. This does not infer a team turnover, future return or tactical value.`
      : null,
    skills.length ? `Applied skills: ${skills.join(", ")}.` : null,
    resolution.outcome === "wrestled_prone"
      ? "Wrestle does not add a knockdown armor check; a separate ball consequence can still matter."
      : null,
    event.metadata.blockBallRelease
      ? `Player ${event.metadata.blockBallRelease.holderId} held the ball at [${event.metadata.blockBallRelease.from.x},${event.metadata.blockBallRelease.from.y}] in the last recorded checkpoint before this prone resolution. The first recorded bounce travels to [${event.metadata.blockBallRelease.to.x},${event.metadata.blockBallRelease.to.y}]. ${event.metadata.blockBallRelease.after?.isHeld === false ? "The immediate snapshot explicitly records the ball as not held." : "Later possession is unconfirmed; omitted holder flags do not establish a loose ball or a new carrier."} This source link adds no dice score or tactical value.`
      : null,
    resolution.damageActionIds.length
      ? `${resolution.damageActionIds.length} immediately linked damage step${resolution.damageActionIds.length === 1 ? "" : "s"} retain${resolution.damageActionIds.length === 1 ? "s" : ""} each victim's team perspective.`
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
  if(end?.kind === "ordinary_block_completed")
    return `Player ${end.actorId}'s ordinary Block activation ended before player ${end.followingPlayerId} started acting in recorded team turn ${end.teamTurn}. The applied block and following stable-position checkpoint establish the spent activation. Later move opportunities exclude this player; its position and tackle zone are preserved. The confirmation adds no dice roll or extra luck score.`;
  if (end)
    return end.kind === "ordinary_move_completed"
      ? `Player ${end.actorId}'s ordinary Move activation ended when player ${end.followingPlayerId} started acting in recorded team turn ${end.teamTurn}. Its position and tackle zone are preserved.${end.completionCheckpointAfter !== undefined ? " The completed position was confirmed by the following stable checkpoint; no dice were needed for this movement." : ""}${end.rosterCheckpointAfter !== undefined ? " Ownership was verified from the current roster checkpoint; missing initial membership was not inferred from the turn. Later move opportunities exclude this spent activation." : ""}`
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

export function explainBlockSkillModel(
  event: LuckReport["events"][number]
): string | null {
  const traits=event.metadata.block?.traitEvidence,model=event.metadata.block?.skillModel;
  if (!traits) return null;
  const source=`Intrinsic skill evidence for attacker ${traits.attacker.playerId} and defender ${traits.defender.playerId} continues from checkpoints ${traits.attacker.observedCheckpointAfter}/${traits.defender.observedCheckpointAfter} through current roster checkpoint ${traits.attacker.currentCheckpointAfter}. Raw missing fields remain unknown; effects, transformations, changed identity and unsupported transitions break continuity.`;
  if(!model)return `${source} This skill combination has no accepted block outcome model. The displayed dice score remains the separate raw-symbol calculation.`;
  const relevant = (side: "attacker" | "defender") => {
    const skills=new Set([...(traits[side].traits.innateSkills ?? []),...(traits[side].traits.acquiredSkills ?? [])]);
    return (
      ([[30,"Block"],[side==="attacker"?57:7,side==="attacker"?"Tackle":"Dodge"],[68,"Wrestle"]] as const).filter(([id])=>skills.has(id)).map(([,name])=>name).join(", ") || "none"
    );
  };
  return `${source} Continued intrinsic block skills: attacker ${relevant("attacker")}; defender ${relevant("defender")}. Single-pool model: both coaches choose by defender knockdowns minus attacker knockdowns, maximizing for the attacker and minimizing for the defender. Block prevents Both Down knockdowns; Dodge prevents Defender Stumbles unless Tackle applies. ${model.wrestlePolicy==="improve_knockdown_balance"?"Wrestle is used only when it improves the holder's knockdown balance; ties decline Wrestle.":"Wrestle is declined."} Under this fixed policy, the chance of a positive knockdown balance is ${(model.positiveChance*100).toFixed(1)}%; its expected balance is ${model.expectedValue.toFixed(3)} and the rolled pool offers ${model.poolValue}. This is a conditional model of the offered pool, not the coach's actual choice or tactical impact. Prone through Wrestle, pushes, position, ball, reroll resources and later damage are outside this component. It is not added to dice or context totals.`;
}
