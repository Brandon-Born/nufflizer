import { createHash } from "node:crypto";

import { LUCK_CATEGORY_WEIGHTS, ROLL_TYPE_BY_EVENT } from "@/domain/nufflizer/constants";
import { computeProbabilityForEvent, resolveActualSuccess } from "@/domain/nufflizer/probability";
import type { LuckEvent, LuckEventType, LuckReport, LuckTeamAggregate } from "@/domain/nufflizer/types";
import type { ReplayEvent, ReplayModel, ReplayTurn } from "@/domain/replay/types";

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

function classifyByRollType(rollType: number | undefined): LuckEventType | null {
  if (rollType === undefined) {
    return null;
  }

  const entries = Object.entries(ROLL_TYPE_BY_EVENT) as Array<[LuckEventType, number[]]>;
  for (const [eventType, rollTypes] of entries) {
    if (rollTypes.includes(rollType)) {
      return eventType;
    }
  }

  return null;
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

function fallbackEventType(event: ReplayEvent): LuckEventType | null {
  if (event.type === "dodge") {
    return "dodge";
  }

  if (event.type === "casualty") {
    return "injury";
  }

  if (event.type === "block" && event.sourceTag === "ResultBlockOutcome") {
    return "block";
  }

  if (/argue|referee|bribe/i.test(event.sourceTag)) {
    return "argue_call";
  }

  return null;
}

function buildMomentLabel(type: LuckEventType, actualSuccess: boolean, probabilitySuccess: number, difficulty?: number): string {
  const action = eventTypeLabel(type);
  const targetPrefix = difficulty && difficulty > 0 ? `${difficulty}+ ` : "";

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

function buildInputsSummary(
  type: LuckEventType,
  target: string,
  dice: number[],
  rerollAvailable: boolean,
  calculationMethod: LuckEvent["calculationMethod"]
): string {
  const diceText = dice.length > 0 ? `[${dice.join(", ")}]` : "none";
  return `${eventTypeLabel(type)} | target ${target} | dice ${diceText} | reroll available ${rerollAvailable ? "yes" : "no"} | method ${calculationMethod}`;
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

function buildNormalizedEvent(
  replayTurn: ReplayTurn,
  turnEvents: ReplayEvent[],
  event: ReplayEvent,
  eventIndex: number,
  teamNameById: Map<string, string>
): LuckEvent | null {
  const payload = isRecord(event.payload) ? event.payload : undefined;
  const rollType = event.rollType ?? toNumber(payload?.RollType);
  const classifiedFromRoll = event.type === "roll" ? classifyByRollType(rollType) : null;
  const type = classifiedFromRoll ?? fallbackEventType(event);

  if (!type) {
    return null;
  }

  const teamId = resolveTeamId(replayTurn, event);
  if (!teamId) {
    return null;
  }

  const { dice, dieTypes } = extractDice(payload);
  const { modifiers, skillsUsed } = extractModifiers(payload);
  const requirement = toNumber(payload?.Requirement);
  const difficulty = toNumber(payload?.Difficulty);
  const outcomeCode = toNumber(payload?.Outcome);
  const { rerollAvailable, rerollUsed } = extractRerollFlags(turnEvents, eventIndex);
  const inferredRerollAvailable = rerollAvailable || skillsUsed.length > 0;
  const normalizationFlags: string[] = [];
  const normalizationNotes: string[] = [];

  if (event.actorTeamId && event.teamId && event.actorTeamId !== event.teamId) {
    normalizationFlags.push("ambiguous_team_attribution");
    normalizationNotes.push(`actorTeamId ${event.actorTeamId} differs from teamId ${event.teamId}`);
  }

  if (difficulty === undefined && requirement === undefined) {
    normalizationFlags.push("missing_target_threshold");
    normalizationNotes.push("difficulty and requirement were both missing; fallback target handling applied");
  }

  if (dice.length > 0 && dieTypes.some((dieType) => dieType === 0)) {
    normalizationFlags.push("insufficient_dice_metadata");
    normalizationNotes.push("one or more dice were missing die type; default die sides were inferred");
  }

  if (!rerollAvailable && skillsUsed.length > 0) {
    normalizationFlags.push("inferred_reroll_from_skill_only");
    normalizationNotes.push("reroll availability inferred from skill usage without explicit reroll question");
  }

  const probability = computeProbabilityForEvent(type, {
    rollType,
    requirement,
    difficulty,
    dice,
    dieTypes,
    rerollAvailable: inferredRerollAvailable
  });
  const probabilitySuccess = probability.probabilitySuccess;
  const actualSuccess = resolveActualSuccess(outcomeCode, dice, difficulty ?? requirement);
  const delta = (actualSuccess ? 1 : 0) - probabilitySuccess;
  const weight = LUCK_CATEGORY_WEIGHTS[type];
  const weightedDelta = delta * weight;
  const target = targetLabel(requirement, difficulty);

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
    type,
    probabilitySuccess: clamp01(probabilitySuccess),
    actualSuccess,
    delta,
    weightedDelta,
    label: buildMomentLabel(type, actualSuccess, probabilitySuccess, difficulty ?? requirement),
    tags,
    calculationMethod: probability.calculationMethod,
    calculationReason: probability.calculationReason,
    explainability: {
      target,
      baseOdds: probability.baseOdds,
      rerollAdjustedOdds: probability.rerollAdjustedOdds,
      weight,
      formulaSummary: buildFormulaSummary(actualSuccess, probabilitySuccess, weight, weightedDelta),
      inputsSummary: buildInputsSummary(type, target, dice, inferredRerollAvailable, probability.calculationMethod)
    },
    metadata: {
      sourceTag: event.sourceTag,
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
      rerollAvailable: inferredRerollAvailable,
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

function initialCoverageByType(): LuckReport["coverage"]["byType"] {
  return {
    block: { explicit: 0, fallback: 0 },
    armor_break: { explicit: 0, fallback: 0 },
    injury: { explicit: 0, fallback: 0 },
    dodge: { explicit: 0, fallback: 0 },
    ball_handling: { explicit: 0, fallback: 0 },
    argue_call: { explicit: 0, fallback: 0 }
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

function buildHowScoredSummary(
  verdictSummary: string,
  coverage: LuckReport["coverage"],
  home: LuckTeamAggregate,
  away: LuckTeamAggregate
): string[] {
  return [
    `Nufflizier scores each event as (actual result - expected odds) multiplied by a category weight.`,
    `Coverage this match: ${coverage.explicitCount} explicit calculations and ${coverage.fallbackCount} fallback calculations (${(
      coverage.explicitRate * 100
    ).toFixed(1)}% explicit).`,
    `${home.teamName} finished at ${home.luckScore.toFixed(1)} versus ${away.teamName} at ${away.luckScore.toFixed(
      1
    )}, so verdict is: ${verdictSummary}`
  ];
}

export function analyzeReplayLuck(replay: ReplayModel): LuckReport {
  const [homeTeam, awayTeam] = selectMatchTeams(replay);
  const trackedTeamIds = new Set<string>([homeTeam.id, awayTeam.id]);
  const teamNameById = new Map<string, string>(
    replay.teams.map((team) => [team.id, team.name] satisfies [string, string])
  );

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
  let explicitCount = 0;
  let fallbackCount = 0;
  const byTypeCoverage = initialCoverageByType();

  for (const event of events) {
    const aggregate = aggregateById.get(event.teamId);
    if (!aggregate) {
      continue;
    }

    const categoryWeight = LUCK_CATEGORY_WEIGHTS[event.type];
    aggregate.eventCount += 1;
    if (event.calculationMethod === "explicit") {
      explicitCount += 1;
      byTypeCoverage[event.type].explicit += 1;
    } else {
      fallbackCount += 1;
      byTypeCoverage[event.type].fallback += 1;
    }

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

  const keyMoments = [...events]
    .sort((a, b) => Math.abs(b.weightedDelta) - Math.abs(a.weightedDelta))
    .slice(0, 15);
  const { verdict } = summarizeVerdict(homeAggregate, awayAggregate);
  const totalCount = explicitCount + fallbackCount;
  const coverage = {
    explicitCount,
    fallbackCount,
    explicitRate: totalCount > 0 ? roundTo(explicitCount / totalCount, 3) : 0,
    byType: byTypeCoverage
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
        baseOdds: roundTo(event.explainability.baseOdds, 3),
        rerollAdjustedOdds: roundTo(event.explainability.rerollAdjustedOdds, 3),
        weight: roundTo(event.explainability.weight, 3),
        formulaSummary: event.explainability.formulaSummary,
        inputsSummary: event.explainability.inputsSummary
      },
      delta: roundTo(event.delta, 3),
      weightedDelta: roundTo(event.weightedDelta, 3)
    })),
    events: events.map((event) => ({
      ...event,
      probabilitySuccess: roundTo(event.probabilitySuccess, 3),
      explainability: {
        ...event.explainability,
        baseOdds: roundTo(event.explainability.baseOdds, 3),
        rerollAdjustedOdds: roundTo(event.explainability.rerollAdjustedOdds, 3),
        weight: roundTo(event.explainability.weight, 3),
        formulaSummary: event.explainability.formulaSummary,
        inputsSummary: event.explainability.inputsSummary
      },
      delta: roundTo(event.delta, 3),
      weightedDelta: roundTo(event.weightedDelta, 3)
    }))
  };
}
