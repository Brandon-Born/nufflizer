export type LuckEventType = "block" | "armor_break" | "injury" | "dodge" | "ball_handling" | "argue_call";

export type LuckMomentTag = "blessed" | "shaftaroonie";

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
  teams: [LuckTeamAggregate, LuckTeamAggregate];
  keyMoments: LuckEvent[];
  events: LuckEvent[];
};
