import type { LuckEventType } from "@/domain/nufflizer/types";

type ProbabilityInput = {
  eventType: LuckEventType;
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
  reason: string;
};

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

function applyReroll(baseOdds: number, rerollAvailable: boolean): number {
  if (!rerollAvailable) {
    return clamp01(baseOdds);
  }

  return clamp01(1 - (1 - baseOdds) * (1 - baseOdds));
}

function resolveTarget(input: ProbabilityInput): number {
  const target = input.difficulty ?? input.requirement;
  if (!Number.isFinite(target) || target === undefined || target <= 0) {
    throw new Error("Probability target threshold is missing.");
  }

  return target;
}

function computeBaseOdds(input: ProbabilityInput): ProbabilityResult {
  if (input.dice.length === 0) {
    throw new Error("Probability dice are missing.");
  }

  const target = resolveTarget(input);
  const sidesByDie = input.dice.map((value, index) => estimatedSides(input.dieTypes[index], value));

  let baseOdds = 0.5;
  let reason = "single-die target";

  if (input.eventType === "armor_break" || input.eventType === "injury") {
    baseOdds = input.dice.length === 1 ? probabilityBySingleDieTarget(target, sidesByDie[0] ?? 6) : probabilityBySumTarget(target, sidesByDie);
    reason = "sum-target roll";
  } else if (
    input.eventType === "block" ||
    input.eventType === "dodge" ||
    input.eventType === "ball_handling" ||
    input.eventType === "argue_call" ||
    input.eventType === "movement_risk"
  ) {
    baseOdds = input.dice.length === 1 ? probabilityBySingleDieTarget(target, sidesByDie[0] ?? 6) : probabilityByAnyDieTarget(target, sidesByDie);
    reason = input.dice.length === 1 ? "single-die target" : "multi-die any-success target";
  }

  const rerollAdjustedOdds = applyReroll(baseOdds, input.rerollAvailable);
  return {
    probabilitySuccess: rerollAdjustedOdds,
    baseOdds: clamp01(baseOdds),
    rerollAdjustedOdds,
    reason
  };
}

export function computeProbabilityForEvent(input: ProbabilityInput): ProbabilityResult {
  return computeBaseOdds(input);
}

export function resolveActualSuccess(
  outcomeCode: number | undefined,
  dice: number[],
  target: number | undefined
): { actualSuccess: boolean; deterministic: boolean; reason: string } {
  if (outcomeCode === 1) {
    return {
      actualSuccess: true,
      deterministic: true,
      reason: "resolved by explicit success outcome code"
    };
  }

  if (outcomeCode === 0) {
    return {
      actualSuccess: false,
      deterministic: true,
      reason: "resolved by explicit failure outcome code"
    };
  }

  if (target !== undefined && dice.length > 0) {
    const total = dice.reduce((sum, value) => sum + value, 0);
    return {
      actualSuccess: total >= target,
      deterministic: true,
      reason: "resolved by dice total versus target threshold"
    };
  }

  return {
    actualSuccess: false,
    deterministic: false,
    reason: "indeterminate outcome: missing explicit outcome and valid threshold"
  };
}
