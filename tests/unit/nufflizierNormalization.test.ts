import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import type { ReplayModel } from "@/domain/replay/types";

function readModelFixture(name: string): ReplayModel {
  const input = readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "models", name), "utf-8");
  return JSON.parse(input) as ReplayModel;
}

describe("nufflizier normalization", () => {
  it("keeps argue-call variants scored/excluded with transparent reasons", () => {
    const report = analyzeReplayLuck(readModelFixture("argue-edge-replay.json"));
    const argueEvents = report.events.filter((event) => event.type === "argue_call");

    expect(argueEvents).toHaveLength(3);

    const roll71 = argueEvents.find((event) => event.metadata.rollType === 71);
    const roll42 = argueEvents.find((event) => event.metadata.rollType === 42);
    const roll70 = argueEvents.find((event) => event.metadata.rollType === 70);

    expect(roll71?.scoringStatus).toBe("scored");
    expect(roll42?.scoringStatus).toBe("excluded");
    expect(roll42?.statusReason).toMatch(/unsupported ResultRoll context|missing target threshold/i);
    expect(roll70?.scoringStatus).toBe("excluded");
    expect(roll70?.statusReason).toMatch(/missing target threshold/i);

    expect(report.coverage.scoredByType.argue_call).toBe(1);
    expect(report.coverage.excludedByType.argue_call).toBe(2);
    expect(
      Object.keys(report.coverage.excludedByReason).some((reason) => /missing target threshold|unsupported ResultRoll context/i.test(reason))
    ).toBe(true);
  });

  it("emits normalization flags for ambiguous event context", () => {
    const report = analyzeReplayLuck(readModelFixture("argue-edge-replay.json"));
    const roll70 = report.events.find((event) => event.type === "argue_call" && event.metadata.rollType === 70);

    expect(roll70).toBeDefined();
    expect(roll70?.metadata.normalizationFlags).toContain("ambiguous_team_attribution");
    expect(roll70?.metadata.normalizationFlags).toContain("missing_target_threshold");
    expect(roll70?.metadata.normalizationFlags).toContain("skill_modifier_present_without_explicit_reroll");
    expect(roll70?.metadata.normalizationFlags).toContain("insufficient_dice_metadata");
    expect(roll70?.metadata.normalizationNotes?.length).toBeGreaterThan(0);
  });

  it("flags unstable target context for rollType 42 and keeps exclusion", () => {
    const report = analyzeReplayLuck(readModelFixture("argue-rolltype-42.json"));
    const roll42 = report.events.filter((event) => event.type === "argue_call" && event.metadata.rollType === 42);

    expect(roll42.length).toBeGreaterThan(0);
    expect(roll42.every((event) => event.scoringStatus === "excluded")).toBe(true);
    expect(roll42.some((event) => (event.metadata.normalizationFlags ?? []).includes("missing_target_threshold"))).toBe(true);
  });

  it("links block chain members to nearest block anchor", () => {
    const report = analyzeReplayLuck({
      matchId: "merge-block-001",
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
          actionTexts: ["block"],
          eventCount: 3,
          raw: {},
          events: [
            {
              type: "block",
              sourceTag: "ResultBlockRoll",
              sourceLabel: "block_resolution",
              teamId: "home",
              actorTeamId: "home",
              actorTeamSource: "explicit",
              playerId: "p1",
              targetId: "t1",
              rollType: 3,
              payload: {
                Dice: {
                  Die: { DieType: 2, Value: 3 }
                },
                Outcome: 6
              }
            },
            {
              type: "roll",
              sourceTag: "ResultRoll",
              sourceLabel: "generic_roll",
              teamId: "home",
              actorTeamId: "home",
              actorTeamSource: "explicit",
              playerId: "p1",
              targetId: "t1",
              rollType: 2,
              payload: {
                Requirement: 3,
                Difficulty: 3,
                Outcome: 1,
                Dice: { Die: { DieType: 0, Value: 4 } }
              }
            },
            {
              type: "block",
              sourceTag: "ResultBlockOutcome",
              sourceLabel: "block_resolution",
              teamId: "home",
              actorTeamId: "home",
              actorTeamSource: "explicit",
              playerId: "p1",
              targetId: "t1",
              payload: {
                Outcome: 6
              }
            }
          ]
        }
      ],
      unknownCodes: [],
      raw: {}
    } satisfies ReplayModel);

    const blockAnchor = report.events.find(
      (event) => event.type === "block" && event.scoringStatus === "scored" && event.metadata.sourceTag === "ResultRoll"
    );
    const mergedMembers = report.events.filter((event) => event.metadata.mergedBlockAnchorId);

    expect(blockAnchor).toBeDefined();
    expect(mergedMembers.length).toBeGreaterThanOrEqual(1);
    expect(mergedMembers.every((event) => event.metadata.mergedBlockAnchorId === blockAnchor?.id)).toBe(true);
    expect(mergedMembers.every((event) => /merged into block anchor/i.test(event.statusReason))).toBe(true);
  });
});
