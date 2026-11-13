import type { ReplayEvent } from "./types";

// These transitions do not rewrite intrinsic player skill lists. Effects,
// transformations, purchases/removals and unknown messages have separate
// invalidation barriers below. This is not general snapshot field inheritance.
const nonMutating = new Set([
  "Carrier",
  "EventMatchStart",
  "EventFanFactor",
  "EventWeatherRoll",
  "EventJourneyMen",
  "EventInducementsData",
  "EventNewInducementsTurn",
  "EventActiveGamerChanged",
  "EventPauseActiveTimer",
  "EventActiveTimerChanged",
  "EventGamersAreReady",
  "EventStartActiveTimer",
  "EventRulesEngineStandBy",
  "EventAddInducement",
  "EventRemoveInducement",
  "EventEndInducements",
  "EventNewGamePhase",
  "EventQuestionKickingChoice",
  "EventKickingChoice",
  "EventSetupMovePitchPlayer",
  "EventSetupBringPlayerOn",
  "EventSetupTakePlayerOut",
  "EventSetupSubstitutePlayers",
  "EventQuickSnapMove",
  "EventTimeOut",
  "EventBrilliantCoaching",
  "EventCheeringFans",
  "EventBlitz",
  "EventQuestionHighKick",
  "EventHighKick",
  "EventEndTurn",
  "EventSetUpConfiguration",
  "EventLegalKickers",
  "EventKickOffTable",
  "EventQuestionSolidDefence",
  "EventSolidDefence",
  "EventQuestionQuickSnap",
  "EventQuickSnap",
  "EventMatchEnd",
  "EventGameFinished",
  "EventTouchdown",
  "BallStep",
  "ResultRoll",
  "ResultDoMove",
  "ResultMoveOutcome",
  "ResultNoRollSuccess",
  "ResultStandUp",
  "QuestionBlockDice",
  "ResultBlockRoll",
  "ResultBlockOutcome",
  "QuestionBlockSkillUsage",
  "QuestionPushBack",
  "ResultPushBack",
  "QuestionFollowUp",
  "ResultFollowUp",
  "QuestionTeamRerollUsage",
  "ResultTeamRerollUsage",
  "QuestionProUsage",
  "QuestionDodgeUsage",
  "QuestionTouchBack",
  "ResultTouchBack",
  "ResultInjuryRoll",
  "ResultCasualtyRoll",
  "QuestionKORecovery",
  "QuestionApothecaryCasualtyUsage",
  "QuestionApothecaryInjuryUsage",
  "ResultApothecaryUsage",
  "QuestionCatchUsage",
  "QuestionSureHandsUsage"
]);
const passiveUses = new Set([
  6, 7, 13, 15, 19, 27, 30, 38, 44, 50, 57, 61, 63, 68, 75, 81, 1008
]);
export function preservesTraitContinuity(e: ReplayEvent) {
  if (e.attributionConflict) return false;
  if (e.sourceTag === "PlayerStep")
    return (
      e.payload?.Skill === 0 &&
      e.payload.IsEvaluation === 0 &&
      e.stepType !== undefined &&
      [0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 29, 35].includes(e.stepType)
    );
  if (e.sourceTag === "DamageStep")
    return e.payload?.Skill === 0 && e.payload.IsEvaluation === 0;
  if (e.sourceTag === "ResultUseAction")
    return (
      e.actionCode !== undefined && [1, 2, 3, 4, 5, 6].includes(e.actionCode)
    );
  if (e.sourceTag === "ResultSkillUsage")
    return (
      passiveUses.has(Number(e.payload?.Skill)) &&
      [0, 1].includes(Number(e.payload?.Used))
    );
  return nonMutating.has(e.sourceTag);
}
