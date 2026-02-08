import type { AnalysisFinding, AnalysisResult } from "@/domain/analysis/types";
import { evaluateTurn } from "@/domain/analysis/evaluateTurn";
import type { TimelineTurn } from "@/domain/replay/types";

function createFinding(
  id: string,
  severity: AnalysisFinding["severity"],
  title: string,
  detail: string,
  turnNumber?: number
): AnalysisFinding {
  return {
    id,
    severity,
    title,
    detail,
    turnNumber
  };
}

export function analyzeReplayTimeline(timeline: TimelineTurn[]): AnalysisResult {
  const metrics = timeline.reduce(
    (acc, turn) => {
      acc.totalTurns += 1;
      acc.turnoverSignals += turn.keywordHits.turnover;
      acc.rerollSignals += turn.keywordHits.reroll;
      acc.aggressiveActionSignals += turn.keywordHits.blitz + turn.keywordHits.dodge + turn.keywordHits.block;

      return acc;
    },
    {
      totalTurns: 0,
      turnoverSignals: 0,
      rerollSignals: 0,
      aggressiveActionSignals: 0
    }
  );

  const findings: AnalysisFinding[] = [];

  const turnoverRate = metrics.turnoverSignals / Math.max(metrics.totalTurns, 1);
  if (turnoverRate > 0.4) {
    findings.push(
      createFinding(
        "high-turnover-rate",
        "high",
        "Frequent turnover signals",
        "Replay suggests repeated turnover-risk outcomes. Consider safer sequencing before high-variance actions."
      )
    );
  }

  if (metrics.totalTurns > 0 && metrics.rerollSignals === 0) {
    findings.push(
      createFinding(
        "no-reroll-signals",
        "medium",
        "No reroll usage detected",
        "Review reroll opportunities when critical actions fail early in the turn."
      )
    );
  }

  if (metrics.aggressiveActionSignals > metrics.totalTurns * 3) {
    findings.push(
      createFinding(
        "high-aggression",
        "medium",
        "Aggressive action density",
        "High block/blitz/dodge density can increase volatility. Confirm objective-first sequencing each turn."
      )
    );
  }

  const turnAdvice = timeline.map(evaluateTurn).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  for (const advice of turnAdvice.slice(0, 3)) {
    findings.push(
      createFinding(
        `turn-${advice.turnNumber}-risk`,
        advice.confidence === "medium" ? "medium" : "low",
        `Risk signal on turn ${advice.turnNumber}`,
        advice.recommendation,
        advice.turnNumber
      )
    );
  }

  return {
    metrics,
    findings,
    turnAdvice
  };
}
