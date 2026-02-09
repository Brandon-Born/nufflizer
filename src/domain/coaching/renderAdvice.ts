import type { AnalysisResult } from "@/domain/analysis/types";
import { summarizeMatch } from "@/domain/analysis/summarizeMatch";
import { sanitizeCoachingText } from "@/domain/coaching/languageGuard";
import { buildNoMajorIssuesText, buildPriorityText, buildSimpleHeadline } from "@/domain/coaching/templates";

export type CoachingPriority = {
  id: string;
  turnNumber?: number;
  severity: "low" | "medium" | "high";
  category: string;
  score: number;
  impactScore: number;
  text: string;
};

export type CoachingReport = {
  headline: string;
  priorities: CoachingPriority[];
  turnByTurn: Array<{
    turnNumber: number;
    category: string;
    severity: "low" | "medium" | "high";
    impactScore: number;
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

function sortByImpact<T extends { impactScore: number; turnNumber?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (b.impactScore !== a.impactScore) {
      return b.impactScore - a.impactScore;
    }

    const aTurn = a.turnNumber ?? Number.MAX_SAFE_INTEGER;
    const bTurn = b.turnNumber ?? Number.MAX_SAFE_INTEGER;
    return aTurn - bTurn;
  });
}

export function renderCoaching(analysis: AnalysisResult): CoachingReport {
  const headline = sanitizeCoachingText(buildSimpleHeadline(summarizeMatch(analysis)));

  const priorities = sortByImpact(analysis.findings)
    .map((finding) => {
      const text = sanitizeCoachingText(buildPriorityText(finding.turnNumber, finding.recommendation));

      return {
        id: finding.id,
        turnNumber: finding.turnNumber,
        severity: finding.severity,
        category: finding.category,
        score: finding.impactScore,
        impactScore: finding.impactScore,
        text
      } satisfies CoachingPriority;
    })
    .slice(0, 5);

  if (priorities.length === 0) {
    const noMajorIssuesText = sanitizeCoachingText(buildNoMajorIssuesText());
    priorities.push({
      id: "no-major-issues",
      turnNumber: undefined,
      severity: "low",
      category: "action_ordering",
      score: 0,
      impactScore: 0,
      text: noMajorIssuesText
    });
  }

  const turnByTurn = analysis.turnAdvice.slice(0, 16).map((advice) => ({
    turnNumber: advice.turnNumber,
    category: advice.category,
    severity: advice.severity,
    impactScore: advice.impactScore,
    happened: sanitizeCoachingText(advice.happened),
    riskyBecause: sanitizeCoachingText(advice.riskyBecause),
    saferAlternative: sanitizeCoachingText(advice.saferAlternative),
    confidence: advice.confidence,
    evidence: advice.evidence
  }));

  return {
    headline,
    priorities,
    turnByTurn
  };
}
