export type ReplayTeam = {
  id: string;
  name: string;
  coach?: string;
};

export type ReplayEventType =
  | "block"
  | "blitz"
  | "foul"
  | "dodge"
  | "reroll"
  | "casualty"
  | "ball_state"
  | "turnover";

export type ReplayEvent = {
  type: ReplayEventType;
  sourceTag: string;
  sourceLabel?: string;
  playerId?: string;
  targetId?: string;
  teamId?: string;
  actorTeamId?: string;
  actorTeamSource?: "explicit" | "player_map" | "turn_inferred";
  gamerId?: string;
  actionCode?: number;
  actionLabel?: string;
  stepType?: number;
  stepLabel?: string;
  reasonCode?: number;
  reasonLabel?: string;
  finishingTurnType?: number;
  payload?: Record<string, unknown>;
};

export type ReplayTurn = {
  turnNumber: number;
  teamId?: string;
  inferredTeamId?: string;
  teamInferenceConfidence?: "low" | "medium" | "high";
  gamerId?: string;
  ballCarrierPlayerId?: string;
  possibleTurnover: boolean;
  endTurnReason?: number;
  endTurnReasonLabel?: string;
  finishingTurnType?: number;
  events: ReplayEvent[];
  actionTexts: string[];
  eventCount: number;
  raw: unknown;
};

export type ReplayUnknownCode = {
  category: "step" | "action" | "roll" | "end_turn_reason";
  code: number;
  occurrences: number;
};

export type ReplayParserDiagnostics = {
  unknownCodeTotal: number;
  unknownCodesByCategory: Record<ReplayUnknownCode["category"], number>;
  turnAttribution: {
    totalTurns: number;
    explicitTeamTurns: number;
    inferredTeamTurns: number;
    unresolvedTeamTurns: number;
    highConfidenceInferences: number;
    mediumConfidenceInferences: number;
    lowConfidenceInferences: number;
  };
  eventAttribution: {
    explicit: number;
    player_map: number;
    turn_inferred: number;
    unresolved: number;
  };
};

export type ReplayModel = {
  matchId: string;
  rootTag: string;
  replayVersion?: string;
  teams: ReplayTeam[];
  analysisTeamId?: string;
  playerNamesByTeamAndId?: Record<string, string>;
  playerNamesById?: Record<string, string>;
  turns: ReplayTurn[];
  unknownCodes: ReplayUnknownCode[];
  parserDiagnostics?: ReplayParserDiagnostics;
  raw: unknown;
};

export type TimelineTurn = {
  turnNumber: number;
  teamId?: string;
  rawEventCount: number;
  keywordHits: {
    turnover: number;
    reroll: number;
    blitz: number;
    foul: number;
    dodge: number;
    block: number;
  };
};
