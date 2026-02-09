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

export function evaluateRedZoneClock(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  if (context.mode === "defense") {
    return [];
  }

  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    if (turn.turnNumber < 13 || turn.turnNumber > 16 || !turn.ballCarrierPlayerId) {
      continue;
    }

    const activeTeamId = activeTeamIdForTurn(replay, turn);
    const carrierOnTeam = isPlayerOnTeam(replay, activeTeamId, turn.ballCarrierPlayerId);
    if (carrierOnTeam === false) {
      continue;
    }

    const riskyActions = countEvents(turn, "dodge") + countEvents(turn, "blitz") + countEvents(turn, "foul");
    const safeFinish = turn.endTurnReason === 4;

    if (!turn.possibleTurnover && safeFinish) {
      continue;
    }

    if (riskyActions < 2 && !turn.possibleTurnover) {
      continue;
    }

    findings.push(
      createFinding({
        id: findingId("red-zone-clock", turn.turnNumber),
        severity: turn.possibleTurnover ? "high" : "medium",
        category: "red_zone_clock",
        title: `Turn ${turn.turnNumber}: late-drive choices stayed too risky`,
        detail: `${playerDisplayName(replay, turn.ballCarrierPlayerId, activeTeamId)} had the ball in a key late turn with extra risk added.`,
        recommendation: contextRecommendation(context, {
          offense: "In turns 13-16, pick the shortest safe path to score or secure the ball.",
          defense: "After a steal late in the half, secure possession first.",
          mixed: "In late turns, choose the safe scoring line over extra risky actions."
        }),
        turnNumber: turn.turnNumber,
        evidence: [
          ...toEvidenceFromTurn(turn, 2),
          {
            detail: `late_turn_risky_actions:${riskyActions}|end_reason:${String(turn.endTurnReason ?? "unknown")}`
          }
        ]
      })
    );
  }

  return limitFindings(findings, 4);
}
