export type ReplayTeam = {
  id: string;
  name: string;
  coach?: string;
};

export type ReplayTurn = {
  turnNumber: number;
  teamId?: string;
  actionTexts: string[];
  eventCount: number;
  raw: unknown;
};

export type ReplayModel = {
  matchId: string;
  rootTag: string;
  teams: ReplayTeam[];
  turns: ReplayTurn[];
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
    dodge: number;
    block: number;
  };
};
