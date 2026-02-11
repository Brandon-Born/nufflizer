import { describe, expect, it } from "vitest";

import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import type { ReplayModel } from "@/domain/replay/types";

function buildReplayModel(): ReplayModel {
  return {
    matchId: "nuff-test-001",
    rootTag: "Replay",
    teams: [
      { id: "home", name: "Home Team" },
      { id: "away", name: "Away Team" }
    ],
    turns: [
      {
        turnNumber: 1,
        teamId: "home",
        inferredTeamId: "home",
        teamInferenceConfidence: "high",
        gamerId: "0",
        ballCarrierPlayerId: undefined,
        possibleTurnover: false,
        endTurnReason: 1,
        endTurnReasonLabel: "manual_end",
        finishingTurnType: 0,
        actionTexts: ["dodge"],
        eventCount: 1,
        raw: {},
        events: [
          {
            type: "roll",
            sourceTag: "ResultRoll",
            sourceLabel: "generic_roll",
            teamId: "home",
            actorTeamId: "home",
            actorTeamSource: "explicit",
            rollType: 2,
            rollLabel: "block_dice",
            payload: {
              Requirement: 6,
              Difficulty: 6,
              Outcome: 1,
              Dice: { Die: { DieType: 0, Value: 5 } }
            }
          }
        ]
      },
      {
        turnNumber: 2,
        teamId: "away",
        inferredTeamId: "away",
        teamInferenceConfidence: "high",
        gamerId: "1",
        ballCarrierPlayerId: undefined,
        possibleTurnover: false,
        endTurnReason: 1,
        endTurnReasonLabel: "manual_end",
        finishingTurnType: 0,
        actionTexts: ["dodge"],
        eventCount: 1,
        raw: {},
        events: [
          {
            type: "roll",
            sourceTag: "ResultRoll",
            sourceLabel: "generic_roll",
            teamId: "away",
            actorTeamId: "away",
            actorTeamSource: "explicit",
            rollType: 10,
            rollLabel: "gfi",
            stepType: 1,
            payload: {
              Requirement: 2,
              Difficulty: 2,
              Outcome: 0,
              Dice: { Die: { DieType: 0, Value: 1 } }
            }
          }
        ]
      },
      {
        turnNumber: 3,
        teamId: "away",
        inferredTeamId: "away",
        teamInferenceConfidence: "high",
        gamerId: "1",
        ballCarrierPlayerId: undefined,
        possibleTurnover: false,
        endTurnReason: 1,
        endTurnReasonLabel: "manual_end",
        finishingTurnType: 0,
        actionTexts: ["argue"],
        eventCount: 1,
        raw: {},
        events: [
          {
            type: "roll",
            sourceTag: "ResultArgueCall",
            sourceLabel: "argue_call",
            teamId: "away",
            actorTeamId: "away",
            actorTeamSource: "explicit",
            rollType: 99,
            payload: {
              Requirement: 4,
              Difficulty: 4,
              Outcome: 1,
              Dice: { Die: { DieType: 0, Value: 5 } }
            }
          }
        ]
      }
    ],
    unknownCodes: [],
    raw: {}
  };
}

describe("nufflizier scoring", () => {
  it("builds a luck verdict and score gap", () => {
    const report = analyzeReplayLuck(buildReplayModel());

    expect(["home", "away"]).toContain(report.verdict.luckierTeam);
    expect(report.verdict.scoreGap).toBeGreaterThan(0);
    expect(report.teams).toHaveLength(2);
    expect(report.keyMoments.length).toBeGreaterThan(0);
    expect(report.coverage.scoredCount).toBeGreaterThanOrEqual(1);
    expect(report.coverage.excludedCount).toBeGreaterThanOrEqual(1);
    expect(report.howScoredSummary.length).toBeGreaterThan(0);
    expect(report.weightTable.block).toBeGreaterThan(0);
    expect(report.coverage.scoredByType.dodge).toBeGreaterThanOrEqual(1);
    expect(report.coverage.excludedByType.block).toBeGreaterThanOrEqual(0);
    expect(
      report.events
        .filter((event) => event.scoringStatus === "scored")
        .every((event) => (event.explainability.formulaSummary?.length ?? 0) > 0)
    ).toBe(true);
    expect(report.events.every((event) => event.explainability.inputsSummary.length > 0)).toBe(true);
  });

  it("marks blessed and shaftaroonie moments", () => {
    const report = analyzeReplayLuck(buildReplayModel());
    const tags = report.keyMoments.flatMap((moment) => moment.tags);

    expect(tags).toContain("blessed");
    expect(tags).toContain("shaftaroonie");
  });

  it("labels event scoring status", () => {
    const report = analyzeReplayLuck(buildReplayModel());
    const statuses = new Set(report.events.map((event) => event.scoringStatus));

    expect(statuses.has("scored")).toBe(true);
    expect(statuses.has("excluded")).toBe(true);
    expect(report.events.every((event) => event.statusReason.length > 0)).toBe(true);
  });
});
