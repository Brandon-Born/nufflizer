type ProbabilityInput = {
  rollType?: number;
  requirement?: number;
  difficulty?: number;
  dice: number[];
  dieTypes: number[];
  rerollAvailable: boolean;
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
