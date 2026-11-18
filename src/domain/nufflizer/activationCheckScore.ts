import {
  readActivationDie,
  type ActivationDraw
} from "@/domain/replay/activationChecks";
import { ACTIVATION_ROLL_TYPE } from "@/domain/replay/mentalEffects";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import type { ReplayEvent } from "@/domain/replay/types";
import { LUCK_CATEGORY_WEIGHTS } from "./constants";
import type { TeamDiceIdentity } from "./diceIdentityLinks";
import type { LuckEvent, LuckReport } from "./types";

export const ACTIVATION_SKILL_NAME = {
  31: "Bone Head",
  51: "Really Stupid",
  84: "Animal Savagery"
} as const;

export function linkActivationRerolls(
  identities: Iterable<TeamDiceIdentity>,
  checks: Map<string, ActivationDraw>,
  sources: ReadonlyMap<string | undefined, ReplayEvent>,
  owners: OwnershipTimeline
) {
  const linked = new Set<string>();
  for (const identity of identities) {
    const {
      question,
      choice,
      gate,
      gateSkill,
      final,
      used,
      replacementRolled
    } = identity;
    const initial = checks.get(question.id!);
    if (
      !initial ||
      initial.evidence.draw !== "original" ||
      identity.directOriginal
    )
      continue;
    const at = question.locator!;
    const header = sources.get(
      `source-${question.sourceIndex! - at.messageIndex! - 1}`
    );
    const resumed = sources.get(`source-${choice.sourceIndex! - 1}`);
    if (!header || !resumed) continue;
    const animalSavagery = initial.evidence.skillId === 84;
    const actor = question.playerId!;
    const team = initial.owner.teamId;
    const steps = [
      resumed,
      choice,
      ...(gateSkill && gate ? [gateSkill, gate] : []),
      final
    ];
    if (
      resumed.sourceTag !== "PlayerStep" ||
      resumed.payload?.Skill !== 0 ||
      resumed.payload?.IsEvaluation !== 0 ||
      (resumed.payload?.State !== 2 &&
        resumed.payload?.State !== 3 &&
        !(animalSavagery && resumed.payload?.State === 1)) ||
      (animalSavagery && used) ||
      JSON.stringify(resumed.payload?.CellTo) !==
        JSON.stringify(header.payload?.CellTo) ||
      resumed.locator?.replayStep !== at.replayStep! + 1 ||
      resumed.locator.childIndex !== at.childIndex ||
      resumed.locator.stepIndex !== 0 ||
      choice.gamerId !== team ||
      used !== Boolean(gate && gateSkill) ||
      (gateSkill && ![44, 1008].includes(Number(gateSkill.payload?.Skill))) ||
      steps.some(
        (part, i) =>
          part.sourceIndex !== resumed.sourceIndex! + i ||
          part.id !== `source-${part.sourceIndex}` ||
          part.playerId !== actor ||
          part.stepActorId !== actor ||
          part.stepTargetId !== question.stepTargetId ||
          part.actionId !== resumed.actionId ||
          part.sequenceId !== resumed.sequenceId ||
          part.locator?.replayStep !== resumed.locator?.replayStep ||
          part.locator?.childIndex !== at.childIndex ||
          part.locator?.stepIndex !== 0 ||
          part.locator?.messageIndex !== (i === 0 ? undefined : i - 1) ||
          part.attributionConflict ||
          part.executionExclusion ||
          (part.teamId !== undefined && part.teamId !== team) ||
          (part.actorTeamId !== undefined &&
            part.actorTeamSource !== "turn_inferred" &&
            part.actorTeamId !== team)
      )
    )
      continue;
    const owner = owners.resolve(actor, final);
    if (owner.status !== "confirmed" || owner.proof.teamId !== team) continue;
    const die = readActivationDie(
      final,
      final.payload,
      initial.evidence.skillId,
      replacementRolled ? 2 : 1,
      replacementRolled ? 1 : 0,
      owners,
      team
    );
    if (
      !die ||
      die.target !== initial.target ||
      die.assistantId !== initial.evidence.assistantId ||
      (!replacementRolled && (die.passed || die.face !== initial.face))
    )
      continue;
    linked.add(question.id!);
    if (replacementRolled)
      checks.set(final.id!, {
        ...die,
        owner: owner.proof,
        evidence: { ...initial.evidence, draw: "replacement" }
      });
  }
  return linked;
}

export function scoreActivationCheck(
  event: LuckEvent,
  checks: ReadonlyMap<string, ActivationDraw>
) {
  const check = checks.get(event.metadata.sourceId ?? "");
  if (!check || event.teamId !== check.owner.teamId) return;
  const { evidence, target, passed, face } = check;
  const name = ACTIVATION_SKILL_NAME[evidence.skillId];
  const chance = (7 - target) / 6;
  const delta = Number(passed) - chance;
  const weight = LUCK_CATEGORY_WEIGHTS.activation_check;
  event.type = "activation_check";
  event.scoringStatus = "scored";
  event.probabilitySuccess = chance;
  event.actualSuccess = passed;
  event.delta = delta;
  event.weightedDelta = delta * weight;
  const attempt =
    evidence.draw === "original"
      ? " first die"
      : evidence.draw === "replacement"
        ? " replacement"
        : "";
  event.label = `${name}${attempt} ${passed ? "passed" : "failed"}`;
  event.statusReason =
    "Verified fresh activation check from the acting team's perspective.";
  event.tags = !passed && chance >= 0.7 ? ["shaftaroonie"] : [];
  event.metadata.activationCheck = evidence;
  event.metadata.ownership = { ...check.owner, role: "actor" };
  event.metadata.probabilityPolicy = "single_attempt";
  if (evidence.draw === "original") {
    const m = event.metadata;
    m.isRollCandidate = true;
    m.rollType = ACTIVATION_ROLL_TYPE[evidence.skillId];
    m.rollLabel = name.toLowerCase().replace(/ /g, "_");
    m.requirement = evidence.skillId === 31 ? 2 : 4;
    m.difficulty = target;
    m.outcomeCode = Number(passed);
    m.dice = [face];
    m.dieTypes = [0];
    m.modifiersSum = evidence.skillId !== 31 && target === 2 ? 2 : 0;
    m.modifiers = m.modifiersSum ? [m.modifiersSum] : [];
    m.normalizationFlags = m.normalizationFlags?.filter(
      (flag) => flag !== "missing_target_threshold"
    );
    m.normalizationNotes = m.normalizationNotes?.filter(
      (note) => note !== "difficulty and requirement were both missing"
    );
  }
  event.explainability = {
    target: `${name} ${target}+`,
    baseOdds: chance,
    rerollAdjustedOdds: chance,
    weight,
    formulaSummary: `(${Number(passed)} - ${7 - target}/6) × ${weight}`,
    inputsSummary: `Player ${event.playerId} rolled ${face} and needed ${target}+.${
      evidence.assistantId !== undefined
        ? ` Recorded help from teammate ${evidence.assistantId} lowered the target from 4+ to 2+.`
        : evidence.skillId === 84 && target === 2
          ? " The declared Block or Blitz lowered the target from 4+ to 2+."
          : ""
    }${
      evidence.draw === "original"
        ? " This is the first die recorded in the reroll question."
        : evidence.draw === "replacement"
          ? " This is the fresh replacement after Loner passed."
          : ""
    } The contribution measures this one die. Any later action or position comes from further replay evidence.`
  };
}

export function validReportedActivationCheck(
  event: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  die: LuckReport["diceRecords"][number] | undefined
) {
  const m = event.metadata;
  const proof = m.activationCheck;
  if (!proof)
    return (
      (event.type !== "activation_check" ||
        !!m.foulAppearance ||
        m.numericRetryAccess?.terminalSourceId !== undefined) &&
      !(
        event.scoringStatus === "scored" &&
        (m.sourceTag === "ResultRoll" ||
          m.sourceTag === "QuestionTeamRerollUsage") &&
        (m.rollType === 33 || m.rollType === 34 || m.rollType === 36)
      )
    );
  const declaration = sources.get(proof.declarationSourceId);
  const skill = sources.get(proof.skillSourceId);
  const teamRoll = m.teamDiceIdentity;
  const replacement = proof.draw === "replacement";
  const firstInQuestion = proof.draw === "original";
  const origin = replacement
    ? sources.get(teamRoll?.questionSourceId ?? "")
    : event;
  const anchor = origin?.metadata;
  const at = anchor?.locator;
  const resumeAt = m.locator;
  const target = m.difficulty;
  const action = declaration?.metadata.actionCode;
  const attack = action === 2 || action === 3;
  const expectedTarget =
    proof.skillId === 31 ||
    proof.assistantId !== undefined ||
    (proof.skillId === 84 && attack)
      ? 2
      : 4;
  const face = m.dice?.[0];
  const passed = typeof face === "number" && face >= expectedTarget;
  const chance = (7 - expectedTarget) / 6;
  const sameStep = (part: LuckEvent, messageIndex: number) =>
    part.metadata.actionId === anchor?.actionId &&
    part.metadata.sequenceId === anchor?.sequenceId &&
    part.metadata.locator?.replayStep === at?.replayStep &&
    part.metadata.locator?.childIndex === at?.childIndex &&
    part.metadata.locator?.stepIndex === 0 &&
    part.metadata.locator?.messageIndex === messageIndex &&
    part.metadata.sourceIndex ===
      anchor!.sourceIndex! - at!.messageIndex! + messageIndex &&
    part.scoringStatus === "excluded" &&
    !part.metadata.isRollCandidate &&
    part.playerId === event.playerId &&
    part.teamId === event.teamId;
  return (
    event.type === "activation_check" &&
    event.scoringStatus === "scored" &&
    m.sourceTag ===
      (firstInQuestion ? "QuestionTeamRerollUsage" : "ResultRoll") &&
    m.stepType === 0 &&
    m.isRollCandidate === true &&
    m.probabilityPolicy === "single_attempt" &&
    m.rollType === ACTIVATION_ROLL_TYPE[proof.skillId] &&
    m.requirement === (proof.skillId === 31 ? 2 : 4) &&
    target === expectedTarget &&
    m.modifiers?.join() === (proof.skillId !== 31 && target === 2 ? "2" : "") &&
    (proof.assistantId === undefined ||
      (proof.skillId === 51 &&
        /^\d+$/.test(proof.assistantId) &&
        proof.assistantId !== event.playerId)) &&
    m.dice?.length === 1 &&
    typeof face === "number" &&
    Number.isInteger(face) &&
    face >= 1 &&
    face <= 6 &&
    m.dieTypes?.join() === "0" &&
    m.outcomeCode === Number(passed) &&
    event.actualSuccess === passed &&
    event.probabilitySuccess === chance &&
    event.explainability.baseOdds === chance &&
    event.explainability.rerollAdjustedOdds === chance &&
    event.delta === Number(event.actualSuccess) - chance &&
    event.explainability.weight === LUCK_CATEGORY_WEIGHTS.activation_check &&
    event.weightedDelta === event.delta * event.explainability.weight &&
    m.ownership?.role === "actor" &&
    !!m.actionId &&
    !!m.sequenceId &&
    m.sourceIndex !== undefined &&
    anchor?.sourceIndex !== undefined &&
    at?.replayStep !== undefined &&
    at.childIndex !== undefined &&
    at.stepIndex === 0 &&
    (at.messageIndex === 2 || at.messageIndex === 3) &&
    !!declaration &&
    sameStep(declaration, 0) &&
    declaration.metadata.sourceTag === "ResultUseAction" &&
    [1, 2, 3, 4, 5, 6].includes(declaration.metadata.actionCode ?? 0) &&
    (proof.skillId !== 84 ||
      (!replacement &&
        (attack
          ? !!m.targetId && m.targetId !== "-1"
          : action === 1 && m.targetId === "-1"))) &&
    !!skill &&
    sameStep(skill, at.messageIndex - 1) &&
    skill.metadata.sourceTag === "ResultSkillUsage" &&
    skill.metadata.skillUsage?.skillId === proof.skillId &&
    skill.metadata.skillUsage.used &&
    (!firstInQuestion ||
      (!passed &&
        m.recordedRerollOffer?.rollType === m.rollType &&
        String(m.recordedRerollOffer.gamerId) === event.teamId &&
        m.recordedRerollOffer.teamAvailable === true &&
        m.recordedRerollOffer.proAvailable === false)) &&
    (!replacement ||
      (!!teamRoll?.teamUsed &&
        teamRoll.replacementRolled &&
        teamRoll.gatePassed === true &&
        (teamRoll.gateSkillId === 44 || teamRoll.gateSkillId === 1008) &&
        origin?.teamId === event.teamId &&
        origin.playerId === event.playerId &&
        origin.scoringStatus === "scored" &&
        anchor?.activationCheck?.draw === "original" &&
        anchor.activationCheck.skillId === proof.skillId &&
        anchor.activationCheck.assistantId === proof.assistantId &&
        anchor.activationCheck.skillSourceId === proof.skillSourceId &&
        anchor.activationCheck.declarationSourceId ===
          proof.declarationSourceId &&
        anchor.difficulty === m.difficulty &&
        anchor.targetId === m.targetId &&
        resumeAt?.replayStep === at.replayStep + 1 &&
        resumeAt.childIndex === at.childIndex &&
        resumeAt.stepIndex === 0 &&
        resumeAt.messageIndex === 3)) &&
    die?.disposition === "covered_roll" &&
    die.eventId === event.id &&
    die.parentEventId === event.id &&
    die.path.join() === (firstInQuestion ? "RollInfos,Dice" : "Dice") &&
    die.status === (replacement ? 2 : 1) &&
    die.newRoll === 1 &&
    die.rollType === m.rollType &&
    die.stepActorId === event.playerId &&
    die.dice.length === 1 &&
    die.dice[0]?.value === face &&
    die.dice[0]?.dieType === 0 &&
    !die.aliasOf &&
    !event.contextualImpact &&
    !event.contextualBounds &&
    !event.possessionBounds &&
    !event.catchPossessionBounds
  );
}
