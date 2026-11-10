import { z } from "zod";
import { VERDICT_SUMMARIES } from "./explainabilityCopy";
import { LUCK_CATEGORY_WEIGHTS } from "./constants";
import { REPLAY_LIMITS } from "@/domain/replay/limits";

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
  rerollQuestionId: text.optional(),
  rerollPolicy: text.optional(),
  sourceTag: text,
  sourceId: text.optional(),
  actionId: text.optional(),
  sequenceId: text.optional(),
  sourceIndex: count.optional(),
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
  eventCount: count
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
    modelVersion: z.literal("dice-only-4"),
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
