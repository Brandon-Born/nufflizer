"use client";

import { useMemo, useState } from "react";

type LuckEventType = "block" | "armor_break" | "injury" | "dodge" | "ball_handling" | "argue_call";
type LuckMomentTag = "blessed" | "shaftaroonie";
type LuckCalculationMethod = "explicit" | "fallback";

type LuckEvent = {
  id: string;
  turn: number;
  teamId: string;
  teamName: string;
  playerId?: string;
  type: LuckEventType;
  probabilitySuccess: number;
  actualSuccess: boolean;
  delta: number;
  weightedDelta: number;
  label: string;
  tags: LuckMomentTag[];
  calculationMethod: LuckCalculationMethod;
  calculationReason: string;
  explainability: {
    target: string;
    baseOdds: number;
    rerollAdjustedOdds: number;
    weight: number;
    formulaSummary: string;
    inputsSummary: string;
  };
};

type LuckReport = {
  id: string;
  generatedAt: string;
  match: {
    id: string;
    homeTeam: string;
    awayTeam: string;
  };
  verdict: {
    luckierTeam: "home" | "away" | "even";
    scoreGap: number;
    summary: string;
  };
  coverage: {
    explicitCount: number;
    fallbackCount: number;
    explicitRate: number;
    byType: Record<LuckEventType, { explicit: number; fallback: number }>;
  };
  weightTable: Record<LuckEventType, number>;
  howScoredSummary: string[];
  teams: Array<{
    teamId: string;
    teamName: string;
    luckScore: number;
    categoryScores: {
      block: number;
      armorBreak: number;
      injury: number;
      dodge: number;
      ballHandling: number;
      argueCall: number;
    };
    eventCount: number;
  }>;
  keyMoments: LuckEvent[];
  events: LuckEvent[];
};

const EVENT_TYPE_OPTIONS: Array<{ value: "all" | LuckEventType; label: string }> = [
  { value: "all", label: "All events" },
  { value: "block", label: "Block" },
  { value: "armor_break", label: "Armor break" },
  { value: "injury", label: "Injury" },
  { value: "dodge", label: "Dodge" },
  { value: "ball_handling", label: "Ball handling" },
  { value: "argue_call", label: "Argue call" }
];

const TAG_OPTIONS = [
  { value: "all", label: "All moments" },
  { value: "blessed", label: "Blessed moments" },
  { value: "shaftaroonie", label: "Shaftaroonie moments" }
] as const;

export function NufflizierAnalyzer({ routeLabel }: { routeLabel: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LuckReport | null>(null);
  const [tagFilter, setTagFilter] = useState<(typeof TAG_OPTIONS)[number]["value"]>("all");
  const [typeFilter, setTypeFilter] = useState<(typeof EVENT_TYPE_OPTIONS)[number]["value"]>("all");

  const filteredMoments = useMemo(() => {
    if (!report) {
      return [];
    }

    return report.keyMoments.filter((event) => {
      if (tagFilter !== "all" && !event.tags.includes(tagFilter)) {
        return false;
      }

      if (typeFilter !== "all" && event.type !== typeFilter) {
        return false;
      }

      return true;
    });
  }, [report, tagFilter, typeFilter]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReport(null);

    const formData = new FormData(event.currentTarget);
    const replayFile = formData.get("replay");
    if (!(replayFile instanceof File)) {
      setError("Choose a replay file first.");
      return;
    }

    setIsLoading(true);
    setStatus("Uploading replay...");

    try {
      const uploadData = new FormData();
      uploadData.append("replay", replayFile);

      setStatus("Reading replay and rolling Nufflizier...");
      const response = await fetch("/api/nufflizier/analyze", {
        method: "POST",
        body: uploadData
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Replay analysis failed.");
      }

      const body = (await response.json()) as LuckReport;
      setReport(body);
      setStatus("Done. Nuffle has spoken.");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unexpected error.";
      setError(message);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }

  function scoreColor(score: number): string {
    if (score >= 8) {
      return "text-emerald-200";
    }

    if (score <= -8) {
      return "text-rose-200";
    }

    return "text-amber-100";
  }

  function downloadJson(): void {
    if (!report) {
      return;
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
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
        <h1 className="text-4xl font-black tracking-tight text-amber-100">Blessed by Nuffle Analyzer</h1>
        <p className="max-w-3xl text-sm text-amber-50/90">
          One-shot flow ({routeLabel}): upload one replay, analyze luck swings, see who got blessed and who got the shaftaroonie.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="rounded-xl border border-amber-300/30 bg-black/35 p-6 shadow-xl backdrop-blur">
        <label className="block space-y-2 text-sm font-medium text-amber-100">
          <span>Replay file (.xml or .bbr)</span>
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

          {report ? (
            <button
              type="button"
              onClick={() => {
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

        {status ? <p className="mt-3 text-xs text-amber-100/90">{status}</p> : null}
      </form>

      {error ? (
        <section className="rounded-lg border border-red-300/60 bg-red-900/30 px-4 py-3 text-sm text-red-100">{error}</section>
      ) : null}

      {report ? (
        <section className="space-y-6 rounded-xl border border-amber-300/30 bg-black/35 p-6 shadow-xl backdrop-blur">
          <header className="space-y-2">
            <h2 className="text-xl font-bold text-amber-100">Nuffle Match Report</h2>
            <p className="text-xs text-amber-100/80">Generated at {new Date(report.generatedAt).toLocaleString()}</p>
            <p className="text-xs text-amber-100/80">Match: {report.match.id}</p>
          </header>

          <div className="rounded-lg border border-amber-300/20 bg-amber-950/20 p-4">
            <p className="text-lg font-semibold text-amber-100">{report.verdict.summary}</p>
            <p className="mt-1 text-sm text-amber-50/90">Score gap: {report.verdict.scoreGap.toFixed(1)}</p>
            <p className="mt-1 text-sm text-amber-50/90">
              Coverage: {(report.coverage.explicitRate * 100).toFixed(1)}% explicit ({report.coverage.explicitCount} explicit,{" "}
              {report.coverage.fallbackCount} fallback)
            </p>
          </div>

          <section className="rounded-xl border border-amber-300/20 bg-black/20 p-4">
            <h3 className="text-base font-semibold text-amber-100">How this was scored</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50/90">
              {report.howScoredSummary.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-amber-100/80">
              Weights: block {report.weightTable.block}, armor {report.weightTable.armor_break}, injury {report.weightTable.injury}, dodge{" "}
              {report.weightTable.dodge}, ball handling {report.weightTable.ball_handling}, argue {report.weightTable.argue_call}.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-xs text-amber-50/90">
                <thead>
                  <tr className="border-b border-amber-300/20 text-left">
                    <th className="px-2 py-1">Event type</th>
                    <th className="px-2 py-1">Explicit</th>
                    <th className="px-2 py-1">Fallback</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.coverage.byType).map(([eventType, counts]) => (
                    <tr key={eventType} className="border-b border-amber-300/10">
                      <td className="px-2 py-1">{eventType}</td>
                      <td className="px-2 py-1">{counts.explicit}</td>
                      <td className="px-2 py-1">{counts.fallback}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            {report.teams.map((team) => (
              <article key={team.teamId} className="rounded-xl border border-amber-300/20 bg-black/20 p-4">
                <h3 className="text-base font-bold text-amber-100">{team.teamName}</h3>
                <p className={`mt-1 text-2xl font-black ${scoreColor(team.luckScore)}`}>{team.luckScore.toFixed(1)}</p>
                <p className="text-xs text-amber-100/75">{team.eventCount} tracked moments</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-amber-50/90">
                  <div>Block: {team.categoryScores.block.toFixed(2)}</div>
                  <div>Armor: {team.categoryScores.armorBreak.toFixed(2)}</div>
                  <div>Injury: {team.categoryScores.injury.toFixed(2)}</div>
                  <div>Dodge: {team.categoryScores.dodge.toFixed(2)}</div>
                  <div>Ball: {team.categoryScores.ballHandling.toFixed(2)}</div>
                  <div>Argue: {team.categoryScores.argueCall.toFixed(2)}</div>
                </dl>
              </article>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-amber-100">Key moments timeline</h4>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={tagFilter}
                  onChange={(event) => setTagFilter(event.target.value as (typeof TAG_OPTIONS)[number]["value"])}
                  className="rounded-md border border-amber-200/40 bg-black/40 px-2 py-1 text-xs text-amber-50"
                >
                  {TAG_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as (typeof EVENT_TYPE_OPTIONS)[number]["value"])}
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

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm text-amber-50">
                <thead>
                  <tr className="border-b border-amber-300/20 text-left">
                    <th className="px-2 py-2">Turn</th>
                    <th className="px-2 py-2">Team</th>
                    <th className="px-2 py-2">Moment</th>
                    <th className="px-2 py-2">Expected</th>
                    <th className="px-2 py-2">Actual</th>
                    <th className="px-2 py-2">Weighted Delta</th>
                    <th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMoments.map((moment) => (
                    <tr key={moment.id} className="border-b border-amber-300/10 align-top">
                      <td className="px-2 py-3 font-semibold">{moment.turn}</td>
                      <td className="px-2 py-3">{moment.teamName}</td>
                      <td className="px-2 py-3">
                        <div>{moment.label}</div>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-amber-100/80">Why</summary>
                          <p className="mt-1 text-xs text-amber-100/80">
                            {moment.calculationReason}. Target: {moment.explainability.target}. Base odds{" "}
                            {(moment.explainability.baseOdds * 100).toFixed(1)}%, reroll-adjusted{" "}
                            {(moment.explainability.rerollAdjustedOdds * 100).toFixed(1)}%, weight {moment.explainability.weight}.
                          </p>
                          <p className="mt-1 text-xs text-amber-100/80">{moment.explainability.formulaSummary}.</p>
                          <p className="mt-1 text-xs text-amber-100/80">{moment.explainability.inputsSummary}.</p>
                        </details>
                      </td>
                      <td className="px-2 py-3">{(moment.probabilitySuccess * 100).toFixed(1)}%</td>
                      <td className="px-2 py-3">{moment.actualSuccess ? "Success" : "Fail"}</td>
                      <td className="px-2 py-3">{moment.weightedDelta.toFixed(3)}</td>
                      <td className="px-2 py-3">{moment.calculationMethod}</td>
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
