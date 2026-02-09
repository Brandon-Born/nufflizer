import { describe, expect, it } from "vitest";

import { renderCoaching } from "@/domain/coaching/renderAdvice";
import { containsBlockedCoachingTokens, sanitizeCoachingText } from "@/domain/coaching/languageGuard";
import type { AnalysisResult } from "@/domain/analysis/types";

function buildAnalysisResult(): AnalysisResult {
  return {
    context: {
      mode: "offense",
      offenseTurns: 8,
      defenseTurns: 8,
      ballControlRate: 0.5
    },
    metrics: {
      totalTurns: 16,
      turnoverSignals: 2,
      rerollSignals: 1,
      aggressiveActionSignals: 10,
      ballCarrierTransitions: 2,
      blitzSignals: 2,
      foulSignals: 1
    },
    findings: [
      {
        id: "a",
        category: "turnover_cause",
        severity: "high",
        impactScore: 320,
        title: "Turn 1: turn ended early after a dodge",
        detail: "Your turn stopped before your plan was complete.",
        recommendation: "Do safe moves first.",
        turnNumber: 1,
        evidence: []
      },
      {
        id: "b",
        category: "ball_safety",
        severity: "medium",
        impactScore: 500,
        title: "Turn 2: opponent took the ball",
        detail: "You lost control of the ball.",
        recommendation: "Protect the ball first.",
        turnNumber: 2,
        evidence: []
      }
    ],
    turnAdvice: [
      {
        turnNumber: 2,
        category: "ball_safety",
        severity: "medium",
        impactScore: 500,
        happened: "Turn 2: ResultRoll happened with high variance",
        riskyBecause: "This is high variance and causes tempo loss.",
        saferAlternative: "Pick a low EV line next time.",
        confidence: "medium",
        evidence: []
      }
    ]
  };
}

describe("coaching output", () => {
  it("orders priorities by impact score", () => {
    const report = renderCoaching(buildAnalysisResult());

    expect(report.priorities[0]?.id).toBe("b");
    expect(report.priorities[0]?.impactScore).toBeGreaterThan(report.priorities[1]?.impactScore ?? 0);
    expect(report.priorities[0]?.score).toBe(report.priorities[0]?.impactScore);
  });

  it("sanitizes internal tokens and jargon", () => {
    const report = renderCoaching(buildAnalysisResult());
    const row = report.turnByTurn[0];

    expect(row).toBeDefined();
    expect(row?.happened).not.toContain("ResultRoll");
    expect(row?.riskyBecause).toContain("very risky");
    expect(row?.riskyBecause).toContain("you lost time this drive");
    expect(row?.saferAlternative).toContain("usually loses value");
    expect(containsBlockedCoachingTokens(row?.happened ?? "")).toBe(false);
  });

  it("sanitizes blocked tokens in plain strings", () => {
    const cleaned = sanitizeCoachingText("ResultRoll is high variance with tempo loss.");

    expect(cleaned).not.toContain("ResultRoll");
    expect(cleaned).toContain("very risky");
    expect(cleaned).toContain("you lost time this drive");
  });
});
