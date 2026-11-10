import type { ReplayEvent } from "@/domain/replay/types";

export type RegenerationEvidence = {
  subject: string;
  success: boolean;
  casualtySourceId: string;
  initialRemovalSourceId: string;
  skillUseSourceId: string;
};

function isD(value: unknown, kind: number, sides: number): boolean {
  const die = value as { DieType?: unknown; Value?: unknown } | undefined;
  return (
    die?.DieType === kind &&
    Number.isInteger(die.Value) &&
    Number(die.Value) >= 1 &&
    Number(die.Value) <= sides
  );
}

// UI-054/068 and demo UI-086 independently identify this post-casualty
// skill and die. Its chance is conditional on the recorded casualty, and
// neither the initial removal nor the recovered player's later state is a die.
export function linkRegeneration(
  events: readonly ReplayEvent[],
  version: string | undefined
): Map<number, RegenerationEvidence> {
  const evidence = new Map<number, RegenerationEvidence>();
  if (version !== "1-4-0-0") return evidence;
  const occurrences = new Map<string, number>();
  for (const event of events) {
    if (
      event.sourceTag !== "ResultRoll" ||
      event.rollType !== 46 ||
      !event.actionId
    )
      continue;
    occurrences.set(event.actionId, (occurrences.get(event.actionId) ?? 0) + 1);
  }
  for (const [index, event] of events.entries()) {
    const subject = event.stepActorId;
    const roll = event.payload;
    if (
      event.sourceTag !== "ResultRoll" ||
      event.rollType !== 46 ||
      !event.actionId ||
      occurrences.get(event.actionId) !== 1 ||
      !subject ||
      (event.damageSource !== 1 && event.damageSource !== 11) ||
      roll?.Status !== 1 ||
      roll.NewRoll !== 1 ||
      roll.Requirement !== 4 ||
      roll.Difficulty !== 4 ||
      (roll.Modifiers !== undefined && roll.Modifiers !== "")
    )
      continue;
    const die = (
      roll.Dice as { Die?: { DieType?: number; Value?: number } } | undefined
    )?.Die;
    if (!isD(die, 0, 6) || roll.Outcome !== Number(Number(die?.Value) >= 4))
      continue;

    const casualty = events[index - 3];
    const removal = events[index - 2];
    const skill = events[index - 1];
    if (
      !casualty?.id ||
      !removal?.id ||
      !skill?.id ||
      casualty.sourceTag !== "ResultCasualtyRoll" ||
      casualty.rollType !== 12 ||
      casualty.payload?.Source !== event.damageSource ||
      casualty.payload.Status !== 1 ||
      !Number.isInteger(casualty.payload.Outcome) ||
      Number(casualty.payload.Outcome) < 1 ||
      Number(casualty.payload.Outcome) > 10 ||
      removal.sourceTag !== "ResultPlayerRemoval" ||
      String(removal.payload?.PlayerId) !== subject ||
      removal.payload?.Situation !== 4 ||
      removal.payload.Status !== 4 ||
      removal.payload.Reason !== 0 ||
      skill.sourceTag !== "ResultSkillUsage" ||
      String(skill.payload?.PlayerId) !== subject ||
      skill.payload?.Skill !== 19 ||
      skill.payload.Used !== 1
    )
      continue;
    const rawCasualtyDice = (
      casualty.payload.Dice as { Die?: unknown } | undefined
    )?.Die;
    const casualtyDice = Array.isArray(rawCasualtyDice)
      ? rawCasualtyDice
      : [rawCasualtyDice];
    if (
      casualtyDice.length > 2 ||
      !isD(casualtyDice[0], 4, 16) ||
      (casualtyDice.length === 2 && !isD(casualtyDice[1], 0, 6))
    )
      continue;
    if (
      [casualty, removal, skill, event].some(
        (item) =>
          item.actionId !== event.actionId ||
          item.stepTag !== "DamageStep" ||
          item.stepType !== 2 ||
          item.damageSource !== event.damageSource ||
          item.stepActorId !== subject ||
          item.stepTargetId !== subject ||
          item.playerId !== subject ||
          item.targetId !== subject ||
          item.attributionConflict ||
          (item.actorTeamId &&
            event.actorTeamId &&
            item.actorTeamId !== event.actorTeamId)
      )
    )
      continue;

    evidence.set(index, {
      subject,
      success: roll.Outcome === 1,
      casualtySourceId: casualty.id,
      initialRemovalSourceId: removal.id,
      skillUseSourceId: skill.id
    });
  }
  return evidence;
}
