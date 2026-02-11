#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

type OutputFormat = "json" | "text";

function usage(): string {
  return [
    "Usage:",
    "  nufflizier analyze <replay_file> --format json|text",
    "",
    "Examples:",
    "  nufflizier analyze demo-replays/demo1.bbr --format text",
    "  nufflizier analyze demo-replays/demo1.bbr --format json"
  ].join("\n");
}

function parseFormat(args: string[]): OutputFormat {
  const formatIndex = args.indexOf("--format");
  if (formatIndex === -1) {
    return "text";
  }

  const value = args[formatIndex + 1];
  if (value === "json" || value === "text") {
    return value;
  }

  throw new Error(`Unsupported format "${value ?? ""}". Use json or text.`);
}

function formatTeamSummary(report: ReturnType<typeof analyzeNufflizerInput>): string {
  const [home, away] = report.teams;
  const topMoments = report.keyMoments.slice(0, 5);
  const byTypeCoverage = Object.entries(report.coverage.byType).map(([type, counts]) => {
    return `- ${type}: ${counts.explicit} explicit, ${counts.fallback} fallback`;
  });

  return [
    `Match: ${report.match.id}`,
    `Home: ${home?.teamName ?? "Home"} (${home?.luckScore.toFixed(1) ?? "0.0"})`,
    `Away: ${away?.teamName ?? "Away"} (${away?.luckScore.toFixed(1) ?? "0.0"})`,
    `Verdict: ${report.verdict.summary} (gap ${report.verdict.scoreGap.toFixed(1)})`,
    `Coverage: ${(report.coverage.explicitRate * 100).toFixed(1)}% explicit (${report.coverage.explicitCount} explicit, ${report.coverage.fallbackCount} fallback)`,
    "Coverage by event type:",
    ...byTypeCoverage,
    "",
    "How this was scored:",
    ...report.howScoredSummary.map((line) => `- ${line}`),
    "",
    "Top swings:",
    ...topMoments.map(
      (moment, index) =>
        `${index + 1}. Turn ${moment.turn} | ${moment.teamName} | ${moment.label} | weighted delta ${moment.weightedDelta.toFixed(3)} | ${moment.calculationMethod} (${moment.calculationReason}) | ${moment.explainability.formulaSummary}`
    )
  ].join("\n");
}

function run() {
  const [command, replayPath, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    process.exit(0);
  }

  if (command !== "analyze") {
    throw new Error(`Unknown command "${command}".`);
  }

  if (!replayPath) {
    throw new Error("Missing replay file path.");
  }

  const absolutePath = path.resolve(process.cwd(), replayPath);
  const replayInput = readFileSync(absolutePath, "utf8");
  const format = parseFormat(rest);
  const report = analyzeNufflizerInput(replayInput);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatTeamSummary(report));
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  console.error(`[nufflizier] ${message}`);
  console.error("");
  console.error(usage());
  process.exit(1);
}
