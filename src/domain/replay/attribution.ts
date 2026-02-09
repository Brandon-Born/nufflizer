import type { ReplayEvent, ReplayModel, ReplayTurn } from "@/domain/replay/types";

export type TeamInferenceConfidence = "low" | "medium" | "high";

export type PlayerOwnershipIndex = {
  playerToTeam: Map<string, string>;
  ambiguousPlayerIds: Set<string>;
  teamToPlayers: Map<string, Set<string>>;
};

export type TurnOwnershipInference = {
  teamId?: string;
  confidence: TeamInferenceConfidence;
  scoreByTeam: Record<string, number>;
};

function parseTeamPlayerKey(key: string): { teamId: string; playerId: string } | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= key.length - 1) {
    return null;
  }

  const teamId = key.slice(0, separatorIndex);
  const playerId = key.slice(separatorIndex + 1);
  if (!teamId || !playerId) {
    return null;
  }

  return {
    teamId,
    playerId
  };
}

function normalizeOwnershipInput(input: Pick<ReplayModel, "playerNamesByTeamAndId"> | undefined): Record<string, string> {
  if (!input) {
    return {};
  }

  return input.playerNamesByTeamAndId ?? {};
}

export function buildPlayerOwnershipIndex(input: Pick<ReplayModel, "playerNamesByTeamAndId"> | undefined): PlayerOwnershipIndex {
  const byTeam = normalizeOwnershipInput(input);
  const playerToTeam = new Map<string, string>();
  const teamToPlayers = new Map<string, Set<string>>();
  const ambiguousPlayerIds = new Set<string>();

  for (const teamPlayerKey of Object.keys(byTeam)) {
    const parsed = parseTeamPlayerKey(teamPlayerKey);
    if (!parsed) {
      continue;
    }

    const { teamId, playerId } = parsed;
    const existing = playerToTeam.get(playerId);

    if (!existing) {
      playerToTeam.set(playerId, teamId);
    } else if (existing !== teamId) {
      ambiguousPlayerIds.add(playerId);
      playerToTeam.delete(playerId);
    }

    if (!teamToPlayers.has(teamId)) {
      teamToPlayers.set(teamId, new Set());
    }

    teamToPlayers.get(teamId)!.add(playerId);
  }

  for (const ambiguousPlayerId of ambiguousPlayerIds) {
    playerToTeam.delete(ambiguousPlayerId);
  }

  return {
    playerToTeam,
    ambiguousPlayerIds,
    teamToPlayers
  };
}

function addScore(scores: Map<string, number>, teamId: string | undefined, score: number): void {
  if (!teamId) {
    return;
  }

  scores.set(teamId, (scores.get(teamId) ?? 0) + score);
}

function eventWeight(event: ReplayEvent): number {
  if (event.type === "dodge" || event.type === "blitz" || event.type === "foul" || event.type === "reroll") {
    return 4;
  }

  if (event.type === "block") {
    return 3;
  }

  if (event.type === "ball_state") {
    return 2;
  }

  return 1;
}

function toObjectScores(scores: Map<string, number>): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [teamId, value] of scores.entries()) {
    result[teamId] = value;
  }

  return result;
}

function confidenceFromTopScores(topScore: number, secondScore: number): TeamInferenceConfidence {
  const delta = topScore - secondScore;

  if (topScore >= 10 && delta >= 5) {
    return "high";
  }

  if (topScore >= 5 && delta >= 2) {
    return "medium";
  }

  return "low";
}

function inferEventTeamId(event: ReplayEvent, ownershipIndex: PlayerOwnershipIndex): { teamId?: string; source?: ReplayEvent["actorTeamSource"] } {
  if (event.actorTeamId) {
    return {
      teamId: event.actorTeamId,
      source: event.actorTeamSource ?? "explicit"
    };
  }

  if (event.teamId) {
    return {
      teamId: event.teamId,
      source: "explicit"
    };
  }

  if (event.playerId) {
    const fromPlayer = ownershipIndex.playerToTeam.get(event.playerId);
    if (fromPlayer) {
      return {
        teamId: fromPlayer,
        source: "player_map"
      };
    }
  }

  return {};
}

export function inferTurnOwnership(turn: ReplayTurn, ownershipIndex: PlayerOwnershipIndex): TurnOwnershipInference {
  const scores = new Map<string, number>();

  addScore(scores, turn.teamId, 3);

  for (const event of turn.events) {
    const inferred = inferEventTeamId(event, ownershipIndex);
    addScore(scores, inferred.teamId, eventWeight(event));
  }

  if (turn.ballCarrierPlayerId) {
    addScore(scores, ownershipIndex.playerToTeam.get(turn.ballCarrierPlayerId), 3);
  }

  const ranked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return {
      confidence: "low",
      scoreByTeam: {}
    };
  }

  if (ranked.length > 1 && ranked[0]![1] === ranked[1]![1]) {
    return {
      confidence: "low",
      scoreByTeam: toObjectScores(scores)
    };
  }

  const topScore = ranked[0]![1];
  const secondScore = ranked[1]?.[1] ?? 0;

  return {
    teamId: ranked[0]![0],
    confidence: confidenceFromTopScores(topScore, secondScore),
    scoreByTeam: toObjectScores(scores)
  };
}

export function annotateTurnAttribution(turn: ReplayTurn, ownershipIndex: PlayerOwnershipIndex): ReplayTurn {
  const inferred = inferTurnOwnership(turn, ownershipIndex);

  const events: ReplayEvent[] = turn.events.map((event): ReplayEvent => {
    const existing = inferEventTeamId(event, ownershipIndex);

    if (existing.teamId) {
      return {
        ...event,
        actorTeamId: existing.teamId,
        actorTeamSource: existing.source as ReplayEvent["actorTeamSource"]
      };
    }

    if (inferred.teamId) {
      return {
        ...event,
        actorTeamId: inferred.teamId,
        actorTeamSource: "turn_inferred"
      };
    }

    return event;
  });

  const nextTurnTeamId =
    turn.teamId ??
    (inferred.teamId && (inferred.confidence === "high" || inferred.confidence === "medium") ? inferred.teamId : undefined);

  return {
    ...turn,
    teamId: nextTurnTeamId,
    inferredTeamId: inferred.teamId,
    teamInferenceConfidence: inferred.confidence,
    events
  };
}

function eventBelongsToTeam(
  event: ReplayEvent,
  scopedTeamId: string,
  inferredTurnTeamId: string | undefined,
  ownershipIndex: PlayerOwnershipIndex
): boolean {
  const inferred = inferEventTeamId(event, ownershipIndex);

  if (inferred.teamId) {
    return inferred.teamId === scopedTeamId;
  }

  if (inferredTurnTeamId && inferredTurnTeamId !== scopedTeamId) {
    return false;
  }

  return true;
}

export function scopeTurnToTeam(turn: ReplayTurn, scopedTeamId: string, ownershipIndex: PlayerOwnershipIndex, turnNumber: number): ReplayTurn {
  const inferred = inferTurnOwnership(turn, ownershipIndex);
  const inferredTeamId = inferred.teamId ?? turn.teamId;

  const scopedEvents: ReplayEvent[] = turn.events
    .map((event): ReplayEvent => {
      const inferredEvent = inferEventTeamId(event, ownershipIndex);

      if (inferredEvent.teamId) {
        return {
          ...event,
          actorTeamId: inferredEvent.teamId,
          actorTeamSource: inferredEvent.source as ReplayEvent["actorTeamSource"]
        };
      }

      if (inferredTeamId) {
        return {
          ...event,
          actorTeamId: inferredTeamId,
          actorTeamSource: "turn_inferred" as const
        };
      }

      return event;
    })
    .filter((event) => eventBelongsToTeam(event, scopedTeamId, inferredTeamId, ownershipIndex));

  const carrierTeamId = turn.ballCarrierPlayerId ? ownershipIndex.playerToTeam.get(turn.ballCarrierPlayerId) : undefined;
  const scopedCarrier =
    turn.ballCarrierPlayerId && carrierTeamId && carrierTeamId !== scopedTeamId ? undefined : turn.ballCarrierPlayerId;

  const actionTexts = Array.from(
    new Set(
      scopedEvents
        .flatMap((event) => [event.type, event.sourceTag, event.actionLabel, event.stepLabel])
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase())
    )
  );

  return {
    ...turn,
    turnNumber,
    teamId: scopedTeamId,
    inferredTeamId,
    teamInferenceConfidence: inferred.confidence,
    ballCarrierPlayerId: scopedCarrier,
    events: scopedEvents,
    actionTexts,
    eventCount: scopedEvents.length
  };
}
