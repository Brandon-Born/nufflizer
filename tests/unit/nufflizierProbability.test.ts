import { describe, expect, it } from "vitest";

import {
  computeProbabilityForEvent,
  resolveActualSuccess
} from "@/domain/nufflizer/probability";

describe("nufflizier probability engine", () => {
  it("computes deterministic single-die odds", () => {
    const result = computeProbabilityForEvent({
      eventType: "dodge",
      rollType: 3,
      requirement: 4,
      difficulty: 4,
      dice: [3],
      dieTypes: [0],
      rerollAvailable: false
    });

    expect(result.baseOdds).toBeCloseTo(0.5, 6);
    expect(result.rerollAdjustedOdds).toBeCloseTo(0.5, 6);
  });

  it("computes movement-risk odds as single-die target checks", () => {
    const result = computeProbabilityForEvent({
      eventType: "movement_risk",
      rollType: 1,
      requirement: 2,
      difficulty: 2,
      dice: [4],
      dieTypes: [0],
      rerollAvailable: false
    });

    expect(result.baseOdds).toBeCloseTo(5 / 6, 6);
    expect(result.rerollAdjustedOdds).toBeCloseTo(5 / 6, 6);
  });

  it("applies reroll probability boost", () => {
    const result = computeProbabilityForEvent({
      eventType: "dodge",
      rollType: 3,
      requirement: 4,
      difficulty: 4,
      dice: [3],
      dieTypes: [0],
      rerollAvailable: true
    });

    expect(result.probabilitySuccess).toBeCloseTo(0.75, 6);
  });

  it("computes sum-based odds for injury-style checks", () => {
    const result = computeProbabilityForEvent({
      eventType: "injury",
      rollType: 4,
      requirement: 8,
      difficulty: 8,
      dice: [2, 4],
      dieTypes: [0, 0],
      rerollAvailable: false
    });

    expect(result.baseOdds).toBeCloseTo(15 / 36, 4);
  });

  it("refuses explicit outcomes that contradict the dice contract", () => {
    expect(resolveActualSuccess(1, [1], 6).deterministic).toBe(false);
    expect(resolveActualSuccess(0, [6], 2).deterministic).toBe(false);
    expect(resolveActualSuccess(1, [6], 6).actualSuccess).toBe(true);
    expect(resolveActualSuccess(0, [1], 2).actualSuccess).toBe(false);
  });

  it("resolves by dice total when outcome code is absent", () => {
    expect(resolveActualSuccess(undefined, [5], 4).actualSuccess).toBe(true);
    expect(resolveActualSuccess(undefined, [1], 4).actualSuccess).toBe(false);
    expect(resolveActualSuccess(undefined, [1], 4).deterministic).toBe(true);
  });

  it("marks indeterminate outcome when neither outcome code nor target exists", () => {
    const resolved = resolveActualSuccess(undefined, [], undefined);

    expect(resolved.deterministic).toBe(false);
    expect(resolved.reason).toMatch(/indeterminate outcome/i);
  });
});
