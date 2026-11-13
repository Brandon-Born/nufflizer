import { ownerAt, type OwnershipLookup } from "@/domain/replay/ownershipTimeline";
import type { ReplayEvent } from "@/domain/replay/types";

export type EmbeddedInjuryRecord = {
  roll?: Record<string, unknown>;
  observed: boolean;
  repeatedOriginalId?: string;
};

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function observedInjury(roll: Record<string, unknown> | undefined) {
  const dice = object(roll?.Dice)?.Die;
  return (
    roll?.RollType === 11 &&
    roll.Status === 1 &&
    Number.isInteger(roll.Outcome) &&
    Number(roll.Outcome) >= 0 &&
    Number(roll.Outcome) <= 10 &&
    Array.isArray(dice) &&
    dice.length === 2 &&
    dice.every((value) => {
      const die = object(value);
      return (
        die?.DieType === 0 &&
        Number.isInteger(die.Value) &&
        Number(die.Value) >= 1 &&
        Number(die.Value) <= 6
      );
    })
  );
}

function key(roll: Record<string, unknown>) {
  return JSON.stringify([
    roll.RollType,
    roll.Status,
    roll.Source,
    roll.Dice,
    roll.Outcome,
    roll.Modifiers ?? null
  ]);
}

// UI-025: the question carries the original injury, not a KO recovery die.
// Only an exact earlier direct injury in the same uniquely owned damage step
// establishes a repeated original. Unknown nested data stays visible.
export function retainEmbeddedInjuries(
  events: readonly ReplayEvent[],
  replayVersion: string | undefined,
  owners: OwnershipLookup
): Map<number, EmbeddedInjuryRecord> {
  const records = new Map<number, EmbeddedInjuryRecord>();
  let actionId: string | undefined;
  const direct = new Map<string, string>();
  for (const [index, event] of events.entries()) {
    if (event.actionId !== actionId) {
      actionId = event.actionId;
      direct.clear();
    }
    const embedded = event.sourceTag === "QuestionKORecovery";
    const roll = embedded ? object(event.payload?.RollInfos) : event.payload;
    const observed =
      replayVersion === "1-4-0-0" && Boolean(observedInjury(roll));
    const subject = event.stepActorId;
    const owner = subject ? ownerAt(owners,subject,event) : undefined;
    const linked =
      observed &&
      event.stepTag === "DamageStep" &&
      event.stepType === 2 &&
      actionId &&
      subject &&
      subject !== "-1" &&
      subject === event.stepTargetId &&
      subject === event.playerId &&
      subject === event.targetId &&
      owner &&
      owner === event.actorTeamId &&
      (!event.teamId || owner === event.teamId) &&
      !event.attributionConflict &&
      event.damageSource !== undefined &&
      roll?.Source === event.damageSource;
    if (embedded) {
      records.set(index, {
        roll,
        observed,
        repeatedOriginalId:
          linked && roll
            ? direct.get(JSON.stringify([subject, owner, key(roll)]))
            : undefined
      });
    } else if (
      linked &&
      roll &&
      event.id &&
      (event.sourceTag === "ResultInjuryRoll" ||
        event.sourceTag === "ResultRoll")
    ) {
      direct.set(JSON.stringify([subject, owner, key(roll)]), event.id);
    }
  }
  return records;
}
