import type { AnalysisResult } from "@/domain/analysis/types";

export function summarizeMatch(analysis: AnalysisResult): string {
  const { metrics, findings } = analysis;

  if (metrics.totalTurns === 0) {
    return "No turn timeline was detected in this replay. Upload another replay to generate actionable coaching.";
  }

  const highestSeverityFinding = findings.find((finding) => finding.severity === "high");
  if (highestSeverityFinding) {
    return `${highestSeverityFinding.title}: ${highestSeverityFinding.detail}`;
  }

  return `Processed ${metrics.totalTurns} turns with ${findings.length} flagged coaching opportunities.`;
}
