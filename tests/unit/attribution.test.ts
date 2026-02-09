import { describe, expect, it } from "vitest";

import {
  annotateTurnAttribution,
  buildPlayerOwnershipIndex,
  inferTurnOwnership,
  scopeTurnToTeam
} from "@/domain/replay/attribution";
import type { ReplayTurn } from "@/domain/replay/types";

function buildTurn(partial: Partial<ReplayTurn>): ReplayTurn {
  return {
    turnNumber: 1,
    teamId: undefined,
    inferredTeamId: undefined,
    teamInferenceConfidence: undefined,
    gamerId: undefined,
    ballCarrierPlayerId: undefined,
    possibleTurnover: false,
    endTurnReason: undefined,
    endTurnReasonLabel: undefined,
    finishingTurnType: undefined,
    events: [],
    actionTexts: [],
    eventCount: 0,
    raw: {},
    ...partial
  };
}

describe("replay attribution", () => {
  it("marks overlapping player ids as ambiguous", () => {
    const index = buildPlayerOwnershipIndex({
      playerNamesByTeamAndId: {
        "0:9": "Alpha",
        "1:9": "Beta",
        "1:7": "Gamma"
      }
    });

    expect(index.playerToTeam.get("7")).toBe("1");
    expect(index.playerToTeam.get("9")).toBeUndefined();
    expect(index.ambiguousPlayerIds.has("9")).toBe(true);
  });

  it("infers team ownership when turn.teamId is missing", () => {
    const index = buildPlayerOwnershipIndex({
      playerNamesByTeamAndId: {
        "0:3": "Sir Chugs-a-Lot",
        "1:50": "The Rizzler"
      }
    });

    const turn = buildTurn({
      turnNumber: 9,
      ballCarrierPlayerId: "50",
      events: [
        { type: "dodge", sourceTag: "ResultRoll", playerId: "50" },
        { type: "blitz", sourceTag: "ResultUseAction", playerId: "50" }
      ],
      eventCount: 2
    });

    const inferred = inferTurnOwnership(turn, index);

    expect(inferred.teamId).toBe("1");
    expect(["medium", "high"]).toContain(inferred.confidence);
  });

  it("scopes turn data to selected team and strips opponent actors", () => {
    const index = buildPlayerOwnershipIndex({
      playerNamesByTeamAndId: {
        "0:3": "Sir Chugs-a-Lot",
        "1:50": "The Rizzler"
      }
    });

    const turn = buildTurn({
      turnNumber: 5,
      teamId: "0",
      ballCarrierPlayerId: "3",
      events: [
        { type: "dodge", sourceTag: "ResultRoll", playerId: "3", teamId: "0" },
        { type: "dodge", sourceTag: "ResultRoll", playerId: "50", teamId: "1" }
      ],
      eventCount: 2
    });

    const annotated = annotateTurnAttribution(turn, index);
    const scoped = scopeTurnToTeam(annotated, "1", index, 1);

    expect(scoped.teamId).toBe("1");
    expect(scoped.ballCarrierPlayerId).toBeUndefined();
    expect(scoped.events).toHaveLength(1);
    expect(scoped.events[0]?.playerId).toBe("50");
    expect(scoped.events[0]?.actorTeamId).toBe("1");
  });

  it("assigns actorTeamSource from player map and turn inference", () => {
    const index = buildPlayerOwnershipIndex({
      playerNamesByTeamAndId: {
        "1:50": "The Rizzler"
      }
    });

    const playerMappedTurn = buildTurn({
      events: [{ type: "dodge", sourceTag: "ResultRoll", playerId: "50" }],
      eventCount: 1
    });

    const turnInferredTurn = buildTurn({
      teamId: "1",
      events: [{ type: "turnover", sourceTag: "EventEndTurn" }],
      eventCount: 1
    });

    const playerMapped = annotateTurnAttribution(playerMappedTurn, index);
    const turnInferred = annotateTurnAttribution(turnInferredTurn, index);

    expect(playerMapped.events[0]?.actorTeamSource).toBe("player_map");
    expect(turnInferred.events[0]?.actorTeamSource).toBe("turn_inferred");
  });
});
