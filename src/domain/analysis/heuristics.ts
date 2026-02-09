import type { AnalysisFinding, AnalysisResult } from "@/domain/analysis/types";
import {
  evaluateActionOrdering,
  evaluateBallSafety,
  evaluateRerollTiming,
  evaluateTurnoverCause,
  findingsToTurnAdvice
} from "@/domain/analysis/rules";
import type { ReplayModel, TimelineTurn } from "@/domain/replay/types";

function rankBySeverity(findings: AnalysisFinding[]): AnalysisFinding[] {
  const score = {
    high: 3,
    medium: 2,
    low: 1
  } as const;

  return [...findings].sort((a, b) => score[b.severity] - score[a.severity]);
}

export function analyzeReplayTimeline(replay: ReplayModel, timeline: TimelineTurn[]): AnalysisResult {
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
      aggressiveActionSignals: 0,
      ballCarrierTransitions: 0
    }
  );

  for (let i = 1; i < replay.turns.length; i += 1) {
    const current = replay.turns[i];
    const previous = replay.turns[i - 1];
    if (current?.ballCarrierPlayerId && previous?.ballCarrierPlayerId && current.ballCarrierPlayerId !== previous.ballCarrierPlayerId) {
      metrics.ballCarrierTransitions += 1;
    }
  }

  const findings = rankBySeverity([
    ...evaluateTurnoverCause(replay),
    ...evaluateRerollTiming(replay),
    ...evaluateActionOrdering(replay),
    ...evaluateBallSafety(replay)
  ]);

  const turnAdvice = findingsToTurnAdvice(findings);

  return {
    metrics,
    findings,
    turnAdvice
  };
}
