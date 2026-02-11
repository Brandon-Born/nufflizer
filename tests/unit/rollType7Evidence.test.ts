import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

type EvidenceSummary = {
  fixtureCount: number;
  fixtures: string[];
  rollType7Total: number;
  reportRollType7Total: number;
  reportScoredBallHandlingCount: number;
  reportExcludedRollType7Count: number;
  reportStatusReasonCounts: Record<string, number>;
  requirementValues: Record<string, number>;
  difficultyValues: Record<string, number>;
  stepTypeCounts: Record<string, number>;
  dieTypeCounts: Record<string, number>;
  diceCountDistribution: Record<string, number>;
  modifierSumCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
  missingTargetCount: number;
  outcomeDiceThresholdMismatches: number;
  prevRollTypeCounts: Record<string, number>;
  nextRollTypeCounts: Record<string, number>;
  prevSourceTagCounts: Record<string, number>;
  nextSourceTagCounts: Record<string, number>;
  consecutiveRollType7Count: number;
  kickoffTurnRollType7Count: number;
  kickoffSameTurnBeforeRollType7Count: number;
  followupRollType25Count: number;
  nonScatterFollowupCount: number;
  chain25725Count: number;
  byFixture: Record<
    string,
    {
      rollType7Total: number;
      successCount: number;
      failureCount: number;
      scoredBallHandlingCount: number;
      kickoffTurnCount: number;
      kickoffSameTurnBeforeCount: number;
      chain25725Count: number;
    }
  >;
};

type RollType7Gate = {
  expectedRollType7Samples: number;
  requiredDieType: number;
  requiredDiceCount: number;
  allowedRequirementValues: number[];
  allowedDifficultyValues: number[];
  allowedStepTypes: number[];
  allowedModifierSums: number[];
  maxMissingTargetCount: number;
  maxOutcomeDiceThresholdMismatches: number;
  maxConsecutiveRollType7Count: number;
  allowedNextRollTypes: string[];
  minKickoffTurnShare: number;
  minKickoffSameTurnBeforeShare: number;
  minChain25725Count: number;
  minNonScatterFollowupCount: number;
  requiredScoredReasonPrefix: string;
};

function sortedDemoReplayFiles(): string[] {
  return readdirSync(path.resolve(process.cwd(), "demo-replays"))
    .filter((file) => file.startsWith("demo") && (file.endsWith(".bbr") || file.endsWith(".xml")))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function buildRollType7EvidenceSummary(): EvidenceSummary {
  const files = sortedDemoReplayFiles();
  const summary: EvidenceSummary = {
    fixtureCount: files.length,
    fixtures: files,
    rollType7Total: 0,
    reportRollType7Total: 0,
    reportScoredBallHandlingCount: 0,
    reportExcludedRollType7Count: 0,
    reportStatusReasonCounts: {},
    requirementValues: {},
    difficultyValues: {},
    stepTypeCounts: {},
    dieTypeCounts: {},
    diceCountDistribution: {},
    modifierSumCounts: {},
    outcomeCounts: {},
    missingTargetCount: 0,
    outcomeDiceThresholdMismatches: 0,
    prevRollTypeCounts: {},
    nextRollTypeCounts: {},
    prevSourceTagCounts: {},
    nextSourceTagCounts: {},
    consecutiveRollType7Count: 0,
    kickoffTurnRollType7Count: 0,
    kickoffSameTurnBeforeRollType7Count: 0,
    followupRollType25Count: 0,
    nonScatterFollowupCount: 0,
    chain25725Count: 0,
    byFixture: {}
  };

  for (const file of files) {
    const replayInput = readFileSync(path.resolve(process.cwd(), "demo-replays", file), "utf-8");
    const replay = parseReplayXml(decodeReplayInput(replayInput).xml);
    const report = analyzeNufflizerInput(replayInput);
    const reportRollType7Events = report.events.filter((event) => event.metadata.rollType === 7);

    summary.reportRollType7Total += reportRollType7Events.length;
    summary.reportScoredBallHandlingCount += reportRollType7Events.filter(
      (event) => event.scoringStatus === "scored" && event.type === "ball_handling"
    ).length;
    summary.reportExcludedRollType7Count += reportRollType7Events.filter((event) => event.scoringStatus === "excluded").length;

    for (const reportEvent of reportRollType7Events) {
      increment(summary.reportStatusReasonCounts, reportEvent.statusReason);
    }

    const fixtureSummary = {
      rollType7Total: 0,
      successCount: 0,
      failureCount: 0,
      scoredBallHandlingCount: reportRollType7Events.filter(
        (event) => event.scoringStatus === "scored" && event.type === "ball_handling"
      ).length,
      kickoffTurnCount: 0,
      kickoffSameTurnBeforeCount: 0,
      chain25725Count: 0
    };

    for (const turn of replay.turns) {
      const events = turn.events;
      const turnHasKickoffRandomizer = events.some(
        (event) => event.sourceTag === "ResultRoll" && (event.rollType === 8 || event.rollType === 9 || event.rollType === 26)
      );

      for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
        const event = events[eventIndex];
        if (event.sourceTag !== "ResultRoll" || event.rollType !== 7) {
          continue;
        }

        summary.rollType7Total += 1;
        fixtureSummary.rollType7Total += 1;

        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const requirement = Number(payload.Requirement);
        const difficulty = Number(payload.Difficulty);
        const outcome = Number(payload.Outcome);
        const stepType = String(event.stepType ?? "na");

        increment(summary.requirementValues, String(requirement));
        increment(summary.difficultyValues, String(difficulty));
        increment(summary.stepTypeCounts, stepType);
        increment(summary.outcomeCounts, String(outcome));

        if (Number.isFinite(difficulty) ? difficulty <= 0 : !Number.isFinite(requirement) || requirement <= 0) {
          summary.missingTargetCount += 1;
        }

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

        const target = Number.isFinite(difficulty) ? difficulty : requirement;
        if (Number.isFinite(target) && dice.length === 1 && Number.isFinite(dice[0]?.value) && (outcome === 0 || outcome === 1)) {
          const expectedSuccess = (dice[0]?.value ?? 0) >= target;
          if ((outcome === 1) !== expectedSuccess) {
            summary.outcomeDiceThresholdMismatches += 1;
          }
        }

        if (outcome === 1) {
          fixtureSummary.successCount += 1;
        } else if (outcome === 0) {
          fixtureSummary.failureCount += 1;
        }

        const prevEvent = events[eventIndex - 1];
        const nextEvent = events[eventIndex + 1];
        const prevRollType = prevEvent?.sourceTag === "ResultRoll" ? String(prevEvent.rollType ?? "na") : "none";
        const nextRollType = nextEvent?.sourceTag === "ResultRoll" ? String(nextEvent.rollType ?? "na") : "none";
        const prevSourceTag = prevEvent?.sourceTag ?? "START";
        const nextSourceTag = nextEvent?.sourceTag ?? "END";

        increment(summary.prevRollTypeCounts, prevRollType);
        increment(summary.nextRollTypeCounts, nextRollType);
        increment(summary.prevSourceTagCounts, prevSourceTag);
        increment(summary.nextSourceTagCounts, nextSourceTag);

        if (nextRollType === "7") {
          summary.consecutiveRollType7Count += 1;
        }

        if (nextRollType === "25") {
          summary.followupRollType25Count += 1;
        } else {
          summary.nonScatterFollowupCount += 1;
        }

        if (prevRollType === "25" && nextRollType === "25") {
          summary.chain25725Count += 1;
          fixtureSummary.chain25725Count += 1;
        }

        if (turnHasKickoffRandomizer) {
          summary.kickoffTurnRollType7Count += 1;
          fixtureSummary.kickoffTurnCount += 1;
        }

        const hasKickoffBeforeInTurn = events
          .slice(0, eventIndex)
          .some((candidate) => candidate.sourceTag === "ResultRoll" && (candidate.rollType === 8 || candidate.rollType === 9 || candidate.rollType === 26));

        if (hasKickoffBeforeInTurn) {
          summary.kickoffSameTurnBeforeRollType7Count += 1;
          fixtureSummary.kickoffSameTurnBeforeCount += 1;
        }
      }
    }

    summary.byFixture[file] = fixtureSummary;
  }

  return summary;
}

function readEvidenceSnapshot(): EvidenceSummary {
  const content = readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "evidence", "rolltype7-expanded-summary.json"), "utf-8");
  return JSON.parse(content) as EvidenceSummary;
}

function readEvidenceGate(): RollType7Gate {
  const content = readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "evidence", "rolltype7-gate.json"), "utf-8");
  return JSON.parse(content) as RollType7Gate;
}

describe("rollType 7 evidence and pickup promotion gate", () => {
  it("matches the committed expanded evidence snapshot", () => {
    const actual = buildRollType7EvidenceSummary();
    const expected = readEvidenceSnapshot();

    expect(actual).toEqual(expected);
  });

  it("passes strict pickup promotion invariants", () => {
    const summary = buildRollType7EvidenceSummary();
    const gate = readEvidenceGate();

    expect(summary.rollType7Total).toBe(gate.expectedRollType7Samples);
    expect(summary.reportRollType7Total).toBe(summary.rollType7Total);
    expect(summary.reportScoredBallHandlingCount).toBe(summary.rollType7Total);
    expect(summary.reportExcludedRollType7Count).toBe(0);
    const scoredReasonEntries = Object.entries(summary.reportStatusReasonCounts);
    expect(scoredReasonEntries.length).toBeGreaterThan(0);
    expect(scoredReasonEntries.every(([reason]) => reason.startsWith(gate.requiredScoredReasonPrefix))).toBe(true);
    expect(scoredReasonEntries.reduce((total, [, count]) => total + count, 0)).toBe(summary.rollType7Total);
    expect(summary.dieTypeCounts).toEqual({ [String(gate.requiredDieType)]: summary.rollType7Total });
    expect(summary.diceCountDistribution).toEqual({ [String(gate.requiredDiceCount)]: summary.rollType7Total });
    expect(summary.missingTargetCount).toBeLessThanOrEqual(gate.maxMissingTargetCount);
    expect(summary.outcomeDiceThresholdMismatches).toBeLessThanOrEqual(gate.maxOutcomeDiceThresholdMismatches);
    expect(summary.consecutiveRollType7Count).toBeLessThanOrEqual(gate.maxConsecutiveRollType7Count);

    const seenRequirements = Object.keys(summary.requirementValues)
      .map((value) => Number(value))
      .sort((left, right) => left - right);
    const allowedRequirements = [...gate.allowedRequirementValues].sort((left, right) => left - right);
    expect(seenRequirements.every((value) => allowedRequirements.includes(value))).toBe(true);

    const seenDifficulties = Object.keys(summary.difficultyValues)
      .map((value) => Number(value))
      .sort((left, right) => left - right);
    const allowedDifficulties = [...gate.allowedDifficultyValues].sort((left, right) => left - right);
    expect(seenDifficulties.every((value) => allowedDifficulties.includes(value))).toBe(true);

    const seenStepTypes = Object.keys(summary.stepTypeCounts)
      .map((value) => Number(value))
      .sort((left, right) => left - right);
    const allowedStepTypes = [...gate.allowedStepTypes].sort((left, right) => left - right);
    expect(seenStepTypes.every((value) => allowedStepTypes.includes(value))).toBe(true);

    const seenModifierSums = Object.keys(summary.modifierSumCounts)
      .map((value) => Number(value))
      .sort((left, right) => left - right);
    const allowedModifierSums = [...gate.allowedModifierSums].sort((left, right) => left - right);
    expect(seenModifierSums.every((value) => allowedModifierSums.includes(value))).toBe(true);

    const seenNextRollTypes = Object.keys(summary.nextRollTypeCounts).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const allowedNextRollTypes = [...gate.allowedNextRollTypes].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    expect(seenNextRollTypes.every((rollType) => allowedNextRollTypes.includes(rollType))).toBe(true);

    const kickoffTurnShare = summary.rollType7Total > 0 ? summary.kickoffTurnRollType7Count / summary.rollType7Total : 0;
    const kickoffSameTurnShare = summary.rollType7Total > 0 ? summary.kickoffSameTurnBeforeRollType7Count / summary.rollType7Total : 0;

    expect(kickoffTurnShare).toBeGreaterThanOrEqual(gate.minKickoffTurnShare);
    expect(kickoffSameTurnShare).toBeGreaterThanOrEqual(gate.minKickoffSameTurnBeforeShare);
    expect(summary.chain25725Count).toBeGreaterThanOrEqual(gate.minChain25725Count);
    expect(summary.nonScatterFollowupCount).toBeGreaterThanOrEqual(gate.minNonScatterFollowupCount);
  });
});
