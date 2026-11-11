import { z } from "zod";
import { VERDICT_SUMMARIES } from "./explainabilityCopy";
import { CONTEXT_MODEL_VERSION } from "./contextImpact";
import { DICE_MODEL_VERSION, LUCK_CATEGORY_WEIGHTS, REPORT_SCHEMA_VERSION } from "./constants";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { summarizeRollFamilies } from "./rollCoverage";
import { summarizeDamageSteps } from "./damageSteps";
import { summarizeContextEvidence } from "./contextCoverage";
import { observedBounceDirection } from "./ballConsequences";
import { summarizeMovementFall } from "./movementConsequences";

export const LuckEventTypeSchema = z.enum([
  "block",
  "armor_break",
  "injury",
  "dodge",
  "ball_handling",
  "argue_call",
  "movement_risk",
  "unknown"
]);
export const LuckMomentTagSchema = z.enum(["blessed", "shaftaroonie"]);
export const LuckScoringStatusSchema = z.enum(["scored", "excluded"]);
const finite = z.number().finite();
const count = z.number().int().min(0).max(REPLAY_LIMITS.events);
const text = z.string().max(REPLAY_LIMITS.decodedBytes);
const probability = finite.min(0).max(1);
const numbers = z.array(finite).max(REPLAY_LIMITS.xmlNodes);
const pitchCell = z.strictObject({
  x: z.number().int().min(0).max(25),
  y: z.number().int().min(0).max(14)
});
const playerTraits = z.strictObject({
  dataPlayerId: z.number().int().nonnegative().nullable(),
  playerTypeId: z.number().int().nonnegative().nullable(),
  innateSkills: z.array(z.number().int().nonnegative()).max(64).nullable(),
  acquiredSkills: z.array(z.number().int().nonnegative()).max(64).nullable()
});
export const LuckEventMetadataSchema = z.strictObject({
  mercenary: z.strictObject({ operation: z.enum(["purchase", "removal_record"]), playerId: text,
    playerTypeId: z.number().int().nonnegative(), gamerId: z.number().int().min(0).max(1) }).optional(),
  ballTravel: z.strictObject({ from: pitchCell, to: pitchCell }).optional(),
  ballCatchCell: pitchCell.optional(),
  pickupBallChain: z.strictObject({
    bounceSourceIds: z.array(text).min(1).max(16),
    catchEventIds: z.array(text).max(16),
    diceByTeam: z.record(text, finite),
    endingCell: pitchCell
  }).optional(),
  initialRosterName: z.string().max(320).optional(),
  embeddedDamageOriginalId: text.optional(),
  originalDice: z.unknown().optional(),
  rerollOriginalId: text.optional(),
  rerollQuestionId: text.optional(),
  rerollDecisionId: text.optional(),
  rerollResource: z.enum(["team", "skill"]).optional(),
  teamRerollsSpent: z.union([z.literal(0), z.literal(1)]).optional(),
  rerollSkill: z.enum(["Catch", "Dodge", "Sure Hands"]).optional(),
  lonerGate: z
    .strictObject({
      passed: z.boolean(),
      gamerId: z.union([z.literal(0), z.literal(1)]),
      skillSourceId: text
    })
    .optional(),
  proGate: z.strictObject({
    passed: z.boolean(),
    successChance: z.literal(2 / 3),
    skillSourceId: text
  }).optional(),
  rerollPolicy: text.optional(),
  mergedRerollAnchorId: text.optional(),
  sourceTag: text,
  sourceId: text.optional(),
  actionId: text.optional(),
  sequenceId: text.optional(),
  sourceIndex: count.optional(),
  locator: z
    .strictObject({
      replayStep: z.number().int().positive().optional(),
      childIndex: z.number().int().min(0).optional(),
      stepIndex: z.number().int().min(0).optional(),
      messageIndex: z.number().int().min(0).optional()
    })
    .optional(),
  preRoll: z
    .strictObject({
      checkpointAfter: count,
      actorRosterTeamId: text.optional(),
      actorTraits: playerTraits.optional(),
      targetTraits: playerTraits.optional(),
      checkpointReplayStep: z.number().int().positive().optional(),
      phaseCode: z.number().int().nonnegative().nullable(),
      period: z.enum(["first_half", "second_half", "extra_time"]).nullable(),
      activeTeamId: text.nullable(),
      teamTurn: z.number().int().positive().nullable(),
      turnsRemaining: count.nullable(),
      activationId: text.nullable(),
      actorCell: pitchCell.nullable(),
      actorStandUpSourceIndex: count.optional(),
      actorMovementRemaining: count.optional(),
      actorPickupSourceId: text.optional(),
      scoringAttempt: z.strictObject({
        destination: pitchCell,
        sideCode: z.union([z.literal(32), z.literal(64)]),
        teamTurn: z.number().int().positive().nullable(),
        turnsRemaining: count.nullable(),
        turnsPerPeriod: z.number().int().min(1).max(16).nullable()
      }).optional(),
      teammateCarrierMove: z.strictObject({
        carrierCell: pitchCell,
        destination: pitchCell,
        effect: z.enum(["approach", "leave"])
      }).optional(),
      actorCarriesBall: z.boolean().nullable(),
      movementCheckLinked: z.boolean(),
      otherUsefulActivations: z.number().int().min(0).max(64).nullable(),
      pickupBounceExposure: probability.nullable()
    })
    .optional(),
  block: z
    .strictObject({
      pool: z.strictObject({
        faces: z.array(z.number().int().min(0).max(4)).min(1).max(3),
        rolledIndexes: z.array(z.number().int().min(0).max(2)).min(1).max(3),
        outcomes: z.array(z.number().int().min(0).max(6)).min(1).max(3),
        attackerChooses: z.boolean(),
        sourceId: text.optional(),
        proEligibleIndexes: z
          .array(z.number().int().min(0).max(2))
          .max(3)
          .optional()
      }),
      attackerId: text,
      defenderId: text,
      defenderTeamId: text,
      chooserTeamId: text,
      chooserGamerId: z.number().int().min(0).max(1).optional(),
      selectedFace: z.number().int().min(0).max(4).optional(),
      selectedOutcome: z.number().int().min(0).max(6).optional(),
      selectedSourceId: text.optional(),
      finalOutcome: z.number().int().min(0).max(6).optional(),
      finalSourceId: text.optional(),
      reroll: z.enum(["initial", "team", "brawler", "pro"]),
      proGateSourceId: text.optional(),
      previousPoolSourceId: text.optional(),
      distribution: z.array(probability).length(5),
      rankedSymbol: z.number().int().min(0).max(4)
    })
    .optional(),
  damage: z
    .strictObject({
      subjectId: text,
      subjectTeamId: text,
      sourceCode: finite.optional(),
      chainActionId: text.optional(),
      koRecovery: z
        .strictObject({ target: z.union([z.literal(3), z.literal(4)]) })
        .optional(),
      regeneration: z
        .strictObject({
          casualtySourceId: text,
          initialRemovalSourceId: text,
          skillUseSourceId: text
        })
        .optional(),
      perspective: z.literal("subject_team")
    })
    .optional(),
  movementFall: z.strictObject({
    damageActionId: text,
    moveOutcomeSourceIndex: count,
    turnoverSourceIndex: count,
    turnoverChildIndex: count,
    diceContribution: finite,
    unscoredDamageRolls: count,
    armorHeld: z.boolean().nullable(),
    playerRemoved: z.boolean()
  }).optional(),
  movementTouchdown: z.strictObject({
    sourceIndex: count,
    childIndex: count,
    destination: pitchCell,
    recordedCell: z.strictObject({
      x: z.number().int().min(0).max(25).nullable(),
      y: z.number().int().min(0).max(14).nullable()
    })
  }).optional(),
  apothecary: z
    .strictObject({
      originalSourceId: text,
      replacementSourceId: text.optional(),
      gamerId: z.number().int().min(0).max(1),
      resourceSpent: z.union([z.literal(0), z.literal(1)]),
      appliedCasualty: z.number().int().min(0).max(10),
      playerStatus: z.number().int().min(0).max(10),
      applied: z.enum(["original", "replacement", "injury_treatment"])
    })
    .optional(),
  isRollCandidate: z.boolean().optional(),
  mergedBlockAnchorId: text.optional(),
  rollType: finite.optional(),
  rollLabel: text.optional(),
  stepType: finite.optional(),
  stepLabel: text.optional(),
  targetId: text.optional(),
  actionCode: finite.optional(),
  actionLabel: text.optional(),
  outcomeCode: finite.optional(),
  requirement: finite.optional(),
  difficulty: finite.optional(),
  dice: numbers.optional(),
  dieTypes: numbers.optional(),
  modifiers: numbers.optional(),
  modifiersSum: finite.optional(),
  rerollAvailable: z.boolean().optional(),
  rerollUsed: z.boolean().optional(),
  skillsUsed: numbers.optional(),
  normalizationFlags: z.array(text).max(REPLAY_LIMITS.events).optional(),
  normalizationNotes: z.array(text).max(REPLAY_LIMITS.events).optional()
});
export const LuckEventSchema = z.strictObject({
  id: text.min(1),
  turn: z.number().int().min(1),
  teamId: text.min(1),
  teamName: text,
  playerId: text.optional(),
  type: LuckEventTypeSchema,
  probabilitySuccess: probability.nullable(),
  actualSuccess: z.boolean().nullable(),
  delta: finite,
  weightedDelta: finite,
  contextualImpact: z
    .strictObject({
      policy: z.enum(["declined_team_reroll", "full_team_reroll"]),
      components: z.strictObject({
        availableMoves: finite.min(0),
        possession: finite.min(0),
        markedBounce: probability
      }),
      difference: finite.min(0),
      contribution: finite
    })
    .optional(),
  label: text,
  tags: z.array(LuckMomentTagSchema).max(2),
  scoringStatus: LuckScoringStatusSchema,
  statusReason: text,
  explainability: z.strictObject({
    target: text,
    baseOdds: probability.optional(),
    rerollAdjustedOdds: probability.optional(),
    weight: finite.min(0),
    formulaSummary: text.optional(),
    inputsSummary: text
  }),
  metadata: LuckEventMetadataSchema
});
export const LuckTeamAggregateSchema = z.strictObject({
  teamId: text.min(1),
  teamName: text,
  luckScore: finite,
  categoryScores: z.strictObject({
    block: finite,
    armorBreak: finite,
    injury: finite,
    dodge: finite,
    ballHandling: finite,
    argueCall: finite,
    movementRisk: finite
  }),
  eventCount: count,
  impactCount: count,
  impactScore: finite,
  impactByType: z.strictObject({ dodge: finite, ball_handling: finite })
});
// This model can only abstain. Supporting comparative verdicts requires a new, validated model version.
export const LuckVerdictSchema = z.strictObject({
  luckierTeam: z.literal("unknown"),
  status: z.enum(["insufficient_evidence", "partial_analysis"]),
  scoreGap: finite.min(0),
  summary: text
});
const coverageBucket = z.strictObject({
  scoredCount: count,
  excludedCount: count,
  scoredRate: probability
});
const categoryCounts = z.record(LuckEventTypeSchema, count);
const categoryKey = {
  block: "block",
  armor_break: "armorBreak",
  injury: "injury",
  dodge: "dodge",
  ball_handling: "ballHandling",
  argue_call: "argueCall",
  movement_risk: "movementRisk"
} as const;
function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
}

export const LuckReportSchema = z
  .strictObject({
    schemaVersion: z.literal(REPORT_SCHEMA_VERSION),
    modelVersion: z.literal(DICE_MODEL_VERSION),
    contextModelVersion: z.literal(CONTEXT_MODEL_VERSION),
    limitations: z.array(text).min(1).max(REPLAY_LIMITS.events),
    id: text.min(1),
    generatedAt: z.iso.datetime(),
    match: z.strictObject({ id: text, homeTeam: text, awayTeam: text }),
    verdict: LuckVerdictSchema,
    coverage: z.strictObject({
      sourceRecordCount: count,
      denominatorDescription: text.min(1),
      allEvents: coverageBucket,
      rollCandidates: coverageBucket,
      rollFamilies: z
        .array(
          z.strictObject({
            teamId: text,
            sourceTag: text,
            rollType: finite.optional(),
            scoredCount: count,
            unscoredCount: count,
            unattributedCount: count
          })
        )
        .max(REPLAY_LIMITS.events),
      contextEvidence: z.strictObject({
        rollCount: count,
        positionCount: count,
        possessionCount: count,
        clockCount: count,
        activationCount: count,
        quantifiedCount: count,
        consequenceCount: count
      }),
      scoredByType: categoryCounts,
      excludedByType: categoryCounts,
      excludedByReason: z.record(text, count)
    }),
    weightTable: z.record(LuckEventTypeSchema, finite.min(0)),
    recruitments: z.array(z.strictObject({
      sourceId: text, sourceIndex: count, playerId: text, playerTypeId: z.number().int().nonnegative(),
      gamerId: z.number().int().min(0).max(1), candidateTeamId: z.number().int().nonnegative().nullable(),
      rosterTeamId: text.nullable(), checkpointAfter: count.nullable(),
      checkpointReplayStep: z.number().int().positive().nullable(), checkpointChildIndex: z.number().int().nonnegative().nullable(),
      innateSkills: z.array(z.number().int().nonnegative()).max(64).nullable(), acquiredSkills: z.array(z.number().int().nonnegative()).max(64).nullable(),
      previousPurchaseSourceId: text.optional(), removalSourceId: text.optional()
    })).max(REPLAY_LIMITS.events),
    damageSteps: z
      .array(
        z.strictObject({
          actionId: text,
          teamId: text,
          playerId: text,
          eventIds: z.array(text).min(1).max(REPLAY_LIMITS.events),
          scoredRolls: count,
          unscoredRolls: count,
          contextRecords: count,
          diceContribution: finite
        })
      )
      .max(REPLAY_LIMITS.events),
    howScoredSummary: z.array(text).max(REPLAY_LIMITS.events),
    teams: z.tuple([LuckTeamAggregateSchema, LuckTeamAggregateSchema]),
    keyMoments: z.array(LuckEventSchema).max(REPLAY_LIMITS.events),
    events: z.array(LuckEventSchema).max(REPLAY_LIMITS.events)
  })
  .superRefine((report, ctx) => {
    function require(condition: boolean, message: string) {
      if (!condition) ctx.addIssue({ code: "custom", message });
    }
    require(report.verdict.summary ===
      VERDICT_SUMMARIES[
        report.verdict.status
      ], "Headline must state the declared model limitations.");
    const ids = new Map(report.events.map((event) => [event.id, event]));
    const sources = new Map(
      report.events.flatMap((event) =>
        event.metadata.sourceId
          ? [[event.metadata.sourceId, event] as const]
          : []
      )
    );
    require(ids.size === report.events.length, "Event IDs must be unique.");
    const teamIds = new Set(report.teams.map((team) => team.teamId));
    require(teamIds.size === 2, "Report requires two distinct teams.");
    require(new Set(report.recruitments.map(r => r.sourceId)).size === report.recruitments.length,
      "Each recorded purchase must appear once.");
    require(report.events.filter(event => event.metadata.mercenary?.operation === "purchase" &&
      event.metadata.sourceId && event.metadata.sourceIndex !== undefined).length === report.recruitments.length,
      "Every locatable purchase record must appear in recruitment evidence.");
    for (const purchase of report.recruitments) {
      const source = sources.get(purchase.sourceId);
      const selection = source?.metadata.mercenary;
      require(source?.metadata.sourceTag === "EventBuyMercenary" &&
        source.metadata.sourceIndex === purchase.sourceIndex && !source.metadata.isRollCandidate &&
        selection?.operation === "purchase" && selection.playerId === purchase.playerId &&
        selection.playerTypeId === purchase.playerTypeId && selection.gamerId === purchase.gamerId,
        "Recruitment evidence must match its recorded purchase source.");
      require((purchase.rosterTeamId === null) === (purchase.checkpointAfter === null) &&
        (purchase.rosterTeamId === null || (teamIds.has(purchase.rosterTeamId) &&
          String(purchase.candidateTeamId) === purchase.rosterTeamId &&
          purchase.checkpointAfter! >= purchase.sourceIndex)),
        "A purchase-to-roster binding requires a following observed membership on the candidate team.");
      for (const list of [purchase.innateSkills, purchase.acquiredSkills])
        if (list) require(new Set(list).size === list.length, "Selected trait lists cannot repeat codes.");
      const previous = purchase.previousPurchaseSourceId ? sources.get(purchase.previousPurchaseSourceId) : undefined;
      if (purchase.previousPurchaseSourceId)
        require(previous?.metadata.mercenary?.operation === "purchase" &&
          previous.metadata.mercenary.playerId === purchase.playerId &&
          previous.metadata.sourceIndex !== undefined && previous.metadata.sourceIndex < purchase.sourceIndex,
          "A reused instance ID must reference its earlier purchase.");
      if (purchase.removalSourceId) {
        const removal = sources.get(purchase.removalSourceId);
        require(removal?.metadata.sourceTag === "EventRemoveMercenary" && removal.playerId === purchase.playerId &&
          removal.metadata.sourceIndex !== undefined && removal.metadata.sourceIndex < purchase.sourceIndex &&
          (!previous || removal.metadata.sourceIndex > (previous.metadata.sourceIndex ?? Infinity)),
          "The recorded removal must belong to this instance between its purchases.");
      }
    }
    require(report.match.homeTeam === report.teams[0].teamName &&
      report.match.awayTeam ===
        report.teams[1].teamName, "Match and team labels must agree.");
    const scored = report.events.filter(
      (event) => event.scoringStatus === "scored"
    );
    const excluded = report.events.filter(
      (event) => event.scoringStatus === "excluded"
    );
    const candidates = report.events.filter(
      (event) => event.metadata.isRollCandidate
    );
    const damageSteps = summarizeDamageSteps(report.events);
    require(JSON.stringify(report.damageSteps) ===
      JSON.stringify(
        damageSteps
      ), "Damage-step totals must reconcile with their original evidence.");
    const damageByAction = new Map(damageSteps.map((step) => [step.actionId, step]));
    const linkedDamageActions = new Set<string>();
    const linkedBallCatches = new Set<string>();
    const families = summarizeRollFamilies(candidates);
    const contextEvidence = summarizeContextEvidence(report.events);
    require(Object.keys(contextEvidence).every(
      (key) =>
        contextEvidence[key as keyof typeof contextEvidence] ===
        report.coverage.contextEvidence[key as keyof typeof contextEvidence]
    ), "Context evidence counts must reconcile with the unique reported roll candidates.");
    require(families.length === report.coverage.rollFamilies.length &&
      families.every((expected, index) => {
        const row = report.coverage.rollFamilies[index];
        return (
          row?.teamId === expected.teamId &&
          row.sourceTag === expected.sourceTag &&
          row.rollType === expected.rollType &&
          row.scoredCount === expected.scoredCount &&
          row.unscoredCount === expected.unscoredCount &&
          row.unattributedCount === expected.unattributedCount
        );
      }), "Roll-family coverage must match the reported candidate evidence.");
    require(report.coverage.sourceRecordCount >=
      report.events.length, "Reported evidence cannot exceed source records.");
    for (const [bucket, events] of [
      [report.coverage.allEvents, report.events],
      [report.coverage.rollCandidates, candidates]
    ] as const) {
      const n = events.filter(
        (event) => event.scoringStatus === "scored"
      ).length;
      require(bucket.scoredCount === n &&
        bucket.excludedCount ===
          events.length - n, "Coverage counts must reconcile with evidence.");
      require(near(
        bucket.scoredRate,
        events.length ? n / events.length : 0
      ), "Coverage rates must use the stated denominator.");
    }
    for (const type of LuckEventTypeSchema.options) {
      require(near(
        report.weightTable[type],
        LUCK_CATEGORY_WEIGHTS[type]
      ), "Weights must match the declared model version.");
      require(report.coverage.scoredByType[type] ===
        scored.filter((event) => event.type === type)
          .length, "Scored category counts must reconcile.");
      require(report.coverage.excludedByType[type] ===
        excluded.filter((event) => event.type === type)
          .length, "Excluded category counts must reconcile.");
    }
    const reasons = new Map<string, number>();
    for (const event of excluded)
      reasons.set(
        event.statusReason,
        (reasons.get(event.statusReason) ?? 0) + 1
      );
    require(Object.keys(report.coverage.excludedByReason).length ===
      reasons.size &&
      [...reasons].every(
        ([reason, n]) => report.coverage.excludedByReason[reason] === n
      ), "Exclusion reasons must conserve excluded records.");
    for (const event of report.events) {
      const pro = event.metadata.proGate;
      if (pro) {
        const { dice, dieTypes, rollType, outcomeCode, teamRerollsSpent, rerollResource } = event.metadata;
        require(
          rollType === 15 &&
            dice?.length === 1 &&
            dieTypes?.length === 1 &&
            dieTypes[0] === 0 &&
            Number.isInteger(dice[0]) &&
            dice[0]! >= 1 &&
            dice[0]! <= 6 &&
            pro.passed === (dice[0]! >= 3) &&
            outcomeCode === Number(pro.passed) &&
            event.actualSuccess === pro.passed &&
            teamRerollsSpent === 0 &&
            rerollResource === "skill" &&
            event.scoringStatus === "excluded",
          "Pro evidence requires a verified 3+ gate and its skill resource."
        );
      }
      const gate = event.metadata.lonerGate;
      if (gate) {
        const {
          rollType,
          dice,
          dieTypes,
          outcomeCode,
          rerollDecisionId,
          teamRerollsSpent
        } = event.metadata;
        require(rollType === 71 &&
          dice?.length === 1 &&
          dieTypes?.[0] === 0 &&
          Number.isInteger(dice[0]) &&
          dice[0]! >= 1 &&
          dice[0]! <= 6 &&
          gate.passed === dice[0]! >= 4 &&
          outcomeCode === Number(gate.passed) &&
          Boolean(rerollDecisionId) &&
          teamRerollsSpent === 1 &&
          event.scoringStatus ===
            "excluded", "A reported Loner gate requires one verified die and a team reroll spend.");
      }
      require(event.teamId === "unresolved" ||
        teamIds.has(
          event.teamId
        ), "Reported evidence must have a known or unresolved team.");
      const context = event.metadata.preRoll;
      if (event.scoringStatus === "scored" && context?.actorRosterTeamId !== undefined)
        require(context.actorRosterTeamId === event.teamId,
          "Scored ownership must agree with the current observed roster.");
      for (const traits of [context?.actorTraits, context?.targetTraits])
        for (const list of [traits?.innateSkills, traits?.acquiredSkills])
          if (list) require(new Set(list).size === list.length,
            "Observed skill lists cannot contain repeated codes.");
      if (context?.actorTraits?.dataPlayerId !== null && context?.actorTraits?.dataPlayerId !== undefined)
        require(String(context.actorTraits.dataPlayerId) === event.playerId,
          "Actor trait data must match the observed player ID.");
      if (context?.targetTraits?.dataPlayerId !== null && context?.targetTraits?.dataPlayerId !== undefined)
        require(String(context.targetTraits.dataPlayerId) === event.metadata.targetId,
          "Target trait data must match the observed target ID.");
      if (context && event.metadata.sourceIndex !== undefined)
        require(context.checkpointAfter <
          event.metadata
            .sourceIndex, "Pre-roll evidence must precede its source.");
      if (context?.actorStandUpSourceIndex !== undefined) {
        require(
          context.activationId !== null &&
            context.actorCell !== null &&
            event.metadata.sourceIndex !== undefined &&
            context.actorStandUpSourceIndex > context.checkpointAfter &&
            context.actorStandUpSourceIndex < event.metadata.sourceIndex,
          "Stand-up evidence must be between the checkpoint and roll of the same activation."
        );
      }
      if (context?.actorPickupSourceId) {
        const pickup = sources.get(context.actorPickupSourceId);
        const index = pickup?.metadata.sourceIndex;
        require(
          context.actorCarriesBall === true &&
            context.activationId !== null &&
            context.actorCell !== null &&
            pickup?.metadata.rollType === 4 &&
            pickup.scoringStatus === "scored" &&
            pickup.actualSuccess === true &&
            pickup.playerId === event.playerId &&
            index !== undefined &&
            index > context.checkpointAfter &&
            event.metadata.sourceIndex !== undefined &&
            index < event.metadata.sourceIndex,
          "Reconstructed possession must link to the earlier successful pickup."
        );
      }
      const carrierMove = context?.teammateCarrierMove;
      const scoringAttempt = context?.scoringAttempt;
      if (scoringAttempt) {
        const from = context?.actorCell;
        const to = scoringAttempt.destination;
        const period = context?.period === "first_half" ? 1 : context?.period === "second_half" ? 2 : context?.period === "extra_time" ? 3 : null;
        const turns = scoringAttempt.turnsPerPeriod;
        const end = period !== null && turns !== null ? period * turns : null;
        require(
          (event.metadata.rollType === 1 || event.metadata.rollType === 2) &&
            context?.phaseCode === 5 &&
            context.activationId !== null &&
            context.actorCarriesBall === true &&
            !!from &&
            Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1 &&
            to.x === (scoringAttempt.sideCode === 32 ? 25 : 0) &&
            (scoringAttempt.turnsRemaining === null ||
              (end !== null &&
                scoringAttempt.teamTurn !== null &&
                turns !== null &&
                scoringAttempt.teamTurn > end - turns &&
                scoringAttempt.turnsRemaining === end - scoringAttempt.teamTurn)),
          "A scoring attempt requires a verified carrier move and its recorded side and clock."
        );
      }
      if (carrierMove) {
        const { carrierCell, destination, effect } = carrierMove;
        const distance = (a: typeof carrierCell, b: typeof carrierCell) =>
          Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        const from = context?.actorCell;
        require(
          event.metadata.rollType === 2 &&
            context?.movementCheckLinked === true &&
            context.activeTeamId === event.teamId &&
            context.actorCarriesBall === false &&
            !!from &&
            distance(from, destination) === 1 &&
            distance(from, carrierCell) === (effect === "approach" ? 2 : 1) &&
            distance(destination, carrierCell) === (effect === "approach" ? 1 : 2),
          "Carrier proximity requires a verified move across the adjacency boundary."
        );
      }
      const impact = event.contextualImpact;
      if (impact) {
        require(event.scoringStatus === "scored" &&
          !!context &&
          context.activeTeamId === event.teamId &&
          (event.type === "dodge" ||
            event.type ===
              "ball_handling"), "Context requires a scored roll and verified pre-roll ownership.");
        require(near(
          impact.difference,
          Object.values(impact.components).reduce((a, b) => a + b, 0)
        ) &&
          near(
            impact.contribution,
            event.delta * impact.difference
          ), "Contextual contribution must reconcile with its components.");
      }
      const block = event.metadata.block;
      const damage = event.metadata.damage;
      const touchdown = event.metadata.movementTouchdown;
      if (touchdown) {
        const { locator, sourceIndex, rollType } = event.metadata;
        const from = context?.actorCell;
        const to = touchdown.destination;
        const recorded = touchdown.recordedCell;
        require(
          event.scoringStatus === "scored" &&
            event.actualSuccess === true &&
            (rollType === 1 || rollType === 2) &&
            context?.actorCarriesBall === true &&
            !!from &&
            Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1 &&
            (to.x === 0 || to.x === 25) &&
            (recorded.x === null || recorded.x === to.x) &&
            (recorded.y === null || recorded.y === to.y) &&
            (recorded.x !== null || recorded.y !== null) &&
            locator?.replayStep !== undefined &&
            locator.childIndex !== undefined &&
            touchdown.childIndex === locator.childIndex + 1 &&
            sourceIndex !== undefined &&
            touchdown.sourceIndex === sourceIndex + 4 &&
            touchdown.sourceIndex <= report.coverage.sourceRecordCount,
          "Touchdown evidence requires the same carrier's successful move to the end zone."
        );
      }
      const fall = event.metadata.movementFall;
      if (fall) {
        const step = damageByAction.get(fall.damageActionId);
        const { locator, rollType, sourceIndex } = event.metadata;
        require(
          !linkedDamageActions.has(fall.damageActionId) &&
            event.scoringStatus === "scored" &&
            event.actualSuccess === false &&
            event.metadata.sourceTag === "ResultRoll" &&
            (rollType === 1 || rollType === 2) &&
            step?.playerId === event.playerId &&
            step?.teamId === event.teamId &&
            sourceIndex !== undefined &&
            fall.moveOutcomeSourceIndex === sourceIndex + 2 &&
            locator?.replayStep !== undefined &&
            locator.childIndex !== undefined &&
            locator.stepIndex !== undefined &&
            fall.turnoverChildIndex === locator.childIndex + 1 &&
            fall.turnoverSourceIndex <= report.coverage.sourceRecordCount,
          "A movement fall requires one failed Rush or Dodge and a linked turnover."
        );
        linkedDamageActions.add(fall.damageActionId);
        if (step) {
          const expected = summarizeMovementFall(event, step, ids);
          require(
            near(fall.diceContribution, expected.diceContribution) &&
              fall.armorHeld === expected.armorHeld &&
              fall.unscoredDamageRolls === expected.unscoredDamageRolls &&
              fall.playerRemoved === expected.playerRemoved &&
              step.eventIds.every((id) => {
                const e = ids.get(id)!;
                const location = e.metadata.locator;
                const index = e.metadata.sourceIndex;
                return (
                  e.turn === event.turn &&
                  location?.replayStep === locator?.replayStep &&
                  location?.childIndex === locator?.childIndex &&
                  location?.stepIndex === (locator?.stepIndex ?? -1) + 1 &&
                  index !== undefined &&
                  index > fall.moveOutcomeSourceIndex &&
                  index < fall.turnoverSourceIndex &&
                  (!e.metadata.damage ||
                    e.metadata.damage.sourceCode === (rollType === 1 ? 9 : 0))
                );
              }),
            "Movement-fall evidence and subtotal must match the following damage step."
          );
        }
      }
      if (block) {
        require(event.type === "block" &&
          teamIds.has(block.defenderTeamId) &&
          block.defenderTeamId !== event.teamId &&
          block.chooserTeamId ===
            (block.pool.attackerChooses
              ? event.teamId
              : block.defenderTeamId), "Block roles must use opposing verified teams.");
        require(block.pool.faces.length === block.pool.outcomes.length &&
          new Set(block.pool.rolledIndexes).size ===
            block.pool.rolledIndexes.length &&
          block.pool.rolledIndexes.every((i) => i < block.pool.faces.length) &&
          near(
            block.distribution.reduce((sum, n) => sum + n, 0),
            1
          ), "Block probabilities and fresh indices must reconcile.");
        require((block.selectedFace === undefined) ===
          (block.selectedOutcome === undefined) &&
          (block.finalOutcome === undefined) ===
            (block.finalSourceId ===
              undefined), "Selected and applied block outcomes require their corresponding evidence.");
        if (block.selectedSourceId) {
          const selected = sources.get(block.selectedSourceId);
          require(selected?.metadata.sourceTag === "ResultBlockRoll" &&
            selected.playerId === block.attackerId &&
            selected.metadata.targetId === block.defenderId &&
            selected.metadata.dice?.[0] === block.selectedFace &&
            selected.metadata.outcomeCode ===
              block.selectedOutcome, "Block selection must match its observed source.");
        }
        if (block.finalSourceId) {
          const final = sources.get(block.finalSourceId);
          require(final?.metadata.sourceTag === "ResultBlockOutcome" &&
            final.playerId === block.attackerId &&
            final.metadata.targetId === block.defenderId &&
            final.metadata.outcomeCode ===
              block.finalOutcome, "Applied block outcomes must match their observed source.");
        }
        if (block.reroll === "pro") {
          const gate = block.proGateSourceId
            ? sources.get(block.proGateSourceId)
            : undefined;
          const previous = block.previousPoolSourceId
            ? sources.get(block.previousPoolSourceId)
            : undefined;
          const index = block.pool.rolledIndexes[0];
          const prior = previous?.metadata.block;
          require(!!gate &&
            gate.metadata.proGate?.passed === true &&
            gate.playerId === block.attackerId &&
            gate.teamId === event.teamId &&
            prior?.attackerId === block.attackerId &&
            prior?.defenderId === block.defenderId &&
            prior?.pool.attackerChooses === block.pool.attackerChooses &&
            block.pool.rolledIndexes.length === 1 &&
            index !== undefined &&
            prior?.pool.proEligibleIndexes?.includes(index) === true &&
            prior.pool.faces.length === block.pool.faces.length &&
            block.pool.faces.every(
              (face, i) => i === index || face === prior.pool.faces[i]
            ), "Pro replacement odds require the passed gate and the unchanged kept dice.");
        }
        if (event.scoringStatus === "scored")
          require(event.probabilitySuccess !== null &&
            near(
              event.probabilitySuccess,
              block.distribution[3]! + block.distribution[4]!
            ) &&
            event.actualSuccess ===
              block.rankedSymbol >=
                3, "Block chance and outcome must agree with the raw symbol contract.");
      }
      if (damage) {
        require(event.type ===
          (damage.regeneration || damage.koRecovery
            ? "injury"
            : "armor_break") &&
          damage.subjectId === event.playerId &&
          damage.chainActionId === event.metadata.actionId &&
          damage.subjectTeamId ===
            event.teamId, "Damage checks use the affected player's perspective.");
        if (damage.regeneration) {
          const casualty = sources.get(damage.regeneration.casualtySourceId);
          const removal = sources.get(
            damage.regeneration.initialRemovalSourceId
          );
          require(event.metadata.rollType === 46 &&
            event.probabilitySuccess === 1 / 2 &&
            damage.chainActionId === event.metadata.actionId &&
            casualty?.metadata.sourceTag === "ResultCasualtyRoll" &&
            casualty.metadata.actionId === damage.chainActionId &&
            removal?.metadata.sourceTag === "ResultPlayerRemoval" &&
            removal.metadata.actionId ===
              damage.chainActionId, "Regeneration requires linked casualty and removal evidence.");
        }
        if (damage.koRecovery) {
          const { target } = damage.koRecovery;
          const {
            sourceTag,
            rollType,
            dice,
            outcomeCode,
            locator,
            difficulty
          } = event.metadata;
          require(!damage.regeneration &&
            sourceTag === "EventRoll" &&
            rollType === 13 &&
            locator?.replayStep !== undefined &&
            locator.childIndex !== undefined &&
            difficulty === target &&
            event.metadata.requirement === 4 &&
            event.metadata.modifiersSum === 4 - target &&
            dice?.length === 1 &&
            Number.isInteger(dice[0]) &&
            dice[0]! >= 1 &&
            dice[0]! <= 6 &&
            event.probabilitySuccess === (7 - target) / 6 &&
            event.actualSuccess === dice[0]! >= target &&
            outcomeCode ===
              (event.actualSuccess
                ? 1
                : undefined), "KO recovery must match its direct source and verified target.");
        }
      }
      const apothecary = event.metadata.apothecary;
      if (event.metadata.ballTravel) {
        const { from, to } = event.metadata.ballTravel;
        require(event.metadata.sourceTag === "ResultRoll" &&
          event.metadata.rollType === 25 && event.scoringStatus === "excluded" &&
          event.metadata.dice?.length === 1 &&
          event.metadata.dieTypes?.[0] === 1 &&
          Number.isInteger(event.metadata.dice[0]) &&
          event.metadata.dice[0]! >= 1 && event.metadata.dice[0]! <= 8 &&
          observedBounceDirection(event.metadata.dice[0], from, to),
          "Observed bounce travel requires the recorded D8 direction and adjacent cells.");
      }
      if (event.metadata.ballCatchCell)
        require(event.scoringStatus === "scored" && event.metadata.rollType === 7 &&
          event.metadata.sourceTag === "ResultRoll" && event.playerId !== undefined,
          "A catch landing requires a verified recorded catch check.");
      const ballChain = event.metadata.pickupBallChain;
      if (ballChain) {
        const bounces = ballChain.bounceSourceIds.map((id) => sources.get(id));
        const catches = ballChain.catchEventIds.map((id) => ids.get(id));
        const contributions: Record<string, number> = { [event.teamId]: event.weightedDelta };
        require(event.scoringStatus === "scored" && event.actualSuccess === false &&
          event.metadata.rollType === 4 &&
          bounces[0]?.metadata.sequenceId === event.metadata.sequenceId &&
          bounces[0]?.metadata.locator?.stepIndex === (event.metadata.locator?.stepIndex ?? -2) + 1 &&
          new Set(ballChain.bounceSourceIds).size === bounces.length &&
          new Set(ballChain.catchEventIds).size === catches.length &&
          catches.length <= bounces.length && bounces.length <= catches.length + 1 &&
          bounces.every((bounce, index) => bounce?.metadata.ballTravel &&
            bounce.metadata.sourceIndex !== undefined &&
            bounce.metadata.sourceIndex > (index ? bounces[index - 1]?.metadata.sourceIndex ?? Infinity : event.metadata.sourceIndex ?? Infinity)),
          "Pickup ball chains require ordered, unique observed bounces after the failed check.");
        for (const [index, caught] of catches.entries()) {
          const bounce = bounces[index];
          const next = bounces[index + 1];
          const landing = bounce?.metadata.ballTravel?.to;
          const catchCell = caught?.metadata.ballCatchCell;
          require(!!caught && !linkedBallCatches.has(caught.id) &&
            caught.scoringStatus === "scored" && caught.metadata.rollType === 7 &&
            caught.metadata.sourceIndex !== undefined &&
            caught.metadata.sourceIndex > (bounce?.metadata.sourceIndex ?? Infinity) &&
            (!next || (caught.actualSuccess === false &&
              caught.metadata.sourceIndex < (next.metadata.sourceIndex ?? -1) &&
              next.metadata.ballTravel?.from.x === landing?.x &&
              next.metadata.ballTravel?.from.y === landing?.y)) &&
            !!catchCell && !!landing && catchCell.x === landing.x && catchCell.y === landing.y,
            "A linked catch must follow its landing, precede another bounce only on failure, and count once.");
          if (caught) {
            linkedBallCatches.add(caught.id);
            contributions[caught.teamId] = (contributions[caught.teamId] ?? 0) + caught.weightedDelta;
          }
        }
        const last = bounces.at(-1)?.metadata.ballTravel?.to;
        require(!!last && last.x === ballChain.endingCell.x && last.y === ballChain.endingCell.y &&
          Object.keys(contributions).length === Object.keys(ballChain.diceByTeam).length &&
          Object.entries(contributions).every(([team, subtotal]) => near(subtotal, ballChain.diceByTeam[team] ?? NaN)),
          "Pickup-chain subtotals must reference the existing contributions by team and final landing.");
      }
      if (event.metadata.embeddedDamageOriginalId) {
        const original = sources.get(event.metadata.embeddedDamageOriginalId);
        require(
          event.metadata.sourceTag === "QuestionKORecovery" &&
            !event.metadata.isRollCandidate && event.scoringStatus === "excluded" &&
            original?.metadata.isRollCandidate === true &&
            original.metadata.actionId === event.metadata.actionId &&
            original.playerId === event.playerId && original.teamId === event.teamId &&
            original.metadata.rollType === 11 && event.metadata.rollType === 11 &&
            original.metadata.outcomeCode === event.metadata.outcomeCode &&
            JSON.stringify(original.metadata.dice) === JSON.stringify(event.metadata.dice),
          "Copied staff-question injury dice require their original damage-step evidence."
        );
      }
      if (apothecary) {
        const original = sources.get(apothecary.originalSourceId);
        const replacement = apothecary.replacementSourceId
          ? sources.get(apothecary.replacementSourceId)
          : undefined;
        require(event.metadata.sourceTag === "ResultApothecary" &&
          event.type === "injury" &&
          event.scoringStatus === "excluded" &&
          event.metadata.isRollCandidate === false &&
          original?.metadata.sourceTag === "QuestionApothecaryCasualtyUsage" &&
          original.teamId === event.teamId &&
          original.playerId === event.playerId &&
          (!apothecary.replacementSourceId ||
            (replacement?.metadata.sourceTag ===
              "QuestionApothecaryCasualtyChoice" &&
              replacement.teamId === event.teamId &&
              replacement.playerId === event.playerId)) &&
          (apothecary.applied === "injury_treatment"
            ? original?.metadata.rollType === 11 &&
              !replacement &&
              apothecary.resourceSpent === 1 &&
              apothecary.appliedCasualty === 0
            : original?.metadata.rollType === 12 &&
              (apothecary.resourceSpent === 1) === Boolean(replacement) &&
              apothecary.appliedCasualty ===
                (apothecary.applied === "original"
                  ? original.metadata.outcomeCode
                  : replacement?.metadata
                      .outcomeCode)), "Apothecary decisions require linked damage rolls and consistent resource evidence.");
      }
      if (event.scoringStatus === "excluded") {
        require(event.probabilitySuccess === null &&
          event.delta === 0 &&
          event.weightedDelta === 0 &&
          event.tags.length ===
            0, "Excluded evidence cannot invent odds or scored contributions.");
      } else {
        require(teamIds.has(event.teamId) &&
          event.metadata.isRollCandidate ===
            true, "Scored outcomes require a known team and random-outcome evidence.");
        require(event.probabilitySuccess !== null &&
          event.actualSuccess !== null &&
          Boolean(
            event.explainability.formulaSummary
          ), "Scored outcomes require odds, observed result and calculation.");
        if (event.probabilitySuccess !== null && event.actualSuccess !== null)
          require(near(
            event.delta,
            Number(event.actualSuccess) - event.probabilitySuccess
          ), "Dice deviation must agree with chance and result.");
        require(near(
          event.weightedDelta,
          event.delta * event.explainability.weight
        ) &&
          near(
            event.explainability.weight,
            report.weightTable[event.type]
          ), "Weighted contributions must agree with the declared scale.");
      }
    }
    for (const team of report.teams) {
      const owned = report.events.filter(
        (event) => event.teamId === team.teamId
      );
      const impacts = owned.filter(
        (event) => event.contextualImpact !== undefined
      );
      require(team.impactCount === impacts.length &&
        near(
          team.impactScore,
          impacts.reduce(
            (sum, event) => sum + event.contextualImpact!.contribution,
            0
          )
        ), "Context totals must reconcile.");
      for (const type of ["dodge", "ball_handling"] as const)
        require(near(
          team.impactByType[type],
          impacts
            .filter((event) => event.type === type)
            .reduce(
              (sum, event) => sum + event.contextualImpact!.contribution,
              0
            )
        ), "Context categories must reconcile.");
      const contributions = owned.filter(
        (event) => event.scoringStatus === "scored"
      );
      require(team.eventCount === owned.length &&
        near(
          team.luckScore,
          contributions.reduce((sum, event) => sum + event.weightedDelta, 0)
        ), "Team totals and counts must reconcile with owned evidence.");
      for (const [type, key] of Object.entries(categoryKey) as Array<
        [
          keyof typeof categoryKey,
          (typeof categoryKey)[keyof typeof categoryKey]
        ]
      >) {
        require(near(
          team.categoryScores[key],
          contributions
            .filter((event) => event.type === type)
            .reduce((sum, event) => sum + event.weightedDelta, 0)
        ), "Category totals must reconcile with event contributions.");
      }
    }
    const momentIds = new Set<string>();
    for (const moment of report.keyMoments) {
      const original = ids.get(moment.id);
      require(!momentIds.has(moment.id) &&
        original?.scoringStatus === "scored" &&
        JSON.stringify(original) ===
          JSON.stringify(
            moment
          ), "Key moments must reference unique, unchanged scored evidence.");
      momentIds.add(moment.id);
    }
    require(near(
      report.verdict.scoreGap,
      Math.abs(report.teams[0].luckScore - report.teams[1].luckScore)
    ), "Reported gap must use the same additive team units.");
    require(report.verdict.status ===
      (scored.length
        ? "partial_analysis"
        : "insufficient_evidence"), "Evidence status must distinguish partial analysis from no scored evidence.");
  });
