"use client";

import { useMemo, useRef, useState } from "react";

import {
  CATEGORY_EXAMPLE_LINES,
  HOW_TO_READ_LINES
} from "@/domain/nufflizer/explainabilityCopy";

import type { LuckEventType, LuckReport } from "@/domain/nufflizer/types";
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
  explainActivationLoss,
  explainProGate,
  explainLonerGate,
  explainBlockResolution,
  explainBlockSkillModel,
  formatActualOutcome,
  formatExpectedOutcome,
  formatContextComponentSum,
  PARTIAL_CONTEXT_SCOPE,
  explainInjuryObservation,
  explainRegenerationAftermath,
  explainRegenerationReturn,
  explainNumericRerollScore,
  explainNumericOriginal,
  explainCatchRerollResume,
  explainFailedNumericRetry,
  explainNumericRetryAccess,
  explainDiceCensus,
  explainObservedDice,
  explainDriveEffectExpiry,
  explainContextCoverage,
  explainRecruitmentEvidence,
  explainOwnership,
  explainBlockPush
} from "@/domain/nufflizer/presentation";
import { readAnalysisResponse } from "@/lib/readAnalysisResponse";
import { REPLAY_LIMITS } from "@/domain/replay/limits";

const EVENT_TYPE_OPTIONS: Array<{
  value: "all" | LuckEventType;
  label: string;
}> = [
  { value: "all", label: "All categories" },
  { value: "unknown", label: "Unknown category" },
  { value: "block", label: "Block" },
  { value: "armor_break", label: "Armor break" },
  { value: "injury", label: "Injury" },
  { value: "dodge", label: "Dodge" },
  { value: "ball_handling", label: "Ball handling" },
  { value: "argue_call", label: "Argue call" },
  { value: "movement_risk", label: "Movement risk" }
];

const TAG_OPTIONS = [
  { value: "all", label: "All moments" },
  { value: "blessed", label: "Blessed moments" },
  { value: "shaftaroonie", label: "Shaftaroonie moments" }
] as const;

export function NufflizierAnalyzer({ routeLabel }: { routeLabel: string }) {
  const abortRef = useRef<AbortController | null>(null);
  const [teamFilter, setTeamFilter] = useState("all");
  const [scoringFilter, setScoringFilter] = useState("scored");
  const [sortOrder, setSortOrder] = useState("chronological");
  const [playerQuery, setPlayerQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [teamTurnFilter, setTeamTurnFilter] = useState("");
  const [activationFilter, setActivationFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LuckReport | null>(null);
  const [resourceOnly, setResourceOnly] = useState(false);
  const sourcesById = useMemo(
    () =>
      new Map(
        report?.events.flatMap((event) =>
          event.metadata.sourceId
            ? [[event.metadata.sourceId, event] as const]
            : []
        ) ?? []
      ),
    [report]
  );
  const diceById = useMemo(
    () => new Map((report?.diceRecords ?? []).map((r) => [r.id, r])),
    [report]
  );
  const rerollDecisions = useMemo(
    () => new Map((report?.rerollResources.decisions ?? []).map(d => [d.decisionEventId,d])),
    [report]
  );
  const eventsById = useMemo(
    () => new Map((report?.events ?? []).map((event) => [event.id, event])),
    [report]
  );
  const [tagFilter, setTagFilter] =
    useState<(typeof TAG_OPTIONS)[number]["value"]>("all");
  const [typeFilter, setTypeFilter] =
    useState<(typeof EVENT_TYPE_OPTIONS)[number]["value"]>("all");

  const filteredMoments = useMemo(() => {
    if (!report) {
      return [];
    }
    const query = playerQuery.trim().toLocaleLowerCase();

    return report.events
      .filter((event) => {
        if(resourceOnly && !event.metadata.recordedRerollChoice)return false;
        if (
          query &&
          ![event.playerId, event.metadata.initialRosterName].some((value) =>
            value?.toLocaleLowerCase().includes(query)
          )
        )
          return false;
        const context = event.metadata.preRoll;
        if (
          periodFilter !== "all" &&
          (context?.period ?? "unknown") !== periodFilter
        )
          return false;
        if (
          teamTurnFilter &&
          (context?.teamTurn ?? context?.scoringAttempt?.teamTurn) !==
            Number(teamTurnFilter)
        )
          return false;
        if (activationFilter && context?.activationId !== activationFilter)
          return false;
        if (teamFilter !== "all" && event.teamId !== teamFilter) return false;
        if (
          scoringFilter === "bounded"
            ? !event.contextualBounds &&
              !event.possessionBounds &&
              !event.catchPossessionBounds
            : scoringFilter !== "all" && event.scoringStatus !== scoringFilter
        )
          return false;
        if (tagFilter !== "all" && !event.tags.includes(tagFilter)) {
          return false;
        }

        if (typeFilter !== "all" && event.type !== typeFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) =>
        sortOrder === "impact"
          ? Math.abs(b.weightedDelta) - Math.abs(a.weightedDelta)
          : sortOrder === "context"
            ? Number(!!b.contextualImpact) - Number(!!a.contextualImpact) ||
              Math.abs(b.contextualImpact?.contribution ?? 0) -
                Math.abs(a.contextualImpact?.contribution ?? 0)
            : a.turn - b.turn ||
              (a.metadata.sourceIndex ?? 0) - (b.metadata.sourceIndex ?? 0)
      );
  }, [
    report,
    tagFilter,
    typeFilter,
    teamFilter,
    scoringFilter,
    sortOrder,
    playerQuery,
    periodFilter,
    teamTurnFilter,
    activationFilter,
    resourceOnly
  ]);

  function resetFilters() {
    setResourceOnly(false);
    setTagFilter("all");
    setTypeFilter("all");
    setTeamFilter("all");
    setScoringFilter("scored");
    setSortOrder("chronological");
    setPlayerQuery("");
    setPeriodFilter("all");
    setTeamTurnFilter("");
    setActivationFilter(null);
    setPage(0);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReport(null);
    resetFilters();

    const formData = new FormData(event.currentTarget);
    const replayFile = formData.get("replay");
    if (!(replayFile instanceof File)) {
      setError("Choose a replay file first.");
      return;
    }

    if (replayFile.size > REPLAY_LIMITS.inputBytes) {
      setError("Replay file too large. Maximum size is 4 MB.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setStatus("Uploading replay...");

    try {
      const uploadData = new FormData();
      uploadData.append("replay", replayFile);

      setStatus("Reading replay and rolling Nufflizier...");
      const response = await fetch("/api/nufflizier/analyze", {
        method: "POST",
        body: uploadData,
        signal: controller.signal
      });

      const body = await readAnalysisResponse(response);
      setReport(body);
      setStatus("Analysis complete. Review the evidence limits below.");
    } catch (requestError) {
      const message =
        requestError instanceof Error && requestError.name === "AbortError"
          ? "Analysis cancelled."
          : requestError instanceof Error
            ? requestError.message
            : "Unexpected error.";
      setError(message);
      setStatus(null);
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }

  function scoreColor(score: number): string {
    if (score > 0) {
      return "text-emerald-200";
    }

    if (score < 0) {
      return "text-rose-200";
    }

    return "text-amber-100";
  }

  function downloadJson(): void {
    if (!report) {
      return;
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nufflizier-${report.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="bb-shell mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-16">
      <section className="space-y-3">
        <p className="inline-flex rounded-full border border-amber-300/60 bg-amber-100/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
          Nufflizier
        </p>
        <h1 className="text-4xl font-black tracking-tight text-amber-100">
          Blessed by Nuffle Analyzer
        </h1>
        <p className="max-w-3xl text-sm text-amber-50/90">
          One-shot flow ({routeLabel}): inspect supported dice outcomes and
          evidence gaps. Whole-match and contextual verdicts remain under
          validation.
        </p>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-amber-300/30 bg-black/35 p-6 shadow-xl backdrop-blur"
      >
        <label className="block space-y-2 text-sm font-medium text-amber-100">
          <span>Replay file (.xml or .bbr), maximum 4 MB</span>
          <input
            className="block w-full rounded-md border border-amber-200/40 bg-black/30 px-3 py-2 text-sm text-amber-50"
            type="file"
            name="replay"
            accept=".xml,.bbr,text/xml,application/xml"
            required
          />
        </label>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Rolling..." : "Analyze Nuffle Luck"}
          </button>

          {isLoading ? (
            <button type="button" onClick={() => abortRef.current?.abort()}>
              Cancel analysis
            </button>
          ) : null}
          {report ? (
            <button
              type="button"
              onClick={() => {
                resetFilters();
                setReport(null);
                setError(null);
                setStatus(null);
              }}
              className="rounded-lg border border-amber-200/40 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-100/10"
            >
              Upload Another Replay
            </button>
          ) : null}

          {report ? (
            <button
              type="button"
              onClick={downloadJson}
              className="rounded-lg border border-amber-200/40 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-100/10"
            >
              Download JSON
            </button>
          ) : null}
        </div>

        {status ? (
          <p className="mt-3 text-xs text-amber-100/90">{status}</p>
        ) : null}
      </form>

      {error ? (
        <section className="rounded-lg border border-red-300/60 bg-red-900/30 px-4 py-3 text-sm text-red-100">
          {error}
        </section>
      ) : null}

      {report ? (
        <section className="space-y-6 rounded-xl border border-amber-300/30 bg-black/35 p-6 shadow-xl backdrop-blur">
          <header className="space-y-2">
            <h2 className="text-xl font-bold text-amber-100">
              Nuffle Match Report
            </h2>
            <p className="text-xs text-amber-100/80">
              Generated at {new Date(report.generatedAt).toLocaleString()}
            </p>
            <p className="text-xs text-amber-100/80">
              Match: {report.match.id}
            </p>
          </header>

          <div className="rounded-lg border border-amber-300/20 bg-amber-950/20 p-4">
            <p className="text-lg font-semibold text-amber-100">
              {report.verdict.summary}
            </p>
            <p className="mt-1 text-sm text-amber-50/90">
              Supported dice contribution gap:{" "}
              {formatDiceContribution(
                report.verdict.scoreGap,
                report.coverage.allEvents.scoredCount,
                1
              )}
            </p>
            <p className="mt-1 text-sm text-amber-50/90">
              Roll-candidate coverage:{" "}
              {(report.coverage.rollCandidates.scoredRate * 100).toFixed(1)}%
              scored ({report.coverage.rollCandidates.scoredCount} scored,{" "}
              {report.coverage.rollCandidates.excludedCount} excluded)
            </p>
            <p className="mt-1 text-sm text-amber-50/90">
              Reported-event coverage:{" "}
              {(report.coverage.allEvents.scoredRate * 100).toFixed(1)}% scored
              ({report.coverage.allEvents.scoredCount} scored,{" "}
              {report.coverage.allEvents.excludedCount} excluded)
            </p>
            <p className="mt-2 text-xs">
              {explainContextCoverage(report.coverage.contextEvidence)}
            </p>
            <p className="mt-2 text-xs">
              Team reroll record: {report.rerollResources.decisionCount} choices ({report.rerollResources.recordedUsedCount} used, {report.rerollResources.recordedNotUsedCount} not used, {report.rerollResources.unknownUsageCount} unknown); {report.rerollResources.linkedCount} linked, {report.rerollResources.unresolvedCount} unresolved.
              {" "}{report.rerollResources.byTeam.map(t => `${report.teams.find(team => team.teamId === t.teamId)?.teamName ?? t.teamId}: ${t.used} used, ${t.notUsed} not used`).join("; ")}.
              {" "}These are linked recorded choices, separate from luck scores and general eligibility.
            </p>
            {report.recruitments.length > 0 && (
              <p className="mt-2 text-xs">
                {explainRecruitmentEvidence(report.recruitments)}
              </p>
            )}
            <p className="mt-2 text-xs">
              {report.coverage.denominatorDescription} Source records retained
              by parser: {report.coverage.sourceRecordCount}.
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {report.limitations.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-amber-100/80">
              {explainDiceCensus(report.coverage.diceRecords)}
            </p>
            {Object.keys(report.coverage.excludedByReason).length > 0 ? (
              <p className="mt-2 text-sm text-amber-100">
                Some events were excluded when replay context was
                nondeterministic.
              </p>
            ) : null}
          </div>

          <section className="rounded-xl border border-amber-300/20 bg-black/20 p-4">
            <h3 className="text-base font-semibold text-amber-100">
              How to read this report
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50/90">
              {HOW_TO_READ_LINES.map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>
                Category examples:
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {CATEGORY_EXAMPLE_LINES.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-amber-300/20 bg-black/20 p-4">
            <h3 className="text-base font-semibold text-amber-100">
              How this was scored
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50/90">
              {report.howScoredSummary.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-amber-100/80">
              Weights: block {report.weightTable.block}, armor{" "}
              {report.weightTable.armor_break}, injury{" "}
              {report.weightTable.injury}, dodge {report.weightTable.dodge},
              ball handling {report.weightTable.ball_handling}, argue{" "}
              {report.weightTable.argue_call}, movement{" "}
              {report.weightTable.movement_risk}.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-xs text-amber-50/90">
                <thead>
                  <tr className="border-b border-amber-300/20 text-left">
                    <th className="px-2 py-1">Event type</th>
                    <th className="px-2 py-1">Scored</th>
                    <th className="px-2 py-1">Excluded</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.coverage.scoredByType).map(
                    ([eventType, scoredCount]) => (
                      <tr
                        key={eventType}
                        className="border-b border-amber-300/10"
                      >
                        <td className="px-2 py-1">{eventType}</td>
                        <td className="px-2 py-1">{scoredCount}</td>
                        <td className="px-2 py-1">
                          {
                            report.coverage.excludedByType[
                              eventType as LuckEventType
                            ]
                          }
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
            {Object.keys(report.coverage.excludedByReason).length > 0 ? (
              <div className="mt-3">
                <h4 className="text-sm font-semibold text-amber-100">
                  Top exclusion reasons
                </h4>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-amber-50/90">
                  {Object.entries(report.coverage.excludedByReason)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([reason, count]) => (
                      <li key={reason}>
                        {count} {reason}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </section>

          <p className="text-xs text-amber-100/80">
            Partial component sums cover only the supported model components
            below. They do not rank the teams or bound whole-match luck.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {report.teams.map((team) => {
              const evidence = scoredEvidenceForTeam(report, team.teamId);
              const components = report.contextComponents.find(
                (c) => c.teamId === team.teamId
              )!;
              return (
                <article
                  key={team.teamId}
                  className="rounded-xl border border-amber-300/20 bg-black/20 p-4"
                >
                  <h3 className="text-base font-bold text-amber-100">
                    {team.teamName}
                  </h3>
                  <p
                    className={`mt-1 text-2xl font-black ${scoreColor(team.luckScore)}`}
                  >
                    {evidence.total > 0
                      ? team.luckScore.toFixed(1)
                      : "No scored evidence"}
                  </p>
                  <p className="text-xs text-amber-100/75">
                    {team.eventCount} tracked moments; cumulative dice units
                    (provisional weights)
                  </p>
                  <p className="mt-1 text-xs text-amber-100/75">
                    Context points:{" "}
                    {team.impactCount > 0
                      ? formatDiceContribution(
                          team.impactScore,
                          team.impactCount
                        ) +
                        " context units across " +
                        team.impactCount +
                        (team.impactCount === 1 ? " estimate" : " estimates")
                      : "Not scored"}
                  </p>
                  <p className="mt-1 text-xs text-amber-100/75">
                    Partial component sum:{" "}
                    {formatContextComponentSum(components)}
                  </p>
                  {components.bounds ? (
                    <details className="mt-2 text-xs text-amber-100/80">
                      <summary className="cursor-pointer">
                        Partial component breakdown
                      </summary>
                      <p className="mt-1">{PARTIAL_CONTEXT_SCOPE}</p>
                      <ul className="mt-1 list-inside list-disc">
                        {components.byCategory.map((category) => (
                          <li key={category.type}>
                            {category.type.replaceAll("_", " ")}:{" "}
                            {formatContextComponentSum(category)}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1">
                        Groups follow recorded source-action IDs, which need not
                        span a whole activation. Unlinked components stay
                        individual. Event membership is retained in JSON.
                      </p>
                    </details>
                  ) : null}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-amber-50/90">
                    <div>
                      Block:{" "}
                      {formatDiceContribution(
                        team.categoryScores.block,
                        evidence.byType.block
                      )}
                    </div>
                    <div>
                      Armor:{" "}
                      {formatDiceContribution(
                        team.categoryScores.armorBreak,
                        evidence.byType.armor_break
                      )}
                    </div>
                    <div>
                      Injury:{" "}
                      {formatDiceContribution(
                        team.categoryScores.injury,
                        evidence.byType.injury
                      )}
                    </div>
                    <div>
                      Dodge:{" "}
                      {formatDiceContribution(
                        team.categoryScores.dodge,
                        evidence.byType.dodge
                      )}
                    </div>
                    <div>
                      Ball:{" "}
                      {formatDiceContribution(
                        team.categoryScores.ballHandling,
                        evidence.byType.ball_handling
                      )}
                    </div>
                    <div>
                      Argue:{" "}
                      {formatDiceContribution(
                        team.categoryScores.argueCall,
                        evidence.byType.argue_call
                      )}
                    </div>
                    <div>
                      Move risk:{" "}
                      {formatDiceContribution(
                        team.categoryScores.movementRisk,
                        evidence.byType.movement_risk
                      )}
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-amber-100">
                Replay evidence
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  aria-label="Player ID or initial roster name"
                  placeholder="Player ID or initial roster name"
                  maxLength={320}
                  value={playerQuery}
                  onChange={(e) => {
                    setPlayerQuery(e.target.value);
                    setPage(0);
                  }}
                />
                <select
                  aria-label="Half"
                  value={periodFilter}
                  onChange={(e) => {
                    setPeriodFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">All halves</option>
                  <option value="first_half">First half</option>
                  <option value="second_half">Second half</option>
                  <option value="extra_time">Extra time</option>
                  <option value="unknown">Half unknown</option>
                </select>
                <input
                  type="number"
                  aria-label="Team turn"
                  placeholder="Team turn"
                  min={1}
                  step={1}
                  value={teamTurnFilter}
                  onChange={(e) => {
                    setTeamTurnFilter(e.target.value);
                    setPage(0);
                  }}
                />
                <button type="button" onClick={() => {
                  resetFilters();
                  setScoringFilter("excluded");
                  setResourceOnly(true);
                }} aria-pressed={resourceOnly}>
                  View team reroll choices ({report.rerollResources.decisionCount})
                </button>
                <button type="button" onClick={resetFilters}>
                  Reset filters
                </button>
                <select
                  aria-label="Team"
                  value={teamFilter}
                  onChange={(e) => {
                    setTeamFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">All teams</option>
                  {report.teams.map((team) => (
                    <option key={team.teamId} value={team.teamId}>
                      {team.teamName}
                    </option>
                  ))}
                  <option value="unresolved">Unresolved</option>
                </select>
                <select
                  aria-label="Scoring status"
                  value={scoringFilter}
                  onChange={(e) => {
                    setScoringFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="scored">Scored</option>
                  <option value="bounded">Context range</option>
                  <option value="excluded">Excluded</option>
                  <option value="all">All evidence</option>
                </select>
                <select
                  aria-label="Sort order"
                  value={sortOrder}
                  onChange={(e) => {
                    setSortOrder(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="chronological">Chronological</option>
                  <option value="impact">Largest dice contribution</option>
                  <option value="context">
                    Largest supported context estimate
                  </option>
                </select>
                <select
                  aria-label="Moment tag"
                  value={tagFilter}
                  onChange={(event) => (
                    setTagFilter(
                      event.target
                        .value as (typeof TAG_OPTIONS)[number]["value"]
                    ),
                    setPage(0)
                  )}
                  className="rounded-md border border-amber-200/40 bg-black/40 px-2 py-1 text-xs text-amber-50"
                >
                  {TAG_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Category"
                  value={typeFilter}
                  onChange={(event) => (
                    setTypeFilter(
                      event.target
                        .value as (typeof EVENT_TYPE_OPTIONS)[number]["value"]
                    ),
                    setPage(0)
                  )}
                  className="rounded-md border border-amber-200/40 bg-black/40 px-2 py-1 text-xs text-amber-50"
                >
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activationFilter && (
              <div className="text-xs text-amber-100/80">
                Activation {activationFilter}
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => {
                    setActivationFilter(null);
                    setPage(0);
                  }}
                >
                  Show all activations
                </button>
              </div>
            )}

            <p className="text-sm" role="status">
              {filteredMoments.length
                ? `${filteredMoments.length} matching events; page ${page + 1} of ${Math.ceil(filteredMoments.length / 50)}`
                : "No events match these filters. Try all evidence or another category."}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous page
              </button>
              <button
                type="button"
                disabled={(page + 1) * 50 >= filteredMoments.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Next page
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm text-amber-50">
                <thead>
                  <tr className="border-b border-amber-300/20 text-left">
                    <th className="px-2 py-2">Replay segment</th>
                    <th className="px-2 py-2">Team</th>
                    <th className="min-w-64 px-2 py-2">Moment</th>
                    <th className="px-2 py-2">Expected</th>
                    <th className="px-2 py-2">Actual</th>
                    <th className="px-2 py-2">Weighted Delta</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMoments
                    .slice(page * 50, page * 50 + 50)
                    .map((moment) => (
                      <tr
                        key={moment.id}
                        className="border-b border-amber-300/10 align-top"
                      >
                        <td className="px-2 py-3 font-semibold">
                          {moment.turn}
                          <div className="text-xs font-normal text-amber-100/75">
                            {formatPreRollPosition(moment.metadata.preRoll)}
                          </div>
                        </td>
                        <td className="px-2 py-3">{moment.teamName}</td>
                        <td className="px-2 py-3">
                          <div>{moment.label}</div>
                          <div className="text-xs text-amber-100/75">
                            {formatPlayerObservation(moment)}
                          </div>
                          {moment.metadata.preRoll?.activationId && (
                            <button
                              type="button"
                              className="text-xs underline"
                              onClick={() => {
                                setActivationFilter(
                                  moment.metadata.preRoll!.activationId
                                );
                                setPage(0);
                              }}
                            >
                              Show this activation
                            </button>
                          )}
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-amber-100/80">
                              Why
                            </summary>
                            <p className="mt-1 text-xs text-amber-100/80">
                              {moment.statusReason}. Target:{" "}
                              {moment.explainability.target}. Base odds{" "}
                              {moment.explainability.baseOdds !== undefined
                                ? `${(moment.explainability.baseOdds * 100).toFixed(1)}%`
                                : "n/a"}
                              , reroll-adjusted{" "}
                              {moment.explainability.rerollAdjustedOdds !==
                              undefined
                                ? `${(moment.explainability.rerollAdjustedOdds * 100).toFixed(1)}%`
                                : "n/a"}
                              , weight {moment.explainability.weight}.
                            </p>
                            {explainBlockPush(moment) ? <p className="mt-2 text-xs text-amber-100/80">{explainBlockPush(moment)}</p> : null}
                            {explainOwnership(moment) ? (
                              <p className="mt-2 text-xs text-slate-300">
                                {explainOwnership(moment)}
                              </p>
                            ) : null}
                            {explainObservedDice(moment, diceById) ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainObservedDice(moment, diceById)}
                              </p>
                            ) : null}
                            {moment.metadata.injuryObservation ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainInjuryObservation(moment)}
                              </p>
                            ) : null}
                            {moment.metadata.regenerationAftermath ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainRegenerationAftermath(moment)}
                              </p>
                            ) : null}
                            {moment.metadata.regenerationReturn || moment.metadata.recoveryReturnActivation ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainRegenerationReturn(moment)}
                              </p>
                            ) : null}
                            {moment.metadata.numericRetryAccess || moment.metadata.numericGatedReplacement ? (
                              <p className="mt-1 text-xs text-amber-100/80">{explainNumericRetryAccess(moment)}</p>
                            ) : null}
                            {moment.metadata.failedNumericRetry ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainFailedNumericRetry(moment)}
                              </p>
                            ) : null}
                            {moment.metadata.catchRerollResume ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainCatchRerollResume(moment)}
                              </p>
                            ) : null}
                            {moment.metadata.numericOriginal ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainNumericOriginal(moment)}
                              </p>
                            ) : null}
                            {moment.metadata.rerollDraws ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainNumericRerollScore(moment)}
                              </p>
                            ) : null}
                            {moment.contextualImpact ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainContextImpact(moment)}
                              </p>
                            ) : null}
                            {explainPreRollEvidence(moment.metadata.preRoll) ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainPreRollEvidence(
                                  moment.metadata.preRoll
                                )}
                              </p>
                            ) : null}
                            {moment.metadata.movementFall ||
                            moment.metadata.movementTouchdown ||
                            moment.metadata.dodgeMovement ||
                            moment.metadata.teamRerollMovement ||
                            moment.metadata.combinedMovement ||
                            moment.metadata.pickupResolution ||
                            moment.metadata.pickupAfterMovement ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainMovementOutcome(moment.metadata)}
                              </p>
                            ) : null}
                            {moment.metadata.pickupBallChain ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainPickupBallChain(
                                  moment,
                                  report.teams,
                                  eventsById
                                )}
                              </p>
                            ) : null}
                            {explainRerollResource(moment, rerollDecisions, sourcesById) ? (
                              <p>{explainRerollResource(moment, rerollDecisions, sourcesById)}</p>
                            ) : null}
                            {explainRerollCounter(moment, sourcesById) ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainRerollCounter(moment, sourcesById)}
                              </p>
                            ) : null}
                            {moment.metadata.activationLoss ||
                            moment.metadata.activationEnd ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainActivationLoss(moment)}
                              </p>
                            ) : null}
                            {moment.contextualBounds ||
                            moment.possessionBounds ||
                            moment.catchPossessionBounds ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainContextBounds(moment)}
                              </p>
                            ) : null}
                            {moment.metadata.block?.traitEvidence ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainBlockSkillModel(moment)}
                              </p>
                            ) : null}
                            {moment.metadata.blockResolution ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainBlockResolution(
                                  moment,
                                  report.teams,
                                  sourcesById
                                )}
                              </p>
                            ) : null}
                            {moment.metadata.driveEffectExpiry ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainDriveEffectExpiry(moment)}
                              </p>
                            ) : null}
                            {moment.metadata.lonerGate ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainLonerGate(moment.metadata.lonerGate,!!moment.metadata.numericRetryAccess)}
                              </p>
                            ) : null}
                            {moment.metadata.proGate ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {explainProGate(moment.metadata.proGate)}
                              </p>
                            ) : null}
                            {moment.explainability.formulaSummary ? (
                              <p className="mt-1 text-xs text-amber-100/80">
                                {moment.explainability.formulaSummary}.
                              </p>
                            ) : null}
                            <p className="mt-1 text-xs text-amber-100/80">
                              {moment.explainability.inputsSummary}. Source:{" "}
                              {moment.metadata.sourceId ?? moment.id}; action:{" "}
                              {moment.metadata.actionId ?? "unknown"}.
                            </p>
                          </details>
                        </td>
                        <td className="px-2 py-3">
                          {formatExpectedOutcome(moment)}
                        </td>
                        <td className="px-2 py-3">
                          {formatActualOutcome(moment)}
                        </td>
                        <td className="px-2 py-3">
                          {formatDiceContribution(
                            moment.weightedDelta,
                            moment.scoringStatus === "scored" ? 1 : 0,
                            3
                          )}
                        </td>
                        <td className="px-2 py-3">{moment.scoringStatus}</td>
                        <td className="px-2 py-3">
                          {moment.tags.length > 0 ? (
                            <span className="inline-flex rounded-full border border-amber-200/40 px-2 py-1 text-xs font-semibold uppercase">
                              {moment.tags.join(", ")}
                            </span>
                          ) : (
                            <span className="text-amber-100/70">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
