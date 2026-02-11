import { describe, expect, it } from "vitest";

import { computeBaseSuccessProbability, computeSuccessProbability, resolveActualSuccess } from "@/domain/nufflizer/probability";

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
});
