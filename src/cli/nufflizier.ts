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
  formatPlayerObservation,
  explainPreRollEvidence,
  explainContextImpact,
  explainContextBounds,
  explainMovementOutcome,
  explainPickupBallChain,
  explainRerollCounter,
  explainRerollResource,
  explainResourceWindow,
  explainActivationLoss,
  explainProGate,
  explainLonerGate,
  explainBlockResolution,
  explainBlockSkillModel,
  explainInjuryObservation,
  explainRegenerationAftermath,
  explainRegenerationReturn,
  explainNumericRerollScore,
  explainNumericOriginal,
  explainCatchRerollResume,
  explainFailedNumericRetry,
  explainNumericRetryAccess,
  formatActualOutcome,
  formatContextComponentSum,
  PARTIAL_CONTEXT_SCOPE,
  explainDriveEffectExpiry,
  explainContextCoverage,
  explainDiceCensus,
  explainObservedDice,
  explainRecruitmentEvidence,
  explainOwnership,
  explainBlockPush
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
  const lostActivations = report.events.filter(
    (event) => event.metadata.activationLoss || event.metadata.activationEnd
  );
  const eventsById = new Map(report.events.map((event) => [event.id, event]));
  const sourcesById = new Map(
    report.events.flatMap((event) =>
      event.metadata.sourceId ? [[event.metadata.sourceId, event] as const] : []
    )
  );
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
  const injuryObservations = report.events.filter(
    (event) => event.metadata.injuryObservation
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
    explainContextCoverage(report.coverage.contextEvidence),
    explainDiceCensus(report.coverage.diceRecords),
    ...report.events
      .filter((e) => e.metadata.observedReroll || e.metadata.teamDiceIdentity)
      .map((e) => `Source ${e.metadata.sourceId}: ${explainObservedDice(e)}`),
    "Partial context component sums:",
    PARTIAL_CONTEXT_SCOPE,
    ...report.contextComponents.flatMap((summary) => [
      `${report.teams.find((t) => t.teamId === summary.teamId)?.teamName ?? summary.teamId}: ${formatContextComponentSum(summary)}`,
      ...summary.byCategory.map(
        (category) =>
          `  ${category.type}: ${formatContextComponentSum(category)}`
      ),
      ...summary.byAction
        .slice(0, 20)
        .map(
          (action) =>
            `  Source action ${action.actionId ?? "unlinked event"}: ${formatContextComponentSum(action)}; events ${action.eventIds.join(", ")}`
        ),
      ...(summary.byAction.length > 20
        ? ["Further component groups are retained in JSON."]
        : [])
    ]),
    `Push decisions: ${report.events.filter(e=>e.metadata.sourceTag==="QuestionPushBack").length} source menus; ${report.events.filter(e=>e.metadata.blockPush?.status==="modeled").length} modeled ordinary position alternatives. These are coach decisions with no added luck score.`,
    ...report.events.filter(e=>e.metadata.blockPush?.status==="modeled").slice(0,20).map(e=>`Source ${e.metadata.sourceId}: ${explainBlockPush(e)}`),
    ...(injuryObservations.length
      ? [
          `Recorded injury results: ${injuryObservations.length}. These observed labels have unverified odds and are not luck scores or final player availability.`,
          ...injuryObservations
            .slice(0, 20)
            .map(
              (event) =>
                `Player ${event.playerId}; source ${event.metadata.sourceId}: ${formatActualOutcome(event)}; Not scored.`
            ),
          ...(injuryObservations.length > 20
            ? ["Further recorded injury results are retained in JSON."]
            : [])
        ]
      : []),
    ...report.events
      .filter(
        (e) =>
          e.metadata.ownershipConflict ||
          e.metadata.identityMutation ||
          (e.metadata.ownership &&
            e.metadata.ownership.basis !== "initial_roster")
      )
      .slice(0, 20)
      .map((e) => `Source ${e.metadata.sourceId}: ${explainOwnership(e)}`),
    ...report.events.filter(event=>event.metadata.regenerationAftermath).slice(0,20)
      .map(event=>`Player ${event.playerId}; source ${event.metadata.sourceId}: ${explainRegenerationAftermath(event)}`),
    ...report.events.filter(event=>event.metadata.regenerationReturn).slice(0,20)
      .map(event=>`Player ${event.playerId}; source ${event.metadata.sourceId}: ${explainRegenerationReturn(event)}`),
    ...report.events.filter(event=>event.metadata.catchRerollResume).slice(0,20)
      .map(event=>`Player ${event.playerId}; source ${event.metadata.sourceId}: ${explainCatchRerollResume(event)}`),
    `Recorded team-reroll decisions: ${report.rerollResources.decisionCount} (${report.rerollResources.recordedUsedCount} used, ${report.rerollResources.recordedNotUsedCount} not used, ${report.rerollResources.unknownUsageCount} unknown); ${report.rerollResources.linkedCount} linked; ${report.rerollResources.unresolvedCount} unresolved. Linked team totals: ${report.rerollResources.byTeam.map(t=>`${t.teamId}: ${t.used} used, ${t.notUsed} not used`).join("; ")}.`,
    ...report.rerollResources.decisions.map(d=>explainRerollResource(eventsById.get(d.decisionEventId)!,new Map([[d.decisionEventId,d]]),sourcesById)!),
    `Recorded counter flow: ${report.rerollResources.flow.clockSnapshots.length} source checkpoints; ${report.rerollResources.flow.clockWindows.length} observed windows. Full raw counters, clocks and source intervals are retained in JSON. Missing counters are unknown, not zero.`,
    ...report.rerollResources.flow.clockWindows.map(w=>`Window ${w.id+1}, checkpoints ${w.startSnapshotId ?? "unknown"} to ${w.endSnapshotId ?? "unknown"}: ${explainResourceWindow(w, report.teams)}`),
    ...report.events.filter(event=>event.metadata.failedNumericRetry).slice(0,20)
      .map(event=>`Player ${event.playerId}; source ${event.metadata.sourceId}: ${explainFailedNumericRetry(event)}`),
    ...report.events.filter(event=>event.metadata.numericRetryAccess||event.metadata.numericGatedReplacement).slice(0,20)
      .map(event=>`Player ${event.playerId}; source ${event.metadata.sourceId}: ${explainNumericRetryAccess(event)}`),
    ...report.events.filter(event=>event.metadata.numericOriginal).slice(0,20)
      .map(event=>`Player ${event.playerId}; source ${event.metadata.sourceId}: ${explainNumericOriginal(event)}`),
    ...report.events.filter(event=>event.metadata.rerollDraws).slice(0,20)
      .map(event=>`Player ${event.playerId}; source ${event.metadata.sourceId}: ${explainNumericRerollScore(event)}`),
    ...report.events
      .filter((event) => event.metadata.injuryTable)
      .slice(0, 20)
      .map(
        (event) =>
          `Player ${event.playerId}; source ${event.metadata.sourceId}: ${explainInjuryObservation(event)}`
      ),
    ...report.events
      .filter((event) => event.metadata.teamRerollCounter)
      .slice(0, 20)
      .map(
        (event) =>
          `Player ${event.playerId ?? "unknown"}; source ${event.metadata.sourceId ?? event.id}: ${explainRerollCounter(event)}`
      ),
    `Block pools: ${report.events.filter(e=>e.metadata.block).length} observed; ${report.events.filter(e=>e.metadata.blockScoring).length} have qualified categorical luck; ${report.events.filter(e=>e.metadata.block&&!e.metadata.blockScoring).length} have no qualified luck value. Raw symbols and applied outcomes are separate evidence.`,
    ...report.events
      .filter((event) => event.metadata.blockScoring)
      .map(
        (event) =>
          `Player ${event.playerId}; source ${event.metadata.sourceId}: ${formatActualOutcome(event)}; fair conditional mean ${event.metadata.blockScoring!.expectedValue.toFixed(6)}; dice contribution ${formatDiceContribution(event.weightedDelta,1,6)}. ${explainBlockSkillModel(event)}`
      ),
    ...report.events.filter(e=>e.metadata.block&&!e.metadata.blockScoring).slice(0,20)
      .map(e=>`Player ${e.playerId}; source ${e.metadata.sourceId}: Observed symbols; Not scored. ${explainBlockSkillModel(e)}`),
    ...report.events
      .filter((event) => event.metadata.blockResolution)
      .slice(0, 20)
      .map((event) =>
        explainBlockResolution(event, report.teams, sourcesById)!
      ),
    ...report.events
      .filter(
        (event) =>
          event.contextualBounds ||
          event.possessionBounds ||
          event.catchPossessionBounds
      )
      .slice(0, 20)
      .map(
        (event) =>
          `Player ${event.playerId ?? "unknown"}; source ${event.metadata.sourceId ?? event.id}: ${explainContextBounds(event)}`
      ),
    ...report.events
      .filter(
        (event) =>
          event.metadata.dodgeMovement ||
          event.metadata.pickupResolution ||
          event.metadata.teamRerollMovement ||
          event.metadata.pickupAfterMovement ||
          event.metadata.combinedMovement ||
          event.metadata.movementFall?.combinedRushSourceId
      )
      .slice(0, 20)
      .map(
        (event) =>
          `Player ${event.playerId ?? "unknown"}; source ${event.metadata.sourceId ?? event.id}: ${explainMovementOutcome(event.metadata)}`
      ),
    ...report.events
      .filter((event) => event.metadata.lonerGate)
      .slice(0, 20)
      .map((event) => explainLonerGate(event.metadata.lonerGate,!!event.metadata.numericRetryAccess)!),
    ...report.events
      .filter((event) => event.metadata.driveEffectExpiry)
      .slice(0, 20)
      .map((event) => explainDriveEffectExpiry(event)!),
    ...(lostActivations.length
      ? [
          `Observed player activation endings: ${lostActivations.length}`,
          ...lostActivations
            .slice(0, 20)
            .map((event) => explainActivationLoss(event)!),
          ...(lostActivations.length > 20
            ? ["Further activation-loss evidence is retained in JSON."]
            : [])
        ]
      : []),
    ...(report.recruitments.length
      ? [explainRecruitmentEvidence(report.recruitments)!]
      : []),
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
    ...topMoments.map((moment, index) =>
      [
        `${index + 1}. Replay segment ${moment.turn}`,
        moment.teamName,
        formatPlayerObservation(moment),
        moment.label,
        formatActualOutcome(moment),
        `weighted delta ${moment.weightedDelta.toFixed(3)}`,
        `${moment.scoringStatus} (${moment.statusReason})`,
        moment.explainability.formulaSummary ?? "no formula",
        formatPreRollPosition(moment.metadata.preRoll),
        explainInjuryObservation(moment),
        explainRegenerationAftermath(moment),
        explainRegenerationReturn(moment),
        explainNumericRerollScore(moment),
        explainNumericOriginal(moment),
        explainCatchRerollResume(moment),
        explainFailedNumericRetry(moment),
        explainNumericRetryAccess(moment),
        explainBlockPush(moment),
        explainOwnership(moment),
        explainPreRollEvidence(moment.metadata.preRoll),
        explainContextImpact(moment),
        explainContextBounds(moment),
        explainMovementOutcome(moment.metadata),
        explainPickupBallChain(moment, report.teams, eventsById),
        explainProGate(moment.metadata.proGate),
        explainBlockSkillModel(moment),
        explainBlockResolution(moment, report.teams, sourcesById)
      ]
        .filter(Boolean)
        .join(" | ")
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
    // Keep the same compact bounded representation as the HTTP contract.
    console.log(JSON.stringify(report));
    return;
  }

  console.log(formatTeamSummary(report));
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown CLI error";
  console.error(`[nufflizier] ${message}`);
  process.exitCode = 1;
});
