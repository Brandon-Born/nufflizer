import type { AnalysisFinding, TeamContext } from "@/domain/analysis/types";
import type { ReplayModel } from "@/domain/replay/types";
import {
  activeTeamIdForTurn,
  contextRecommendation,
  countEvents,
  createFinding,
  findingId,
  isPlayerOnTeam,
  limitFindings,
  toEvidenceFromTurn
} from "@/domain/analysis/rules/helpers";

function riskyActionCountBeforeBall(turn: ReplayModel["turns"][number]): number {
  const firstBallStateIndex = turn.events.findIndex((event) => event.type === "ball_state");
  const relevantEvents = firstBallStateIndex >= 0 ? turn.events.slice(0, firstBallStateIndex) : turn.events;

  return relevantEvents.filter((event) => event.type === "dodge" || event.type === "block" || event.type === "blitz" || event.type === "foul").length;
}

export function evaluateEarlyRiskOrder(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    if (turn.turnNumber > 3) {
      continue;
    }

    const activeTeamId = activeTeamIdForTurn(replay, turn);
    const firstRiskEvent = turn.events.find(
      (event) => event.type === "dodge" || event.type === "block" || event.type === "blitz" || event.type === "foul"
    );

    if (activeTeamId && firstRiskEvent?.playerId && isPlayerOnTeam(replay, activeTeamId, firstRiskEvent.playerId) === false) {
      continue;
    }

    const riskyCount = riskyActionCountBeforeBall(turn);
    if (riskyCount < 2) {
      continue;
    }

    const supportActions = countEvents(turn, "block") + countEvents(turn, "blitz");

    findings.push(
      createFinding({
        id: findingId("early-risk-order", turn.turnNumber),
        severity: turn.possibleTurnover ? "high" : "medium",
        category: "early_risk_order",
        title: `Turn ${turn.turnNumber}: risky dice came too early`,
        detail: `You made ${riskyCount} risky actions before setting a safe shape on an early turn.`,
        recommendation: contextRecommendation(context, {
          offense: "On early turns, set your screen first, then roll dice.",
          defense: "On early turns, place marks first, then roll dice.",
          mixed: "Start with safe moves first, then roll risky dice."
        }),
        turnNumber: turn.turnNumber,
        evidence: [
          ...toEvidenceFromTurn(turn, 2),
          {
            detail: `risky_before_setup:${riskyCount}|support_actions:${supportActions}`
          }
        ]
      })
    );
  }

  return limitFindings(findings, 3);
}
