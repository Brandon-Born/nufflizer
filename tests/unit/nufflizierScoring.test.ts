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
            rollType: 3,
            rollLabel: "dodge",
            payload: {
              Requirement: 6,
              Difficulty: 6,
              Outcome: 1,
              Dice: { Die: { DieType: 0, Value: 6 } }
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
            rollType: 3,
            rollLabel: "dodge",
            payload: {
              Requirement: 2,
              Difficulty: 2,
              Outcome: 0,
              Dice: { Die: { DieType: 0, Value: 1 } }
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

    expect(report.verdict.luckierTeam).toBe("home");
    expect(report.verdict.scoreGap).toBeGreaterThan(0);
    expect(report.teams).toHaveLength(2);
    expect(report.keyMoments.length).toBeGreaterThan(0);
  });

  it("marks blessed and shaftaroonie moments", () => {
    const report = analyzeReplayLuck(buildReplayModel());
    const tags = report.keyMoments.flatMap((moment) => moment.tags);

    expect(tags).toContain("blessed");
    expect(tags).toContain("shaftaroonie");
  });
});
