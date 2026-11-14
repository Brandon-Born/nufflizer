import type { ReplayEvent } from "./types";
import { recordedMentalEffect } from "./mentalEffects";
import { isInertReplayControl } from "./inertControls";

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
// These source-specific uses affect a test, displacement or follow-up, not
// learned skill lists. This does not grant their effective gameplay policy.
// BB2020 action/position/damage skills (pp75–87), individually source-linked
// in INJURY_TRANSACTION_EVIDENCE. Their uses do not replace learned lists.
// Physical effects, removals, prayers, transformations and unknown messages
// still have their independent invalidation barriers.
const intrinsicOnlyUses = new Set([
  10, 31, 35, 36, 51, 56,
  17, 18, 23, 25, 26, 37, 41, 47, 55, 64, 71, 84, 95, 97, 1009
]);
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function playerNumber(value: unknown): number | undefined {
  if (typeof value === "string" && /^(0|[1-9]\d{0,15})$/.test(value))
    value = Number(value);
  return integer(value) ? value : undefined;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function listedPlayers(value: unknown) {
  const list = record(value);
  if (!list || Object.keys(list).some((key) => key !== "PlayersItem"))
    return false;
  const items = Array.isArray(list.PlayersItem)
    ? list.PlayersItem
    : [list.PlayersItem];
  if (!items.length || items.length > 64) return false;
  const ids = items.map(playerNumber);
  return (
    ids.every((id) => id !== undefined) && new Set(ids).size === items.length
  );
}

// A fully recognized Confused effect cannot rewrite anyone else's skills.
// Its holder is still invalidated: an effect end alone does not prove restored
// eligibility or recover an earlier seed. Other effect shapes remain barriers.
export function scopedTraitEffectPlayer(e: ReplayEvent): string | undefined {
  const p = e.payload;
  if (
    e.attributionConflict ||
    !["EventAddPlayerEffect", "EventEndPlayerEffect"].includes(e.sourceTag) ||
    !p ||
    !Object.keys(p).every((key) => key === "PlayerId" || key === "Effect") ||
    playerNumber(p.PlayerId) === undefined ||
    !recordedMentalEffect(p.Effect)
  )
    return;
  return String(p.PlayerId);
}
export function preservesTraitContinuity(e: ReplayEvent) {
  if (e.attributionConflict) return false;
  if(["Clock","EventPauseActiveTimer","EventActiveTimerChanged","EventGamersAreReady","EventStartActiveTimer"].includes(e.sourceTag))return isInertReplayControl(e);
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
      !!e.payload &&
      (passiveUses.has(e.payload.Skill as number) ||
        intrinsicOnlyUses.has(e.payload.Skill as number)) &&
      integer(e.payload.PlayerId) &&
      [0, 1].includes(e.payload.Used as number) &&
      Object.keys(e.payload).every((key) =>
        ["PlayerId", "Skill", "Used"].includes(key)
      )
    );
  if (e.sourceTag === "ResultGainSpp")
    return (
      !!e.payload &&
      integer(e.payload.PlayerId) &&
      integer(e.payload.SppGained) &&
      Object.keys(e.payload).every(
        (key) => key === "PlayerId" || key === "SppGained"
      )
    );
  if (e.sourceTag === "EventFaceUpStunnedPlayers")
    return (
      !!e.payload &&
      e.payload.PitchRolls === "" &&
      listedPlayers(e.payload.Players) &&
      Object.keys(e.payload).every(
        (key) => key === "PitchRolls" || key === "Players"
      )
    );
  return nonMutating.has(e.sourceTag);
}
