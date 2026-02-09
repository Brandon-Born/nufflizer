import type { AnalysisFinding, TurnAdvice } from "@/domain/analysis/types";
import type { ReplayModel, ReplayTurn } from "@/domain/replay/types";

function findingId(prefix: string, turn: number): string {
  return `${prefix}-turn-${turn}`;
}

function toTurnAdvice(finding: AnalysisFinding): TurnAdvice {
  return {
    turnNumber: finding.turnNumber ?? 0,
    happened: finding.title,
    riskyBecause: finding.detail,
    saferAlternative: finding.recommendation,
    confidence: finding.severity === "high" ? "high" : finding.severity === "medium" ? "medium" : "low",
    evidence: finding.evidence
  };
}

export function evaluateTurnoverCause(replay: ReplayModel): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    if (!turn.possibleTurnover) {
      continue;
    }

    const likelyCauseEvent =
      turn.events.find((event) => event.type === "dodge") ??
      turn.events.find((event) => event.type === "block") ??
      turn.events.find((event) => event.type === "ball_state");

    findings.push({
      id: findingId("turnover-cause", turn.turnNumber),
      severity: "high",
      category: "turnover_cause",
      title: `Turn ${turn.turnNumber}: turnover-risk turn ended non-manually`,
      detail:
        likelyCauseEvent !== undefined
          ? `Turn appears to have ended due to high-variance sequence near ${likelyCauseEvent.sourceTag}.`
          : "Turn appears to have ended due to a turnover condition.",
      recommendation: "Complete low-risk positioning and ball-safety actions before high-variance rolls.",
      turnNumber: turn.turnNumber,
      evidence: [
        {
          eventType: likelyCauseEvent?.type,
          sourceTag: likelyCauseEvent?.sourceTag,
          code: turn.endTurnReasonLabel ?? String(turn.endTurnReason ?? "unknown")
        }
      ]
    });
  }

  return findings;
}

function hasRiskyActionBeforeBallSafety(turn: ReplayTurn): boolean {
  const firstBallIndex = turn.events.findIndex((event) => event.type === "ball_state");
  if (firstBallIndex <= 0) {
    return false;
  }

  return turn.events.slice(0, firstBallIndex).some((event) => event.type === "dodge" || event.type === "block" || event.type === "blitz");
}

export function evaluateActionOrdering(replay: ReplayModel): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    if (!hasRiskyActionBeforeBallSafety(turn)) {
      continue;
    }

    findings.push({
      id: findingId("action-order", turn.turnNumber),
      severity: "medium",
      category: "action_ordering",
      title: `Turn ${turn.turnNumber}: risky action ordering`,
      detail: "Risky actions were taken before stabilizing ball state or critical board position.",
      recommendation: "Start with guaranteed positioning and ball protection, then commit to blocks/blitz/dodges.",
      turnNumber: turn.turnNumber,
      evidence: turn.events.slice(0, 3).map((event) => ({
        eventType: event.type,
        sourceTag: event.sourceTag,
        code: event.actionLabel ?? event.stepLabel
      }))
    });
  }

  return findings;
}

export function evaluateRerollTiming(replay: ReplayModel): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    const rerollEvents = turn.events.filter((event) => event.type === "reroll");
    if (rerollEvents.length === 0) {
      continue;
    }

    const riskyEvents = turn.events.filter((event) => event.type === "dodge" || event.type === "block" || event.type === "blitz");
    if (riskyEvents.length <= rerollEvents.length) {
      continue;
    }

    findings.push({
      id: findingId("reroll-timing", turn.turnNumber),
      severity: "medium",
      category: "reroll_timing",
      title: `Turn ${turn.turnNumber}: reroll pressure detected`,
      detail: "Reroll usage occurred during a high-risk action sequence, which may indicate avoidable variance.",
      recommendation: "Reduce early-turn variance before consuming rerolls to preserve recovery options.",
      turnNumber: turn.turnNumber,
      evidence: rerollEvents.slice(0, 2).map((event) => ({
        eventType: event.type,
        sourceTag: event.sourceTag,
        code: event.actionLabel ?? event.stepLabel
      }))
    });
  }

  return findings;
}

export function evaluateBallSafety(replay: ReplayModel): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  let previousCarrier: string | undefined;

  for (const turn of replay.turns) {
    if (turn.ballCarrierPlayerId && previousCarrier && turn.ballCarrierPlayerId !== previousCarrier) {
      findings.push({
        id: findingId("ball-safety", turn.turnNumber),
        severity: "medium",
        category: "ball_safety",
        title: `Turn ${turn.turnNumber}: ball carrier transition`,
        detail: "Ball carrier changed across turns, increasing exposure if not supported by safe positioning.",
        recommendation: "Plan carrier transfers only after screening and tackle-zone control are secured.",
        turnNumber: turn.turnNumber,
        evidence: [
          {
            eventType: "ball_state",
            sourceTag: "Carrier",
            detail: `carrier:${previousCarrier}->${turn.ballCarrierPlayerId}`
          }
        ]
      });
    }

    if (turn.ballCarrierPlayerId) {
      previousCarrier = turn.ballCarrierPlayerId;
    }
  }

  return findings;
}

export function findingsToTurnAdvice(findings: AnalysisFinding[]): TurnAdvice[] {
  return findings
    .filter((finding) => finding.turnNumber !== undefined)
    .map(toTurnAdvice)
    .sort((a, b) => a.turnNumber - b.turnNumber)
    .slice(0, 32);
}
