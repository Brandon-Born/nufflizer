import type { LuckCalculationMethod, LuckEventType } from "@/domain/nufflizer/types";

type ProbabilityInput = {
  rollType?: number;
  requirement?: number;
  difficulty?: number;
  dice: number[];
  dieTypes: number[];
  rerollAvailable: boolean;
};

export type ProbabilityResult = {
  probabilitySuccess: number;
  baseOdds: number;
  rerollAdjustedOdds: number;
  calculationMethod: LuckCalculationMethod;
  calculationReason: string;
};

const ARGUE_CALL_FALLBACK_ROLLS = new Set([42, 70]);

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

function estimatedSides(dieType: number | undefined, observedMax: number): number {
  if (dieType === 1) {
    return Math.max(8, observedMax);
  }

  if (dieType === 2) {
    return Math.max(6, observedMax);
  }

  return Math.max(6, observedMax);
}

function probabilityBySingleDieTarget(target: number, sides: number): number {
  const successful = Math.max(0, sides - target + 1);
  return clamp01(successful / sides);
}

function probabilityByAnyDieTarget(target: number, sidesByDie: number[]): number {
  const failProbability = sidesByDie.reduce((product, sides) => product * (1 - probabilityBySingleDieTarget(target, sides)), 1);
  return clamp01(1 - failProbability);
}

function probabilityBySumTarget(target: number, sidesByDie: number[]): number {
  let distribution = new Map<number, number>();
  distribution.set(0, 1);

  for (const sides of sidesByDie) {
    const next = new Map<number, number>();

    for (const [sum, ways] of distribution.entries()) {
      for (let value = 1; value <= sides; value += 1) {
        const nextSum = sum + value;
        next.set(nextSum, (next.get(nextSum) ?? 0) + ways);
      }
    }

    distribution = next;
  }

  const totalOutcomes = sidesByDie.reduce((product, sides) => product * sides, 1);
  if (totalOutcomes <= 0) {
    return 0.5;
  }

  const successfulOutcomes = Array.from(distribution.entries()).reduce((sum, [result, ways]) => {
    if (result >= target) {
      return sum + ways;
    }
    return sum;
  }, 0);

  return clamp01(successfulOutcomes / totalOutcomes);
}

function isSumRoll(target: number, diceCount: number, rollType?: number): boolean {
  if (target > 6 || diceCount > 2) {
    return true;
  }

  return rollType === 10 || rollType === 1 || rollType === 34 || rollType === 37;
}

export function computeBaseSuccessProbability(input: ProbabilityInput): number {
  const target = input.difficulty ?? input.requirement;
  if (!Number.isFinite(target) || target === undefined || target <= 0) {
    return 0.5;
  }

  if (input.dice.length === 0) {
    return 0.5;
  }

  const sidesByDie = input.dice.map((value, index) => estimatedSides(input.dieTypes[index], value));

  if (input.dice.length === 1) {
    return probabilityBySingleDieTarget(target, sidesByDie[0] ?? 6);
  }

  if (isSumRoll(target, input.dice.length, input.rollType)) {
    return probabilityBySumTarget(target, sidesByDie);
  }

  return probabilityByAnyDieTarget(target, sidesByDie);
}

export function computeSuccessProbability(input: ProbabilityInput): number {
  const base = computeBaseSuccessProbability(input);

  if (!input.rerollAvailable) {
    return base;
  }

  return clamp01(1 - (1 - base) * (1 - base));
}

function applyReroll(baseOdds: number, rerollAvailable: boolean): number {
  if (!rerollAvailable) {
    return clamp01(baseOdds);
  }

  return clamp01(1 - (1 - baseOdds) * (1 - baseOdds));
}

function resolveTarget(input: ProbabilityInput): number | undefined {
  const target = input.difficulty ?? input.requirement;
  if (!Number.isFinite(target) || target === undefined || target <= 0) {
    return undefined;
  }

  return target;
}

function computeExplicitBlockOdds(input: ProbabilityInput): number | null {
  if (input.rollType !== 2) {
    return null;
  }

  const target = resolveTarget(input);
  if (!target || input.dice.length === 0) {
    return null;
  }

  const sidesByDie = input.dice.map((value, index) => estimatedSides(input.dieTypes[index], value));
  if (input.dice.length === 1) {
    return probabilityBySingleDieTarget(target, sidesByDie[0] ?? 6);
  }

  return probabilityByAnyDieTarget(target, sidesByDie);
}

function computeExplicitArmorOdds(input: ProbabilityInput): number | null {
  if (input.rollType !== 1 && input.rollType !== 34) {
    return null;
  }

  const target = resolveTarget(input);
  if (!target || input.dice.length === 0) {
    return null;
  }

  const sidesByDie = input.dice.map((value, index) => estimatedSides(input.dieTypes[index], value));
  if (input.dice.length === 1) {
    return probabilityBySingleDieTarget(target, sidesByDie[0] ?? 6);
  }

  return probabilityBySumTarget(target, sidesByDie);
}

function computeExplicitInjuryOdds(input: ProbabilityInput): number | null {
  if (input.rollType !== 4 && input.rollType !== 31 && input.rollType !== 37) {
    return null;
  }

  const target = resolveTarget(input);
  if (!target || input.dice.length === 0) {
    return null;
  }

  const sidesByDie = input.dice.map((value, index) => estimatedSides(input.dieTypes[index], value));
  if (input.dice.length === 1) {
    return probabilityBySingleDieTarget(target, sidesByDie[0] ?? 6);
  }

  return probabilityBySumTarget(target, sidesByDie);
}

function computeExplicitDodgeOdds(input: ProbabilityInput): number | null {
  if (input.rollType !== 3 && input.rollType !== 17 && input.rollType !== 21) {
    return null;
  }

  const target = resolveTarget(input);
  if (!target || input.dice.length === 0) {
    return null;
  }

  const sidesByDie = input.dice.map((value, index) => estimatedSides(input.dieTypes[index], value));
  if (input.dice.length === 1) {
    return probabilityBySingleDieTarget(target, sidesByDie[0] ?? 6);
  }

  return probabilityByAnyDieTarget(target, sidesByDie);
}

function computeExplicitBallHandlingOdds(input: ProbabilityInput): number | null {
  if (input.rollType !== 11 && input.rollType !== 12 && input.rollType !== 13 && input.rollType !== 14 && input.rollType !== 15 && input.rollType !== 25) {
    return null;
  }

  const target = resolveTarget(input);
  if (!target || input.dice.length === 0) {
    return null;
  }

  const sidesByDie = input.dice.map((value, index) => estimatedSides(input.dieTypes[index], value));
  if (input.dice.length === 1) {
    return probabilityBySingleDieTarget(target, sidesByDie[0] ?? 6);
  }

  return probabilityByAnyDieTarget(target, sidesByDie);
}

function computeExplicitArgueCallOdds(input: ProbabilityInput): number | null {
  if (input.rollType !== 71) {
    return null;
  }

  const target = resolveTarget(input);
  if (!target || input.dice.length === 0) {
    return null;
  }

  const sidesByDie = input.dice.map((value, index) => estimatedSides(input.dieTypes[index], value));
  if (input.dice.length === 1) {
    return probabilityBySingleDieTarget(target, sidesByDie[0] ?? 6);
  }

  return probabilityByAnyDieTarget(target, sidesByDie);
}

function explicitComputation(eventType: LuckEventType, input: ProbabilityInput): { baseOdds: number; reason: string } | null {
  if (eventType === "block") {
    const baseOdds = computeExplicitBlockOdds(input);
    if (baseOdds !== null) {
      return {
        baseOdds,
        reason: "explicit block calculator (rollType 2)"
      };
    }
  }

  if (eventType === "armor_break") {
    const baseOdds = computeExplicitArmorOdds(input);
    if (baseOdds !== null) {
      return {
        baseOdds,
        reason: "explicit armor-break calculator (rollType 1/34)"
      };
    }
  }

  if (eventType === "injury") {
    const baseOdds = computeExplicitInjuryOdds(input);
    if (baseOdds !== null) {
      return {
        baseOdds,
        reason: "explicit injury calculator (rollType 4/31/37)"
      };
    }
  }

  if (eventType === "dodge") {
    const baseOdds = computeExplicitDodgeOdds(input);
    if (baseOdds !== null) {
      return {
        baseOdds,
        reason: "explicit dodge calculator (rollType 3/17/21)"
      };
    }
  }

  if (eventType === "ball_handling") {
    const baseOdds = computeExplicitBallHandlingOdds(input);
    if (baseOdds !== null) {
      return {
        baseOdds,
        reason: "explicit ball-handling calculator (rollType 11/12/13/14/15/25)"
      };
    }
  }

  if (eventType === "argue_call") {
    const baseOdds = computeExplicitArgueCallOdds(input);
    if (baseOdds !== null) {
      return {
        baseOdds,
        reason: "explicit argue-call calculator (rollType 71)"
      };
    }
  }

  return null;
}

export function computeProbabilityForEvent(eventType: LuckEventType, input: ProbabilityInput): ProbabilityResult {
  const explicit = explicitComputation(eventType, input);
  if (explicit) {
    const rerollAdjustedOdds = applyReroll(explicit.baseOdds, input.rerollAvailable);
    return {
      probabilitySuccess: rerollAdjustedOdds,
      baseOdds: clamp01(explicit.baseOdds),
      rerollAdjustedOdds,
      calculationMethod: "explicit",
      calculationReason: explicit.reason
    };
  }

  const baseOdds = computeBaseSuccessProbability(input);
  const rerollAdjustedOdds = applyReroll(baseOdds, input.rerollAvailable);
  let calculationReason = `generic fallback calculator (insufficient explicit mapping${input.rollType !== undefined ? ` for rollType ${input.rollType}` : ""})`;
  if (eventType === "argue_call" && input.rollType !== undefined && ARGUE_CALL_FALLBACK_ROLLS.has(input.rollType)) {
    calculationReason = `argue-call fallback calculator (rollType ${input.rollType} remains nondeterministic in current fixtures)`;
  }

  return {
    probabilitySuccess: rerollAdjustedOdds,
    baseOdds: clamp01(baseOdds),
    rerollAdjustedOdds,
    calculationMethod: "fallback",
    calculationReason
  };
}

export function resolveActualSuccess(outcomeCode: number | undefined, dice: number[], target: number | undefined): boolean {
  if (outcomeCode === 1) {
    return true;
  }

  if (outcomeCode === 0) {
    return false;
  }

  if (target !== undefined && dice.length > 0) {
    const total = dice.reduce((sum, value) => sum + value, 0);
    return total >= target;
  }

  return outcomeCode !== undefined ? outcomeCode > 0 : false;
}
