import type { AnalysisFinding, TeamContext } from "@/domain/analysis/types";

const BASE_SEVERITY_SCORE = {
  high: 300,
  medium: 200,
  low: 100
} as const;

function hasTurnoverSignal(finding: AnalysisFinding): boolean {
  if (finding.category === "turnover_cause") {
    return true;
  }

  return finding.evidence.some((item) => item.eventType === "turnover" || /turnover/i.test(item.code ?? ""));
}

function hasBallLossSignal(finding: AnalysisFinding): boolean {
  if (finding.category !== "ball_safety") {
    return false;
  }

  return /opponent took the ball|lost control of the ball/i.test(`${finding.title} ${finding.detail}`);
}

function hasLateTurnRiskSignal(finding: AnalysisFinding, context: TeamContext): boolean {
  if (context.mode === "defense") {
    return false;
  }

  if (!finding.turnNumber) {
    return false;
  }

  return finding.turnNumber >= 13 && finding.turnNumber <= 16;
}

export function calculateImpactScore(finding: AnalysisFinding, context: TeamContext, repeatedCategoryCount: number): number {
  let score = BASE_SEVERITY_SCORE[finding.severity];

  if (hasTurnoverSignal(finding)) {
    score += 120;
  }

  if (hasBallLossSignal(finding)) {
    score += 100;
  }

  if (hasLateTurnRiskSignal(finding, context)) {
    score += 60;
  }

  if (repeatedCategoryCount > 0) {
    score += repeatedCategoryCount * 20;
  }

  return score;
}

export function applyImpactScores(findings: AnalysisFinding[], context: TeamContext): AnalysisFinding[] {
  const categoryUsage = new Map<string, number>();

  const seeded = [...findings].sort((a, b) => {
    const aTurn = a.turnNumber ?? Number.MAX_SAFE_INTEGER;
    const bTurn = b.turnNumber ?? Number.MAX_SAFE_INTEGER;
    return aTurn - bTurn;
  });

  return seeded.map((finding) => {
    const repeatedCount = categoryUsage.get(finding.category) ?? 0;
    categoryUsage.set(finding.category, repeatedCount + 1);

    return {
      ...finding,
      impactScore: calculateImpactScore(finding, context, repeatedCount)
    };
  });
}

export function sortFindingsByImpact(findings: AnalysisFinding[]): AnalysisFinding[] {
  return [...findings].sort((a, b) => {
    if (b.impactScore !== a.impactScore) {
      return b.impactScore - a.impactScore;
    }

    const aTurn = a.turnNumber ?? Number.MAX_SAFE_INTEGER;
    const bTurn = b.turnNumber ?? Number.MAX_SAFE_INTEGER;
    return aTurn - bTurn;
  });
}
