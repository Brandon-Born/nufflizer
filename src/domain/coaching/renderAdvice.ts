import type { AnalysisResult } from "@/domain/analysis/types";
import { summarizeMatch } from "@/domain/analysis/summarizeMatch";

export type CoachingPriority = {
  id: string;
  turnNumber?: number;
  severity: "low" | "medium" | "high";
  category: string;
  score: number;
  text: string;
};

export type CoachingReport = {
  headline: string;
  priorities: CoachingPriority[];
  turnByTurn: Array<{
    turnNumber: number;
    category: string;
    severity: "low" | "medium" | "high";
    happened: string;
    riskyBecause: string;
    saferAlternative: string;
    confidence: "low" | "medium" | "high";
    evidence: Array<{
      eventType?: string;
      sourceTag?: string;
      code?: string;
      detail?: string;
    }>;
  }>;
};

const CATEGORY_WEIGHT: Record<string, number> = {
  turnover_cause: 100,
  scoring_window: 90,
  reroll_timing: 80,
  ball_safety: 75,
  cage_safety: 70,
  blitz_value: 65,
  surf_risk: 60,
  kickoff_setup: 55,
  action_ordering: 50,
  foul_timing: 45,
  screen_lanes: 40
};

function severityScore(severity: CoachingPriority["severity"]): number {
  if (severity === "high") {
    return 300;
  }

  if (severity === "medium") {
    return 200;
  }

  return 100;
}

export function renderCoaching(analysis: AnalysisResult): CoachingReport {
  const headline = summarizeMatch(analysis);

  const priorities = analysis.findings
    .map((finding) => {
      const turnRef = finding.turnNumber ? `Turn ${finding.turnNumber}` : "Match";
      const score = severityScore(finding.severity) + (CATEGORY_WEIGHT[finding.category] ?? 0);

      return {
        id: finding.id,
        turnNumber: finding.turnNumber,
        severity: finding.severity,
        category: finding.category,
        score,
        text: `${turnRef}: ${finding.recommendation}`
      } satisfies CoachingPriority;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (priorities.length === 0) {
    priorities.push({
      id: "no-major-issues",
      turnNumber: undefined,
      severity: "low",
      category: "action_ordering",
      score: 0,
      text: "No major mistakes were found in this replay. Keep practicing the same safe turn order."
    });
  }

  const turnByTurn = analysis.turnAdvice.slice(0, 16).map((advice) => ({
    turnNumber: advice.turnNumber,
    category: advice.category,
    severity: advice.severity,
    happened: advice.happened,
    riskyBecause: advice.riskyBecause,
    saferAlternative: advice.saferAlternative,
    confidence: advice.confidence,
    evidence: advice.evidence
  }));

  return {
    headline,
    priorities,
    turnByTurn
  };
}
