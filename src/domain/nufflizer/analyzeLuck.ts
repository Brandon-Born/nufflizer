import {
  findTeamDiceIdentities,
  linkBlockDiceCopies,
  linkApothecaryDiceCopies,
  type TeamDiceIdentity
} from "./diceIdentityLinks";
import { findObservedRerollDice } from "./observedRerollDice";
import {
  addDiceLink,
  reconcileDiceEvidence,
  summarizeDiceRecords,
  type DiceLinks,
  inventoryDiceRecords
} from "./diceEvidence";
import { findBlockTraitEvidence } from "@/domain/replay/traitContinuity";
import {
  findBlockActivationEnds,
  type BlockCommitment
} from "@/domain/replay/blockActivationEnds";
import { enumerateSkillBlock } from "./blockSkillModel";
import { findKeptDodgeContexts, attachKeptDodgeMoves } from "./keptDodgeMoves";
import {
  findRetainedRushContexts,
  attachRetainedRushMoves
} from "./retainedRushMoves";
import { summarizeContextComponents } from "./contextComponents";
import { attachInjuryObservations } from "./injuryObservation";
import { attachCategoricalInjuries } from "./categoricalInjury";
import { findMightyBlowArmorUses } from "./armorModifierBudget";
import { findRegenerationAftermath } from "./regenerationAftermath";
import { findRegenerationReturns } from "./regenerationReturn";
import { numericRerollScore, formatNumericRerollFormula } from "./numericRerollScore";
import { attachInjuryTables } from "./injuryTable";
import { attachBlockPush } from "./blockPush";
import { attachBlockCrowd } from "./blockCrowd";
import { attachBlockBallReleases } from "./blockBallRelease";
import {
  createOwnershipTimeline,
  applyCurrentOwnership,
  ownerAt,
  type OwnershipTimeline
} from "@/domain/replay/ownershipTimeline";
import { attachRetainedCatchPossession } from "./retainedCatchPossession";
import { teamMovementContinuity } from "@/domain/replay/teamMovementContinuity";
import {
  findBounceCatchReactions,
  attachBounceCatchReactions
} from "./catchPossession";
import { findPickupTurnEnds, attachPickupTurnEnds } from "./pickupTurnEnd";
import {
  findRerollCounterEvidence,
  attachRerollCounterEvidence
} from "./rerollCounters";
import {
  findBlockConsequences,
  summarizeBlockConsequence,
  type ObservedBlockConsequence
} from "./blockConsequences";
import { findDriveEffectExpiries } from "@/domain/replay/driveEffects";
import { checkpointClockEpochs } from "@/domain/replay/boardState";
import { VERDICT_SUMMARIES } from "./explainabilityCopy";
import { formatDiceContribution, scoredEvidenceForTeam } from "./presentation";
import {
  linkLonerGates,
  linkProGates,
  linkObservedSkillRerolls,
  linkTeamRerolls,
  type RerollLink
} from "./rerolls";
import {
  CONTEXT_MODEL_VERSION,
  estimateNumericImpact,
  estimateDodgeImpactBounds,
  estimateTeamDodgeMoveBounds,
  estimateTeamRushMoveBounds,
  estimatePickupPossessionBounds
} from "./contextImpact";
import {
  reconstructReplayContext,
  type PreRollEvidence
} from "@/domain/replay/reconstructContext";
import { verifyArmorCheck } from "./armorChecks";
import { summarizeDamageSteps } from "./damageSteps";
import {
  findMovementFall,
  findMovementTouchdown,
  summarizeMovementFall
} from "./movementConsequences";
import { linkRegeneration, type RegenerationEvidence } from "./regeneration";
import { countKoRecoveryChecks, verifyKoRecovery } from "./koRecovery";
import { linkApothecary, type ApothecaryRecord } from "./apothecary";
import {
  BLOCK_FACES,
  enumerateBlockPool,
  explainBlockEvidence,
  linkBlockPools,
  type BlockRecord
} from "./blockPools";
import { summarizeRollFamilies } from "./rollCoverage";
import { summarizeContextEvidence } from "./contextCoverage";
import { findConfirmedActivationLosses } from "@/domain/replay/activationLosses";
import {
  mercenaryIdentity,
  recruitmentIdentityObservation,
  observeRecruitmentPurchases
} from "@/domain/replay/recruitment";
import { linkPickupBallConsequences } from "./ballConsequences";
import {
  retainEmbeddedInjuries,
  type EmbeddedInjuryRecord
} from "./embeddedInjury";
import {
  numericCheckExclusion,
  fixedNumericModifierEvidence
} from "./numericCheckContract";
import { labelForRollType } from "@/domain/replay/rollTypeContracts";
import { createHash } from "node:crypto";

import {
  DICE_MODEL_VERSION,
  REPORT_SCHEMA_VERSION,
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
  twoAttemptPolicy: boolean,
  scoringStatus: LuckEvent["scoringStatus"]
): string {
  const diceText = dice.length > 0 ? `[${dice.join(", ")}]` : "none";
  const policy =
    scoringStatus !== "scored"
      ? "not scored"
      : twoAttemptPolicy
        ? "two attempts"
        : "one attempt";
  return `${eventTypeLabel(type)} | target ${target} | dice ${diceText} | odds policy ${policy} | status ${scoringStatus}`;
}

function isPlayableTeamName(name: string): boolean {
  return !/^Team \d+$/i.test(name.trim());
}

function selectMatchTeams(
  replay: ReplayModel
): [ReplayModel["teams"][number], ReplayModel["teams"][number]] {
  if (replay.teams.length === 2) return [replay.teams[0]!, replay.teams[1]!];
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
  if (
    event.sourceTag === "ResultNoRollSuccess" &&
    event.payload?.Dice === undefined
  )
    return false;
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

function isDirectResultOrQuestion(event: ReplayEvent): boolean {
  return (
    event.locator?.replayStep !== undefined &&
    event.locator.stepIndex === undefined &&
    (event.sourceTag.startsWith("Result") ||
      event.sourceTag.startsWith("Question"))
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
  ownership: OwnershipTimeline,
  blockRecord: BlockRecord | undefined,
  contextBySource: ReadonlyMap<string, PreRollEvidence>,
  rerollLink: RerollLink | undefined,
  regeneration: RegenerationEvidence | undefined,
  apothecary: ApothecaryRecord | undefined,
  embeddedInjury: EmbeddedInjuryRecord | undefined,
  koRecoveryChecks: ReadonlyMap<string, number>,
  armorCountInStep: number | undefined
): LuckEvent | null {
  const payload =
    embeddedInjury?.roll ??
    apothecary?.roll ??
    (isRecord(event.payload) ? event.payload : undefined);
  const recordedPreRoll = contextBySource.get(
    rerollLink?.originalId ?? rerollLink?.questionId ?? event.id ?? ""
  );
  const preRoll =
    recordedPreRoll && event.sourceTag !== "QuestionTeamRerollUsage"
      ? {
          ...recordedPreRoll,
          pickupSuccessors:
            rerollLink?.skill === "Sure Hands" &&
            payload?.Requirement === payload?.Difficulty &&
            (payload?.Modifiers === undefined || payload?.Modifiers === "")
              ? recordedPreRoll.pickupSuccessors
              : undefined,
          activeMoveContinuation:
            rerollLink?.skill === "Dodge"
              ? recordedPreRoll.activeMoveContinuation
              : undefined
        }
      : undefined;
  if (preRoll) delete preRoll.pickupMoveAvailability;
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
  const twoAttemptPolicy = rerollLink?.twoAttemptPolicy ?? false;
  const rerollMetadata = {
    rerollUsed: rerollLink?.rerollUsed,
    originalDice: rerollLink?.originalDice,
    rerollOriginalId: rerollLink?.originalId,
    rerollQuestionId: rerollLink?.questionId,
    rerollDecisionId: rerollLink?.decisionId,
    rerollResource: rerollLink?.resource,
    teamRerollsSpent: rerollLink?.teamRerollsSpent,
    rerollSkill: rerollLink?.skill,
    lonerGate: rerollLink?.lonerGate,
    proGate: rerollLink?.proGate,
    rerollPolicy: rerollLink?.policy,
    mergedRerollAnchorId: rerollLink?.mergedIntoId
  };
  const normalizationFlags: string[] = [];
  const normalizationNotes: string[] = [];

  const { ambiguousPlayerIds } = ownership.initial;
  const playerOwnership = event.playerId
    ? ownership.resolve(event.playerId, event)
    : undefined;
  const blockEvidence =
    blockRecord?.kind === "pool" ? blockRecord.evidence : undefined;
  const defenderOwnership = blockEvidence
    ? ownership.resolve(blockEvidence.defenderId, event)
    : undefined;
  const owner =
    event.playerId === undefined
      ? undefined
      : ownerAt(ownership, event.playerId, event);
  const subjectRole =
    event.stepTag === "DamageStep" ||
    (event.sourceTag === "EventRoll" && rollType === 13);
  const conflict = (
    value: typeof playerOwnership,
    role: "actor" | "subject" | "defender"
  ) => {
    if (value?.status !== "unresolved" || value.reason === "missing_evidence")
      return;
    return {
      reason: value.reason,
      role,
      playerId: value.playerId,
      initialTeamId: value.initialTeamId,
      observedTeamId: value.observedTeamId,
      checkpointAfter: value.checkpointAfter,
      identitySourceId: value.identitySourceId
    };
  };
  const ownershipConflict =
    conflict(playerOwnership, subjectRole ? "subject" : "actor") ??
    conflict(defenderOwnership, "defender");
  const currentOwner = preRoll?.actorRosterTeamId;
  const resolvedTeamId =
    event.actorTeamSource === "turn_inferred" ||
    (event.actorTeamSource === "player_map" && !owner)
      ? currentOwner
      : (event.actorTeamId ?? event.teamId ?? currentOwner);
  const declaredConflict =
    event.actorTeamId && event.teamId && event.actorTeamId !== event.teamId;
  const rosterConflict = owner && resolvedTeamId && owner !== resolvedTeamId;
  const currentRosterConflict =
    currentOwner &&
    ((resolvedTeamId && currentOwner !== resolvedTeamId) ||
      (event.teamId && event.teamId !== currentOwner));
  if (
    currentOwner &&
    (!event.actorTeamId ||
      event.actorTeamSource === "turn_inferred" ||
      (playerOwnership?.status === "confirmed" &&
        playerOwnership.proof.basis === "current_roster" &&
        !ownership.initial.playerToTeam.has(event.playerId ?? "")))
  )
    normalizationNotes.push(
      "Actor ownership comes from the current pre-roll roster observation."
    );
  const ambiguousPlayer =
    event.playerId !== undefined &&
    ambiguousPlayerIds.has(event.playerId) &&
    !(
      playerOwnership?.status === "confirmed" &&
      playerOwnership.proof.identitySourceId
    );
  if (
    declaredConflict ||
    rosterConflict ||
    currentRosterConflict ||
    ambiguousPlayer ||
    ownershipConflict ||
    event.attributionConflict
  ) {
    normalizationFlags.push("ambiguous_team_attribution");
    if (declaredConflict)
      normalizationNotes.push(
        `Actor team ${event.actorTeamId} conflicts with declared team ${event.teamId}.`
      );
    if (rosterConflict)
      normalizationNotes.push(
        `Declared team ${resolvedTeamId} conflicts with roster team ${owner}.`
      );
    if (currentRosterConflict)
      normalizationNotes.push(
        `Current roster team ${currentOwner} conflicts with explicit event ownership.`
      );
    if (ambiguousPlayer)
      normalizationNotes.push("Both rosters list this player ID.");
    if (ownershipConflict)
      normalizationNotes.push(
        `The ${ownershipConflict.role} player ${ownershipConflict.playerId} has unresolved time-local roster evidence (${ownershipConflict.reason}).`
      );
  }

  if (difficulty === undefined && requirement === undefined) {
    normalizationFlags.push("missing_target_threshold");
    normalizationNotes.push("difficulty and requirement were both missing");
  }

  const teamId =
    resolvedTeamId &&
    teamNameById.has(resolvedTeamId) &&
    !normalizationFlags.includes("ambiguous_team_attribution")
      ? resolvedTeamId
      : "unresolved";
  const isKoRecovery = event.sourceTag === "EventRoll" && rollType === 13;
  const koRecovery = isKoRecovery
    ? verifyKoRecovery(event, replayVersion, koRecoveryChecks, owner, teamId)
    : undefined;

  if (
    !koRecovery &&
    dice.length > 0 &&
    dieTypes.some((dieType) => dieType === -1)
  ) {
    normalizationFlags.push("insufficient_dice_metadata");
    normalizationNotes.push(
      "one or more dice were missing die type; probability will not be inferred"
    );
  }

  if (!twoAttemptPolicy && skillsUsed.length > 0) {
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
  const isRollCandidate = embeddedInjury
    ? Boolean(embeddedInjury.roll && !embeddedInjury.repeatedOriginalId)
    : apothecary
      ? Boolean(apothecary.roll && !apothecary.repeatedOriginal)
      : !rerollLink?.mergedIntoId &&
        blockRecord?.kind !== "summary" &&
        isRollCandidateEvent(event);

  const armor = verifyArmorCheck(
    replayVersion,
    event,
    dice,
    dieTypes,
    armorCountInStep
  );
  const armorAccepted = armor?.kind === "verified" ? armor : undefined;
  const armorOwner =
    armorAccepted && ownerAt(ownership, armorAccepted.subject, event);
  const recovery =
    regeneration && ownerAt(ownership, regeneration.subject, event) === teamId
      ? regeneration
      : undefined;
  const recoverySuccess = recovery?.success ?? koRecovery?.success;
  const recoveryTarget = koRecovery?.target ?? 4;
  const recoveryName = recovery ? "Regeneration" : "KO recovery";
  const attackerTeam =
    blockEvidence && ownerAt(ownership, blockEvidence.attackerId, event);
  const defenderTeam =
    blockEvidence && ownerAt(ownership, blockEvidence.defenderId, event);
  const chooserMatches =
    !blockEvidence ||
    blockEvidence.chooserGamerId === undefined ||
    String(blockEvidence.chooserGamerId) ===
      (blockEvidence.pool.attackerChooses ? attackerTeam : defenderTeam);
  const blockAccepted =
    blockEvidence &&
    attackerTeam === teamId &&
    defenderTeam &&
    defenderTeam !== attackerTeam &&
    chooserMatches &&
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
  if (recoverySuccess !== undefined)
    classification = {
      eventType: "injury",
      scored: true,
      rollCandidate: true,
      reason: `verified ${recoveryName} check`
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
  const damageSubject =
    armorScored?.subject ?? recovery?.subject ?? koRecovery?.subject;
  const damage = damageSubject
    ? {
        subjectId: damageSubject,
        subjectTeamId: teamId,
        sourceCode: event.damageSource,
        perspective: "subject_team" as const,
        chainActionId: event.actionId,
        koRecovery: koRecovery ? { target: koRecovery.target } : undefined,
        regeneration: recovery
          ? {
              casualtySourceId: recovery.casualtySourceId,
              initialRemovalSourceId: recovery.initialRemovalSourceId,
              skillUseSourceId: recovery.skillUseSourceId
            }
          : undefined
      }
    : undefined;
  const eventType =
    embeddedInjury?.observed || apothecary || isKoRecovery
      ? "injury"
      : defaultCategory(classification.eventType);
  const target = block
    ? "Defender Stumbles or Defender Down under the raw symbol order"
    : armorScored
      ? `Armor holds below ${difficulty}`
      : recoverySuccess !== undefined
        ? `${recoveryName} on ${recoveryTarget}+${koRecovery?.target === 3 ? " with Kegs" : ""}`
        : targetLabel(requirement, difficulty);
  const contractExclusion =
    (!chooserMatches
      ? "block chooser slot conflicts with the participant roster"
      : undefined) ??
    (blockEvidence &&
    (!attackerTeam || !defenderTeam || attackerTeam === defenderTeam)
      ? "block participants require verified opposing roster ownership"
      : undefined) ??
    (embeddedInjury
      ? embeddedInjury.repeatedOriginalId
        ? "original injury dice already reported in this damage step"
        : embeddedInjury.observed
          ? "observed injury dice in a staff-choice question have no verified odds"
          : "staff-choice question has no verified injury dice; no recovery is inferred"
      : undefined) ??
    (apothecary
      ? apothecary.resolution
        ? apothecary.resolution.applied === "injury_treatment"
          ? "Apothecary used to treat the injury without a replacement roll"
          : apothecary.resolution.resourceSpent === 0
            ? "Apothecary declined and the original casualty kept"
            : apothecary.resolution.applied === "original"
              ? "Apothecary used and the original casualty kept"
              : "Apothecary used and the replacement casualty applied"
        : apothecary.repeatedOriginal
          ? "original dice already reported in this damage step"
          : apothecary.roll
            ? "observed Apothecary injury or casualty dice have no verified odds"
            : "Apothecary message without a verified roll or linked resolution"
      : undefined) ??
    (armor?.kind === "excluded" ? armor.reason : undefined) ??
    (armorAccepted && !armorScored
      ? "armor subject has no verified roster owner"
      : undefined) ??
    (event.sourceTag === "ResultRoll" && rollType === 46 && !recovery
      ? "Regeneration requires an unambiguous casualty, removal and skill-use chain"
      : undefined) ??
    (isKoRecovery && !koRecovery
      ? "KO recovery requires a direct roll with a verified target, outcome and roster"
      : undefined) ??
    (event.sourceTag === "ResultRoll" && isDirectResultOrQuestion(event)
      ? "direct replay roll has no verified scoring contract in this source format"
      : undefined) ??
    rerollLink?.exclusionReason ??
    numericCheckExclusion(
      replayVersion,
      { ...event, rollType },
      twoAttemptPolicy,
      rerollLink?.retainedOriginal
    );
  const resolvedActual = armorScored
    ? {
        actualSuccess: armorScored.held,
        deterministic: true,
        reason: "armor hold from the subject team's perspective"
      }
    : recoverySuccess !== undefined
      ? {
          actualSuccess: recoverySuccess,
          deterministic: true,
          reason: `${recoveryName} die versus ${recoveryTarget}+ from the affected player's perspective`
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
    recoverySuccess === undefined &&
    !block &&
    ["block", "armor_break", "injury", "argue_call"].includes(eventType);
  const attributionUnresolved = teamId === "unresolved";
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
        rerollLink?.lonerGate?.passed ??
        rerollLink?.proGate?.passed ??
        (!contractExclusion && resolvedActual.deterministic
          ? resolvedActual.actualSuccess
          : null),
      delta: 0,
      weightedDelta: 0,
      label: embeddedInjury
        ? embeddedInjury.observed
          ? "Observed injury dice"
          : "Unverified staff-choice evidence"
        : rerollLink?.lonerGate
          ? `Loner ${rerollLink.lonerGate.threshold}+ test ${rerollLink.lonerGate.passed ? "passed" : "failed"}`
          : rerollLink?.proGate
            ? `Pro test ${rerollLink.proGate.passed ? "passed" : "failed"}`
            : buildMomentLabel(
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
        inputsSummary: rerollLink?.proGate
          ? `Recorded Pro 3+ test with die ${dice[0]}.`
          : buildInputsSummary(
              eventType,
              target,
              dice,
              twoAttemptPolicy,
              "excluded"
            )
      },
      metadata: {
        sourceTag: event.sourceTag,
        mercenary:
          replayVersion === "1-4-0-0" ? mercenaryIdentity(event) : undefined,
        sourceId: event.id,
        actionId: event.actionId,
        sequenceId: event.sequenceId,
        sourceIndex: event.sourceIndex,
        locator: event.locator,
        preRoll,
        apothecary: apothecary?.resolution,
        embeddedDamageOriginalId: embeddedInjury?.repeatedOriginalId,
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
        normalizationNotes,
        ownershipConflict,
        identityMutation:
          replayVersion === "1-4-0-0"
            ? recruitmentIdentityObservation(event)
            : undefined
      }
    };
  }

  let probability;
  let rerollDraws: ReturnType<typeof numericRerollScore>;
  try {
    const scopedOdds =
      armorScored?.probability ??
      (recoverySuccess !== undefined
        ? (7 - recoveryTarget) / 6
        : blockOdds?.chance);
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
                : koRecovery
                  ? `${7 - recoveryTarget} of 6 faces succeed on the recorded KO recovery check`
                  : "six-sided block dice with two Push faces"
          }
        : computeProbabilityForEvent({
            eventType,
            rollType,
            requirement,
            difficulty,
            dice,
            dieTypes,
            twoAttemptPolicy
          });

  if (twoAttemptPolicy) {
    const initial=extractDice({Dice:rerollLink?.originalDice});
    rerollDraws=initial.dice.length===1 && initial.dieTypes[0]===0
      ? numericRerollScore(rerollLink?.originalId ?? rerollLink?.questionId ?? "",initial.dice[0]!,difficulty!,resolvedActual.actualSuccess!)
      : undefined;
    // Linkers admit only a source-qualified failed first draw and one fresh
    // replacement. Missing evidence must not revert to the biased benchmark.
    if(!rerollDraws) throw new Error("A numeric reroll needs its observed initial draw and source");
  }
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
  const delta = rerollDraws ? rerollDraws.initialDelta + rerollDraws.replacementDelta
    : (actualSuccess ? 1 : 0) - probabilitySuccess;
  const weight = LUCK_CATEGORY_WEIGHTS[eventType];
  const weightedDelta = delta * weight;
  const contextPolicy = rerollLink?.retainedOriginal
    ? "declined_team_reroll"
    : rerollLink?.resource === "team"
      ? "full_team_reroll"
      : rerollLink?.resource === "skill" && rerollLink.skill === "Dodge"
        ? "dodge_skill_reroll"
        : rerollLink?.resource === "skill" && rerollLink.skill === "Sure Hands"
          ? "sure_hands_reroll"
          : undefined;
  const contextDeviation =
    rerollDraws ? rerollDraws.replacementDelta : delta;
  const contextualImpact =
    preRoll?.activeTeamId === teamId
      ? estimateNumericImpact(
          preRoll,
          rollType,
          contextPolicy,
          contextDeviation
        )
      : undefined;
  const contextualBounds =
    preRoll?.activeTeamId === teamId && rollType === 2
      ? estimateDodgeImpactBounds(
          preRoll,
          contextPolicy,
          contextDeviation,
          probability.baseOdds
        )
      : undefined;

  const possessionBounds =
    preRoll?.pickupSuccessors && rollType === 4
      ? estimatePickupPossessionBounds(
          preRoll,
          contextPolicy,
          contextDeviation,
          probability.baseOdds
        )
      : undefined;
  const tags: LuckEvent["tags"] = [];
  if (actualSuccess && probabilitySuccess <= 0.3) {
    tags.push("blessed");
  }
  if (!actualSuccess && probabilitySuccess >= 0.7) {
    tags.push("shaftaroonie");
  }
  if (rerollDraws && actualSuccess && rerollDraws.baseSuccessChance >= 0.7 && delta < 0)
    tags.push("shaftaroonie");
  if (rerollDraws && actualSuccess && rerollDraws.baseSuccessChance <= 0.3 && delta > 0 && !tags.includes("blessed"))
    tags.push("blessed");

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
    contextualBounds,
    possessionBounds,
    label: armorScored
      ? actualSuccess
        ? "Armor held"
        : "Armor broke"
      : recoverySuccess !== undefined
        ? `${recoveryName} ${actualSuccess ? "succeeded" : "failed"}`
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
      formulaSummary: rerollDraws
        ? formatNumericRerollFormula(rerollDraws,actualSuccess,weight)
        : buildFormulaSummary(
        actualSuccess,
        probabilitySuccess,
        weight,
        weightedDelta
      ),
      inputsSummary: block
        ? explainBlockEvidence(block)
        : buildInputsSummary(
            eventType,
            target,
            dice,
            twoAttemptPolicy,
            "scored"
          )
    },
    metadata: {
      probabilityPolicy: block
        ? "block_pool"
        : twoAttemptPolicy
          ? "two_attempt"
          : "single_attempt",
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
      rerollDraws,
      fixedNumericModifiers: fixedNumericModifierEvidence(event),
      skillsUsed,
      normalizationFlags,
      normalizationNotes,
      ownership: {
        ...(playerOwnership?.status === "confirmed"
          ? playerOwnership.proof
          : currentOwner && preRoll
            ? {
                playerId: event.playerId,
                teamId: currentOwner,
                basis: "current_roster" as const,
                checkpointAfter: preRoll.checkpointAfter
              }
            : {
                playerId: event.playerId,
                teamId,
                basis: "explicit_team" as const,
                sourceTeamId: event.teamId ?? event.actorTeamId
              }),
        role: subjectRole ? "subject" : event.playerId ? "actor" : "team",
        ...(block && defenderOwnership?.status === "confirmed"
          ? { defender: defenderOwnership.proof }
          : {})
      }
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
  const unattributed = coverage.rollFamilies.reduce(
    (total, family) => total + family.unattributedCount,
    0
  );

  return [
    "Dice totals add supported outcomes under the stated rules. Context estimates are separate and require verified pre-roll state. Neither is a win probability.",
    "A single-attempt calculation does not establish whether a reroll was available. Recorded choices and counter observations are separate evidence.",
    `Roll-candidate coverage: ${coverage.rollCandidates.scoredCount} scored and ${coverage.rollCandidates.excludedCount} excluded (${(
      coverage.rollCandidates.scoredRate * 100
    ).toFixed(1)}% scored).`,
    `All-event visibility: ${coverage.allEvents.scoredCount} scored and ${coverage.allEvents.excludedCount} excluded (${(
      coverage.allEvents.scoredRate * 100
    ).toFixed(1)}% scored).`,
    ...(unattributed
      ? [
          `Rolls without a verified team: ${unattributed}. These count toward overall coverage.`
        ]
      : []),
    excludedTopReasons.length > 0
      ? `Top exclusions: ${excludedTopReasons.join("; ")}.`
      : "Top exclusions: none.",
    `${home.teamName} supported dice contribution: ${formatDiceContribution(home.luckScore, scoredEvidenceForTeam({ events }, home.teamId).total, 1)}; ${away.teamName}: ${formatDiceContribution(away.luckScore, scoredEvidenceForTeam({ events }, away.teamId).total, 1)}. ${verdictSummary}`
  ];
}

export function analyzeReplayLuck(inputReplay: ReplayModel): LuckReport {
  const ownership = createOwnershipTimeline(inputReplay);
  const replay = applyCurrentOwnership(inputReplay, ownership);
  // Inventory and bound all observed fields before probability admission.
  const diceInventory = inventoryDiceRecords(replay);
  const [homeTeam, awayTeam] = selectMatchTeams(replay);
  const teamNameById = new Map<string, string>(
    replay.teams.map((team) => [team.id, team.name] satisfies [string, string])
  );

  const events: LuckEvent[] = [];
  const normalizedByRaw = new Map<ReplayEvent, LuckEvent>();
  const diceLinks: DiceLinks = new Map();
  const observedRerollDice = findObservedRerollDice(replay);
  const armorModifierUses = findMightyBlowArmorUses(replay, ownership);
  const recoveryState = findRegenerationAftermath(replay, ownership);
  const recoveryReturns = findRegenerationReturns(replay, ownership, recoveryState.aftermath);
  const teamDiceIdentityByQuestion = new Map(
    findTeamDiceIdentities(replay).map((p) => [p.question.id, p])
  );
  const newTeamDiceIdentities: TeamDiceIdentity[] = [];
  linkBlockDiceCopies(replay, diceLinks);
  linkApothecaryDiceCopies(replay, diceLinks);
  const lonerSkills = new Map<string, 44 | 1008>();
  const lonerChoices = new Map<string, 0 | 1>();
  const blockConsequences: ObservedBlockConsequence[] = [];
  const movementFalls: NonNullable<ReturnType<typeof findMovementFall>>[] = [];
  const blockTraits = findBlockTraitEvidence(replay, ownership);
  const { playerToTeam } = ownership.initial;
  // A role-qualified actor is not automatically a legal/usable activation.
  // State/context keeps its independent controller, eligibility and continuity
  // gates on source annotations; the private role view serves dice policies.
  const activationLosses = findConfirmedActivationLosses(inputReplay);
  const driveExpiries = findDriveEffectExpiries(inputReplay);
  const activationEvidenceSources = new Set(
    activationLosses.flatMap((loss) => [
      loss.declarationSourceId,
      loss.skillSourceId,
      loss.followingActivationSourceId
    ])
  );
  const rerollCounters = findRerollCounterEvidence(inputReplay);
  for (const source of armorModifierUses.keys()) activationEvidenceSources.add(source);
  for (const source of recoveryState.controls.keys()) activationEvidenceSources.add(source);
  for (const source of recoveryReturns.activations.keys()) activationEvidenceSources.add(source);
  for (const [source, proof] of rerollCounters) {
    activationEvidenceSources.add(source);
    activationEvidenceSources.add(proof.questionSourceId);
  }
  const {
    preRollEvidence: contextBySource,
    activationEnds,
    mentalEffectEnds,
    mentalSkillUses,
    mentalTraitResults,
    dodgeMovements,
    teamRerollMovements,
    combinedMovements,
    pickupResolutions,
    pickupsAfterMovement
  } = reconstructReplayContext(
    inputReplay,
    activationLosses,
    findBlockActivationEnds(
      inputReplay,
      replay.turns.flatMap((turn) => {
        const records = linkBlockPools(turn.events, replay.replayVersion);
        return findBlockConsequences(turn.events, records, ownership).flatMap(
          (fact) => {
            let i = fact.nextEventIndex;
            while (
              turn.events[i]?.sourceTag === "Carrier" &&
              turn.events[i]?.checkpointCarrier
            )
              i++;
            const next = turn.events[i];
            return next?.id
              ? [
                  {
                    poolSourceId: fact.poolSourceId,
                    finalSourceId: fact.finalSourceId,
                    nextSourceId: next.id
                  } satisfies BlockCommitment
                ]
              : [];
          }
        );
      }),
      ownership
    )
  );
  const keptDodgeContexts = findKeptDodgeContexts(
    inputReplay,
    contextBySource,
    activationEnds
  );
  for (const proof of keptDodgeContexts.values()) {
    for (const source of [
      proof.declarationSourceId,
      proof.questionSourceId,
      proof.decisionSourceId
    ])
      activationEvidenceSources.add(source);
  }
  const retainedRushContexts = findRetainedRushContexts(
    inputReplay,
    contextBySource
  );
  for (const proof of retainedRushContexts.values())
    for (const source of [
      proof.declarationSourceId,
      proof.successRushSourceId,
      proof.doMoveSourceId,
      proof.moveOutcomeSourceId,
      proof.questionSourceId,
      proof.decisionSourceId
    ])
      activationEvidenceSources.add(source);
  for (const p of combinedMovements.values())
    for (const source of [
      p.stepSourceId,
      p.questionSourceId,
      p.decisionSourceId,
      p.rushSourceId,
      p.dodgeSourceId,
      p.doMoveSourceId,
      p.outcomeSourceId
    ])
      if (source) activationEvidenceSources.add(source);
  for (const proof of pickupsAfterMovement.values())
    for (const source of [
      proof.movementSourceId,
      proof.originalSourceId,
      proof.skillSourceId,
      proof.declarationSourceId,
      proof.moveOutcomeSourceId
    ])
      activationEvidenceSources.add(source);
  const bounceCatchReactions = findBounceCatchReactions(
    inputReplay,
    contextBySource
  );
  for (const movement of teamRerollMovements.values())
    for (const source of [
      movement.questionSourceId,
      movement.decisionSourceId,
      movement.declarationSourceId,
      movement.doMoveSourceId,
      movement.outcomeSourceId
    ])
      activationEvidenceSources.add(source);
  const pickupTurnEnds = findPickupTurnEnds(
    inputReplay,
    bounceCatchReactions,
    contextBySource
  );
  for (const proof of pickupTurnEnds.values())
    activationEvidenceSources.add(proof.endSourceId);
  for (const proof of bounceCatchReactions.values())
    for (const source of [proof.declarationSourceId, proof.moveOutcomeSourceId])
      activationEvidenceSources.add(source);
  for (const move of dodgeMovements.values())
    for (const source of [
      move.declarationSourceId,
      move.doMoveSourceId,
      move.outcomeSourceId
    ])
      activationEvidenceSources.add(source);
  for (const end of activationEnds.values())
    for (const source of [
      end.sourceId,
      end.declarationSourceId,
      end.moveSourceId,
      end.blockPoolSourceId,
      end.blockSourceId,
      end.skillSourceId,
      end.rollSourceId,
      end.effectSourceId,
      end.questionSourceId,
      end.decisionSourceId,
      end.lonerSourceId,
      end.lonerSkillSourceId
    ]) {
      if (source) activationEvidenceSources.add(source);
    }
  for (const [source, end] of mentalEffectEnds) {
    activationEvidenceSources.add(source);
    activationEvidenceSources.add(end.declarationSourceId);
  }
  for (const source of mentalSkillUses.keys())
    activationEvidenceSources.add(source);
  for (const [source, expiry] of driveExpiries) {
    activationEvidenceSources.add(source);
    activationEvidenceSources.add(expiry.phaseSourceId);
  }
  for (const proof of observedRerollDice) {
    activationEvidenceSources.add(proof.question.id!);
    activationEvidenceSources.add(proof.choice.id!);
    if (proof.directOriginal)
      addDiceLink(
        diceLinks,
        proof.question.id,
        proof.originalPath,
        proof.directOriginal.id,
        ["Dice"],
        "summary"
      );
    else
      addDiceLink(
        diceLinks,
        proof.question.id,
        proof.originalPath,
        proof.final.id,
        ["Dice"],
        "policy_original"
      );
    if (!proof.used)
      addDiceLink(
        diceLinks,
        proof.final.id,
        ["Dice"],
        proof.question.id,
        proof.originalPath,
        "summary"
      );
    for (const duplicate of proof.duplicates)
      addDiceLink(
        diceLinks,
        duplicate.id,
        ["Dice"],
        proof.final.id,
        ["Dice"],
        "summary"
      );
  }
  const koRecoveryChecks = countKoRecoveryChecks(replay.turns);
  const checkpoints = replay.boardCheckpoints ?? [];
  const epochs = checkpointClockEpochs(checkpoints);
  const eventEpochs = new Map<number, number>();
  let checkpointCursor = 0,
    epoch = 0;
  for (const event of replay.turns.flatMap((t) => t.events)) {
    if (event.sourceIndex === undefined) continue;
    while (
      checkpointCursor < checkpoints.length &&
      checkpoints[checkpointCursor]!.afterSourceIndex < event.sourceIndex
    )
      epoch = epochs.get(checkpoints[checkpointCursor++]!)!;
    eventEpochs.set(event.sourceIndex, epoch);
  }

  for (const replayTurn of replay.turns) {
    const fall =
      replay.replayVersion === "1-4-0-0"
        ? findMovementFall(replayTurn)
        : undefined;
    if (fall) movementFalls.push(fall);
    const touchdown =
      replay.replayVersion === "1-4-0-0"
        ? findMovementTouchdown(replayTurn)
        : undefined;
    const armorCounts = new Map<string, number>();
    for (const event of replayTurn.events) {
      if (
        event.sourceTag === "ResultRoll" &&
        event.rollType === 10 &&
        event.actionId
      )
        armorCounts.set(
          event.actionId,
          (armorCounts.get(event.actionId) ?? 0) + 1
        );
    }
    const rerollLinks = linkTeamRerolls(
      replayTurn.events,
      eventEpochs,
      ownership,
      replay.replayVersion
    );
    linkObservedSkillRerolls(
      replayTurn.events,
      replay.replayVersion,
      ownership,
      rerollLinks
    );
    for (const link of rerollLinks.values())
      if (
        (link.skill === "Dodge" || link.skill === "Sure Hands") &&
        link.decisionId
      ) {
        activationEvidenceSources.add(link.decisionId);
        const continuation = link.originalId
          ? contextBySource.get(link.originalId)?.activeMoveContinuation
          : undefined;
        if (continuation)
          activationEvidenceSources.add(continuation.declarationSourceId);
        const pickup = link.originalId
          ? contextBySource.get(link.originalId)?.pickupSuccessors
          : undefined;
        if (pickup) {
          activationEvidenceSources.add(pickup.declarationSourceId);
          activationEvidenceSources.add(pickup.moveOutcomeSourceId);
        }
      }
    linkLonerGates(
      replayTurn.events,
      replay.replayVersion,
      ownership,
      rerollLinks
    );
    for (const link of rerollLinks.values())
      if (link.lonerGate) {
        activationEvidenceSources.add(link.lonerGate.skillSourceId);
        if (link.decisionId) {
          activationEvidenceSources.add(link.decisionId);
          lonerChoices.set(link.decisionId, link.lonerGate.gamerId);
        }
        lonerSkills.set(link.lonerGate.skillSourceId, link.lonerGate.skillId);
      }
    linkProGates(
      replayTurn.events,
      replay.replayVersion,
      ownership,
      rerollLinks
    );
    const blockRecords = linkBlockPools(
      replayTurn.events,
      replay.replayVersion,
      rerollLinks
    );
    for (const [index, record] of blockRecords)
      if (record.kind === "summary") {
        const raw = replayTurn.events[index]!;
        addDiceLink(
          diceLinks,
          raw.id,
          raw.sourceTag === "QuestionPushBack"
            ? ["BlockRoll", "Die"]
            : raw.sourceTag === "QuestionBlockSkillUsage"
              ? ["RollInfos", "Die"]
              : [raw.sourceTag === "ResultBlockRoll" ? "Die" : "Dice"],
          record.poolSourceId,
          ["Dice"],
          "summary"
        );
      }
    for (const [index, link] of rerollLinks) {
      const raw = replayTurn.events[index]!;
      if (
        raw.sourceTag !== "ResultRoll" ||
        raw.rollType === 71 ||
        raw.rollType === 15 ||
        !link.questionId
      )
        continue;
      if (link.originalId)
        addDiceLink(
          diceLinks,
          link.questionId,
          ["RollInfos", "Dice"],
          link.originalId,
          ["Dice"],
          "summary"
        );
      else if (!link.mergedIntoId)
        addDiceLink(
          diceLinks,
          link.questionId,
          ["RollInfos", "Dice"],
          raw.id,
          ["Dice"],
          "policy_original"
        );
      if (link.retainedOriginal)
        addDiceLink(
          diceLinks,
          raw.id,
          ["Dice"],
          link.questionId,
          ["RollInfos", "Dice"],
          "summary"
        );
    }
    for (const rawQuestion of replayTurn.events) {
      const proof = teamDiceIdentityByQuestion.get(rawQuestion.id);
      if (!proof) continue;
      if (
        diceLinks
          .get(proof.question.id!)
          ?.some(
            (l) =>
              JSON.stringify(l.path) === JSON.stringify(["RollInfos", "Dice"])
          )
      )
        continue;
      activationEvidenceSources.add(proof.question.id!);
      activationEvidenceSources.add(proof.choice.id!);
      if (proof.directOriginal)
        addDiceLink(
          diceLinks,
          proof.question.id,
          ["RollInfos", "Dice"],
          proof.directOriginal.id,
          ["Dice"],
          "summary"
        );
      else
        addDiceLink(
          diceLinks,
          proof.question.id,
          ["RollInfos", "Dice"],
          proof.final.id,
          ["Dice"],
          "policy_original"
        );
      if (!proof.replacementRolled)
        addDiceLink(
          diceLinks,
          proof.final.id,
          ["Dice"],
          proof.question.id,
          ["RollInfos", "Dice"],
          "summary"
        );
      newTeamDiceIdentities.push(proof);
    }
    const consequences = findBlockConsequences(
      replayTurn.events,
      blockRecords,
      ownership
    );
    blockConsequences.push(...consequences);
    for (const consequence of consequences)
      for (const skill of consequence.skills)
        activationEvidenceSources.add(skill.sourceId);
    const regeneration = linkRegeneration(
      replayTurn.events,
      replay.replayVersion
    );
    const apothecary = linkApothecary(
      replayTurn.events,
      replay.replayVersion,
      ownership
    );
    for (const [index, record] of apothecary) {
      const raw = replayTurn.events[index]!;
      addDiceLink(
        diceLinks,
        raw.id,
        ["RollInfos", "Dice"],
        record.repeatedOriginalSourceId,
        ["Dice"],
        "summary"
      );
      addDiceLink(
        diceLinks,
        raw.id,
        ["OriginalRoll", "Dice"],
        record.copiedOriginalSourceId,
        ["RollInfos", "Dice"],
        "summary"
      );
    }
    const embeddedInjuries = retainEmbeddedInjuries(
      replayTurn.events,
      replay.replayVersion,
      ownership
    );
    // Keep the source offer/decline beside retained Pickup/Catch originals.
    // These are non-random receipts, not new dice or inferred counter values.
    for (const [index, link] of rerollLinks)
      if (
        link.retainedOriginal &&
        ([4, 7].includes(replayTurn.events[index]?.rollType ?? -1) || !!link.originalId)
      ) {
        if (link.questionId) activationEvidenceSources.add(link.questionId);
        if (link.decisionId) activationEvidenceSources.add(link.decisionId);
      }
    const numericTeamChoices = new Map<string, 0 | 1>();
    const numericTeamOffers = new Map<string, {gamerId:0|1;canUseTeamReroll:boolean;decisionSourceId:string}>();
    for (const [index,link] of rerollLinks)
      if (replay.replayVersion === "1-4-0-0" && link.twoAttemptPolicy && [1,2,4,7].includes(replayTurn.events[index]?.rollType ?? -1)) {
        if (link.questionId) activationEvidenceSources.add(link.questionId);
        if (link.decisionId) {
          activationEvidenceSources.add(link.decisionId);
          if(link.teamDecisionGamerId !== undefined) {
            numericTeamChoices.set(link.decisionId, link.teamDecisionGamerId);
            if(link.questionId)numericTeamOffers.set(link.questionId,{gamerId:link.teamDecisionGamerId,canUseTeamReroll:true,decisionSourceId:link.decisionId});
          }
        }
      }
    for (const [eventIndex, event] of replayTurn.events.entries()) {
      if (
        !apothecary.has(eventIndex) &&
        !embeddedInjuries.has(eventIndex) &&
        !activationEvidenceSources.has(event.id ?? "") &&
        !(
          event.sourceTag === "ResultUseAction" &&
          contextBySource.get(event.id ?? "")?.suppressedTackleZones?.length
        ) &&
        !isRollCandidateEvent(event) &&
        !isDirectResultOrQuestion(event) &&
        ![
          "ResultBlockOutcome",
          "QuestionPushBack",
          "ResultPushBack",
          "ResultPlayerRemoval",
          "ResultNoRollSuccess",
          "EventBuyMercenary",
          "EventRemoveMercenary"
        ].includes(event.sourceTag)
      )
        continue;

      if (event.unclassifiedDice) continue;
      const normalized = buildNormalizedEvent(
        replay.replayVersion,
        replayTurn,
        event,
        eventIndex,
        teamNameById,
        ownership,
        blockRecords.get(eventIndex),
        contextBySource,
        rerollLinks.get(eventIndex),
        regeneration.get(eventIndex),
        apothecary.get(eventIndex),
        embeddedInjuries.get(eventIndex),
        koRecoveryChecks,
        event.actionId ? armorCounts.get(event.actionId) : undefined
      );
      if (!normalized) {
        continue;
      }
      const numericOffer = numericTeamOffers.get(event.id ?? "");
      if(numericOffer){
        normalized.metadata.rerollOffer=numericOffer;
        normalized.label="Recorded team reroll offer";
        normalized.statusReason="Recorded original die and team reroll offer; the draw is counted once with its replacement.";
      }
      const numericChoice = numericTeamChoices.get(event.id ?? "");
      if (numericChoice !== undefined){
        normalized.metadata.teamRerollDecision = {
          gamerId: numericChoice, used: true
        };
        normalized.label="Recorded team reroll used";
        normalized.statusReason="Recorded use of one team reroll; the decision is not another random outcome.";
      }
      const armorUse = armorModifierUses.get(event.id ?? "");
      const recoveryControl = recoveryState.controls.get(event.id ?? "");
      if(recoveryControl)normalized.metadata.recoveryControl=recoveryControl;
      const recoveryAfter = recoveryState.aftermath.get(event.id ?? "");
      if(recoveryAfter && normalized.metadata.damage?.regeneration && normalized.scoringStatus==="scored")normalized.metadata.regenerationAftermath=recoveryAfter;
      const returned=recoveryReturns.traces.get(event.id??"");
      if(returned&&normalized.metadata.regenerationAftermath)normalized.metadata.regenerationReturn=returned;
      const returnActivation=recoveryReturns.activations.get(event.id??"");
      if(returnActivation){
        normalized.metadata.recoveryReturnActivation=returnActivation;
        normalized.label=`Recorded recovered-player ${returnActivation.actionCode===1?"Move":"Block"} declaration`;
        normalized.statusReason="A recovered player's later declaration is an observed action, not another roll or a complete eligibility test.";
      }
      if (armorUse) {
        normalized.metadata.armorModifierUse = armorUse;
        normalized.metadata.skillUsage = {skillId:13,used:true};
        normalized.label = "Recorded Mighty Blow on armor";
        normalized.statusReason = "Recorded +1 armor use; eligibility and the later injury policy require separate evidence. No luck score is added.";
      }
      if(event.sourceTag==="QuestionPushBack" && !normalized.metadata.isRollCandidate){
        normalized.label="Recorded push destination choice";
        normalized.statusReason="A coach's push menu is source evidence; its copied block die adds no random outcome or luck score.";
        normalized.actualSuccess=null;
        normalized.metadata.normalizationFlags=normalized.metadata.normalizationFlags?.filter(f=>f!=="missing_target_threshold");
        normalized.metadata.normalizationNotes=normalized.metadata.normalizationNotes?.filter(n=>n!=="difficulty and requirement were both missing");
      }
      const traitEvidence = event.id ? blockTraits.get(event.id) : undefined;
      if (normalized.metadata.block && traitEvidence) {
        normalized.metadata.block.traitEvidence = traitEvidence;
        normalized.metadata.block.skillModel = enumerateSkillBlock(
          normalized.metadata.block.pool,
          traitEvidence
        );
      }
      if (
        normalized.teamId !== "unresolved" &&
        normalized.playerId &&
        !normalized.metadata.ownership?.identitySourceId &&
        playerToTeam.get(normalized.playerId) === normalized.teamId
      ) {
        const name =
          replay.playerNamesByTeamAndId?.[
            `${normalized.teamId}:${normalized.playerId}`
          ];
        if (name) normalized.metadata.initialRosterName = name.slice(0, 320);
      }

      if (
        touchdown &&
        touchdown.rollSourceId === event.id &&
        normalized.scoringStatus === "scored" &&
        normalized.actualSuccess === true &&
        normalized.metadata.preRoll?.actorCarriesBall === true
      )
        normalized.metadata.movementTouchdown = touchdown.evidence;
      events.push(normalized);
      normalizedByRaw.set(event, normalized);
    }
  }

  const ballSources = new Map(
    events.flatMap((e) =>
      e.metadata.sourceId ? [[e.metadata.sourceId, e] as const] : []
    )
  );
  attachInjuryObservations(replay, ballSources);
  attachInjuryTables(replay, ballSources, ownership);
  attachCategoricalInjuries(replay, ballSources, blockConsequences, ownership);
  attachBlockCrowd(replay, ballSources, blockConsequences);
  attachBlockPush(replay, ballSources, blockConsequences, ownership);
  const damageSteps = summarizeDamageSteps(events);
  if (movementFalls.length > 0) {
    const damageByAction = new Map(
      damageSteps.map((step) => [step.actionId, step])
    );
    const eventsById = new Map(events.map((event) => [event.id, event]));
    const eventsBySource = new Map(
      events.map((event) => [event.metadata.sourceId, event])
    );
    for (const {
      rollSourceId,
      decisionSourceId,
      skillOriginalId,
      evidence
    } of movementFalls) {
      const roll = eventsBySource.get(rollSourceId);
      const damage = damageByAction.get(evidence.damageActionId);
      const combinedRush = evidence.combinedRushSourceId
        ? eventsBySource.get(evidence.combinedRushSourceId)
        : undefined;
      if (
        !roll ||
        roll.scoringStatus !== "scored" ||
        roll.actualSuccess !== false ||
        roll.metadata.rerollDecisionId !== decisionSourceId ||
        (skillOriginalId
          ? roll.metadata.rerollOriginalId !== skillOriginalId ||
            roll.metadata.rerollSkill !== "Dodge"
          : decisionSourceId !== undefined &&
            !roll.metadata.rerollQuestionId) ||
        !damage ||
        damage.playerId !== roll.playerId ||
        damage.teamId !== roll.teamId ||
        (evidence.combinedRushSourceId &&
          (!combinedRush ||
            combinedRush.scoringStatus !== "scored" ||
            combinedRush.actualSuccess !== true ||
            combinedRush.teamId !== roll.teamId ||
            combinedRush.playerId !== roll.playerId))
      )
        continue;
      roll.metadata.movementFall = {
        ...evidence,
        ...summarizeMovementFall(roll, damage, eventsById, combinedRush)
      };
    }
  }

  for (const turn of replay.turns)
    linkPickupBallConsequences(turn, ballSources);
  attachBounceCatchReactions(bounceCatchReactions, ballSources);
  attachRetainedCatchPossession(replay, ballSources);
  attachPickupTurnEnds(pickupTurnEnds, ballSources);
  attachRerollCounterEvidence(rerollCounters, ballSources);
  for (const [source, proof] of combinedMovements) {
    const dodge = ballSources.get(source),
      rush = ballSources.get(proof.rushSourceId);
    if (
      dodge?.scoringStatus === "scored" &&
      rush?.scoringStatus === "scored" &&
      rush.actualSuccess === true &&
      dodge.actualSuccess === proof.dodgeSucceeded
    ) {
      dodge.metadata.combinedMovement = proof;
      const choice = proof.decisionSourceId
        ? ballSources.get(proof.decisionSourceId)
        : undefined;
      if (choice && proof.gamerId !== undefined)
        choice.metadata.teamRerollDecision = {
          gamerId: proof.gamerId,
          used: true
        };
    }
  }
  for (const [source, movement] of teamRerollMovements) {
    const roll = ballSources.get(source),
      choice = ballSources.get(movement.decisionSourceId);
    if (
      roll?.scoringStatus === "scored" &&
      roll.actualSuccess === true &&
      roll.metadata.rerollResource === "team" &&
      roll.metadata.rerollUsed &&
      choice
    ) {
      roll.metadata.teamRerollMovement = movement;
      choice.metadata.teamRerollDecision = {
        gamerId: movement.gamerId,
        used: true
      };
      const declaration = ballSources.get(movement.declarationSourceId);
      if (declaration) declaration.label = "Recorded ordinary Move declaration";
      const outcome = ballSources.get(movement.outcomeSourceId);
      if (outcome) outcome.label = "Recorded movement after team reroll";
    }
  }
  for (const event of events)
    if (
      event.metadata.rerollResource === "skill" && event.metadata.rerollSkill &&
      event.metadata.rerollDecisionId
    ) {
      const skill = ballSources.get(event.metadata.rerollDecisionId);
      if (skill)
        skill.metadata.skillUsage = {
          skillId: event.metadata.rerollSkill === "Dodge" ? 7 : event.metadata.rerollSkill === "Sure Hands" ? 61 : 6,
          used: true
        };
    }
  for (const event of events) {
    const source =
      event.metadata.preRoll?.activeMoveContinuation?.declarationSourceId ??
      event.metadata.preRoll?.pickupSuccessors?.declarationSourceId;
    if (source) {
      const declaration = ballSources.get(source);
      if (declaration) declaration.label = "Recorded ordinary Move declaration";
    }
  }
  for (const event of events) {
    const moveSource =
      event.metadata.preRoll?.pickupSuccessors?.moveOutcomeSourceId;
    const move = moveSource ? ballSources.get(moveSource) : undefined;
    if (move) {
      move.label = "Recorded move to the pickup square";
      move.statusReason =
        "The ordinary move reached the recorded ball square before the pickup attempt; no random outcome is added.";
    }
  }
  for (const [source, resolution] of pickupResolutions) {
    const roll = ballSources.get(source);
    if (roll) roll.metadata.pickupResolution = resolution;
  }
  for (const [source, proof] of pickupsAfterMovement) {
    const roll = ballSources.get(source);
    if (
      roll?.scoringStatus === "scored" &&
      roll.actualSuccess === true &&
      roll.metadata.rerollSkill === "Sure Hands"
    )
      roll.metadata.pickupAfterMovement = proof;
  }
  for (const [source, movement] of dodgeMovements) {
    const roll = ballSources.get(source);
    if (roll) roll.metadata.dodgeMovement = movement;
    const outcome = ballSources.get(movement.outcomeSourceId);
    if (outcome) {
      outcome.label = "Recorded movement after Dodge reroll";
      outcome.statusReason =
        "The successful own Dodge replacement and its immediately recorded movement preserve the observed position and remaining movement; no extra luck score is added.";
    }
  }
  for (const event of events) {
    const m = event.metadata;
    if (
      event.scoringStatus === "scored" &&
      event.actualSuccess !== null &&
      !event.contextualImpact &&
      !event.contextualBounds &&
      (m.rollType === 2 ||
        (m.rollType === 1 &&
          m.difficulty === 2 &&
          event.actualSuccess === true)) &&
      m.rerollResource === "team" &&
      m.rerollUsed === true &&
      m.teamRerollsSpent === 1 &&
      !m.rerollSkill &&
      !m.lonerGate &&
      !m.proGate &&
      (m.modifiers?.length ?? 0) === 0 &&
      m.requirement === m.difficulty &&
      m.difficulty !== undefined &&
      m.difficulty >= 2 &&
      m.difficulty <= 6 &&
      m.preRoll?.activeTeamId === event.teamId &&
      (event.actualSuccess
        ? !!m.teamRerollMovement && !m.teamRerollMovement.zonePenalty
        : !!m.movementFall && !m.movementFall.combinedRushSourceId)
    ) {
      const question = ballSources.get(m.rerollQuestionId ?? ""),
        choice = ballSources.get(m.rerollDecisionId ?? "");
      const completedMoves = new Map(
        (m.preRoll.endedActivationSourceIds ?? []).flatMap((id) => {
          const end = activationEnds.get(id);
          return end?.kind === "ordinary_move_completed" &&
            end.teamId === event.teamId &&
            end.teamTurn === m.preRoll?.teamTurn &&
            end.checkpointAfter <= m.preRoll.checkpointAfter &&
            end.sourceIndex < (question?.metadata.sourceIndex ?? -1)
            ? [[end.actorId, end.actorCell] as const]
            : [];
        })
      );
      const terminalCheckpointAfter =
        m.preRoll.ordinaryMoveAvailability &&
        question?.metadata.sourceIndex !== undefined &&
        choice?.metadata.sourceIndex !== undefined
          ? teamMovementContinuity(
              replay.boardCheckpoints ?? [],
              m.preRoll.checkpointAfter,
              question.metadata.sourceIndex,
              choice.metadata.sourceIndex,
              event.playerId!,
              m.preRoll.actorCell,
              m.preRoll.ordinaryMoveAvailability,
              epochs,
              completedMoves
            )
          : undefined;
      if (terminalCheckpointAfter !== undefined)
        event.contextualBounds = (
          m.rollType === 1
            ? estimateTeamRushMoveBounds
            : estimateTeamDodgeMoveBounds
        )(
          m.preRoll,
          event.actualSuccess,
          (7 - m.difficulty) / 6,
          terminalCheckpointAfter
        );
    }
  }
  attachRetainedRushMoves(retainedRushContexts, ballSources);
  attachKeptDodgeMoves(keptDodgeContexts, ballSources);
  const blockDamage = new Map(damageSteps.map((step) => [step.actionId, step]));
  for (const consequence of blockConsequences) {
    const pool = ballSources.get(consequence.poolSourceId);
    if (!pool?.metadata.block || pool.teamId === "unresolved") continue;
    const selected = ballSources.get(consequence.selectedSourceId);
    if (selected)
      selected.metadata.blockSelection = { face: consequence.selectedFace };
    const damageActionIds = [
      ...consequence.damageActionIds,
      ...(pool.metadata.blockCrowd
        ? [pool.metadata.blockCrowd.damageActionId]
        : [])
    ];
    const linkedDamage = damageActionIds.flatMap((id) =>
      blockDamage.has(id) ? [blockDamage.get(id)!] : []
    );
    pool.metadata.blockResolution = {
      outcome: consequence.outcome,
      skillSourceIds: consequence.skills.map((skill) => skill.sourceId),
      damageActionIds: linkedDamage.map((step) => step.actionId),
      ...summarizeBlockConsequence(pool, linkedDamage)
    };
    for (const skill of consequence.skills) {
      const event = ballSources.get(skill.sourceId);
      if (event)
        event.metadata.skillUsage = { skillId: skill.skillId, used: true };
    }
  }
  attachBlockBallReleases(replay, ballSources, blockConsequences);
  for (const loss of activationLosses) {
    const roll = ballSources.get(loss.rollSourceId),
      skill = ballSources.get(loss.skillSourceId);
    if (!roll || !skill) continue;
    roll.metadata.activationLoss = loss;
    skill.metadata.skillUsage = { skillId: 10, used: true };
    skill.label = "Recorded Foul Appearance use";
    skill.statusReason =
      "Recorded skill use supplies context for the Foul Appearance test.";
    for (const source of [
      loss.declarationSourceId,
      loss.followingActivationSourceId
    ]) {
      const declaration = ballSources.get(source);
      if (declaration) {
        declaration.label =
          declaration.metadata.actionCode === 2
            ? "Recorded Block declaration"
            : "Recorded player activation";
        declaration.statusReason =
          "Recorded declaration supplies action context.";
      }
    }
    roll.label = "Foul Appearance failed; activation lost";
    roll.actualSuccess = false;
    roll.statusReason =
      "The failed Foul Appearance test ended this player's declared Block activation; a different teammate continued in the same recorded team turn.";
  }

  for (const end of activationEnds.values()) {
    const confirmation = ballSources.get(end.sourceId);
    if (!confirmation) continue;
    confirmation.metadata.activationEnd = end;
    confirmation.label = "Recorded teammate activation";
    confirmation.statusReason =
      "This declaration confirms the prior player's activation has ended in the same recorded team turn.";
    if (end.kind === "bone_head" || end.kind === "really_stupid") {
      const name = end.kind === "bone_head" ? "Bone Head" : "Really Stupid";
      const skill = end.skillSourceId
        ? ballSources.get(end.skillSourceId)
        : undefined;
      if (skill) {
        skill.metadata.skillUsage = {
          skillId: end.kind === "bone_head" ? 31 : 51,
          used: true
        };
        skill.label = `Recorded ${name} use`;
      }
      const lonerSkill = end.lonerSkillSourceId
        ? ballSources.get(end.lonerSkillSourceId)
        : undefined;
      if (lonerSkill) {
        const skillId = lonerSkills.get(end.lonerSkillSourceId!);
        if (skillId) lonerSkill.metadata.skillUsage = { skillId, used: true };
        lonerSkill.label = "Recorded Loner use";
      }
      const effect = end.effectSourceId
        ? ballSources.get(end.effectSourceId)
        : undefined;
      if (effect) {
        effect.metadata.recordedEffect = {
          effectId: 44,
          providerId: end.kind === "bone_head" ? 31 : 51,
          providerType: 4,
          durations: [6, 1]
        };
        effect.label = `Recorded ${name} effect`;
      }
      const roll = end.rollSourceId
        ? ballSources.get(end.rollSourceId)
        : undefined;
      if (roll) {
        roll.actualSuccess = false;
        roll.label = `${name} failed; activation and tackle zone lost`;
      }
    }
  }

  for (const [source, end] of mentalEffectEnds) {
    const event = ballSources.get(source);
    if (event) {
      event.metadata.mentalEffectEnd = end;
      event.metadata.recordedEffect = {
        effectId: 44,
        providerType: 4,
        providerId: end.providerSkillId,
        durations: [6, 1]
      };
      event.label = "Recorded mental-trait effect ended";
      event.statusReason =
        "The previous effect ended at this activation. Tackle-zone recovery still needs its own evidence.";
    }
  }
  for (const [source, skillId] of mentalSkillUses) {
    const event = ballSources.get(source);
    if (event) {
      event.metadata.skillUsage = { skillId, used: true };
      event.label = `Recorded ${skillId === 51 ? "Really Stupid" : "Bone Head"} use`;
    }
  }

  for (const [source, resolution] of mentalTraitResults) {
    const event = ballSources.get(source);
    if (event) {
      const { success, ...proof } = resolution;
      event.metadata.mentalTraitResolution = proof;
      event.actualSuccess = success;
      event.label = `${proof.providerSkillId === 51 ? "Really Stupid" : "Bone Head"} ${success ? "passed" : "failed"} its recorded activation test`;
    }
  }

  for (const [source, gamerId] of lonerChoices) {
    const event = ballSources.get(source);
    if (event) {
      event.metadata.teamRerollDecision = { gamerId, used: true };
      event.label = "Recorded team reroll spend";
    }
  }
  for (const [source, skillId] of lonerSkills) {
    const event = ballSources.get(source);
    if (event) {
      event.metadata.skillUsage = { skillId, used: true };
      event.label = `Recorded Loner ${skillId === 1008 ? 3 : 4}+ use`;
    }
  }

  for (const [source, expiry] of driveExpiries) {
    const event = ballSources.get(source),
      phase = ballSources.get(expiry.phaseSourceId);
    if (event && event.teamId === expiry.teamId && phase) {
      event.metadata.driveEffectExpiry = expiry;
      event.metadata.recordedEffect = {
        effectId: 44,
        providerType: 4,
        providerId: expiry.providerSkillId,
        durations: [6, 1]
      };
      event.label = "Recorded drive-end mental effect expiry";
      event.statusReason =
        "The old effect explicitly ended before setup. Setup flags do not establish playable-state availability or defensive coverage.";
      phase.metadata.setupPhase = { code: 3 };
      phase.label = "Recorded setup phase";
    }
  }

  const diceRecords = reconcileDiceEvidence(
    replay,
    events,
    normalizedByRaw,
    diceLinks,
    diceInventory
  );
  const diceByParentPath = new Map(
    diceRecords.map((r) => [JSON.stringify([r.parentSourceId, r.path]), r])
  );
  for (const proof of newTeamDiceIdentities) {
    const final = normalizedByRaw.get(proof.final),
      choice = normalizedByRaw.get(proof.choice),
      original = diceByParentPath.get(
        JSON.stringify([proof.question.id, ["RollInfos", "Dice"]])
      );
    if (!final || !choice || !original || final.scoringStatus !== "excluded")
      continue;
    choice.metadata.teamDiceChoice = {
      questionSourceId: proof.question.id!,
      used: proof.used,
      gamerId: Number(proof.choice.payload!.GamerId) as 0 | 1
    };
    final.metadata.teamDiceIdentity = {
      questionSourceId: proof.question.id!,
      decisionSourceId: proof.choice.id!,
      originalRecordId: original.id,
      teamUsed: proof.used,
      replacementRolled: proof.replacementRolled,
      originalDie: proof.originalDie,
      finalDie: proof.finalDie,
      gateSourceId: proof.gate?.id,
      gatePassed: proof.gatePassed,
      gateSkillId: proof.gateSkill?.payload?.Skill as 44 | 1008 | 50 | undefined
    };
  }
  for (const proof of observedRerollDice) {
    const question = normalizedByRaw.get(proof.question),
      choice = normalizedByRaw.get(proof.choice),
      final = normalizedByRaw.get(proof.final);
    const originalRecord = diceByParentPath.get(
      JSON.stringify([proof.question.id, proof.originalPath])
    );
    if (!question || !choice || !final || !originalRecord) continue;
    for (const row of [question, choice, final]) {
      if (row.scoringStatus !== "excluded") continue;
      row.teamId = proof.teamId;
      row.teamName = teamNameById.get(proof.teamId) ?? proof.teamId;
      row.statusReason =
        "excluded: observed source-linked reroll has no accepted probability/value contract";
    }
    question.metadata.observedRerollOffer = {
      kind: proof.kind,
      ruleId: proof.ruleId,
      gamerId: proof.gamerId,
      originalRecordId: originalRecord.id
    };
    choice.metadata.observedRerollChoice = {
      kind: proof.kind,
      ruleId: proof.ruleId,
      used: proof.used,
      questionSourceId: proof.question.id!
    };
    final.metadata.observedReroll = {
      kind: proof.kind,
      ruleId: proof.ruleId,
      used: proof.used,
      questionSourceId: proof.question.id!,
      decisionSourceId: proof.choice.id!,
      ownershipCheckpointAfter: proof.ownershipCheckpointAfter,
      originalRecordId: originalRecord.id,
      originalDie: proof.originalDie,
      finalDie: proof.finalDie
    };
    for (const raw of proof.duplicates) {
      const duplicate = normalizedByRaw.get(raw);
      if (duplicate) {
        duplicate.metadata.isRollCandidate = false;
        duplicate.metadata.repeatedDiceSourceId = proof.final.id;
        duplicate.statusReason =
          "excluded: repeated terminal reroll summary in the same action";
      }
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
    diceParentCount:
      replay.turns.reduce((n, t) => n + t.events.length, 0) +
      new Set(
        diceRecords
          .filter((r) => r.parentKind === "snapshot")
          .map((r) => r.parentSourceId)
      ).size,
    sourceRecordCount: replay.turns.reduce(
      (count, turn) => count + turn.events.length,
      0
    ),
    denominatorDescription:
      "Roll candidates include unsupported outcomes and randomizers after known summary/policy grouping. Raw dice records are separately reconciled; unresolved identities are disclosed. Neither percentage is whole-match confidence.",
    diceRecords: summarizeDiceRecords(diceRecords),
    modelVersion: "dice-evidence-2" as const,
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
    rollFamilies: summarizeRollFamilies(events, diceRecords),
    contextEvidence: summarizeContextEvidence(events),
    scoredByType,
    excludedByType,
    excludedByReason: Object.fromEntries(
      Array.from(excludedByReason.entries()).sort((a, b) => b[1] - a[1])
    )
  } satisfies LuckReport["coverage"];
  const recruitments = observeRecruitmentPurchases(replay);
  const idSeed = `${replay.matchId}:${JSON.stringify({ events, recruitments })}`;

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    modelVersion: DICE_MODEL_VERSION,
    contextModelVersion: CONTEXT_MODEL_VERSION,
    limitations: [
      "Supported source and dice policies are scoped to their evidence; unknown variants remain unscored.",
      "Block scoring measures linked raw symbol pools; skill-adjusted resolution and unsupported damage variants are retained as evidence.",
      "Categorical injury luck scores a qualified initial unmodified table, separately from treatment, recovery and match impact.",
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
    diceRecords,
    coverage,
    damageSteps,
    contextComponents: summarizeContextComponents(events, [
      homeAggregate.teamId,
      awayAggregate.teamId
    ]) as LuckReport["contextComponents"],
    recruitments,
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
