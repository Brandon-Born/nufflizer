import type { AnalysisFinding, TeamContext } from "@/domain/analysis/types";
import type { ReplayModel } from "@/domain/replay/types";
import {
  contextRecommendation,
  countEvents,
  createFinding,
  findingId,
  limitFindings,
  playerDisplayName,
  toEvidenceFromTurn,
  activeTeamIdForTurn
} from "@/domain/analysis/rules/helpers";

function foulsBeforeBallSafety(turn: ReplayModel["turns"][number]): number {
  const firstBallIndex = turn.events.findIndex((event) => event.type === "ball_state");
  const scopedEvents = firstBallIndex >= 0 ? turn.events.slice(0, firstBallIndex) : turn.events;
  return scopedEvents.filter((event) => event.type === "foul").length;
}

export function evaluateFoulOvercommit(replay: ReplayModel, context: TeamContext): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const turn of replay.turns) {
    const totalFouls = countEvents(turn, "foul");
    if (totalFouls === 0) {
      continue;
    }

    const foulsEarly = foulsBeforeBallSafety(turn);
    const supportActions = countEvents(turn, "block") + countEvents(turn, "blitz");

    if (foulsEarly === 0 && totalFouls < 2) {
      continue;
    }

    if (supportActions >= 2 && !turn.possibleTurnover) {
      continue;
    }

    const foulPlayer = turn.events.find((event) => event.type === "foul")?.playerId;
    const activeTeamId = activeTeamIdForTurn(replay, turn);

    findings.push(
      createFinding({
        id: findingId("foul-overcommit", turn.turnNumber),
        severity: turn.possibleTurnover || foulsEarly > 0 ? "high" : "medium",
        category: "foul_overcommit",
        title: `Turn ${turn.turnNumber}: foul focus cost you safer plays`,
        detail: `${playerDisplayName(replay, foulPlayer, activeTeamId)} fouled before the turn was secure.`,
        recommendation: contextRecommendation(context, {
          offense: "Foul late in the turn after the ball is safe.",
          defense: "Foul after your key marks and blitz are finished.",
          mixed: "Treat fouls as optional late-turn actions."
        }),
        turnNumber: turn.turnNumber,
        evidence: [
          ...toEvidenceFromTurn(turn, 2),
          {
            detail: `fouls_before_ball_safety:${foulsEarly}|total_fouls:${totalFouls}|support_actions:${supportActions}`
          }
        ]
      })
    );
  }

  return limitFindings(findings, 4);
}
