import type { AnalysisFinding, TeamContext } from "@/domain/analysis/types";
import type { ReplayEvent, ReplayModel, ReplayTurn } from "@/domain/replay/types";

const SOURCE_TAG_LABELS: Record<string, string> = {
  ResultRoll: "a dice roll",
  ResultBlockRoll: "a block roll",
  ResultBlockOutcome: "a block result",
  ResultPushBack: "a push",
  ResultUseAction: "an action",
  ResultTeamRerollUsage: "a reroll",
  QuestionTeamRerollUsage: "a reroll",
  Carrier: "ball movement",
  BallStep: "ball movement",
  EventEndTurn: "turn end"
};

export function findingId(prefix: string, turn: number): string {
  return `${prefix}-turn-${turn}`;
}

export function contextRecommendation(context: TeamContext, options: { offense: string; defense: string; mixed: string }): string {
  if (context.mode === "offense") {
    return options.offense;
  }

  if (context.mode === "defense") {
    return options.defense;
  }

  return options.mixed;
}

export function countEvents(turn: ReplayTurn, eventType: ReplayTurn["events"][number]["type"]): number {
  return turn.events.filter((event) => event.type === eventType).length;
}

export function activeTeamIdForTurn(replay: ReplayModel, turn: ReplayTurn): string | undefined {
  return replay.analysisTeamId ?? turn.teamId;
}

export function isPlayerOnTeam(replay: ReplayModel, teamId: string | undefined, playerId: string | undefined): boolean | undefined {
  if (!teamId || !playerId) {
    return undefined;
  }

  const byTeamMap = replay.playerNamesByTeamAndId ?? {};
  const teamKey = `${teamId}:${playerId}`;
  if (teamKey in byTeamMap) {
    return true;
  }

  const hasPlayerInAnyTeam = Object.keys(byTeamMap).some((key) => key.endsWith(`:${playerId}`));
  if (hasPlayerInAnyTeam) {
    return false;
  }

  return undefined;
}

export function playerNameFromId(replay: ReplayModel, playerId: string | undefined, teamIdHint?: string): string | undefined {
  if (!playerId) {
    return undefined;
  }

  if (teamIdHint) {
    const byTeamKey = `${teamIdHint}:${playerId}`;
    const byTeamName = replay.playerNamesByTeamAndId?.[byTeamKey];
    if (byTeamName) {
      return byTeamName;
    }

    const hasMappedTeamForPlayer = Object.keys(replay.playerNamesByTeamAndId ?? {}).some((key) => key.endsWith(`:${playerId}`));
    if (hasMappedTeamForPlayer) {
      return undefined;
    }
  }

  return replay.playerNamesById?.[playerId];
}

export function playerDisplayName(replay: ReplayModel, playerId: string | undefined, teamIdHint?: string): string {
  if (!playerId) {
    return "a player";
  }

  return playerNameFromId(replay, playerId, teamIdHint) ?? `Player ${playerId}`;
}

export function describeReplayEvent(replay: ReplayModel, event: ReplayEvent | undefined, teamIdHint?: string): string {
  if (!event) {
    return "a risky play";
  }

  const eventTeamHint = teamIdHint ?? event.teamId;

  if (event.type === "dodge") {
    return `${playerDisplayName(replay, event.playerId, eventTeamHint)} attempted a dodge`;
  }

  if (event.type === "block") {
    return `${playerDisplayName(replay, event.playerId, eventTeamHint)} attempted a block`;
  }

  if (event.type === "blitz") {
    return `${playerDisplayName(replay, event.playerId, eventTeamHint)} used a blitz action`;
  }

  if (event.type === "foul") {
    return `${playerDisplayName(replay, event.playerId, eventTeamHint)} attempted a foul`;
  }

  if (event.type === "ball_state") {
    return "the ball changed state";
  }

  const tagLabel = SOURCE_TAG_LABELS[event.sourceTag] ?? "a risky sequence";
  return `${playerDisplayName(replay, event.playerId, eventTeamHint)} took ${tagLabel}`;
}

export function toEvidenceFromTurn(turn: ReplayTurn, maxItems = 3): AnalysisFinding["evidence"] {
  return turn.events.slice(0, maxItems).map((event) => ({
    eventType: event.type,
    sourceTag: event.sourceTag,
    code: event.actionLabel ?? event.stepLabel
  }));
}

export function limitFindings(findings: AnalysisFinding[], maxByCategory = 5): AnalysisFinding[] {
  const byCategory = new Map<string, number>();

  return findings.filter((finding) => {
    const count = byCategory.get(finding.category) ?? 0;
    if (count >= maxByCategory) {
      return false;
    }

    byCategory.set(finding.category, count + 1);
    return true;
  });
}

export function createFinding(input: Omit<AnalysisFinding, "impactScore">): AnalysisFinding {
  return {
    ...input,
    impactScore: 0
  };
}
