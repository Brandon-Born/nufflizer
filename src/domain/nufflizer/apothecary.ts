import type { ReplayEvent } from "@/domain/replay/types";

const USAGE = "QuestionApothecaryCasualtyUsage";
const CHOICE = "QuestionApothecaryCasualtyChoice";
const RESULT = "ResultApothecary";

export type ApothecaryResolution = {
  originalSourceId: string;
  replacementSourceId?: string;
  gamerId: number;
  resourceSpent: 0 | 1;
  appliedCasualty: number;
  playerStatus: number;
  applied: "original" | "replacement" | "injury_treatment";
};

export type ApothecaryRecord = {
  roll?: Record<string, unknown>;
  repeatedOriginal?: boolean;
  resolution?: ApothecaryResolution;
};

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function integer(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

// The embedded original uses RollInfos. The choice's OriginalRoll is a copy
// whose outcome can change (UI-060); only its NewRoll can add fresh dice.
function readRoll(
  value: unknown,
  source: number | undefined,
  casualtyOnly = false
) {
  const roll = object(value);
  if (
    !roll ||
    source === undefined ||
    roll.Source !== source ||
    roll.Status !== 1 ||
    !integer(roll.Outcome, 0, 10)
  )
    return;
  const rawDice = object(roll.Dice)?.Die;
  const dice = Array.isArray(rawDice) ? rawDice : [rawDice];
  const isDie = (index: number, type: number, sides: number) => {
    const die = object(dice[index]);
    return die?.DieType === type && integer(die.Value, 1, sides);
  };
  if (
    roll.RollType === 12 &&
    ((dice.length === 1 && isDie(0, 4, 16)) ||
      (dice.length === 2 && isDie(0, 4, 16) && isDie(1, 0, 6)))
  )
    return roll;
  if (
    !casualtyOnly &&
    roll.RollType === 11 &&
    dice.length === 2 &&
    isDie(0, 0, 6) &&
    isDie(1, 0, 6)
  )
    return roll;
}

function rollKey(roll: Record<string, unknown>) {
  return JSON.stringify([
    roll.RollType,
    roll.Source,
    roll.Dice,
    roll.Modifiers
  ]);
}

function appliedOutcome(
  original: Record<string, unknown>,
  replacement: Record<string, unknown> | undefined,
  resourceSpent: 0 | 1,
  casualty: number
): ApothecaryResolution["applied"] | undefined {
  if (original.RollType === 11)
    return resourceSpent === 1 && !replacement && casualty === 0
      ? "injury_treatment"
      : undefined;
  if (resourceSpent === 0)
    return !replacement && casualty === original.Outcome
      ? "original"
      : undefined;
  if (!replacement || original.Outcome === replacement.Outcome) return;
  if (casualty === original.Outcome) return "original";
  if (casualty === replacement.Outcome) return "replacement";
}

function subjectOf(event: ReplayEvent) {
  const subject = event.stepActorId;
  return event.stepTag === "DamageStep" &&
    event.stepType === 2 &&
    event.actionId &&
    subject &&
    subject !== "-1" &&
    subject === event.stepTargetId &&
    subject === event.playerId &&
    subject === event.targetId &&
    !event.attributionConflict &&
    (!event.teamId || !event.actorTeamId || event.teamId === event.actorTeamId)
    ? subject
    : undefined;
}

function sameCell(a: unknown, b: unknown) {
  const left = object(a),
    right = object(b);
  return (
    integer(left?.X, 0, 25) &&
    integer(left?.Y, 0, 14) &&
    left.X === right?.X &&
    left.Y === right.Y
  );
}

// Preserve dice even if a continuation is missing. A resource or applied
// choice needs matching player, source, cell, controller and removal evidence.
export function linkApothecary(
  events: readonly ReplayEvent[],
  version: string | undefined,
  owners: ReadonlyMap<string, string>
): Map<number, ApothecaryRecord> {
  const records = new Map<number, ApothecaryRecord>();
  let step: ReplayEvent | undefined;
  const direct = new Set<string>();
  let pending:
    | {
        subject: string;
        owner: string;
        source: number;
        cell: unknown;
        lastActionId: string;
        original: Record<string, unknown>;
        originalSourceId: string;
        gamerId: number;
        replacement?: Record<string, unknown>;
        replacementSourceId?: string;
        removal?: ReplayEvent;
      }
    | undefined;

  for (const [index, event] of events.entries()) {
    const { sourceTag: tag, payload } = event;
    if (
      event.checkpointCarrier ||
      (!event.actionId &&
        (tag === "EventGamersAreReady" || tag === "EventStartActiveTimer"))
    )
      continue;
    const subject = subjectOf(event);
    const owner = subject ? owners.get(subject) : undefined;
    const isStep = tag === "DamageStep";
    if (isStep) {
      if (
        pending &&
        (pending.removal || pending.lastActionId !== step?.actionId)
      )
        pending = undefined;
      step = event;
      direct.clear();
    }
    const sameStep = step && subject && step.actionId === event.actionId;
    const owned = owner && owner === event.actorTeamId;
    if (
      pending &&
      (!sameStep ||
        !owned ||
        subject !== pending.subject ||
        owner !== pending.owner ||
        event.damageSource !== pending.source ||
        !sameCell(pending.cell, step?.payload?.CellFrom) ||
        !sameCell(pending.cell, step?.payload?.CellTo))
    )
      pending = undefined;
    if (isStep) continue;

    if (tag === USAGE) {
      const roll = readRoll(payload?.RollInfos, event.damageSource);
      const key = roll && JSON.stringify([rollKey(roll), roll.Outcome]);
      const repeatedOriginal = Boolean(
        key && sameStep && owned && direct.has(key)
      );
      records.set(index, { roll, repeatedOriginal });
      pending = undefined;
      const source = event.damageSource;
      if (
        !roll ||
        !subject ||
        !owned ||
        !sameStep ||
        !event.actionId ||
        !event.id ||
        !integer(payload?.GamerId, 0, 1) ||
        (source !== 1 && source !== 9) ||
        !sameCell(step?.payload?.CellFrom, step?.payload?.CellTo)
      )
        continue;
      pending = {
        subject,
        owner,
        source,
        cell: step?.payload?.CellFrom,
        lastActionId: event.actionId,
        original: roll,
        originalSourceId: event.id,
        gamerId: payload.GamerId
      };
      continue;
    }
    if (tag === CHOICE) {
      const roll = readRoll(payload?.NewRoll, event.damageSource, true);
      records.set(index, { roll });
      const copied = readRoll(payload?.OriginalRoll, event.damageSource, true);
      if (
        !pending ||
        pending.replacement ||
        pending.removal ||
        !copied ||
        !roll ||
        !event.id ||
        !event.actionId ||
        event.actionId === pending.lastActionId ||
        payload?.GamerId !== pending.gamerId ||
        rollKey(copied) !== rollKey(pending.original)
      ) {
        pending = undefined;
        continue;
      }
      pending.replacement = roll;
      pending.replacementSourceId = event.id;
      pending.lastActionId = event.actionId;
      continue;
    }
    if (tag === RESULT) {
      records.set(index, {});
      const appliedCasualty = payload?.Casualty;
      const playerStatus = payload?.PlayerStatus;
      const resourceSpent = payload?.ApothecaryUsed;
      const isInjury = payload?.IsInjury;
      if (
        pending?.removal &&
        pending.removal.actionId === event.actionId &&
        pending.removal.payload?.Status === playerStatus &&
        integer(appliedCasualty, 0, 10) &&
        integer(playerStatus, 0, 10) &&
        (resourceSpent === 0 || resourceSpent === 1) &&
        isInjury === Number(pending.original.RollType === 11)
      ) {
        const applied = appliedOutcome(
          pending.original,
          pending.replacement,
          resourceSpent,
          appliedCasualty
        );
        if (applied)
          records.set(index, {
            resolution: {
              originalSourceId: pending.originalSourceId,
              replacementSourceId: pending.replacementSourceId,
              gamerId: pending.gamerId,
              resourceSpent,
              appliedCasualty,
              playerStatus,
              applied
            }
          });
      }
      pending = undefined;
      continue;
    }
    if (
      pending &&
      tag === "ResultPlayerRemoval" &&
      !pending.removal &&
      event.actionId !== pending.lastActionId &&
      String(payload?.PlayerId) === pending.subject &&
      payload?.Reason === 0
    ) {
      pending.removal = event;
      continue;
    }
    if (tag === "ResultGainSpp") continue;
    pending = undefined;
    if (
      (tag === "ResultCasualtyRoll" || tag === "ResultInjuryRoll") &&
      sameStep &&
      owned
    ) {
      const roll = readRoll(payload, event.damageSource);
      if (roll) direct.add(JSON.stringify([rollKey(roll), roll.Outcome]));
    }
  }
  return records;
}
