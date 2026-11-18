import type { findFoulAppearanceChecks } from "@/domain/replay/foulAppearance";
import { LUCK_CATEGORY_WEIGHTS } from "./constants";
import type { LuckEvent, LuckReport } from "./types";

type Checks = ReturnType<typeof findFoulAppearanceChecks>;
const chance = 5 / 6;

export function scoreFoulAppearance(event: LuckEvent, checks: Checks) {
  const check = checks.get(event.metadata.sourceId ?? "");
  if (!check || event.teamId !== check.attacker.teamId) return;
  const {
    attacker,
    defender,
    skillSourceId,
    triggerSourceId,
    previousBlockSourceId,
    passed
  } = check;
  const delta = Number(passed) - chance;
  const weight = LUCK_CATEGORY_WEIGHTS.activation_check;
  event.type = "activation_check";
  event.scoringStatus = "scored";
  event.actualSuccess = passed;
  event.probabilitySuccess = chance;
  event.delta = delta;
  event.weightedDelta = delta * weight;
  event.tags = passed ? [] : ["shaftaroonie"];
  event.label = `Foul Appearance ${passed ? "passed" : "failed"}`;
  event.statusReason =
    "Verified fresh Foul Appearance check from the attacking team's perspective.";
  event.metadata.probabilityPolicy = "single_attempt";
  event.metadata.ownership = { ...attacker, role: "actor", defender };
  event.metadata.foulAppearance = {
    defenderId: defender.playerId,
    skillSourceId,
    triggerSourceId,
    previousBlockSourceId
  };
  event.explainability = {
    target: "Foul Appearance 2+",
    baseOdds: chance,
    rerollAdjustedOdds: chance,
    weight,
    formulaSummary: `(${Number(passed)} - 5/6) × ${weight}`,
    inputsSummary: `Player ${event.playerId} rolled ${event.metadata.dice?.[0]} and needed 2+ to get past player ${defender.playerId}'s Foul Appearance${previousBlockSourceId ? " on the second Frenzy block" : ""}. This scores the gate. Any block dice or lost activation have their own replay evidence.`
  };
}

export function validReportedFoulAppearance(
  event: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  die: LuckReport["diceRecords"][number] | undefined
) {
  const m = event.metadata;
  const proof = m.foulAppearance;
  if (!proof) return !(m.rollType === 37 && event.scoringStatus === "scored");
  const defender = m.ownership?.defender;
  const skill = sources.get(proof.skillSourceId);
  const trigger = sources.get(proof.triggerSourceId);
  const previous = sources.get(proof.previousBlockSourceId ?? "");
  const at = m.locator;
  const stepMatches = (part: LuckEvent, messageIndex: number) =>
    part.metadata.sourceIndex === m.sourceIndex! - (2 - messageIndex) &&
    part.metadata.sourceTag !== m.sourceTag &&
    part.metadata.actionId === m.actionId &&
    part.metadata.sequenceId === m.sequenceId &&
    part.metadata.stepType === m.stepType &&
    part.metadata.locator?.replayStep === at?.replayStep &&
    part.metadata.locator?.childIndex === at?.childIndex &&
    part.metadata.locator?.stepIndex === at?.stepIndex &&
    part.metadata.locator?.messageIndex === messageIndex &&
    part.scoringStatus === "excluded" &&
    part.metadata.isRollCandidate === false;
  const face = m.dice?.[0];
  return (
    m.sourceTag === "ResultRoll" &&
    m.rollType === 37 &&
    m.isRollCandidate === true &&
    m.probabilityPolicy === "single_attempt" &&
    event.type === "activation_check" &&
    event.scoringStatus === "scored" &&
    !m.activationCheck &&
    !m.numericRetryAccess &&
    !m.rerollDraws &&
    event.playerId !== proof.defenderId &&
    m.targetId === proof.defenderId &&
    m.ownership?.role === "actor" &&
    defender?.playerId === proof.defenderId &&
    defender.teamId !== event.teamId &&
    m.requirement === 2 &&
    m.difficulty === 2 &&
    m.modifiers?.length === 0 &&
    m.modifiersSum === 0 &&
    m.dice?.length === 1 &&
    m.dieTypes?.join() === "0" &&
    typeof face === "number" &&
    Number.isInteger(face) &&
    face >= 1 &&
    face <= 6 &&
    m.outcomeCode === Number(face >= 2) &&
    event.actualSuccess === face >= 2 &&
    event.probabilitySuccess === chance &&
    event.explainability.baseOdds === chance &&
    event.explainability.rerollAdjustedOdds === chance &&
    !!m.actionId &&
    !!m.sequenceId &&
    m.sourceIndex !== undefined &&
    at?.replayStep !== undefined &&
    at.childIndex !== undefined &&
    at.messageIndex === 2 &&
    !!skill &&
    stepMatches(skill, 1) &&
    skill.metadata.sourceTag === "ResultSkillUsage" &&
    skill.playerId === defender.playerId &&
    skill.teamId === defender.teamId &&
    skill.metadata.skillUsage?.skillId === 10 &&
    skill.metadata.skillUsage.used &&
    !!trigger &&
    stepMatches(trigger, 0) &&
    trigger.playerId === event.playerId &&
    trigger.teamId === event.teamId &&
    (proof.previousBlockSourceId === undefined
      ? m.stepType === 0 &&
        at.stepIndex === 0 &&
        trigger.metadata.sourceTag === "ResultUseAction" &&
        (trigger.metadata.actionCode === 2 || trigger.metadata.actionCode === 3)
      : m.stepType === 6 &&
        at.stepIndex === 1 &&
        trigger.metadata.sourceTag === "ResultSkillUsage" &&
        trigger.metadata.skillUsage?.skillId === 36 &&
        trigger.metadata.skillUsage.used &&
        previous?.metadata.sourceTag === "ResultBlockOutcome" &&
        previous.playerId === event.playerId &&
        previous.teamId === event.teamId &&
        previous.metadata.targetId === proof.defenderId &&
        previous.metadata.stepType === 6 && previous.metadata.outcomeCode === 4 &&
        previous.metadata.sequenceId === m.sequenceId &&
        !!previous.metadata.actionId && previous.metadata.actionId !== m.actionId &&
        previous.metadata.locator?.replayStep === at.replayStep &&
        previous.metadata.locator?.childIndex === at.childIndex &&
        previous.metadata.locator?.stepIndex === 0 &&
        previous.metadata.locator?.messageIndex === 2 &&
        previous.metadata.sourceIndex === m.sourceIndex - 5) &&
    die?.parentEventId === event.id &&
    die.eventId === event.id &&
    die.disposition === "covered_roll" &&
    !die.aliasOf &&
    die.status === 1 &&
    die.newRoll === 1 &&
    die.path.join() === "Dice" &&
    die.rollType === 37 &&
    die.stepActorId === event.playerId &&
    die.stepTargetId === defender.playerId &&
    die.dice.length === 1 &&
    die.dice[0]?.value === face &&
    die.dice[0]?.dieType === 0 &&
    !event.contextualImpact &&
    !event.contextualBounds &&
    !event.possessionBounds &&
    !event.catchPossessionBounds
  );
}
