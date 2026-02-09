export function buildPriorityText(turnNumber: number | undefined, recommendation: string): string {
  const turnLabel = turnNumber ? `Turn ${turnNumber}` : "Match";
  return `${turnLabel}: ${recommendation}`;
}

export function buildNoMajorIssuesText(): string {
  return "No major mistakes were found in this replay. Keep using the same safe turn order.";
}

export function buildSimpleHeadline(headline: string): string {
  return headline.trim();
}
