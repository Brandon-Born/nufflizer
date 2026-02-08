export type AnalysisFinding = {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  turnNumber?: number;
};

export type TurnAdvice = {
  turnNumber: number;
  summary: string;
  recommendation: string;
  confidence: "low" | "medium";
};

export type AnalysisMetrics = {
  totalTurns: number;
  turnoverSignals: number;
  rerollSignals: number;
  aggressiveActionSignals: number;
};

export type AnalysisResult = {
  metrics: AnalysisMetrics;
  findings: AnalysisFinding[];
  turnAdvice: TurnAdvice[];
};
