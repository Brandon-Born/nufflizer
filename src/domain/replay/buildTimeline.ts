import type { ReplayModel, TimelineTurn } from "@/domain/replay/types";

const KEYWORD_PATTERNS = {
  turnover: /\bturn ?over\b/g,
  reroll: /\bre ?-?roll\b|\breroll\b/g,
  blitz: /\bblitz(?:ed|ing|es)?\b/g,
  dodge: /\bdodge(?:d|s|ing)?\b/g,
  block: /\bblock(?:ed|ing|s)?\b/g
} as const;

function countPatternMatches(input: string, pattern: RegExp): number {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
}

export function buildTimeline(replay: ReplayModel): TimelineTurn[] {
  return replay.turns.map((turn) => {
    const combinedText = `${JSON.stringify(turn.raw).toLowerCase()} ${turn.actionTexts.join(" ")}`;

    return {
      turnNumber: turn.turnNumber,
      teamId: turn.teamId,
      rawEventCount: Math.max(turn.eventCount, 1),
      keywordHits: {
        turnover: countPatternMatches(combinedText, KEYWORD_PATTERNS.turnover),
        reroll: countPatternMatches(combinedText, KEYWORD_PATTERNS.reroll),
        blitz: countPatternMatches(combinedText, KEYWORD_PATTERNS.blitz),
        dodge: countPatternMatches(combinedText, KEYWORD_PATTERNS.dodge),
        block: countPatternMatches(combinedText, KEYWORD_PATTERNS.block)
      }
    };
  });
}
