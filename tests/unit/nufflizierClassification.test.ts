import { describe, expect, it } from "vitest";

import { classifyRollContext } from "@/domain/nufflizer/classifyRollContext";

describe("nufflizier roll-context classification", () => {
  it("does not classify ResultBlockRoll rollType 3 as dodge", () => {
    const result = classifyRollContext({
      sourceTag: "ResultBlockRoll",
      stepType: 6,
      rollType: 3,
      requirement: undefined,
      difficulty: undefined,
      diceCount: 1
    });

    expect(result.scored).toBe(false);
    expect(result.reason).toMatch(/unsupported source tag/i);
  });

  it("does not classify ResultInjuryRoll rollType 11 as ball handling", () => {
    const result = classifyRollContext({
      sourceTag: "ResultInjuryRoll",
      stepType: 6,
      rollType: 11,
      requirement: undefined,
      difficulty: undefined,
      diceCount: 2
    });

    expect(result.scored).toBe(false);
    expect(result.reason).toMatch(/injury-chain summary/i);
  });

  it("classifies ResultRoll stepType 1 as scored dodge only for supported roll family", () => {
    const result = classifyRollContext({
      sourceTag: "ResultRoll",
      stepType: 1,
      rollType: 3,
      requirement: 3,
      difficulty: 3,
      diceCount: 1
    });

    expect(result.scored).toBe(true);
    expect(result.eventType).toBe("dodge");
  });

  it("excludes dodge step when roll family is unsupported", () => {
    const result = classifyRollContext({
      sourceTag: "ResultRoll",
      stepType: 1,
      rollType: 10,
      requirement: 3,
      difficulty: 3,
      diceCount: 1
    });

    expect(result.scored).toBe(false);
    expect(result.eventType).toBe("dodge");
    expect(result.reason).toMatch(/dodge step without supported roll family/i);
  });

  it("excludes ball-handling step when roll family is unsupported", () => {
    const result = classifyRollContext({
      sourceTag: "ResultRoll",
      stepType: 4,
      rollType: 7,
      requirement: 3,
      difficulty: 3,
      diceCount: 1
    });

    expect(result.scored).toBe(false);
    expect(result.eventType).toBe("ball_handling");
    expect(result.reason).toMatch(/ball-handling step without supported roll family/i);
  });

  it("excludes ResultBlockOutcome from scoring", () => {
    const result = classifyRollContext({
      sourceTag: "ResultBlockOutcome",
      stepType: 6,
      rollType: undefined,
      requirement: undefined,
      difficulty: undefined,
      diceCount: 0
    });

    expect(result.scored).toBe(false);
    expect(result.eventType).toBe("block");
  });
});
