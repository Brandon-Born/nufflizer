import { VERDICT_SUMMARIES } from "./explainabilityCopy";
import { formatDiceContribution, scoredEvidenceForTeam } from "./presentation";
import { linkTeamRerolls } from "./rerolls";
import { numericCheckExclusion } from "./numericCheckContract";
import { labelForRollType } from "@/domain/replay/rollTypeContracts";
import { createHash } from "node:crypto";

import { LUCK_CATEGORY_WEIGHTS } from "@/domain/nufflizer/constants";
import { classifyRollContext } from "@/domain/nufflizer/classifyRollContext";
import {
  computeProbabilityForEvent,
  resolveActualSuccess
} from "@/domain/nufflizer/probability";
import type {
  LuckEvent,
  LuckEventType,
  LuckReport,
  LuckTeamAggregate
} from "@/domain/nufflizer/types";
import type {
  ReplayEvent,
  ReplayModel,
  ReplayTurn
} from "@/domain/replay/types";

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function percent(value: number): string {
  return `${(clamp01(value) * 100).toFixed(1)}%`;
}

function eventTypeLabel(type: LuckEventType): string {
  if (type === "armor_break") {
    return "Armor break";
  }

  if (type === "ball_handling") {
    return "Ball handling";
  }

  if (type === "argue_call") {
    return "Argue the call";
  }

  if (type === "movement_risk") {
    return "Movement risk";
  }

  return type[0].toUpperCase() + type.slice(1);
}

function extractDice(payload: RecordLike | undefined): {
  dice: number[];
  dieTypes: number[];
} {
  if (!payload) {
    return {
      dice: [],
      dieTypes: []
    };
  }

  const diceNodes = toArray(
    (payload.Dice as RecordLike | undefined)?.Die as
      RecordLike | RecordLike[] | undefined
  );
  const dice = diceNodes
    .map((die) => toNumber(die.Value))
    .filter((value): value is number => value !== undefined);
  const dieTypes = diceNodes.map((die) => toNumber(die.DieType) ?? -1);

  return { dice, dieTypes };
}

function extractModifiers(payload: RecordLike | undefined): {
  modifiers: number[];
  skillsUsed: number[];
} {
  if (!payload) {
    return { modifiers: [], skillsUsed: [] };
  }

  const modifierNodes = toArray(
    (payload.Modifiers as RecordLike | undefined)?.Modifier as
      RecordLike | RecordLike[] | undefined
  );
  const modifiers = modifierNodes
    .map((modifier) => toNumber(modifier.Value))
    .filter((value): value is number => value !== undefined);
  const skillsUsed = modifierNodes
    .map((modifier) => toNumber(modifier.Skill))
    .filter((value): value is number => value !== undefined && value >= 0);

  return {
    modifiers,
    skillsUsed: Array.from(new Set(skillsUsed))
  };
}

function resolveTeamId(
  turn: ReplayTurn,
  event: ReplayEvent
): string | undefined {
  void turn;
  return event.actorTeamSource === "turn_inferred"
    ? undefined
    : (event.actorTeamId ?? event.teamId);
}

function buildMomentLabel(
  type: LuckEventType,
  actualSuccess: boolean,
  probabilitySuccess?: number,
  difficulty?: number
): string {
  const action = eventTypeLabel(type);
  const targetPrefix = difficulty && difficulty > 0 ? `${difficulty}+ ` : "";

  if (probabilitySuccess === undefined) {
    return `${targetPrefix}${action} excluded from score`;
  }

  if (actualSuccess) {
    return `${targetPrefix}${action} succeeded (${percent(probabilitySuccess)})`;
  }

  return `${targetPrefix}${action} failed (${percent(probabilitySuccess)})`;
}

function targetLabel(requirement?: number, difficulty?: number): string {
  const target = difficulty ?? requirement;
  if (!target || target <= 0) {
    return "unspecified target";
  }

  return `${target}+ target`;
}

function buildFormulaSummary(
  actualSuccess: boolean,
  probabilitySuccess: number,
  weight: number,
  weightedDelta: number
): string {
  return `weighted delta = (${actualSuccess ? 1 : 0} - ${probabilitySuccess.toFixed(3)}) x ${weight.toFixed(2)} = ${weightedDelta.toFixed(3)}`;
}

function buildInputsSummary(
  type: LuckEventType,
  target: string,
  dice: number[],
  rerollAvailable: boolean,
  scoringStatus: LuckEvent["scoringStatus"]
): string {
  const diceText = dice.length > 0 ? `[${dice.join(", ")}]` : "none";
  return `${eventTypeLabel(type)} | target ${target} | dice ${diceText} | reroll available ${rerollAvailable ? "yes" : "no"} | status ${scoringStatus}`;
}

function isPlayableTeamName(name: string): boolean {
  return !/^Team \d+$/i.test(name.trim());
}

function selectMatchTeams(
  replay: ReplayModel
): [ReplayModel["teams"][number], ReplayModel["teams"][number]] {
  const usage = new Map<string, number>();
  for (const turn of replay.turns) {
    const teamId = turn.teamId ?? turn.inferredTeamId;
    if (!teamId) {
      continue;
    }

    usage.set(teamId, (usage.get(teamId) ?? 0) + 1);
  }

  const usageRanked = replay.teams
    .map((team) => ({ team, usage: usage.get(team.id) ?? 0 }))
    .sort((a, b) => b.usage - a.usage)
    .map((entry) => entry.team);

  const named = usageRanked.filter((team) => isPlayableTeamName(team.name));
  if (named.length >= 2) {
    return [named[0]!, named[1]!];
  }

  if (usageRanked.length >= 2) {
    return [usageRanked[0]!, usageRanked[1]!];
  }

  if (replay.teams.length >= 2) {
    return [replay.teams[0]!, replay.teams[1]!];
  }

  const placeholder = replay.teams[0] ?? { id: "away", name: "Away Team" };
  const home = replay.teams[0] ?? { id: "home", name: "Home Team" };
  return [
    home,
    placeholder.id === home.id ? { id: "away", name: "Away Team" } : placeholder
  ];
}

function hashId(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function isRollCandidateEvent(event: ReplayEvent): boolean {
  return (
    event.sourceTag === "ResultRoll" ||
    event.sourceTag === "ResultBlockRoll" ||
    event.sourceTag === "ResultInjuryRoll" ||
    event.sourceTag === "ResultCasualtyRoll" ||
    Boolean(isRecord(event.payload) && isRecord(event.payload.Dice)) ||
    (/Roll/.test(event.sourceTag) && !/RerollUsage/.test(event.sourceTag))
  );
}
function normalizeExcludedReason(reason: string): string {
  return reason;
}

function defaultCategory(type: LuckEventType | null): LuckEventType {
  return type ?? "unknown";
}

function buildNormalizedEvent(
  replayVersion: string | undefined,
  replayTurn: ReplayTurn,
  turnEvents: ReplayEvent[],
  event: ReplayEvent,
  eventIndex: number,
  teamNameById: Map<string, string>,
  rerollLink?: ReturnType<typeof linkTeamRerolls> extends Map<number, infer T>
    ? T
    : never
): LuckEvent | null {
  const payload = isRecord(event.payload) ? event.payload : undefined;
  const rollType = event.rollType ?? toNumber(payload?.RollType);
  const rollLabel = labelForRollType(
    event.sourceTag,
    rollType,
    event.rollLabel ?? "unknown"
  );
  const { dice, dieTypes } = extractDice(payload);
  const { modifiers, skillsUsed } = extractModifiers(payload);
  const requirement = toNumber(payload?.Requirement);
  const difficulty = toNumber(payload?.Difficulty);
  const outcomeCode = toNumber(payload?.Outcome);
  const { rerollAvailable, rerollUsed } = rerollLink ?? {
    rerollAvailable: false,
    rerollUsed: false
  };
  void turnEvents;
  const normalizationFlags: string[] = [];
  const normalizationNotes: string[] = [];

  if (event.actorTeamId && event.teamId && event.actorTeamId !== event.teamId) {
    normalizationFlags.push("ambiguous_team_attribution");
    normalizationNotes.push(
      `actorTeamId ${event.actorTeamId} differs from teamId ${event.teamId}`
    );
  }

  if (difficulty === undefined && requirement === undefined) {
    normalizationFlags.push("missing_target_threshold");
    normalizationNotes.push("difficulty and requirement were both missing");
  }

  if (dice.length > 0 && dieTypes.some((dieType) => dieType === -1)) {
    normalizationFlags.push("insufficient_dice_metadata");
    normalizationNotes.push(
      "one or more dice were missing die type; probability will not be inferred"
    );
  }

  if (!rerollAvailable && skillsUsed.length > 0) {
    normalizationFlags.push("skill_modifier_present_without_explicit_reroll");
    normalizationNotes.push(
      "skill modifiers observed without explicit team reroll question"
    );
  }

  const classification = classifyRollContext({
    sourceTag: event.sourceTag,
    stepType: event.stepType,
    rollType,
    requirement,
    difficulty,
    diceCount: dice.length
  });
  const isRollCandidate = isRollCandidateEvent(event);

  const resolvedTeamId = resolveTeamId(replayTurn, event);
  const teamId =
    resolvedTeamId && teamNameById.has(resolvedTeamId)
      ? resolvedTeamId
      : "unresolved";

  const eventType = defaultCategory(classification.eventType);
  const target = targetLabel(requirement, difficulty);
  const contractExclusion =
    rerollLink?.exclusionReason ??
    numericCheckExclusion(
      replayVersion,
      { ...event, rollType },
      rerollAvailable,
      rerollLink?.retainedOriginal
    );
  const resolvedActual = resolveActualSuccess(
    outcomeCode,
    dice,
    difficulty ?? requirement,
    eventType
  );

  // Disputed category/beneficiary mappings cannot contribute favorable luck.
  const semanticsUnverified =
    classification.scored &&
    ["block", "armor_break", "injury", "argue_call"].includes(eventType);
  const attributionUnresolved =
    !teamNameById.has(teamId) ||
    event.attributionConflict === true ||
    normalizationFlags.includes("ambiguous_team_attribution");
  if (
    contractExclusion ||
    !classification.scored ||
    !resolvedActual.deterministic ||
    semanticsUnverified ||
    attributionUnresolved
  ) {
    const exclusionReason = attributionUnresolved
      ? "excluded: unresolved or conflicting team attribution"
      : contractExclusion
        ? `excluded: ${contractExclusion}`
        : semanticsUnverified
          ? "excluded: category or damage-beneficiary semantics awaiting independent evidence (NUF-009/013)"
          : !classification.scored
            ? classification.reason
            : `excluded: ${resolvedActual.reason}`;
    return {
      id: `${replayTurn.turnNumber}-${eventIndex}-${event.sourceTag}`,
      turn: replayTurn.turnNumber,
      teamId,
      teamName: teamNameById.get(teamId) ?? teamId,
      playerId: event.playerId,
      type: eventType,
      probabilitySuccess: null,
      actualSuccess:
        !contractExclusion && resolvedActual.deterministic
          ? resolvedActual.actualSuccess
          : null,
      delta: 0,
      weightedDelta: 0,
      label: buildMomentLabel(
        eventType,
        resolvedActual.actualSuccess,
        undefined,
        difficulty ?? requirement
      ),
      tags: [],
      scoringStatus: "excluded",
      statusReason: exclusionReason,
      explainability: {
        target,
        weight: LUCK_CATEGORY_WEIGHTS[eventType],
        inputsSummary: buildInputsSummary(
          eventType,
          target,
          dice,
          rerollAvailable,
          "excluded"
        )
      },
      metadata: {
        sourceTag: event.sourceTag,
        sourceId: event.id,
        actionId: event.actionId,
        sequenceId: event.sequenceId,
        sourceIndex: event.sourceIndex,
        isRollCandidate,
        targetId: event.targetId,
        rollType,
        rollLabel,
        stepType: event.stepType,
        stepLabel: event.stepLabel,
        actionCode: event.actionCode,
        actionLabel: event.actionLabel,
        outcomeCode,
        requirement,
        difficulty,
        dice,
        dieTypes,
        modifiers,
        modifiersSum: modifiers.reduce((sum, value) => sum + value, 0),
        rerollAvailable,
        rerollUsed,
        originalDice: rerollLink?.originalDice,
        rerollQuestionId: rerollLink?.questionId,
        rerollPolicy: rerollLink?.policy,
        skillsUsed,
        normalizationFlags,
        normalizationNotes
      }
    };
  }

  let probability;
  try {
    probability = computeProbabilityForEvent({
      eventType,
      rollType,
      requirement,
      difficulty,
      dice,
      dieTypes,
      rerollAvailable
    });
  } catch (error) {
    return {
      id:
        event.id ?? `${replayTurn.turnNumber}-${eventIndex}-${event.sourceTag}`,
      turn: replayTurn.turnNumber,
      teamId,
      teamName: teamNameById.get(teamId) ?? teamId,
      playerId: event.playerId,
      type: eventType,
      probabilitySuccess: null,
      actualSuccess: null,
      delta: 0,
      weightedDelta: 0,
      label: "Unsupported dice contract",
      tags: [],
      scoringStatus: "excluded",
      statusReason: `excluded: ${error instanceof Error ? error.message : "invalid dice contract"}`,
      explainability: {
        target,
        weight: 0,
        inputsSummary:
          "Dice metadata is incomplete or invalid; no odds inferred."
      },
      metadata: {
        sourceTag: event.sourceTag,
        sourceId: event.id,
        sourceIndex: event.sourceIndex,
        isRollCandidate,
        rollType,
        dice,
        dieTypes,
        normalizationFlags
      }
    };
  }
  const probabilitySuccess = probability.probabilitySuccess;
  const actualSuccess = resolvedActual.actualSuccess;
  const delta = (actualSuccess ? 1 : 0) - probabilitySuccess;
  const weight = LUCK_CATEGORY_WEIGHTS[eventType];
  const weightedDelta = delta * weight;

  const tags: LuckEvent["tags"] = [];
  if (actualSuccess && probabilitySuccess <= 0.3) {
    tags.push("blessed");
  }
  if (!actualSuccess && probabilitySuccess >= 0.7) {
    tags.push("shaftaroonie");
  }

  return {
    id: `${replayTurn.turnNumber}-${eventIndex}-${event.sourceTag}`,
    turn: replayTurn.turnNumber,
    teamId,
    teamName: teamNameById.get(teamId) ?? teamId,
    playerId: event.playerId,
    type: eventType,
    probabilitySuccess: clamp01(probabilitySuccess),
    actualSuccess,
    delta,
    weightedDelta,
    label: buildMomentLabel(
      eventType,
      actualSuccess,
      probabilitySuccess,
      difficulty ?? requirement
    ),
    tags,
    scoringStatus: "scored",
    statusReason: `${classification.reason}; ${probability.reason}; ${resolvedActual.reason}`,
    explainability: {
      target,
      baseOdds: probability.baseOdds,
      rerollAdjustedOdds: probability.rerollAdjustedOdds,
      weight,
      formulaSummary: buildFormulaSummary(
        actualSuccess,
        probabilitySuccess,
        weight,
        weightedDelta
      ),
      inputsSummary: buildInputsSummary(
        eventType,
        target,
        dice,
        rerollAvailable,
        "scored"
      )
    },
    metadata: {
      sourceTag: event.sourceTag,
      sourceId: event.id,
      actionId: event.actionId,
      sequenceId: event.sequenceId,
      sourceIndex: event.sourceIndex,
      isRollCandidate,
      targetId: event.targetId,
      rollType,
      rollLabel,
      stepType: event.stepType,
      stepLabel: event.stepLabel,
      actionCode: event.actionCode,
      actionLabel: event.actionLabel,
      outcomeCode,
      requirement,
      difficulty,
      dice,
      dieTypes,
      modifiers,
      modifiersSum: modifiers.reduce((sum, value) => sum + value, 0),
      rerollAvailable,
      rerollUsed,
      originalDice: rerollLink?.originalDice,
      rerollQuestionId: rerollLink?.questionId,
      rerollPolicy: rerollLink?.policy,
      skillsUsed,
      normalizationFlags,
      normalizationNotes
    }
  };
}

function initialAggregate(teamId: string, teamName: string): LuckTeamAggregate {
  return {
    teamId,
    teamName,
    luckScore: 0,
    categoryScores: {
      block: 0,
      armorBreak: 0,
      injury: 0,
      dodge: 0,
      ballHandling: 0,
      argueCall: 0,
      movementRisk: 0
    },
    eventCount: 0
  };
}

function initialCoverageByType(): Record<LuckEventType, number> {
  return {
    unknown: 0,
    block: 0,
    armor_break: 0,
    injury: 0,
    dodge: 0,
    ball_handling: 0,
    argue_call: 0,
    movement_risk: 0
  };
}

function buildHowScoredSummary(
  verdictSummary: string,
  coverage: LuckReport["coverage"],
  home: LuckTeamAggregate,
  away: LuckTeamAggregate,
  events: LuckEvent[]
): string[] {
  const excludedTopReasons = Object.entries(coverage.excludedByReason)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${count} ${reason}`);

  return [
    "This is partial dice-only analysis with provisional category weights; it is not contextual impact or calibrated win probability.",
    `Roll-candidate coverage: ${coverage.rollCandidates.scoredCount} scored and ${coverage.rollCandidates.excludedCount} excluded (${(
      coverage.rollCandidates.scoredRate * 100
    ).toFixed(1)}% scored).`,
    `All-event visibility: ${coverage.allEvents.scoredCount} scored and ${coverage.allEvents.excludedCount} excluded (${(
      coverage.allEvents.scoredRate * 100
    ).toFixed(1)}% scored).`,
    excludedTopReasons.length > 0
      ? `Top exclusions: ${excludedTopReasons.join("; ")}.`
      : "Top exclusions: none.",
    `${home.teamName} supported dice contribution: ${formatDiceContribution(home.luckScore, scoredEvidenceForTeam({ events }, home.teamId).total, 1)}; ${away.teamName}: ${formatDiceContribution(away.luckScore, scoredEvidenceForTeam({ events }, away.teamId).total, 1)}. ${verdictSummary}`
  ];
}

export function analyzeReplayLuck(replay: ReplayModel): LuckReport {
  const [homeTeam, awayTeam] = selectMatchTeams(replay);
  const teamNameById = new Map<string, string>(
    replay.teams.map((team) => [team.id, team.name] satisfies [string, string])
  );

  const events: LuckEvent[] = [];

  for (const replayTurn of replay.turns) {
    const rerollLinks = linkTeamRerolls(replayTurn.events);
    for (const [eventIndex, event] of replayTurn.events.entries()) {
      if (
        !isRollCandidateEvent(event) &&
        ![
          "ResultBlockOutcome",
          "ResultPushBack",
          "ResultPlayerRemoval"
        ].includes(event.sourceTag)
      )
        continue;

      const normalized = buildNormalizedEvent(
        replay.replayVersion,
        replayTurn,
        replayTurn.events,
        event,
        eventIndex,
        teamNameById,
        rerollLinks.get(eventIndex)
      );
      if (!normalized) {
        continue;
      }

      events.push(normalized);
    }
  }

  const homeAggregate = initialAggregate(homeTeam.id, homeTeam.name);
  const awayAggregate = initialAggregate(awayTeam.id, awayTeam.name);
  const aggregateById = new Map<string, LuckTeamAggregate>([
    [homeAggregate.teamId, homeAggregate],
    [awayAggregate.teamId, awayAggregate]
  ]);
  const weightedTotals = new Map<string, number>([
    [homeAggregate.teamId, 0],
    [awayAggregate.teamId, 0]
  ]);
  let allScoredCount = 0;
  let allExcludedCount = 0;
  let rollCandidateScoredCount = 0;
  let rollCandidateExcludedCount = 0;
  const scoredByType = initialCoverageByType();
  const excludedByType = initialCoverageByType();
  const excludedByReason = new Map<string, number>();

  for (const event of events) {
    const aggregate = aggregateById.get(event.teamId);
    if (aggregate) aggregate.eventCount += 1;
    if (event.scoringStatus === "excluded") {
      allExcludedCount += 1;
      if (event.metadata.isRollCandidate) {
        rollCandidateExcludedCount += 1;
      }
      excludedByType[event.type] += 1;
      const reasonKey = normalizeExcludedReason(event.statusReason);
      excludedByReason.set(
        reasonKey,
        (excludedByReason.get(reasonKey) ?? 0) + 1
      );
      continue;
    }

    if (!aggregate) continue;
    allScoredCount += 1;
    if (event.metadata.isRollCandidate) {
      rollCandidateScoredCount += 1;
    }
    scoredByType[event.type] += 1;

    if (event.type === "block") {
      aggregate.categoryScores.block += event.weightedDelta;
    } else if (event.type === "armor_break") {
      aggregate.categoryScores.armorBreak += event.weightedDelta;
    } else if (event.type === "injury") {
      aggregate.categoryScores.injury += event.weightedDelta;
    } else if (event.type === "dodge") {
      aggregate.categoryScores.dodge += event.weightedDelta;
    } else if (event.type === "ball_handling") {
      aggregate.categoryScores.ballHandling += event.weightedDelta;
    } else if (event.type === "argue_call") {
      aggregate.categoryScores.argueCall += event.weightedDelta;
    } else if (event.type === "movement_risk") {
      aggregate.categoryScores.movementRisk += event.weightedDelta;
    }

    weightedTotals.set(
      event.teamId,
      (weightedTotals.get(event.teamId) ?? 0) + event.weightedDelta
    );
  }

  for (const teamAggregate of [homeAggregate, awayAggregate]) {
    const totalWeightedDelta = weightedTotals.get(teamAggregate.teamId) ?? 0;
    teamAggregate.luckScore = totalWeightedDelta;
  }

  const keyMoments = events
    .filter((event) => event.scoringStatus === "scored")
    .sort((a, b) => Math.abs(b.weightedDelta) - Math.abs(a.weightedDelta));

  const verdict: LuckReport["verdict"] = {
    luckierTeam: "unknown",
    status: allScoredCount === 0 ? "insufficient_evidence" : "partial_analysis",
    scoreGap: Math.abs(homeAggregate.luckScore - awayAggregate.luckScore),
    summary:
      VERDICT_SUMMARIES[
        allScoredCount === 0 ? "insufficient_evidence" : "partial_analysis"
      ]
  };
  const allEventsTotalCount = allScoredCount + allExcludedCount;
  const rollCandidateTotalCount =
    rollCandidateScoredCount + rollCandidateExcludedCount;
  const coverage = {
    sourceRecordCount: replay.turns.reduce(
      (count, turn) => count + turn.events.length,
      0
    ),
    denominatorDescription:
      "Roll candidates include every reported random outcome, including unknown families and randomizers; allEvents additionally includes retained block/damage summaries. Neither percentage measures state reconstruction or whole-match confidence.",
    allEvents: {
      scoredCount: allScoredCount,
      excludedCount: allExcludedCount,
      scoredRate:
        allEventsTotalCount > 0 ? allScoredCount / allEventsTotalCount : 0
    },
    rollCandidates: {
      scoredCount: rollCandidateScoredCount,
      excludedCount: rollCandidateExcludedCount,
      scoredRate:
        rollCandidateTotalCount > 0
          ? rollCandidateScoredCount / rollCandidateTotalCount
          : 0
    },
    scoredByType,
    excludedByType,
    excludedByReason: Object.fromEntries(
      Array.from(excludedByReason.entries()).sort((a, b) => b[1] - a[1])
    )
  } satisfies LuckReport["coverage"];
  const idSeed = `${replay.matchId}:${JSON.stringify(events)}`;

  return {
    schemaVersion: "2.0",
    modelVersion: "dice-only-4",
    limitations: [
      "Category mappings remain provisional pending NUF-009 independent game evidence.",
      "Block and damage outcomes are retained but excluded pending verified semantics and beneficiary attribution.",
      "Board-state reconstruction, contextual impact and calibration are not yet supported."
    ],
    id: hashId(idSeed),
    generatedAt: new Date().toISOString(),
    match: {
      id: replay.matchId,
      homeTeam: homeAggregate.teamName,
      awayTeam: awayAggregate.teamName
    },
    verdict,
    coverage,
    weightTable: { ...LUCK_CATEGORY_WEIGHTS },
    howScoredSummary: buildHowScoredSummary(
      verdict.summary,
      coverage,
      homeAggregate,
      awayAggregate,
      events
    ),
    teams: [homeAggregate, awayAggregate],
    keyMoments,
    events
  };
}
