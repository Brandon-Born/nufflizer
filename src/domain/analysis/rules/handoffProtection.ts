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

function hasHandoffSignal(turn: ReplayModel["turns"][number]): boolean {
  return turn.events.some((event) => event.actionCode === 5 || event.actionLabel === "handoff");
}

export function evaluateHandoffProtection(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  let previousCarrier: string | undefined;

  for (const turn of replay.turns) {
    if (!turn.ballCarrierPlayerId) {
      continue;
    }

    const activeTeamId = activeTeamIdForTurn(replay, turn);
    const currentOnTeam = isPlayerOnTeam(replay, activeTeamId, turn.ballCarrierPlayerId);
    const previousOnTeam = isPlayerOnTeam(replay, activeTeamId, previousCarrier);

    const carrierChanged = Boolean(previousCarrier && turn.ballCarrierPlayerId !== previousCarrier);
    const likelyHandoff = carrierChanged && hasHandoffSignal(turn) && currentOnTeam !== false && previousOnTeam !== false;

    if (!likelyHandoff) {
      previousCarrier = turn.ballCarrierPlayerId;
      continue;
    }

    const supportActions = countEvents(turn, "block") + countEvents(turn, "blitz");
    if (supportActions >= 2) {
      previousCarrier = turn.ballCarrierPlayerId;
      continue;
    }

    findings.push(
      createFinding({
        id: findingId("handoff-protection", turn.turnNumber),
        severity: turn.possibleTurnover ? "high" : "medium",
        category: "handoff_protection",
        title: `Turn ${turn.turnNumber}: handoff target looked unprotected`,
        detail: `The ball moved to ${playerDisplayName(replay, turn.ballCarrierPlayerId, activeTeamId)} without enough nearby support.`,
        recommendation: contextRecommendation(context, {
          offense: "Before a handoff, move 1-2 protectors next to the receiver.",
          defense: "If you hand off after a steal, secure the new carrier first.",
          mixed: "Hand off only when the new carrier already has support."
        }),
        turnNumber: turn.turnNumber,
        evidence: [
          ...toEvidenceFromTurn(turn, 3),
          {
            detail: `support_actions_after_handoff:${supportActions}`
          }
        ]
      })
    );

    previousCarrier = turn.ballCarrierPlayerId;
  }

  return limitFindings(findings, 3);
}
