const JARGON_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bhigh variance\b/gi, "very risky"],
  [/\blow variance\b/gi, "safer"],
  [/\blow\s+ev\b/gi, "usually loses value"],
  [/\bexpected value\b/gi, "long-term value"],
  [/\btempo loss\b/gi, "you lost time this drive"],
  [/\bsuboptimal\b/gi, "not the best play"],
  [/\bnon-deterministic\b/gi, "unpredictable"],
  [/\bhighly volatile\b/gi, "very swingy"],
  [/\bcounterplay\b/gi, "the other team can answer this"],
  [/\boptimization\b/gi, "better play choice"]
];

const BLOCKED_PATTERNS: RegExp[] = [
  /\bResult[A-Za-z0-9_]+\b/g,
  /\bStepType\b/gi,
  /\bRollType\b/gi,
  /\bActionCode\b/gi,
  /\bEventExecuteSequence\b/gi
];

function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function sanitizeCoachingText(input: string): string {
  let output = input;

  for (const [pattern, replacement] of JARGON_REPLACEMENTS) {
    output = output.replace(pattern, replacement);
  }

  for (const blockedPattern of BLOCKED_PATTERNS) {
    output = output.replace(blockedPattern, "");
  }

  output = output.replace(/\s+([,.;!?])/g, "$1");

  return collapseWhitespace(output);
}

export function containsBlockedCoachingTokens(input: string): boolean {
  return BLOCKED_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}
