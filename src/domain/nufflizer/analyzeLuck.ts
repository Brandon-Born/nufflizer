import { VERDICT_SUMMARIES } from "./explainabilityCopy";
import { formatDiceContribution, scoredEvidenceForTeam } from "./presentation";
import {
  linkObservedSkillRerolls,
  linkTeamRerolls,
  type RerollLink
} from "./rerolls";
import { CONTEXT_MODEL_VERSION, estimateNumericImpact } from "./contextImpact";
import {
  reconstructPreRollEvidence,
  type PreRollEvidence
} from "@/domain/replay/reconstructContext";
import { verifyArmorCheck } from "./armorChecks";
import { linkRegeneration, type RegenerationEvidence } from "./regeneration";
import {
  BLOCK_FACES,
  enumerateBlockPool,
  linkBlockPools,
  type BlockRecord
} from "./blockPools";
import { buildPlayerOwnershipIndex } from "@/domain/replay/attribution";
import { numericCheckExclusion } from "./numericCheckContract";
import { labelForRollType } from "@/domain/replay/rollTypeContracts";
import { createHash } from "node:crypto";

import {
  DICE_MODEL_VERSION,
  LUCK_CATEGORY_WEIGHTS
} from "@/domain/nufflizer/constants";
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
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))
  )
    return undefined;
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
    .map((die) => toNumber(die?.Value))
    .filter((value): value is number => value !== undefined);
  const dieTypes = diceNodes.map((die) => toNumber(die?.DieType) ?? -1);

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
    .map((modifier) => toNumber(modifier?.Value))
    .filter((value): value is number => value !== undefined);
  const skillsUsed = modifierNodes
    .map((modifier) => toNumber(modifier?.Skill))
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
    event.sourceTag === "QuestionBlockDice" ||
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
  event: ReplayEvent,
  eventIndex: number,
  teamNameById: Map<string, string>,
  playerToTeam: ReadonlyMap<string, string>,
  blockRecord: BlockRecord | undefined,
  contextBySource: ReadonlyMap<string, PreRollEvidence>,
  rerollLink: RerollLink | undefined,
  regeneration: RegenerationEvidence | undefined
): LuckEvent | null {
  const payload = isRecord(event.payload) ? event.payload : undefined;
  const preRoll = contextBySource.get(
    rerollLink?.originalId ?? rerollLink?.questionId ?? event.id ?? ""
  );
  const rollType = event.rollType ?? toNumber(payload?.RollType);
  const rollLabel =
    replayVersion === "1-4-0-0"
      ? labelForRollType(
          event.sourceTag,
          rollType,
          event.rollLabel ?? "unknown"
        )
      : rollType === undefined
        ? "unknown"
        : `roll_${rollType}`;
  const dicePayload =
    event.sourceTag === "ResultBlockRoll" && payload?.Die !== undefined
      ? { Dice: { Die: payload.Die } }
      : payload;
  const { dice, dieTypes } = extractDice(dicePayload);
  const { modifiers, skillsUsed } = extractModifiers(payload);
  const requirement = toNumber(payload?.Requirement);
  const difficulty = toNumber(payload?.Difficulty);
  const outcomeCode = toNumber(payload?.Outcome);
  const { rerollAvailable, rerollUsed } = rerollLink ?? {
    rerollAvailable: false,
    rerollUsed: false
  };
  const rerollMetadata = {
    rerollAvailable,
    rerollUsed,
    originalDice: rerollLink?.originalDice,
    rerollOriginalId: rerollLink?.originalId,
    rerollQuestionId: rerollLink?.questionId,
    rerollDecisionId: rerollLink?.decisionId,
    rerollResource: rerollLink?.resource,
    teamRerollsSpent: rerollLink?.teamRerollsSpent,
    rerollSkill: rerollLink?.skill,
    rerollPolicy: rerollLink?.policy,
    mergedRerollAnchorId: rerollLink?.mergedIntoId
  };
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
    normalizationNotes.push("skill modifiers alone do not establish a reroll");
  }

  let classification = classifyRollContext({
    sourceTag: event.sourceTag,
    stepType: event.stepType,
    rollType,
    requirement,
    difficulty,
    diceCount: dice.length
  });
  const isRollCandidate =
    !rerollLink?.mergedIntoId &&
    blockRecord?.kind !== "summary" &&
    isRollCandidateEvent(event);

  const resolvedTeamId = resolveTeamId(replayTurn, event);
  const teamId =
    resolvedTeamId && teamNameById.has(resolvedTeamId)
      ? resolvedTeamId
      : "unresolved";

  const armor = verifyArmorCheck(replayVersion, event, dice, dieTypes);
  const armorAccepted = armor?.kind === "verified" ? armor : undefined;
  const armorOwner = armorAccepted && playerToTeam.get(armorAccepted.subject);
  const recovery =
    regeneration && playerToTeam.get(regeneration.subject) === teamId
      ? regeneration
      : undefined;
  const blockEvidence =
    blockRecord?.kind === "pool" ? blockRecord.evidence : undefined;
  const attackerTeam =
    blockEvidence && playerToTeam.get(blockEvidence.attackerId);
  const defenderTeam =
    blockEvidence && playerToTeam.get(blockEvidence.defenderId);
  const blockAccepted =
    blockEvidence &&
    attackerTeam === teamId &&
    defenderTeam &&
    defenderTeam !== attackerTeam &&
    teamNameById.has(defenderTeam)
      ? blockEvidence
      : undefined;
  const blockOdds = blockAccepted && enumerateBlockPool(blockAccepted.pool);
  const rawBlock = [
    "QuestionBlockDice",
    "ResultBlockRoll",
    "ResultBlockOutcome"
  ].includes(event.sourceTag);
  if (rawBlock)
    classification = blockAccepted
      ? {
          eventType: "block",
          scored: true,
          rollCandidate: true,
          reason: "verified block pool"
        }
      : {
          eventType: "block",
          scored: false,
          rollCandidate: isRollCandidate,
          reason: `excluded: ${blockRecord?.kind === "summary" ? blockRecord.reason : "block pool or its chooser/resolution could not be linked"}`
        };
  if (armorAccepted && armorOwner === teamId)
    classification = {
      eventType: "armor_break",
      scored: true,
      rollCandidate: true,
      reason: "verified 2D6 armor check"
    };
  if (recovery)
    classification = {
      eventType: "injury",
      scored: true,
      rollCandidate: true,
      reason: "verified post-casualty Regeneration check"
    };
  const armorScored =
    armorAccepted && armorOwner === teamId ? armorAccepted : undefined;
  const block =
    blockAccepted && blockOdds && defenderTeam
      ? {
          ...blockAccepted,
          defenderTeamId: defenderTeam,
          chooserTeamId: blockAccepted.pool.attackerChooses
            ? teamId
            : defenderTeam,
          distribution: blockOdds.distribution,
          rankedSymbol: blockOdds.favoredSymbol
        }
      : undefined;
  const damageSubject = armorScored?.subject ?? recovery?.subject;
  const damage = damageSubject
    ? {
        subjectId: damageSubject,
        subjectTeamId: teamId,
        sourceCode: event.damageSource,
        perspective: "subject_team" as const,
        chainActionId: event.actionId,
        regeneration: recovery
          ? {
              casualtySourceId: recovery.casualtySourceId,
              initialRemovalSourceId: recovery.initialRemovalSourceId,
              skillUseSourceId: recovery.skillUseSourceId
            }
          : undefined
      }
    : undefined;
  const eventType = defaultCategory(classification.eventType);
  const target = block
    ? "Defender Stumbles or Defender Down under the raw symbol order"
    : armorScored
      ? `Armor holds below ${difficulty}`
      : recovery
        ? "Regeneration on 4+ after the recorded casualty"
        : targetLabel(requirement, difficulty);
  const contractExclusion =
    (armor?.kind === "excluded" ? armor.reason : undefined) ??
    (armorAccepted && !armorScored
      ? "armor subject has no verified roster owner"
      : undefined) ??
    (event.sourceTag === "ResultRoll" && rollType === 46 && !recovery
      ? "Regeneration requires an unambiguous casualty, removal and skill-use chain"
      : undefined) ??
    rerollLink?.exclusionReason ??
    numericCheckExclusion(
      replayVersion,
      { ...event, rollType },
      rerollAvailable,
      rerollLink?.retainedOriginal
    );
  const resolvedActual = armorScored
    ? {
        actualSuccess: armorScored.held,
        deterministic: true,
        reason: "armor hold from the subject team's perspective"
      }
    : recovery
      ? {
          actualSuccess: recovery.success,
          deterministic: true,
          reason:
            "Regeneration die versus 4+ from the affected player's perspective"
        }
      : blockOdds
        ? {
            actualSuccess: blockOdds.favoredSymbol >= 3,
            deterministic: true,
            reason:
              "raw symbol opportunity, independent of coach choice and applied skills"
          }
        : resolveActualSuccess(
            outcomeCode,
            dice,
            difficulty ?? requirement,
            eventType
          );

  // Disputed category/beneficiary mappings cannot contribute favorable luck.
  const semanticsUnverified =
    classification.scored &&
    !armorScored &&
    !recovery &&
    !block &&
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
        locator: event.locator,
        preRoll,
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
        ...rerollMetadata,
        skillsUsed,
        normalizationFlags,
        normalizationNotes
      }
    };
  }

  let probability;
  try {
    const scopedOdds =
      armorScored?.probability ?? (recovery ? 1 / 2 : blockOdds?.chance);
    probability =
      scopedOdds !== undefined
        ? {
            probabilitySuccess: scopedOdds,
            baseOdds: scopedOdds,
            rerollAdjustedOdds: scopedOdds,
            reason: armorScored
              ? "2D6 against the effective armor target"
              : recovery
                ? "3 of 6 faces succeed, conditional on a recorded casualty"
                : "six-sided block dice with two Push faces"
          }
        : computeProbabilityForEvent({
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
  const contextualImpact =
    preRoll?.activeTeamId === teamId
      ? estimateNumericImpact(
          preRoll,
          rollType,
          rerollLink?.retainedOriginal
            ? "declined_team_reroll"
            : rerollLink?.resource === "team"
              ? "full_team_reroll"
              : undefined,
          delta
        )
      : undefined;

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
    contextualImpact,
    label: armorScored
      ? actualSuccess
        ? "Armor held"
        : "Armor broke"
      : recovery
        ? actualSuccess
          ? "Regeneration succeeded"
          : "Regeneration failed"
        : block
          ? `Block pool: ${BLOCK_FACES[block.rankedSymbol]} opportunity`
          : buildMomentLabel(
              eventType,
              actualSuccess,
              probabilitySuccess,
              difficulty ?? requirement
            ),
    tags,
    scoringStatus: "scored",
    statusReason: `${classification.reason}; ${probability.reason}; ${resolvedActual.reason}${rerollLink?.policy ? `; ${rerollLink.policy}` : ""}`,
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
      inputsSummary: block
        ? `${block.pool.faces.map((f) => BLOCK_FACES[f]).join(", ")}. ${block.pool.attackerChooses ? "Attacker" : "Defender"} controls the choice. Selected ${BLOCK_FACES[block.selectedFace]}; applied outcome ${block.finalOutcome}. The score measures the raw symbols, before skills or the coach's choice.`
        : buildInputsSummary(eventType, target, dice, rerollAvailable, "scored")
    },
    metadata: {
      sourceTag: event.sourceTag,
      sourceId: event.id,
      actionId: event.actionId,
      sequenceId: event.sequenceId,
      sourceIndex: event.sourceIndex,
      locator: event.locator,
      preRoll,
      block,
      damage,
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
      ...rerollMetadata,
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
    eventCount: 0,
    impactCount: 0,
    impactScore: 0,
    impactByType: { dodge: 0, ball_handling: 0 }
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
    "Dice totals add supported outcomes under the stated rules. Context estimates are separate and require verified pre-roll state. Neither is a win probability.",
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
  const { playerToTeam } = buildPlayerOwnershipIndex(replay);
  const contextBySource = reconstructPreRollEvidence(replay);

  for (const replayTurn of replay.turns) {
    const rerollLinks = linkTeamRerolls(replayTurn.events);
    linkObservedSkillRerolls(
      replayTurn.events,
      replay.replayVersion,
      playerToTeam,
      rerollLinks
    );
    const blockRecords = linkBlockPools(
      replayTurn.events,
      replay.replayVersion
    );
    const regeneration = linkRegeneration(
      replayTurn.events,
      replay.replayVersion
    );
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
        event,
        eventIndex,
        teamNameById,
        playerToTeam,
        blockRecords.get(eventIndex),
        contextBySource,
        rerollLinks.get(eventIndex),
        regeneration.get(eventIndex)
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
    if (
      event.contextualImpact &&
      (event.type === "dodge" || event.type === "ball_handling")
    ) {
      aggregate.impactCount++;
      aggregate.impactScore += event.contextualImpact.contribution;
      aggregate.impactByType[event.type] += event.contextualImpact.contribution;
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
      "Roll candidates include unknown families and randomizers. Linked checks are counted once; allEvents additionally includes retained evidence such as block selections and first dice. Neither percentage measures state reconstruction or whole-match confidence.",
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
    modelVersion: DICE_MODEL_VERSION,
    contextModelVersion: CONTEXT_MODEL_VERSION,
    limitations: [
      "Category mappings remain provisional pending NUF-009 independent game evidence.",
      "Block scoring measures linked raw symbol pools; skill-adjusted resolution and unsupported damage variants are retained as evidence.",
      "Context estimates require a reconciled board and a verified terminal roll policy. The mobility/possession scale is a heuristic, not calibrated match impact."
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
