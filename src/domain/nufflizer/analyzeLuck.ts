import { createHash } from "node:crypto";

import { LUCK_CATEGORY_WEIGHTS } from "@/domain/nufflizer/constants";
import { classifyRollContext } from "@/domain/nufflizer/classifyRollContext";
import { computeProbabilityForEvent, resolveActualSuccess } from "@/domain/nufflizer/probability";
import type { LuckEvent, LuckEventType, LuckReport, LuckTeamAggregate } from "@/domain/nufflizer/types";
import type { ReplayEvent, ReplayModel, ReplayTurn } from "@/domain/replay/types";

type RecordLike = Record<string, unknown>;
const BLOCK_CHAIN_SOURCE_TAGS = new Set(["ResultBlockRoll", "ResultBlockOutcome", "ResultPushBack"]);

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

function roundTo(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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

  return type[0].toUpperCase() + type.slice(1);
}

function extractDice(payload: RecordLike | undefined): { dice: number[]; dieTypes: number[] } {
  if (!payload) {
    return {
      dice: [],
      dieTypes: []
    };
  }

  const diceNodes = toArray((payload.Dice as RecordLike | undefined)?.Die as RecordLike | RecordLike[] | undefined);
  const dice = diceNodes
    .map((die) => toNumber(die.Value))
    .filter((value): value is number => value !== undefined);
  const dieTypes = diceNodes.map((die) => toNumber(die.DieType) ?? 0);

  return { dice, dieTypes };
}

function extractModifiers(payload: RecordLike | undefined): { modifiers: number[]; skillsUsed: number[] } {
  if (!payload) {
    return { modifiers: [], skillsUsed: [] };
  }

  const modifierNodes = toArray((payload.Modifiers as RecordLike | undefined)?.Modifier as RecordLike | RecordLike[] | undefined);
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

function extractRerollFlags(turnEvents: ReplayEvent[], eventIndex: number): { rerollAvailable: boolean; rerollUsed: boolean } {
  let rerollAvailable = false;
  let rerollUsed = false;
  const lookahead = turnEvents.slice(eventIndex + 1, eventIndex + 5);

  for (const nextEvent of lookahead) {
    if (nextEvent.sourceTag === "QuestionTeamRerollUsage") {
      const payload = isRecord(nextEvent.payload) ? nextEvent.payload : undefined;
      const canUseTeamReroll = toNumber(payload?.CanUseTeamReroll) ?? 0;
      const canUseProReroll = toNumber(payload?.CanUseProReroll) ?? 0;
      rerollAvailable = rerollAvailable || canUseTeamReroll > 0 || canUseProReroll > 0;
    }

    if (nextEvent.sourceTag === "ResultTeamRerollUsage") {
      const payload = isRecord(nextEvent.payload) ? nextEvent.payload : undefined;
      const used = toNumber(payload?.Used) ?? 0;
      if (used > 0) {
        rerollAvailable = true;
        rerollUsed = true;
      }
    }
  }

  return {
    rerollAvailable,
    rerollUsed
  };
}

function resolveTeamId(turn: ReplayTurn, event: ReplayEvent): string | undefined {
  return event.actorTeamId ?? event.teamId ?? turn.teamId ?? turn.inferredTeamId;
}

function buildMomentLabel(type: LuckEventType, actualSuccess: boolean, probabilitySuccess?: number, difficulty?: number): string {
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

function buildFormulaSummary(actualSuccess: boolean, probabilitySuccess: number, weight: number, weightedDelta: number): string {
  return `weighted delta = (${actualSuccess ? 1 : 0} - ${probabilitySuccess.toFixed(3)}) x ${weight.toFixed(2)} = ${weightedDelta.toFixed(3)}`;
}

function buildInputsSummary(type: LuckEventType, target: string, dice: number[], rerollAvailable: boolean, scoringStatus: LuckEvent["scoringStatus"]): string {
  const diceText = dice.length > 0 ? `[${dice.join(", ")}]` : "none";
  return `${eventTypeLabel(type)} | target ${target} | dice ${diceText} | reroll available ${rerollAvailable ? "yes" : "no"} | status ${scoringStatus}`;
}

function isPlayableTeamName(name: string): boolean {
  return !/^Team \d+$/i.test(name.trim());
}

function selectMatchTeams(replay: ReplayModel): [ReplayModel["teams"][number], ReplayModel["teams"][number]] {
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
  return [home, placeholder.id === home.id ? { id: "away", name: "Away Team" } : placeholder];
}

function hashId(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function eventIndexFromId(eventId: string): number | null {
  const tokens = eventId.split("-");
  if (tokens.length < 3) {
    return null;
  }

  const index = Number(tokens[1]);
  return Number.isFinite(index) ? index : null;
}

function isRollCandidateEvent(event: ReplayEvent, dice: number[], classification: ReturnType<typeof classifyRollContext>): boolean {
  if (event.sourceTag !== "ResultRoll" || dice.length === 0) {
    return false;
  }

  return classification.scored || classification.reason.startsWith("excluded:");
}

function normalizeExcludedReason(reason: string): string {
  if (reason.startsWith("excluded: merged into block anchor ")) {
    return "excluded: merged into block anchor";
  }

  return reason;
}

function mergeBlockChainContext(events: LuckEvent[]): void {
  const blockAnchors = events.filter(
    (event) =>
      event.scoringStatus === "scored" &&
      event.type === "block" &&
      event.metadata.sourceTag === "ResultRoll" &&
      event.metadata.rollType === 2
  );

  for (const event of events) {
    if (!BLOCK_CHAIN_SOURCE_TAGS.has(event.metadata.sourceTag)) {
      continue;
    }

    const memberEventIndex = eventIndexFromId(event.id);
    if (memberEventIndex === null) {
      continue;
    }

    const candidateAnchors = blockAnchors
      .map((anchor) => {
        const anchorIndex = eventIndexFromId(anchor.id);
        if (anchor.turn !== event.turn || anchorIndex === null) {
          return null;
        }

        const distance = Math.abs(anchorIndex - memberEventIndex);
        if (distance > 6) {
          return null;
        }

        const teamMatch = anchor.teamId === event.teamId;
        const playerMatch = event.playerId ? anchor.playerId === event.playerId : false;
        const targetMatch = event.metadata.targetId ? anchor.metadata.targetId === event.metadata.targetId : false;

        return {
          anchor,
          anchorIndex,
          distance,
          teamMatch,
          playerMatch,
          targetMatch
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

    if (candidateAnchors.length === 0) {
      continue;
    }

    candidateAnchors.sort((left, right) => {
      if (left.teamMatch !== right.teamMatch) {
        return left.teamMatch ? -1 : 1;
      }

      const leftMatchScore = Number(left.playerMatch) + Number(left.targetMatch);
      const rightMatchScore = Number(right.playerMatch) + Number(right.targetMatch);
      if (leftMatchScore !== rightMatchScore) {
        return rightMatchScore - leftMatchScore;
      }

      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }

      return left.anchorIndex - right.anchorIndex;
    });

    const bestAnchor = candidateAnchors[0]!.anchor;
    event.scoringStatus = "excluded";
    event.statusReason = `excluded: merged into block anchor ${bestAnchor.id}`;
    event.metadata.mergedBlockAnchorId = bestAnchor.id;
  }
}

function defaultCategory(type: LuckEventType | null): LuckEventType {
  return type ?? "block";
}

function buildNormalizedEvent(
  replayTurn: ReplayTurn,
  turnEvents: ReplayEvent[],
  event: ReplayEvent,
  eventIndex: number,
  teamNameById: Map<string, string>
): LuckEvent | null {
  const payload = isRecord(event.payload) ? event.payload : undefined;
  const rollType = event.rollType ?? toNumber(payload?.RollType);
  const { dice, dieTypes } = extractDice(payload);
  const { modifiers, skillsUsed } = extractModifiers(payload);
  const requirement = toNumber(payload?.Requirement);
  const difficulty = toNumber(payload?.Difficulty);
  const outcomeCode = toNumber(payload?.Outcome);
  const { rerollAvailable, rerollUsed } = extractRerollFlags(turnEvents, eventIndex);
  const normalizationFlags: string[] = [];
  const normalizationNotes: string[] = [];

  if (event.actorTeamId && event.teamId && event.actorTeamId !== event.teamId) {
    normalizationFlags.push("ambiguous_team_attribution");
    normalizationNotes.push(`actorTeamId ${event.actorTeamId} differs from teamId ${event.teamId}`);
  }

  if (difficulty === undefined && requirement === undefined) {
    normalizationFlags.push("missing_target_threshold");
    normalizationNotes.push("difficulty and requirement were both missing");
  }

  if (dice.length > 0 && dieTypes.some((dieType) => dieType === 0)) {
    normalizationFlags.push("insufficient_dice_metadata");
    normalizationNotes.push("one or more dice were missing die type; default die sides were inferred");
  }

  if (!rerollAvailable && skillsUsed.length > 0) {
    normalizationFlags.push("skill_modifier_present_without_explicit_reroll");
    normalizationNotes.push("skill modifiers observed without explicit team reroll question");
  }

  const classification = classifyRollContext({
    sourceTag: event.sourceTag,
    stepType: event.stepType,
    rollType,
    requirement,
    difficulty,
    diceCount: dice.length
  });
  const isRollCandidate = isRollCandidateEvent(event, dice, classification);

  const teamId = resolveTeamId(replayTurn, event);
  if (!teamId) {
    return null;
  }

  const eventType = defaultCategory(classification.eventType);
  const target = targetLabel(requirement, difficulty);
  const resolvedActual = resolveActualSuccess(outcomeCode, dice, difficulty ?? requirement);

  if (!classification.scored || !resolvedActual.deterministic) {
    const exclusionReason = !classification.scored ? classification.reason : `excluded: ${resolvedActual.reason}`;
    return {
      id: `${replayTurn.turnNumber}-${eventIndex}-${event.sourceTag}`,
      turn: replayTurn.turnNumber,
      teamId,
      teamName: teamNameById.get(teamId) ?? teamId,
      playerId: event.playerId,
      type: eventType,
      probabilitySuccess: 0,
      actualSuccess: resolvedActual.actualSuccess,
      delta: 0,
      weightedDelta: 0,
      label: buildMomentLabel(eventType, resolvedActual.actualSuccess, undefined, difficulty ?? requirement),
      tags: [],
      scoringStatus: "excluded",
      statusReason: exclusionReason,
      explainability: {
        target,
        weight: LUCK_CATEGORY_WEIGHTS[eventType],
        inputsSummary: buildInputsSummary(eventType, target, dice, rerollAvailable, "excluded")
      },
      metadata: {
        sourceTag: event.sourceTag,
        isRollCandidate,
        targetId: event.targetId,
        rollType,
        rollLabel: event.rollLabel,
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
        skillsUsed,
        normalizationFlags,
        normalizationNotes
      }
    };
  }

  const probability = computeProbabilityForEvent({
    eventType,
    rollType,
    requirement,
    difficulty,
    dice,
    dieTypes,
    rerollAvailable
  });
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
    label: buildMomentLabel(eventType, actualSuccess, probabilitySuccess, difficulty ?? requirement),
    tags,
    scoringStatus: "scored",
    statusReason: `${classification.reason}; ${probability.reason}; ${resolvedActual.reason}`,
    explainability: {
      target,
      baseOdds: probability.baseOdds,
      rerollAdjustedOdds: probability.rerollAdjustedOdds,
      weight,
      formulaSummary: buildFormulaSummary(actualSuccess, probabilitySuccess, weight, weightedDelta),
      inputsSummary: buildInputsSummary(eventType, target, dice, rerollAvailable, "scored")
    },
    metadata: {
        sourceTag: event.sourceTag,
        isRollCandidate,
        targetId: event.targetId,
        rollType,
      rollLabel: event.rollLabel,
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
      argueCall: 0
    },
    eventCount: 0
  };
}

function initialCoverageByType(): Record<LuckEventType, number> {
  return {
    block: 0,
    armor_break: 0,
    injury: 0,
    dodge: 0,
    ball_handling: 0,
    argue_call: 0
  };
}

function summarizeVerdict(
  home: LuckTeamAggregate,
  away: LuckTeamAggregate
): {
  verdict: LuckReport["verdict"];
  scoreGap: number;
} {
  const homeRounded = roundTo(home.luckScore, 1);
  const awayRounded = roundTo(away.luckScore, 1);
  const scoreGap = roundTo(Math.abs(homeRounded - awayRounded), 1);

  if (homeRounded === awayRounded) {
    return {
      scoreGap,
      verdict: {
        luckierTeam: "even",
        scoreGap,
        summary: "Nuffle called this one even."
      }
    };
  }

  const luckier = homeRounded > awayRounded ? home : away;
  const strength = scoreGap >= 15 ? "decisively" : scoreGap >= 8 ? "clearly" : "slightly";

  return {
    scoreGap,
    verdict: {
      luckierTeam: luckier.teamId === home.teamId ? "home" : "away",
      scoreGap,
      summary: `${luckier.teamName} was ${strength} blessed by nuffle.`
    }
  };
}

function buildHowScoredSummary(verdictSummary: string, coverage: LuckReport["coverage"], home: LuckTeamAggregate, away: LuckTeamAggregate): string[] {
  const excludedTopReasons = Object.entries(coverage.excludedByReason)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${count} ${reason}`);

  return [
    "Nufflizier scores only deterministic roll contexts with stable thresholds and outcomes.",
    `Roll-candidate coverage: ${coverage.rollCandidates.scoredCount} scored and ${coverage.rollCandidates.excludedCount} excluded (${(
      coverage.rollCandidates.scoredRate * 100
    ).toFixed(1)}% scored).`,
    `All-event visibility: ${coverage.allEvents.scoredCount} scored and ${coverage.allEvents.excludedCount} excluded (${(
      coverage.allEvents.scoredRate * 100
    ).toFixed(1)}% scored).`,
    excludedTopReasons.length > 0 ? `Top exclusions: ${excludedTopReasons.join("; ")}.` : "Top exclusions: none.",
    `${home.teamName} finished at ${home.luckScore.toFixed(1)} versus ${away.teamName} at ${away.luckScore.toFixed(
      1
    )}, so verdict is: ${verdictSummary}`
  ];
}

export function analyzeReplayLuck(replay: ReplayModel): LuckReport {
  const [homeTeam, awayTeam] = selectMatchTeams(replay);
  const trackedTeamIds = new Set<string>([homeTeam.id, awayTeam.id]);
  const teamNameById = new Map<string, string>(replay.teams.map((team) => [team.id, team.name] satisfies [string, string]));

  const events: LuckEvent[] = [];

  for (const replayTurn of replay.turns) {
    for (const [eventIndex, event] of replayTurn.events.entries()) {
      const teamId = resolveTeamId(replayTurn, event);
      if (!teamId || !trackedTeamIds.has(teamId)) {
        continue;
      }

      const normalized = buildNormalizedEvent(replayTurn, replayTurn.events, event, eventIndex, teamNameById);
      if (!normalized) {
        continue;
      }

      events.push(normalized);
    }
  }

  mergeBlockChainContext(events);

  const homeAggregate = initialAggregate(homeTeam.id, homeTeam.name);
  const awayAggregate = initialAggregate(awayTeam.id, awayTeam.name);
  const aggregateById = new Map<string, LuckTeamAggregate>([
    [homeAggregate.teamId, homeAggregate],
    [awayAggregate.teamId, awayAggregate]
  ]);
  const weightSums = new Map<string, number>([
    [homeAggregate.teamId, 0],
    [awayAggregate.teamId, 0]
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
    if (!aggregate) {
      continue;
    }

    aggregate.eventCount += 1;
    if (event.scoringStatus === "excluded") {
      allExcludedCount += 1;
      if (event.metadata.isRollCandidate) {
        rollCandidateExcludedCount += 1;
      }
      excludedByType[event.type] += 1;
      const reasonKey = normalizeExcludedReason(event.statusReason);
      excludedByReason.set(reasonKey, (excludedByReason.get(reasonKey) ?? 0) + 1);
      continue;
    }

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
    }

    const categoryWeight = LUCK_CATEGORY_WEIGHTS[event.type];
    weightSums.set(event.teamId, (weightSums.get(event.teamId) ?? 0) + categoryWeight);
    weightedTotals.set(event.teamId, (weightedTotals.get(event.teamId) ?? 0) + event.weightedDelta);
  }

  for (const teamAggregate of [homeAggregate, awayAggregate]) {
    const totalWeight = weightSums.get(teamAggregate.teamId) ?? 0;
    const totalWeightedDelta = weightedTotals.get(teamAggregate.teamId) ?? 0;
    teamAggregate.luckScore = totalWeight > 0 ? roundTo((100 * totalWeightedDelta) / totalWeight, 1) : 0;
    teamAggregate.categoryScores = {
      block: roundTo(teamAggregate.categoryScores.block, 3),
      armorBreak: roundTo(teamAggregate.categoryScores.armorBreak, 3),
      injury: roundTo(teamAggregate.categoryScores.injury, 3),
      dodge: roundTo(teamAggregate.categoryScores.dodge, 3),
      ballHandling: roundTo(teamAggregate.categoryScores.ballHandling, 3),
      argueCall: roundTo(teamAggregate.categoryScores.argueCall, 3)
    };
  }

  const keyMoments = events
    .filter((event) => event.scoringStatus === "scored")
    .sort((a, b) => Math.abs(b.weightedDelta) - Math.abs(a.weightedDelta))
    .slice(0, 15);

  const { verdict } = summarizeVerdict(homeAggregate, awayAggregate);
  const allEventsTotalCount = allScoredCount + allExcludedCount;
  const rollCandidateTotalCount = rollCandidateScoredCount + rollCandidateExcludedCount;
  const coverage = {
    allEvents: {
      scoredCount: allScoredCount,
      excludedCount: allExcludedCount,
      scoredRate: allEventsTotalCount > 0 ? roundTo(allScoredCount / allEventsTotalCount, 3) : 0
    },
    rollCandidates: {
      scoredCount: rollCandidateScoredCount,
      excludedCount: rollCandidateExcludedCount,
      scoredRate: rollCandidateTotalCount > 0 ? roundTo(rollCandidateScoredCount / rollCandidateTotalCount, 3) : 0
    },
    scoredByType,
    excludedByType,
    excludedByReason: Object.fromEntries(Array.from(excludedByReason.entries()).sort((a, b) => b[1] - a[1]))
  } satisfies LuckReport["coverage"];
  const idSeed = `${replay.matchId}:${events.length}:${homeAggregate.luckScore}:${awayAggregate.luckScore}`;

  return {
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
    howScoredSummary: buildHowScoredSummary(verdict.summary, coverage, homeAggregate, awayAggregate),
    teams: [homeAggregate, awayAggregate],
    keyMoments: keyMoments.map((event) => ({
      ...event,
      probabilitySuccess: roundTo(event.probabilitySuccess, 3),
      explainability: {
        ...event.explainability,
        baseOdds: event.explainability.baseOdds !== undefined ? roundTo(event.explainability.baseOdds, 3) : undefined,
        rerollAdjustedOdds:
          event.explainability.rerollAdjustedOdds !== undefined ? roundTo(event.explainability.rerollAdjustedOdds, 3) : undefined,
        weight: roundTo(event.explainability.weight, 3)
      },
      delta: roundTo(event.delta, 3),
      weightedDelta: roundTo(event.weightedDelta, 3)
    })),
    events: events.map((event) => ({
      ...event,
      probabilitySuccess: roundTo(event.probabilitySuccess, 3),
      explainability: {
        ...event.explainability,
        baseOdds: event.explainability.baseOdds !== undefined ? roundTo(event.explainability.baseOdds, 3) : undefined,
        rerollAdjustedOdds:
          event.explainability.rerollAdjustedOdds !== undefined ? roundTo(event.explainability.rerollAdjustedOdds, 3) : undefined,
        weight: roundTo(event.explainability.weight, 3)
      },
      delta: roundTo(event.delta, 3),
      weightedDelta: roundTo(event.weightedDelta, 3)
    }))
  };
}
