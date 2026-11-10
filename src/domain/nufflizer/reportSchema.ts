import { z } from "zod";
import { VERDICT_SUMMARIES } from "./explainabilityCopy";
import { CONTEXT_MODEL_VERSION } from "./contextImpact";
import { DICE_MODEL_VERSION, LUCK_CATEGORY_WEIGHTS } from "./constants";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import { summarizeRollFamilies } from "./rollCoverage";

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
export const LuckEventMetadataSchema = z.strictObject({
  originalDice: z.unknown().optional(),
  rerollOriginalId: text.optional(),
  rerollQuestionId: text.optional(),
  rerollDecisionId: text.optional(),
  rerollResource: z.enum(["team", "skill"]).optional(),
  teamRerollsSpent: z.union([z.literal(0), z.literal(1)]).optional(),
  rerollSkill: z.enum(["Catch", "Dodge", "Sure Hands"]).optional(),
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
      checkpointReplayStep: z.number().int().positive().optional(),
      phaseCode: z.number().int().nonnegative().nullable(),
      period: z.enum(["first_half", "second_half", "extra_time"]).nullable(),
      activeTeamId: text.nullable(),
      teamTurn: z.number().int().positive().nullable(),
      turnsRemaining: count.nullable(),
      activationId: text.nullable(),
      actorCell: z
        .strictObject({
          x: z.number().int().min(0).max(25),
          y: z.number().int().min(0).max(14)
        })
        .nullable(),
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
        sourceId: text.optional()
      }),
      attackerId: text,
      defenderId: text,
      defenderTeamId: text,
      chooserTeamId: text,
      chooserGamerId: z.number().int().min(0).max(1).optional(),
      selectedFace: z.number().int().min(0).max(4),
      selectedOutcome: z.number().int().min(0).max(6),
      finalOutcome: z.number().int().min(0).max(6),
      finalSourceId: text.optional(),
      reroll: z.enum(["initial", "team", "brawler"]),
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
    schemaVersion: z.literal("2.0"),
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
      scoredByType: categoryCounts,
      excludedByType: categoryCounts,
      excludedByReason: z.record(text, count)
    }),
    weightTable: z.record(LuckEventTypeSchema, finite.min(0)),
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
    const families = summarizeRollFamilies(candidates);
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
      require(event.teamId === "unresolved" ||
        teamIds.has(
          event.teamId
        ), "Reported evidence must have a known or unresolved team.");
      const context = event.metadata.preRoll;
      if (context && event.metadata.sourceIndex !== undefined)
        require(context.checkpointAfter <
          event.metadata
            .sourceIndex, "Pre-roll evidence must precede its source.");
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
          (damage.regeneration ? "injury" : "armor_break") &&
          damage.subjectId === event.playerId &&
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
      }
      const apothecary = event.metadata.apothecary;
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
