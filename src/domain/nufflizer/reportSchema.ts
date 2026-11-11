import { estimateDodgeImpactBounds, estimateNumericImpact } from "./contextImpact";
import { blockOutcomeName, consistentBlockResolution, knockedDownSubjects, summarizeBlockConsequence } from "./blockConsequences";
import { enumerateBlockPool } from "./blockPools";
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
const activationEnd = z.strictObject({
  kind: z.enum(["ordinary_move_completed", "bone_head", "really_stupid"]),
  sourceId: text,
  sourceIndex: count,
  declarationSourceId: text,
  actorId: text,
  teamId: text,
  rosterIndex: z.number().int().min(0).max(1),
  teamTurn: z.number().int().positive(),
  periodCode: z.number().int().nonnegative().nullable(),
  actorCell: pitchCell,
  followingPlayerId: text,
  checkpointAfter: count,
  moveSourceId: text.optional(),
  skillSourceId: text.optional(),
  rollSourceId: text.optional(),
  effectSourceId: text.optional(),
  questionSourceId: text.optional(),
  decisionSourceId: text.optional(),
  lonerSourceId: text.optional(),
  lonerSkillSourceId: text.optional(),
  policy: z
    .enum(["fresh_final", "kept_original", "team_loner_replacement", "failed_loner_kept_original"])
    .optional()
});
export const LuckEventMetadataSchema = z.strictObject({
  blockSelection:z.strictObject({face:z.number().int().min(0).max(4)}).optional(),
  blockResolution: z.strictObject({
    outcome:z.enum(["attacker_down","both_down","wrestled_prone","both_stay_up","push","defender_down","defender_pushed_down"]),
    skillSourceIds:z.array(text).max(4),damageActionIds:z.array(text).max(2),
    diceByTeam:z.record(text,finite),unscoredDamageRolls:count
  }).optional(),
  setupPhase: z.strictObject({code:z.literal(3)}).optional(),
  driveEffectExpiry: z.strictObject({playerId:text,teamId:text,providerSkillId:z.union([z.literal(31),z.literal(51)]),phaseSourceId:text,
    beforeCheckpointAfter:count,afterCheckpointAfter:count,afterReplayStep:z.number().int().positive(),afterChildIndex:z.number().int().nonnegative(),
    afterPitchLocation:z.enum(["on_pitch","off_pitch","unknown"]),afterRecordedCanAct:z.boolean().nullable(),afterRecordedTackleZone:z.boolean().nullable()}).optional(),
  teamRerollDecision: z.strictObject({ gamerId: z.union([z.literal(0),z.literal(1)]), used: z.literal(true) }).optional(),
  mentalTraitResolution: z.strictObject({ providerSkillId: z.union([z.literal(31), z.literal(51)]), effectEndSourceId: text, skillSourceId: text }).optional(),
  mentalEffectEnd: z.strictObject({ providerSkillId: z.union([z.literal(31),z.literal(51)]), declarationSourceId: text, playerId: text }).optional(),
  activationEnd: activationEnd.optional(),
  recordedEffect: z
    .strictObject({
      effectId: z.literal(44),
      providerId: z.union([z.literal(31), z.literal(51)]),
      providerType: z.literal(4),
      durations: z.tuple([z.literal(6), z.literal(1)])
    })
    .optional(),

  skillUsage: z.strictObject({ skillId: z.number().int().nonnegative(), used: z.boolean() }).optional(),
  activationLoss: z.strictObject({
    rollSourceId: text, rollSourceIndex: count, declarationSourceId: text, skillSourceId: text,
    followingActivationSourceId: text, followingSourceIndex: count, followingPlayerId: text,
    actorId: text, subjectId: text, teamId: text, teamTurn: z.number().int().positive(),
    rosterIndex: z.number().int().min(0).max(1), periodCode: z.number().int().nonnegative().nullable(),
    actorCell: pitchCell, beforeCheckpointAfter: count, afterCheckpointAfter: count
  }).optional(),
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
      threshold: z.union([z.literal(3), z.literal(4)]),
      skillId: z.union([z.literal(44), z.literal(1008)]),
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
      ordinaryMoveAvailability:z.strictObject({successDestination:pitchCell,knownAvailablePlayerIds:z.array(text).max(64),unknownPlayerIds:z.array(text).max(64)}).optional(),
      suppressedTackleZones: z.array(z.strictObject({ playerId: text, rosterIndex: z.number().int().min(0).max(1), teamId: text.nullable(), providerSkillId: z.union([z.literal(31),z.literal(51)]) })).max(128).optional(),
      actorMentalEffectEnd: z.strictObject({ sourceId: text, providerSkillId: z.union([z.literal(31),z.literal(51)]) }).optional(),
      endedActivationSourceIds: z.array(text).max(64).optional(),
      actorTackleZone: z.boolean().nullable().optional(),
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
      reroll: z.enum(["initial", "team", "brawler", "pro", "loner"]),
      proGateSourceId: text.optional(),
      lonerGateSourceId: text.optional(),
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
  contextualBounds:z.strictObject({policy:z.literal("dodge_skill_reroll"),minimumMoves:count,maximumMoves:count,successChance:probability,lower:finite,upper:finite}).optional(),
  contextualImpact: z
    .strictObject({
      policy: z.enum(["declined_team_reroll", "full_team_reroll", "dodge_skill_reroll"]),
      components: z.strictObject({
        availableMoves: finite.min(0),
        possession: finite.min(0),
        markedBounce: probability
      }),
      difference: finite.min(0),
      deviation:finite,
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
        boundedCount: count,
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
    const linkedBlockFinals = new Set<string>();
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
        const skill = sources.get(gate.skillSourceId), choice = event.metadata.rerollDecisionId ? sources.get(event.metadata.rerollDecisionId) : undefined;
        require(skill?.metadata.sourceTag === "ResultSkillUsage" && skill.metadata.skillUsage?.skillId === gate.skillId && skill.metadata.skillUsage.used &&
          skill.playerId === event.playerId && skill.teamId === event.teamId && skill.metadata.actionId === event.metadata.actionId &&
          choice?.metadata.sourceTag === "ResultTeamRerollUsage" && choice.playerId === event.playerId && choice.teamId === event.teamId &&
          choice.metadata.actionId === event.metadata.actionId && choice.metadata.teamRerollDecision?.gamerId === gate.gamerId &&
          choice.metadata.teamRerollDecision.used && event.metadata.rerollResource === "team" &&
          (choice.metadata.sourceIndex ?? Infinity) < (skill.metadata.sourceIndex ?? -1) && (skill.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1),
          "A Loner gate requires its own ordered actor/skill/spend sources.");
        const {
          rollType,
          dice,
          dieTypes,
          outcomeCode,
          rerollDecisionId,
          teamRerollsSpent
        } = event.metadata;
        require(event.metadata.sourceTag === "ResultRoll" && event.metadata.isRollCandidate === true && rollType === 71 &&
          dice?.length === 1 &&
          dieTypes?.length === 1 && dieTypes[0] === 0 && event.teamId !== "unresolved" &&
          (event.metadata.modifiers?.length ?? 0) === 0 && event.metadata.modifiersSum === 0 &&
          Number.isInteger(dice[0]) &&
          dice[0]! >= 1 &&
          dice[0]! <= 6 &&
          gate.passed === (dice[0]! >= gate.threshold) &&
          gate.threshold === (gate.skillId === 1008 ? 3 : 4) &&
          event.metadata.requirement === gate.threshold && event.metadata.difficulty === gate.threshold &&
          event.actualSuccess === gate.passed &&
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
      const ended = context?.endedActivationSourceIds;
      if (ended) require(new Set(ended).size === ended.length && ended.every(id => {
        const loss = sources.get(id)?.metadata.activationLoss;
        const end = sources.get(id)?.metadata.activationEnd;
        if (end) return end.teamId === context.actorRosterTeamId && end.teamTurn === context.teamTurn &&
          context.period === (end.periodCode === 0 ? "first_half" : end.periodCode === 1 ? "second_half" : end.periodCode === 2 ? "extra_time" : null) &&
          end.sourceIndex <= (event.metadata.sourceIndex ?? -1);
        return loss && loss.teamId === context.actorRosterTeamId &&
          loss.teamTurn === context.teamTurn &&
          context.period === (loss.periodCode === 0 ? "first_half" : loss.periodCode === 1 ? "second_half" : loss.periodCode === 2 ? "extra_time" : null) &&
          loss.followingSourceIndex <= (event.metadata.sourceIndex ?? -1);
      }), "Known ended activations require earlier confirmed same-team, same-turn evidence.");
      const expiry = event.metadata.driveEffectExpiry;
      if (expiry) {
        const phase = sources.get(expiry.phaseSourceId);
        require(event.metadata.sourceTag === "EventEndPlayerEffect" && event.playerId === expiry.playerId && event.teamId === expiry.teamId &&
          teamIds.has(expiry.teamId) && event.metadata.recordedEffect?.providerId === expiry.providerSkillId &&
          phase?.metadata.sourceTag === "EventNewGamePhase" && phase.metadata.setupPhase?.code === 3 &&
          phase.metadata.locator?.replayStep === expiry.afterReplayStep && event.metadata.locator?.replayStep === expiry.afterReplayStep &&
          (event.metadata.locator?.childIndex ?? Infinity) < (phase.metadata.locator?.childIndex ?? -1) &&
          (phase.metadata.locator?.childIndex ?? Infinity) < expiry.afterChildIndex &&
          expiry.beforeCheckpointAfter < (event.metadata.sourceIndex ?? -1) && (event.metadata.sourceIndex ?? Infinity) < (phase.metadata.sourceIndex ?? -1) &&
          (phase.metadata.sourceIndex ?? Infinity) <= expiry.afterCheckpointAfter && expiry.afterCheckpointAfter <= report.coverage.sourceRecordCount &&
          event.scoringStatus === "excluded" && event.probabilitySuccess === null,
          "Drive effect expiry requires the explicit ordered end, setup phase and first same-step observation.");
      }
      if (event.metadata.setupPhase) require(event.metadata.sourceTag === "EventNewGamePhase", "Setup-phase context requires a recorded phase transition.");
      const suppressed = context?.suppressedTackleZones;
      if (suppressed) require(new Set(suppressed.map(p=>p.playerId)).size === suppressed.length &&
        suppressed.every(p=>(p.teamId === null || teamIds.has(p.teamId)) && (p.playerId !== event.playerId || context?.actorTackleZone === false)), "Tackle-zone effect observations require unique players and observed team identities.");
      const recovery = context?.actorMentalEffectEnd;
      if (recovery) {
        const source = sources.get(recovery.sourceId);
        require(source?.metadata.mentalEffectEnd?.providerSkillId === recovery.providerSkillId && source.playerId === event.playerId &&
          source.teamId === event.teamId && context?.actorTackleZone === null && source.metadata.mentalEffectEnd.declarationSourceId === context?.activationId &&
          (source.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1) &&
          (context?.checkpointAfter ?? Infinity) < (source.metadata.sourceIndex ?? -1), "An ended actor effect requires its earlier source in this observed activation frame.");
      }
      const resolution = event.metadata.mentalTraitResolution;
      if (resolution) {
        const end = sources.get(resolution.effectEndSourceId), skill = sources.get(resolution.skillSourceId);
        const face = event.metadata.dice?.[0], target = event.metadata.difficulty;
        const modifiers = event.metadata.modifiers ?? [];
        const unmodified = modifiers.length === 0 && event.metadata.modifiersSum === 0;
        const targetKnown = resolution.providerSkillId === 31
          ? event.metadata.requirement === 2 && target === 2 && unmodified
          : event.metadata.requirement === 4 && ((target === 4 && unmodified) ||
              (target === 2 && modifiers.length === 1 && modifiers[0] === 2 && event.metadata.modifiersSum === 2));
        require(event.metadata.dice?.length === 1 && event.metadata.dieTypes?.length === 1 && event.metadata.dieTypes[0] === 0 &&
          face !== undefined && Number.isInteger(face) && face >= 1 && face <= 6 && targetKnown &&
          event.actualSuccess === (face >= target!) && event.metadata.outcomeCode === Number(event.actualSuccess),
          "A resolved mental test requires one consistent D6, effective target, modifiers and observed outcome.");
        require(event.metadata.sourceTag === "ResultRoll" && event.metadata.rollType === (resolution.providerSkillId === 51 ? 34 : 33) &&
          typeof event.actualSuccess === "boolean" && event.actualSuccess === Boolean(event.metadata.outcomeCode) &&
          event.scoringStatus === "excluded" && event.probabilitySuccess === null &&
          context?.actorMentalEffectEnd?.sourceId === resolution.effectEndSourceId && end?.metadata.mentalEffectEnd?.providerSkillId === resolution.providerSkillId &&
          skill?.metadata.sourceTag === "ResultSkillUsage" && skill.metadata.skillUsage?.skillId === resolution.providerSkillId && skill.metadata.skillUsage.used &&
          skill.playerId === event.playerId && skill.metadata.actionId === event.metadata.actionId &&
          (end?.metadata.sourceIndex ?? Infinity) < (skill.metadata.sourceIndex ?? -1) && (skill.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1),
          "A resolved mental test requires its ended prior effect and same-actor applied skill, with unknown odds.");
      }
      const effectEnd = event.metadata.mentalEffectEnd;
      if (effectEnd) {
        const declaration = sources.get(effectEnd.declarationSourceId);
        require(event.metadata.sourceTag === "ResultEndPlayerEffect" && event.teamId !== "unresolved" && event.playerId === effectEnd.playerId &&
          event.metadata.recordedEffect?.providerId === effectEnd.providerSkillId &&
          declaration?.metadata.sourceTag === "ResultUseAction" && declaration.playerId === event.playerId && declaration.teamId === event.teamId &&
          declaration.metadata.actionId === event.metadata.actionId &&
          (declaration.metadata.actionCode ?? 0) >= 1 && (declaration.metadata.actionCode ?? 0) <= 6 &&
          (declaration.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1), "Effect-end evidence requires the actor's own prior ordinary declaration.");
      }
      const end = event.metadata.activationEnd;
      if (end) {
        const declaration = sources.get(end.declarationSourceId);
        const originIndex = declaration?.metadata.sourceIndex ?? Infinity;
        const linked = (id: string | undefined, tag: string) => {
          const e = id ? sources.get(id) : undefined;
          return e?.metadata.sourceTag === tag &&
            e.playerId === end.actorId &&
            e.teamId === end.teamId &&
            (e.metadata.sourceIndex ?? -1) > originIndex &&
            (e.metadata.sourceIndex ?? Infinity) < end.sourceIndex
            ? e
            : undefined;
        };
        require(event.metadata.sourceTag === "ResultUseAction" &&
          event.metadata.sourceId === end.sourceId &&
          event.metadata.sourceIndex === end.sourceIndex &&
          event.playerId === end.followingPlayerId &&
          event.playerId !== end.actorId &&
          event.teamId === end.teamId &&
          (event.metadata.actionCode ?? 0) >= 1 &&
          (event.metadata.actionCode ?? 0) <= 6 &&
          declaration?.metadata.sourceTag === "ResultUseAction" &&
          declaration.playerId === end.actorId &&
          declaration.teamId === end.teamId &&
          originIndex < end.sourceIndex &&
          end.checkpointAfter <
            end.sourceIndex, "An ended activation requires an earlier declaration and a different following teammate.");
        if (end.kind === "ordinary_move_completed") {
          require(declaration?.metadata.actionCode === 1 &&
            !!linked(end.moveSourceId, "ResultMoveOutcome") &&
            !end.policy &&
            !end.rollSourceId &&
            !end.effectSourceId &&
            !end.skillSourceId &&
            !end.questionSourceId &&
            !end.decisionSourceId &&
            !end.lonerSourceId &&
            !end.lonerSkillSourceId, "Ordinary Move completion requires its recorded movement and no fabricated trait policy.");
        } else {
          const skillId = end.kind === "bone_head" ? 31 : 51;
          const skill = linked(end.skillSourceId, "ResultSkillUsage"),
            roll = linked(end.rollSourceId, "ResultRoll"),
            effect = linked(end.effectSourceId, "ResultAddPlayerEffect");
          require((declaration?.metadata.actionCode ?? 0) >= 1 &&
            (declaration?.metadata.actionCode ?? 0) <= 6 &&
            skill?.metadata.skillUsage?.skillId === skillId &&
            skill.metadata.skillUsage.used &&
            roll?.metadata.rollType === (skillId === 31 ? 33 : 34) &&
            roll.actualSuccess === false &&
            roll.scoringStatus === "excluded" &&
            effect?.metadata.recordedEffect?.providerId === skillId &&
            (skill?.metadata.sourceIndex ?? Infinity) <
              (roll?.metadata.sourceIndex ?? -1) &&
            (roll?.metadata.sourceIndex ?? Infinity) <
              (effect?.metadata.sourceIndex ?? -1) &&
            (effect?.metadata.sourceIndex ?? Infinity) <= end.checkpointAfter &&
            !end.moveSourceId, "A terminal mental trait requires its own skill, failed roll, recorded effect and following board.");
          if (end.policy === "fresh_final")
            require(!end.questionSourceId &&
              !end.decisionSourceId &&
              !end.lonerSourceId &&
              !end.lonerSkillSourceId, "A fresh final trait cannot claim a reroll policy.");
          else {
            const question = linked(
                end.questionSourceId,
                "QuestionTeamRerollUsage"
              ),
              decision = linked(end.decisionSourceId, "ResultTeamRerollUsage");
            require(!!question &&
              !!decision &&
              (question?.metadata.sourceIndex ?? Infinity) <
                (decision?.metadata.sourceIndex ?? -1) &&
              (decision?.metadata.sourceIndex ?? Infinity) <
                (roll?.metadata.sourceIndex ??
                  -1), "A terminal reroll policy requires ordered question and decision evidence.");
            if (end.policy === "team_loner_replacement" || end.policy === "failed_loner_kept_original") {
              const loner = linked(end.lonerSourceId, "ResultRoll"),
                lonerSkill = linked(end.lonerSkillSourceId, "ResultSkillUsage");
              require(loner?.metadata.rollType === 71 &&
                loner.metadata.lonerGate?.passed === (end.policy === "team_loner_replacement") &&
                lonerSkill?.metadata.skillUsage?.skillId === loner.metadata.lonerGate?.skillId &&
                lonerSkill.metadata.skillUsage.used &&
                loner.metadata.lonerGate.skillSourceId ===
                  end.lonerSkillSourceId &&
                (decision?.metadata.sourceIndex ?? Infinity) <
                  (loner?.metadata.sourceIndex ?? -1) &&
                (loner?.metadata.sourceIndex ?? Infinity) <
                  (roll?.metadata.sourceIndex ??
                    -1), "A terminal trait policy requires its matching passed or failed Loner gate.");
            } else
              require(end.policy === "kept_original" &&
                !end.lonerSourceId &&
                !end.lonerSkillSourceId, "A kept trait cannot invent a replacement.");
          }
        }
      }
      const activationLoss = event.metadata.activationLoss;
      if (activationLoss) {
        const declaration = sources.get(activationLoss.declarationSourceId);
        const skill = sources.get(activationLoss.skillSourceId);
        const following = sources.get(activationLoss.followingActivationSourceId);
        require(event.metadata.sourceTag === "ResultRoll" && event.metadata.rollType === 37 &&
          event.metadata.sourceId === activationLoss.rollSourceId &&
          event.metadata.sourceIndex === activationLoss.rollSourceIndex &&
          event.metadata.dice?.length === 1 && event.metadata.dice[0] === 1 && event.metadata.dieTypes?.[0] === 0 &&
          event.metadata.difficulty === 2 && event.metadata.outcomeCode === 0 &&
          event.teamId === activationLoss.teamId && event.playerId === activationLoss.actorId &&
          event.metadata.targetId === activationLoss.subjectId && event.actualSuccess === false &&
          event.scoringStatus === "excluded" && event.probabilitySuccess === null &&
          declaration?.metadata.sourceTag === "ResultUseAction" && declaration.metadata.actionCode === 2 &&
          declaration.playerId === activationLoss.actorId && declaration.metadata.actionId === event.metadata.actionId &&
          (declaration.metadata.sourceIndex ?? Infinity) < activationLoss.rollSourceIndex &&
          skill?.metadata.sourceTag === "ResultSkillUsage" && skill.playerId === activationLoss.subjectId &&
          skill.metadata.skillUsage?.skillId === 10 && skill.metadata.skillUsage.used === true &&
          skill.metadata.actionId === event.metadata.actionId &&
          (skill.metadata.sourceIndex ?? Infinity) < activationLoss.rollSourceIndex &&
          following?.metadata.sourceTag === "ResultUseAction" && following.playerId === activationLoss.followingPlayerId &&
          following.playerId !== activationLoss.actorId && following.teamId === activationLoss.teamId &&
          following.metadata.sourceIndex === activationLoss.followingSourceIndex &&
          (following.metadata.actionCode ?? 0) >= 1 && (following.metadata.actionCode ?? 0) <= 6 &&
          activationLoss.beforeCheckpointAfter < activationLoss.rollSourceIndex &&
          activationLoss.afterCheckpointAfter >= activationLoss.rollSourceIndex &&
          activationLoss.afterCheckpointAfter < activationLoss.followingSourceIndex,
          "An activation loss requires the failed gate, opposing skill, following teammate and ordered checkpoints.");
      }
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
      const availability = context?.ordinaryMoveAvailability;
      if (availability) {
        const members=[...availability.knownAvailablePlayerIds,...availability.unknownPlayerIds];
        require(context?.movementCheckLinked === true && event.metadata.rollType === 2 && context.actorCell !== null &&
          context.activeTeamId === event.teamId && Math.max(Math.abs(context.actorCell!.x-availability.successDestination.x),Math.abs(context.actorCell!.y-availability.successDestination.y)) === 1 &&
          members.length < 64 && new Set(members).size === members.length && !members.includes(event.playerId ?? "") &&
          context.otherUsefulActivations === (availability.unknownPlayerIds.length ? null : availability.knownAvailablePlayerIds.length),
          "Ordinary-move availability must describe the verified successful successor without duplicated or fabricated known counts.");
      }
      const bound=event.contextualBounds;
      if (bound) {
        const expected=estimateDodgeImpactBounds(context,bound.policy,Number(event.actualSuccess)-bound.successChance,bound.successChance);
        require(event.scoringStatus === "scored" && event.metadata.rollType === 2 && context?.activeTeamId === event.teamId &&
          event.contextualImpact === undefined && !!expected && bound.minimumMoves === expected.minimumMoves && bound.maximumMoves === expected.maximumMoves &&
          near(bound.successChance,(7-(event.metadata.difficulty ?? 0))/6) && near(bound.lower,expected.lower) && near(bound.upper,expected.upper),
          "Partial ordinary-move bounds must reconcile with missing availability, the fixed policy and dice deviation, without a point estimate.");
      }
      if (bound || event.contextualImpact?.policy === "dodge_skill_reroll") {
        const original=event.metadata.rerollOriginalId ? sources.get(event.metadata.rerollOriginalId) : undefined;
        const use=event.metadata.rerollDecisionId ? sources.get(event.metadata.rerollDecisionId) : undefined;
        const target=event.metadata.difficulty;
        require(event.metadata.rollType === 2 && event.metadata.rerollResource === "skill" && event.metadata.rerollSkill === "Dodge" && event.metadata.teamRerollsSpent === 0 &&
          original?.metadata.sourceTag === "ResultRoll" && original.metadata.rollType === 2 && original.playerId === event.playerId && original.teamId === event.teamId &&
          original.metadata.outcomeCode === 0 && original.metadata.mergedRerollAnchorId === event.metadata.sourceId &&
          original.metadata.difficulty === target && original.metadata.requirement === event.metadata.requirement &&
          JSON.stringify(original.metadata.modifiers) === JSON.stringify(event.metadata.modifiers) &&
          original.metadata.dice?.length === 1 && original.metadata.dieTypes?.length === 1 && original.metadata.dieTypes[0] === 0 &&
          Number.isInteger(original.metadata.dice[0]) && original.metadata.dice[0]!>=1 &&
          event.metadata.dice?.length === 1 && event.metadata.dieTypes?.length === 1 && event.metadata.dieTypes[0] === 0 &&
          Number.isInteger(event.metadata.dice[0]) && event.metadata.dice[0]!>=1 && event.metadata.dice[0]!<=6 && event.actualSuccess === (event.metadata.dice[0]!>=(target ?? 0)) &&
          typeof target === "number" && Number.isInteger(target) && target>=2 && target<=6 && original.metadata.dice[0]!<target &&
          use?.metadata.sourceTag === "ResultSkillUsage" && use.metadata.skillUsage?.skillId === 7 && use.metadata.skillUsage.used && use.playerId === event.playerId && use.teamId === event.teamId &&
          use.metadata.actionId === event.metadata.actionId && original.metadata.actionId === event.metadata.actionId &&
          (original.metadata.sourceIndex ?? Infinity)<(use.metadata.sourceIndex ?? -1) && (use.metadata.sourceIndex ?? Infinity)<(event.metadata.sourceIndex ?? -1) &&
          event.probabilitySuccess !== null && near(event.probabilitySuccess,1-((target-1)/6)**2),
          "A Dodge-skill context policy requires the owned committed reroll, original failed die and two-attempt odds.");
      }
      const impact = event.contextualImpact;
      if (impact) {
        require(event.scoringStatus === "scored" &&
          !!context &&
          context.activeTeamId === event.teamId &&
          (event.type === "dodge" ||
            event.type ===
              "ball_handling"), "Context requires a scored roll and verified pre-roll ownership.");
        const expectedDeviation=impact.policy === "dodge_skill_reroll" ? Number(event.actualSuccess)-(7-(event.metadata.difficulty ?? 0))/6 : event.delta;
        require(near(impact.deviation,expectedDeviation), "Context deviation must use its stated whole-check or conditional terminal-die scope.");
        const expected=estimateNumericImpact(context,event.metadata.rollType,impact.policy,expectedDeviation);
        require(!!expected && near(impact.components.availableMoves,expected.components.availableMoves) && near(impact.components.possession,expected.components.possession) && near(impact.components.markedBounce,expected.components.markedBounce), "Point context requires complete supported successor components.");
        require(near(
          impact.difference,
          Object.values(impact.components).reduce((a, b) => a + b, 0)
        ) &&
          near(
            impact.contribution,
            impact.deviation * impact.difference
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
      if (event.metadata.blockSelection) require(event.metadata.sourceTag === "ResultBlockRoll" && !event.metadata.isRollCandidate && event.scoringStatus === "excluded", "An observed selected block face is a deterministic summary of a linked pool.");
      const blockAftermath = event.metadata.blockResolution;
      if (blockAftermath) {
        const block = event.metadata.block;
        const selection = block?.selectedSourceId ? sources.get(block.selectedSourceId) : undefined;
        const final = block?.finalSourceId ? sources.get(block.finalSourceId) : undefined;
        const skills = blockAftermath.skillSourceIds.flatMap(id => {
          const use = sources.get(id);
          return use?.playerId && use.metadata.skillUsage ? [{sourceId:id,playerId:use.playerId,skillId:use.metadata.skillUsage.skillId}] : [];
        });
        require(!linkedBlockFinals.has(block?.finalSourceId ?? "") && block !== undefined && block.pool.faces.includes(block.selectedFace!) && event.teamId !== "unresolved" && block.selectedFace !== undefined && block.finalOutcome !== undefined &&
          blockOutcomeName(block.finalOutcome) === blockAftermath.outcome && block.selectedOutcome === block.finalOutcome &&
          selection?.metadata.sourceTag === "ResultBlockRoll" && selection.playerId === block.attackerId && selection.metadata.targetId === block.defenderId && selection.metadata.blockSelection?.face === block.selectedFace && selection.metadata.outcomeCode === block.finalOutcome && final?.metadata.sourceTag === "ResultBlockOutcome" &&
          final.metadata.outcomeCode === block.finalOutcome && final.playerId === block.attackerId && final.metadata.targetId === block.defenderId &&
          (event.metadata.sourceIndex ?? Infinity) < (selection?.metadata.sourceIndex ?? -1) &&
          (selection?.metadata.sourceIndex ?? Infinity) < (final?.metadata.sourceIndex ?? -1) &&
          skills.length === blockAftermath.skillSourceIds.length && new Set(blockAftermath.skillSourceIds).size === skills.length &&
          skills.every(skill => {
            const use = sources.get(skill.sourceId)!;
            return use.metadata.sourceTag === "ResultSkillUsage" && use.metadata.skillUsage?.used && teamIds.has(use.teamId) &&
              (skill.playerId === block.attackerId ? use.teamId === event.teamId : skill.playerId === block.defenderId && use.teamId !== event.teamId) &&
              use.metadata.stepType === 6 && use.metadata.actionId === selection?.metadata.actionId &&
              (event.metadata.sourceIndex ?? Infinity) < (use.metadata.sourceIndex ?? -1) && (use.metadata.sourceIndex ?? Infinity) < (selection?.metadata.sourceIndex ?? -1);
          }) && consistentBlockResolution(block.selectedFace, block.finalOutcome, block.attackerId, block.defenderId, skills),
          "Block consequences require their own ordered selected face, participant skill uses and applied outcome.");
        if (block && final) {
          linkedBlockFinals.add(block.finalSourceId!);
          const subjects = knockedDownSubjects(blockAftermath.outcome,block.attackerId,block.defenderId);
          const linked = blockAftermath.damageActionIds.flatMap(id => damageByAction.has(id) ? [damageByAction.get(id)!] : []);
          require(linked.length === blockAftermath.damageActionIds.length && new Set(blockAftermath.damageActionIds).size === linked.length &&
            new Set(linked.map(step=>step.playerId)).size === linked.length && linked.every(step =>
              !linkedDamageActions.has(step.actionId) && subjects.includes(step.playerId) &&
              (step.playerId === block.attackerId ? step.teamId === event.teamId : step.teamId !== event.teamId && teamIds.has(step.teamId)) &&
              step.eventIds.some(id=>ids.get(id)?.metadata.damage?.sourceCode === 1) && step.eventIds.every(id=> {
                const damage = ids.get(id)!;
                return damage.metadata.sequenceId === final.metadata.sequenceId &&
                  damage.metadata.locator?.replayStep === final.metadata.locator?.replayStep &&
                  damage.metadata.locator?.stepIndex !== undefined && final.metadata.locator?.stepIndex !== undefined &&
                  damage.metadata.locator.stepIndex > final.metadata.locator.stepIndex && damage.metadata.locator.stepIndex <= final.metadata.locator.stepIndex + 2 &&
                  (damage.metadata.sourceIndex ?? -1) > (final.metadata.sourceIndex ?? Infinity);
              })), "Block damage must retain the knocked-down subject, adjacent block-source damage step and original team perspective.");
          for (const step of linked) linkedDamageActions.add(step.actionId);
          const expected = summarizeBlockConsequence(event,linked);
          require(blockAftermath.unscoredDamageRolls === expected.unscoredDamageRolls &&
            Object.keys(blockAftermath.diceByTeam).length === Object.keys(expected.diceByTeam).length &&
            Object.entries(expected.diceByTeam).every(([team,total])=>near(blockAftermath.diceByTeam[team] ?? NaN,total)),
            "Block subtotals reference the terminal pool and existing damage contributions once per team.");
        }
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
        if (block.reroll === "loner") {
          const expected = enumerateBlockPool(block.pool);
          require(block.distribution.every((p,i)=>near(p,expected.distribution[i]!)) && block.rankedSymbol === expected.favoredSymbol,
            "A conditional Loner pool must use the fair fresh block-dice distribution.");
          require(block.pool.sourceId === event.metadata.sourceId, "A conditional pool must refer to its own fresh source.");
          const gate = block.lonerGateSourceId ? sources.get(block.lonerGateSourceId) : undefined;
          const previous = block.previousPoolSourceId ? sources.get(block.previousPoolSourceId) : undefined;
          const prior = previous?.metadata.block;
          require(gate?.metadata.lonerGate?.passed === true && gate.playerId === block.attackerId && gate.teamId === event.teamId &&
            gate.metadata.targetId === block.defenderId && prior?.attackerId === block.attackerId && prior.defenderId === block.defenderId &&
            prior.pool.faces.length === block.pool.faces.length && prior.pool.attackerChooses === block.pool.attackerChooses &&
            block.pool.rolledIndexes.length === block.pool.faces.length && !block.proGateSourceId &&
            (previous?.metadata.sourceIndex ?? Infinity) < (gate.metadata.sourceIndex ?? -1) &&
            (gate.metadata.sourceIndex ?? Infinity) < (event.metadata.sourceIndex ?? -1),
            "A conditional Loner pool requires the passed gate, prior pool and newly rolled full pool in order.");
        } else require(!block.lonerGateSourceId, "Only a conditional Loner pool can claim a Loner gate.");
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
