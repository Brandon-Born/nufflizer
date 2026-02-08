import type { AnalysisResult } from "@/domain/analysis/types";
import { summarizeMatch } from "@/domain/analysis/summarizeMatch";

export type CoachingReport = {
  headline: string;
  priorities: string[];
  turnByTurn: Array<{
    turnNumber: number;
    note: string;
    betterLine: string;
  }>;
};

export function renderCoaching(analysis: AnalysisResult): CoachingReport {
  const headline = summarizeMatch(analysis);

  const priorities = analysis.findings.slice(0, 5).map((finding) => `${finding.title}: ${finding.detail}`);

  if (priorities.length === 0) {
    priorities.push("No major issues detected by current ruleset. Expand heuristic coverage for deeper review.");
  }

  const turnByTurn = analysis.turnAdvice.slice(0, 16).map((advice) => ({
    turnNumber: advice.turnNumber,
    note: advice.summary,
    betterLine: advice.recommendation
  }));

  return {
    headline,
    priorities,
    turnByTurn
  };
}
