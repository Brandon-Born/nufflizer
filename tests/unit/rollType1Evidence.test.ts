import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

type EvidenceSummary = {
  fixtureCount: number;
  fixtures: string[];
  rollType1Total: number;
  reportRollType1Total: number;
  reportScoredMovementRiskCount: number;
  requirementValues: Record<string, number>;
  difficultyValues: Record<string, number>;
  stepTypeCounts: Record<string, number>;
  dieTypeCounts: Record<string, number>;
  diceCountDistribution: Record<string, number>;
  modifierSumCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
  outcomeDiceThresholdMismatches: number;
  failureNextSourceTagCounts: Record<string, number>;
  failureNextRollTypeCounts: Record<string, number>;
  successNextRollType10Count: number;
  failureNextRollType10Count: number;
  failureNextRollType87Count: number;
  byFixture: Record<
    string,
    {
      rollType1Total: number;
      successCount: number;
      failureCount: number;
      scoredMovementRiskCount: number;
    }
  >;
};

type RollType1Gate = {
  minRollType1Samples: number;
  requiredRequirement: number;
  requiredDifficulty: number;
  requiredDieType: number;
  requiredDiceCount: number;
  requiredModifierSum: number;
  allowedStepTypes: number[];
  failureFollowupAllowedRollTypes: number[];
  minFailureFollowupRollType10Share: number;
  maxOutcomeDiceThresholdMismatches: number;
};

function sortedDemoReplayFiles(): string[] {
  return readdirSync(path.resolve(process.cwd(), "demo-replays"))
    .filter((file) => file.startsWith("demo") && (file.endsWith(".bbr") || file.endsWith(".xml")))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function buildRollType1EvidenceSummary(): EvidenceSummary {
  const files = sortedDemoReplayFiles();
  const summary: EvidenceSummary = {
    fixtureCount: files.length,
    fixtures: files,
    rollType1Total: 0,
    reportRollType1Total: 0,
    reportScoredMovementRiskCount: 0,
    requirementValues: {},
    difficultyValues: {},
    stepTypeCounts: {},
    dieTypeCounts: {},
    diceCountDistribution: {},
    modifierSumCounts: {},
    outcomeCounts: {},
    outcomeDiceThresholdMismatches: 0,
    failureNextSourceTagCounts: {},
    failureNextRollTypeCounts: {},
    successNextRollType10Count: 0,
    failureNextRollType10Count: 0,
    failureNextRollType87Count: 0,
    byFixture: {}
  };

  for (const file of files) {
    const replayInput = readFileSync(path.resolve(process.cwd(), "demo-replays", file), "utf-8");
    const replay = parseReplayXml(decodeReplayInput(replayInput).xml);
    const report = analyzeNufflizerInput(replayInput);
    const reportRollType1Events = report.events.filter((event) => event.metadata.rollType === 1);

    summary.reportRollType1Total += reportRollType1Events.length;
    summary.reportScoredMovementRiskCount += reportRollType1Events.filter(
      (event) => event.scoringStatus === "scored" && event.type === "movement_risk"
    ).length;

    const fixtureSummary = {
      rollType1Total: 0,
      successCount: 0,
      failureCount: 0,
      scoredMovementRiskCount: reportRollType1Events.filter(
        (event) => event.scoringStatus === "scored" && event.type === "movement_risk"
      ).length
    };

    for (const turn of replay.turns) {
      const events = turn.events;

      for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
        const event = events[eventIndex];
        if (event.sourceTag !== "ResultRoll" || event.rollType !== 1) {
          continue;
        }

        summary.rollType1Total += 1;
        fixtureSummary.rollType1Total += 1;

        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const requirement = Number(payload.Requirement);
        const difficulty = Number(payload.Difficulty);
        const outcome = Number(payload.Outcome);
        const stepType = String(event.stepType ?? "na");

        increment(summary.requirementValues, String(requirement));
        increment(summary.difficultyValues, String(difficulty));
        increment(summary.stepTypeCounts, stepType);
        increment(summary.outcomeCounts, String(outcome));

        const diceNode = ((payload.Dice as { Die?: unknown } | undefined)?.Die ?? undefined) as unknown;
        const dice = (Array.isArray(diceNode) ? diceNode : [diceNode].filter(Boolean)).map((die) => ({
          dieType: Number((die as { DieType?: unknown }).DieType),
          value: Number((die as { Value?: unknown }).Value)
        }));

        increment(summary.diceCountDistribution, String(dice.length));
        for (const die of dice) {
          increment(summary.dieTypeCounts, String(die.dieType));
        }

        const modifiersNode = ((payload.Modifiers as { Modifier?: unknown } | undefined)?.Modifier ?? undefined) as unknown;
        const modifiers = (Array.isArray(modifiersNode) ? modifiersNode : [modifiersNode].filter(Boolean)).map((modifier) =>
          Number((modifier as { Value?: unknown }).Value)
        );
        const modifierSum = modifiers.filter(Number.isFinite).reduce((sum, value) => sum + value, 0);
        increment(summary.modifierSumCounts, String(modifierSum));

        const nextEvent = events[eventIndex + 1];
        const nextSourceTag = nextEvent?.sourceTag ?? "END";
        const nextRollType = nextEvent?.sourceTag === "ResultRoll" ? String(nextEvent.rollType ?? "na") : "none";

        if (outcome === 1) {
          fixtureSummary.successCount += 1;
        }

        if (outcome === 0) {
          fixtureSummary.failureCount += 1;
          increment(summary.failureNextSourceTagCounts, nextSourceTag);
          increment(summary.failureNextRollTypeCounts, nextRollType);
        }

        if (nextRollType === "10") {
          if (outcome === 0) {
            summary.failureNextRollType10Count += 1;
          } else if (outcome === 1) {
            summary.successNextRollType10Count += 1;
          }
        }

        if (nextRollType === "87" && outcome === 0) {
          summary.failureNextRollType87Count += 1;
        }

        const target = Number.isFinite(difficulty) ? difficulty : requirement;
        if (Number.isFinite(target) && dice.length === 1 && Number.isFinite(dice[0]?.value) && (outcome === 0 || outcome === 1)) {
          const expectedSuccess = (dice[0]?.value ?? 0) >= target;
          if ((outcome === 1) !== expectedSuccess) {
            summary.outcomeDiceThresholdMismatches += 1;
          }
        }
      }
    }

    summary.byFixture[file] = fixtureSummary;
  }

  return summary;
}

function readEvidenceSnapshot(): EvidenceSummary {
  const content = readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "evidence", "rolltype1-expanded-summary.json"), "utf-8");
  return JSON.parse(content) as EvidenceSummary;
}

function readEvidenceGate(): RollType1Gate {
  const content = readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "evidence", "rolltype1-gate.json"), "utf-8");
  return JSON.parse(content) as RollType1Gate;
}

describe("rollType 1 evidence and promotion gate", () => {
  it("matches the committed expanded evidence snapshot", () => {
    const actual = buildRollType1EvidenceSummary();
    const expected = readEvidenceSnapshot();

    expect(actual).toEqual(expected);
  });

  it("passes strict movement-risk promotion invariants", () => {
    const summary = buildRollType1EvidenceSummary();
    const gate = readEvidenceGate();

    expect(summary.rollType1Total).toBeGreaterThanOrEqual(gate.minRollType1Samples);
    expect(summary.reportRollType1Total).toBe(summary.rollType1Total);
    expect(summary.reportScoredMovementRiskCount).toBe(summary.rollType1Total);
    expect(summary.requirementValues).toEqual({ [String(gate.requiredRequirement)]: summary.rollType1Total });
    expect(summary.difficultyValues).toEqual({ [String(gate.requiredDifficulty)]: summary.rollType1Total });
    expect(summary.dieTypeCounts).toEqual({ [String(gate.requiredDieType)]: summary.rollType1Total });
    expect(summary.diceCountDistribution).toEqual({ [String(gate.requiredDiceCount)]: summary.rollType1Total });
    expect(summary.modifierSumCounts).toEqual({ [String(gate.requiredModifierSum)]: summary.rollType1Total });

    const seenStepTypes = Object.keys(summary.stepTypeCounts)
      .map((value) => Number(value))
      .sort((left, right) => left - right);
    const allowedStepTypes = [...gate.allowedStepTypes].sort((left, right) => left - right);

    expect(seenStepTypes.every((stepType) => allowedStepTypes.includes(stepType))).toBe(true);

    const seenFailureFollowups = Object.keys(summary.failureNextRollTypeCounts)
      .map((value) => Number(value))
      .sort((left, right) => left - right);
    const allowedFailureFollowups = [...gate.failureFollowupAllowedRollTypes].sort((left, right) => left - right);

    expect(seenFailureFollowups.every((rollType) => allowedFailureFollowups.includes(rollType))).toBe(true);
    expect(summary.outcomeDiceThresholdMismatches).toBeLessThanOrEqual(gate.maxOutcomeDiceThresholdMismatches);

    const failureCount = Number(summary.outcomeCounts["0"] ?? 0);
    expect(failureCount).toBeGreaterThan(0);

    const rollType10FailureShare = failureCount > 0 ? summary.failureNextRollType10Count / failureCount : 0;
    expect(rollType10FailureShare).toBeGreaterThanOrEqual(gate.minFailureFollowupRollType10Share);
  });
});
