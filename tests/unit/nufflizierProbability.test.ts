import { describe, expect, it } from "vitest";

import {
  computeBaseSuccessProbability,
  computeProbabilityForEvent,
  computeSuccessProbability,
  resolveActualSuccess
} from "@/domain/nufflizer/probability";

describe("nufflizier probability engine", () => {
  it("computes single-die target odds", () => {
    const probability = computeBaseSuccessProbability({
      rollType: 3,
      requirement: 4,
      difficulty: 4,
      dice: [3],
      dieTypes: [0],
      rerollAvailable: false
    });

    expect(probability).toBeCloseTo(0.5, 6);
  });

  it("applies reroll probability boost", () => {
    const noReroll = computeSuccessProbability({
      rollType: 3,
      requirement: 4,
      difficulty: 4,
      dice: [3],
      dieTypes: [0],
      rerollAvailable: false
    });
    const withReroll = computeSuccessProbability({
      rollType: 3,
      requirement: 4,
      difficulty: 4,
      dice: [3],
      dieTypes: [0],
      rerollAvailable: true
    });

    expect(noReroll).toBeCloseTo(0.5, 6);
    expect(withReroll).toBeCloseTo(0.75, 6);
  });

  it("computes sum-based odds for 2d6 style checks", () => {
    const probability = computeBaseSuccessProbability({
      rollType: 10,
      requirement: 8,
      difficulty: 8,
      dice: [2, 4],
      dieTypes: [0, 0],
      rerollAvailable: false
    });

    expect(probability).toBeCloseTo(15 / 36, 4);
  });

  it("resolves outcome codes to actual success", () => {
    expect(resolveActualSuccess(1, [1], 6)).toBe(true);
    expect(resolveActualSuccess(0, [6], 2)).toBe(false);
    expect(resolveActualSuccess(undefined, [5], 4)).toBe(true);
    expect(resolveActualSuccess(undefined, [1], 4)).toBe(false);
  });

  it("uses explicit calculators for block, armor break, and injury", () => {
    const block = computeProbabilityForEvent("block", {
      rollType: 2,
      requirement: 3,
      difficulty: 3,
      dice: [2],
      dieTypes: [0],
      rerollAvailable: false
    });
    const armor = computeProbabilityForEvent("armor_break", {
      rollType: 1,
      requirement: 8,
      difficulty: 8,
      dice: [4, 4],
      dieTypes: [0, 0],
      rerollAvailable: false
    });
    const injury = computeProbabilityForEvent("injury", {
      rollType: 4,
      requirement: 9,
      difficulty: 9,
      dice: [4, 5],
      dieTypes: [0, 0],
      rerollAvailable: false
    });

    expect(block.calculationMethod).toBe("explicit");
    expect(armor.calculationMethod).toBe("explicit");
    expect(injury.calculationMethod).toBe("explicit");
  });

  it("uses explicit calculators for dodge and ball handling", () => {
    const dodge = computeProbabilityForEvent("dodge", {
      rollType: 3,
      requirement: 4,
      difficulty: 4,
      dice: [3],
      dieTypes: [0],
      rerollAvailable: false
    });
    const ballHandling = computeProbabilityForEvent("ball_handling", {
      rollType: 12,
      requirement: 4,
      difficulty: 4,
      dice: [2],
      dieTypes: [0],
      rerollAvailable: true
    });

    expect(dodge.calculationMethod).toBe("explicit");
    expect(ballHandling.calculationMethod).toBe("explicit");
  });

  it("uses explicit calculator for argue-call rollType 71", () => {
    const argueCall = computeProbabilityForEvent("argue_call", {
      rollType: 71,
      requirement: 4,
      difficulty: 4,
      dice: [5],
      dieTypes: [0],
      rerollAvailable: false
    });

    expect(argueCall.calculationMethod).toBe("explicit");
    expect(argueCall.calculationReason).toMatch(/rollType 71/i);
  });

  it("falls back when no explicit mapping is available", () => {
    const fallback42 = computeProbabilityForEvent("argue_call", {
      rollType: 42,
      requirement: 4,
      difficulty: 4,
      dice: [3],
      dieTypes: [0],
      rerollAvailable: false
    });
    const fallback70 = computeProbabilityForEvent("argue_call", {
      rollType: 70,
      requirement: 3,
      difficulty: 3,
      dice: [2],
      dieTypes: [0],
      rerollAvailable: false
    });

    expect(fallback42.calculationMethod).toBe("fallback");
    expect(fallback42.calculationReason).toMatch(/fallback/i);
    expect(fallback42.calculationReason).toMatch(/rollType 42/i);
    expect(fallback42.calculationReason).toMatch(/nondeterministic/i);
    expect(fallback70.calculationMethod).toBe("fallback");
    expect(fallback70.calculationReason).toMatch(/rollType 70/i);
    expect(fallback70.calculationReason).toMatch(/nondeterministic/i);
  });
});
