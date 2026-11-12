import type { LuckEventType } from "./types";
import { ReplayValidationError } from "@/lib/errors";

type ProbabilityInput = {
  eventType: LuckEventType;
  rollType?: number;
  requirement?: number;
  difficulty?: number;
  dice: number[];
  dieTypes: number[];
  twoAttemptPolicy: boolean;
};
export type ProbabilityResult = {
  probabilitySuccess: number;
  baseOdds: number;
  rerollAdjustedOdds: number;
  reason: string;
};
function sumRule(type: LuckEventType): boolean {
  return type === "armor_break" || type === "injury";
}
function validate(input: ProbabilityInput): number {
  if (input.eventType === "block")
    throw new ReplayValidationError(
      "Block pools require a categorical contract."
    );
  const target = input.difficulty ?? input.requirement;
  if (
    !Number.isSafeInteger(target) ||
    target === undefined ||
    target < 1 ||
    target > 30
  )
    throw new ReplayValidationError(
      "Probability target must be an integer from 1 to 30."
    );
  if (!sumRule(input.eventType) && (target < 2 || target > 6))
    throw new ReplayValidationError(
      "Natural-roll rules outside a 2+ through 6+ numeric contract are unsupported."
    );
  if (
    !input.dice.length ||
    input.dice.length > 3 ||
    input.dieTypes.length !== input.dice.length
  )
    throw new ReplayValidationError(
      "Probability requires one to three dice with explicit die types."
    );
  if (!sumRule(input.eventType) && input.dice.length !== 1)
    throw new ReplayValidationError(
      "Numeric check contracts require exactly one D6; multi-die choice semantics are unsupported."
    );
  input.dice.forEach((value, i) => {
    // Only explicit numeric D6 contracts are modeled. Directional D8 and categorical block faces need different rules.
    const sides = input.dieTypes[i] === 0 ? 6 : undefined;
    if (!sides || !Number.isSafeInteger(value) || value < 1 || value > sides)
      throw new ReplayValidationError(
        "Invalid die type or face for probability contract."
      );
  });
  return target;
}
export function computeProbabilityForEvent(
  input: ProbabilityInput
): ProbabilityResult {
  const target = validate(input);
  const sides = input.dieTypes.map((type) => (type === 0 ? 6 : 8));
  let successes = 0;
  let count = 0;
  function enumerate(index: number, values: number[]) {
    if (index === sides.length) {
      count++;
      if (
        sumRule(input.eventType)
          ? values.reduce((a, b) => a + b, 0) >= target
          : values.some((v) => v >= target)
      )
        successes++;
      return;
    }
    for (let face = 1; face <= sides[index]!; face++)
      enumerate(index + 1, [...values, face]);
  }
  enumerate(0, []);
  const baseOdds = successes / count;
  const adjusted = input.twoAttemptPolicy ? 1 - (1 - baseOdds) ** 2 : baseOdds;
  return {
    probabilitySuccess: adjusted,
    baseOdds,
    rerollAdjustedOdds: adjusted,
    reason: `${sumRule(input.eventType) ? "sum" : "any-die"}-target roll; ${input.twoAttemptPolicy ? "full reroll on failure policy" : "single attempt"}`
  };
}
export function resolveActualSuccess(
  outcomeCode: number | undefined,
  dice: number[],
  target: number | undefined,
  eventType: LuckEventType = "ball_handling"
): { actualSuccess: boolean; deterministic: boolean; reason: string } {
  const unknown = (reason: string) => ({
    actualSuccess: false,
    deterministic: false,
    reason: `indeterminate outcome: ${reason}`
  });
  if (outcomeCode !== undefined && outcomeCode !== 0 && outcomeCode !== 1)
    return unknown("unsupported outcome code");
  if (
    target === undefined ||
    !Number.isSafeInteger(target) ||
    !dice.length ||
    (!sumRule(eventType) && (dice.length !== 1 || target < 2 || target > 6)) ||
    dice.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 6)
  )
    return unknown("missing dice or target");
  const actualSuccess = sumRule(eventType)
    ? dice.reduce((a, b) => a + b, 0) >= target
    : dice.some((value) => value >= target);
  if (outcomeCode !== undefined && Boolean(outcomeCode) !== actualSuccess)
    return unknown("dice contradict explicit outcome");
  return {
    actualSuccess,
    deterministic: true,
    reason: `resolved by ${sumRule(eventType) ? "dice sum" : "any die"} versus target threshold`
  };
}
