import type { TurnAdvice } from "@/domain/analysis/types";
import type { TimelineTurn } from "@/domain/replay/types";

export function evaluateTurn(turn: TimelineTurn): TurnAdvice | null {
  const riskScore = turn.keywordHits.turnover * 3 + turn.keywordHits.dodge + turn.keywordHits.blitz;

  if (riskScore === 0) {
    return null;
  }

  const recommendation =
    turn.keywordHits.turnover > 0
      ? "Prioritize low-risk positioning and reserve high-variance actions for after key ball safety moves."
      : "Sequence safer moves first, then commit to high-variance actions once board position is secured.";

  return {
    turnNumber: turn.turnNumber,
    summary: `Detected elevated risk signals on this turn (score ${riskScore}).`,
    recommendation,
    confidence: riskScore >= 3 ? "medium" : "low"
  };
}
