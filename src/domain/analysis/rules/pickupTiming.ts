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
  playerDisplayName,
  toEvidenceFromTurn
} from "@/domain/analysis/rules/helpers";

function hasPickupSignal(turn: ReplayModel["turns"][number]): boolean {
  return turn.events.some(
    (event) =>
      event.type === "ball_state" &&
      (event.stepLabel?.includes("pickup") || event.actionLabel?.includes("pickup") || event.sourceTag === "Carrier")
  );
}

export function evaluatePickupTiming(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    if (!turn.ballCarrierPlayerId || !hasPickupSignal(turn)) {
      continue;
    }

    const activeTeamId = activeTeamIdForTurn(replay, turn);
    const carrierOnTeam = isPlayerOnTeam(replay, activeTeamId, turn.ballCarrierPlayerId);
    if (carrierOnTeam === false) {
      continue;
    }

    const supportActions = countEvents(turn, "block") + countEvents(turn, "blitz");
    const riskyActions = countEvents(turn, "dodge") + countEvents(turn, "foul");

    if (supportActions >= 2 || riskyActions < 2) {
      continue;
    }

    findings.push(
      createFinding({
        id: findingId("pickup-timing", turn.turnNumber),
        severity: turn.possibleTurnover ? "high" : "medium",
        category: "pickup_timing",
        title: `Turn ${turn.turnNumber}: pickup happened before enough protection`,
        detail: `${playerDisplayName(replay, turn.ballCarrierPlayerId, activeTeamId)} got the ball, but protection actions came too late.`,
        recommendation: contextRecommendation(context, {
          offense: "Move support next to the ball first, then pick it up.",
          defense: "If you recover the ball, set nearby support before extra risky plays.",
          mixed: "Protect the pickup with nearby support before risky actions."
        }),
        turnNumber: turn.turnNumber,
        evidence: [
          ...toEvidenceFromTurn(turn, 3),
          {
            detail: `support_actions:${supportActions}|risky_actions:${riskyActions}`
          }
        ]
      })
    );
  }

  return limitFindings(findings, 4);
}
