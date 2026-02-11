export type LuckEventType = "block" | "armor_break" | "injury" | "dodge" | "ball_handling" | "argue_call";

export type LuckMomentTag = "blessed" | "shaftaroonie";
export type LuckCalculationMethod = "explicit" | "fallback";

export type LuckEventMetadata = {
  sourceTag: string;
  rollType?: number;
  rollLabel?: string;
  stepType?: number;
  stepLabel?: string;
  actionCode?: number;
  actionLabel?: string;
  outcomeCode?: number;
  requirement?: number;
  difficulty?: number;
  dice?: number[];
  dieTypes?: number[];
  modifiers?: number[];
  modifiersSum?: number;
  rerollAvailable?: boolean;
  rerollUsed?: boolean;
  skillsUsed?: number[];
  normalizationFlags?: string[];
  normalizationNotes?: string[];
};

export type LuckEvent = {
  id: string;
  turn: number;
  teamId: string;
  teamName: string;
  playerId?: string;
  type: LuckEventType;
  probabilitySuccess: number;
  actualSuccess: boolean;
  delta: number;
  weightedDelta: number;
  label: string;
  tags: LuckMomentTag[];
  calculationMethod: LuckCalculationMethod;
  calculationReason: string;
  explainability: {
    target: string;
    baseOdds: number;
    rerollAdjustedOdds: number;
    weight: number;
    formulaSummary: string;
    inputsSummary: string;
  };
  metadata: LuckEventMetadata;
};

export type LuckTeamAggregate = {
  teamId: string;
  teamName: string;
  luckScore: number;
  categoryScores: {
    block: number;
    armorBreak: number;
    injury: number;
    dodge: number;
    ballHandling: number;
    argueCall: number;
  };
  eventCount: number;
};

export type LuckVerdict = {
  luckierTeam: "home" | "away" | "even";
  scoreGap: number;
  summary: string;
};

export type LuckReport = {
  id: string;
  generatedAt: string;
  match: {
    id: string;
    homeTeam: string;
    awayTeam: string;
  };
  verdict: LuckVerdict;
  coverage: {
    explicitCount: number;
    fallbackCount: number;
    explicitRate: number;
    byType: Record<LuckEventType, { explicit: number; fallback: number }>;
  };
  weightTable: Record<LuckEventType, number>;
  howScoredSummary: string[];
  teams: [LuckTeamAggregate, LuckTeamAggregate];
  keyMoments: LuckEvent[];
  events: LuckEvent[];
};
