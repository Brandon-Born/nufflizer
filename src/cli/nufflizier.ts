#!/usr/bin/env node
import { openSync, fstatSync, closeSync, readSync } from "node:fs";
import path from "node:path";
import { REPLAY_LIMITS } from "@/domain/replay/limits";

import {
  CATEGORY_EXAMPLE_LINES,
  HOW_TO_READ_LINES
} from "@/domain/nufflizer/explainabilityCopy";
import type { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";

import {
  scoredEvidenceForTeam,
  formatDiceContribution,
  formatPreRollPosition,
  explainContextImpact
} from "@/domain/nufflizer/presentation";
import { runAnalysis } from "@/server/runAnalysis";

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

function formatTeamSummary(
  report: ReturnType<typeof analyzeNufflizerInput>
): string {
  const [home, away] = report.teams;
  const topMoments = report.keyMoments.slice(0, 5);
  const scoredByType = Object.entries(report.coverage.scoredByType).map(
    ([type, count]) => {
      return `- ${type}: ${count} scored`;
    }
  );
  const excludedByType = Object.entries(report.coverage.excludedByType).map(
    ([type, count]) => {
      return `- ${type}: ${count} excluded`;
    }
  );
  const topExclusions = Object.entries(report.coverage.excludedByReason)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => `- ${count} ${reason}`);

  return [
    `Match: ${report.match.id}`,
    `Home: ${home?.teamName ?? "Home"} (${formatDiceContribution(home.luckScore, scoredEvidenceForTeam(report, home.teamId).total, 1)})`,
    `Away: ${away?.teamName ?? "Away"} (${formatDiceContribution(away.luckScore, scoredEvidenceForTeam(report, away.teamId).total, 1)})`,
    `Verdict: ${report.verdict.summary} (dice contribution gap ${formatDiceContribution(report.verdict.scoreGap, report.coverage.allEvents.scoredCount, 1)})`,
    `Roll-candidate coverage: ${(report.coverage.rollCandidates.scoredRate * 100).toFixed(1)}% scored (${report.coverage.rollCandidates.scoredCount} scored, ${report.coverage.rollCandidates.excludedCount} excluded)`,
    `All-event coverage: ${(report.coverage.allEvents.scoredRate * 100).toFixed(1)}% scored (${report.coverage.allEvents.scoredCount} scored, ${report.coverage.allEvents.excludedCount} excluded)`,
    ...report.teams.map(
      (team) =>
        "Context for " +
        team.teamName +
        ": " +
        (team.impactCount
          ? formatDiceContribution(team.impactScore, team.impactCount) +
            " context units across " +
            team.impactCount +
            (team.impactCount === 1 ? " estimate" : " estimates")
          : "Not scored")
    ),
    report.coverage.denominatorDescription,
    ...report.limitations.map((line) => `Limitation: ${line}`),
    "Scored by event type:",
    ...scoredByType,
    "Excluded by event type:",
    ...excludedByType,
    ...(topExclusions.length > 0
      ? ["Top exclusion reasons:", ...topExclusions]
      : []),
    "",
    "How to read this report:",
    ...HOW_TO_READ_LINES.map((line) => `- ${line}`),
    "- Category examples:",
    ...CATEGORY_EXAMPLE_LINES.map((line) => `  - ${line}`),
    "",
    "How this was scored:",
    ...report.howScoredSummary.map((line) => `- ${line}`),
    "",
    "Top swings:",
    ...topMoments.map(
      (moment, index) =>
        `${index + 1}. Replay segment ${moment.turn} | ${moment.teamName} | ${moment.label} | weighted delta ${moment.weightedDelta.toFixed(3)} | ${
          moment.scoringStatus
        } (${moment.statusReason}) | ${moment.explainability.formulaSummary ?? "no formula"}${formatPreRollPosition(moment.metadata.preRoll) ? " | " + formatPreRollPosition(moment.metadata.preRoll) : ""}${moment.contextualImpact ? " | " + explainContextImpact(moment) : ""}`
    )
  ].join("\n");
}

async function run() {
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
  const fd = openSync(absolutePath, "r");
  let replayInput: string;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > REPLAY_LIMITS.inputBytes)
      throw new Error("Replay must be a regular file no larger than 4 MB.");
    const buffer = Buffer.alloc(REPLAY_LIMITS.inputBytes + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const n = readSync(fd, buffer, bytes, buffer.length - bytes, null);
      if (!n) break;
      bytes += n;
    }
    if (bytes > REPLAY_LIMITS.inputBytes)
      throw new Error("Replay file is too large.");
    replayInput = buffer.subarray(0, bytes).toString("utf8");
  } finally {
    closeSync(fd);
  }
  const format = parseFormat(rest);
  const report = await runAnalysis(replayInput);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatTeamSummary(report));
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  console.error(`[nufflizier] ${message}`);
  process.exitCode = 1;
});
