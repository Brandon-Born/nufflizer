import { describe, expect, it } from "vitest";

import { classifyRollContext } from "@/domain/nufflizer/classifyRollContext";

describe("nufflizier roll-context classification", () => {
  it("retains actual unscored block pools in the observed denominator", () => {
    const result = classifyRollContext({
      sourceTag: "ResultBlockRoll",
      stepType: 6,
      rollType: 3,
      requirement: undefined,
      difficulty: undefined,
      diceCount: 1
    });

    expect(result.scored).toBe(false);
    expect(result.rollCandidate).toBe(true);
    expect(result.eventType).toBe("block");
    expect(result.reason).toMatch(/categorical semantics/i);
  });

  it("counts unscored ResultInjuryRoll rollType 11 as random-outcome evidence", () => {
    const result = classifyRollContext({
      sourceTag: "ResultInjuryRoll",
      stepType: 6,
      rollType: 11,
      requirement: undefined,
      difficulty: undefined,
      diceCount: 2
    });

    expect(result.scored).toBe(false);
    expect(result.rollCandidate).toBe(true);
    expect(result.reason).toMatch(/injury-chain dice/i);
  });

  it("scores rollType 10 as deterministic armor-break", () => {
    const result = classifyRollContext({
      sourceTag: "ResultRoll",
      stepType: 6,
      rollType: 10,
      requirement: 10,
      difficulty: 10,
      diceCount: 2
    });

    expect(result.scored).toBe(true);
    expect(result.rollCandidate).toBe(true);
    expect(result.eventType).toBe("armor_break");
  });

  it("scores rollType 1 as movement-risk context", () => {
    const result = classifyRollContext({
      sourceTag: "ResultRoll",
      stepType: 0,
      rollType: 1,
      requirement: 2,
      difficulty: 2,
      diceCount: 1
    });

    expect(result.scored).toBe(true);
    expect(result.rollCandidate).toBe(true);
    expect(result.eventType).toBe("movement_risk");
    expect(result.reason).toMatch(/movement_risk_check/i);
  });

  it("scores rollType 7 as pickup ball-handling context", () => {
    const result = classifyRollContext({
      sourceTag: "ResultRoll",
      stepType: 4,
      rollType: 7,
      requirement: 3,
      difficulty: 4,
      diceCount: 1
    });

    expect(result.scored).toBe(true);
    expect(result.rollCandidate).toBe(true);
    expect(result.eventType).toBe("ball_handling");
    expect(result.reason).toMatch(/pickup_attempt_check/i);
  });

  it("retains randomizer families as observed outcomes without success odds", () => {
    const result = classifyRollContext({
      sourceTag: "ResultRoll",
      stepType: 3,
      rollType: 25,
      requirement: 0,
      difficulty: 0,
      diceCount: 1
    });

    expect(result.scored).toBe(false);
    expect(result.rollCandidate).toBe(true);
    expect(result.reason).toMatch(/randomizer roll family/i);
  });

  it("keeps unsupported random outcomes in the coverage denominator", () => {
    const result = classifyRollContext({
      sourceTag: "ResultRoll",
      stepType: 1,
      rollType: 3,
      requirement: 3,
      difficulty: 3,
      diceCount: 1
    });

    expect(result.scored).toBe(false);
    expect(result.rollCandidate).toBe(true);
    expect(result.reason).toMatch(/unsupported ResultRoll context/i);
  });
});
