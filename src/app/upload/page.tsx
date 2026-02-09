"use client";

import Link from "next/link";
import { useState } from "react";

type TurnRow = {
  turnNumber: number;
  happened: string;
  riskyBecause: string;
  saferAlternative: string;
  confidence: "low" | "medium" | "high";
  evidence: Array<{
    eventType?: string;
    sourceTag?: string;
    code?: string;
    detail?: string;
  }>;
};

type ReportResponse = {
  report: {
    id: string;
    generatedAt: string;
    replay: {
      matchId: string;
      replayVersion?: string;
      format: "xml" | "bbr";
      teamCount: number;
      turnCount: number;
      unknownCodes: Array<{
        category: "step" | "action" | "roll" | "end_turn_reason";
        code: number;
        occurrences: number;
      }>;
    };
    coaching: {
      headline: string;
      priorities: string[];
      turnByTurn: TurnRow[];
    };
  };
};

export default function UploadPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse["report"] | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReport(null);

    const formData = new FormData(event.currentTarget);
    const replayFile = formData.get("replay");

    if (!(replayFile instanceof File)) {
      setError("Please select a replay file.");
      return;
    }

    setIsLoading(true);
    setStatus("Uploading replay...");

    try {
      const uploadData = new FormData();
      uploadData.append("replay", replayFile);

      setStatus("Parsing and evaluating replay...");
      const response = await fetch("/api/replay", {
        method: "POST",
        body: uploadData
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Replay analysis failed.");
      }

      const body = (await response.json()) as ReportResponse;
      setReport(body.report);
      setStatus("Analysis complete.");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unexpected error.";
      setError(message);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-16">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Upload Replay</h1>
        <p className="text-slate-700">Upload Blood Bowl 3 replay files (`.xml` or `.bbr`) for evidence-backed coaching.</p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block space-y-2 text-sm font-medium">
          <span>Replay file</span>
          <input
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="file"
            name="replay"
            accept=".xml,.bbr,text/xml,application/xml"
            required
          />
        </label>

        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Analyzing..." : "Analyze Replay"}
        </button>

        {status ? <p className="text-xs text-slate-600">{status}</p> : null}
      </form>

      {error ? (
        <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</section>
      ) : null}

      {report ? (
        <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <header className="space-y-1">
            <h2 className="text-xl font-semibold">Report</h2>
            <p className="text-sm text-slate-600">Generated at {new Date(report.generatedAt).toLocaleString()}</p>
            <p className="text-sm text-slate-700">{report.coaching.headline}</p>
            <p className="text-xs text-slate-500">
              Match: {report.replay.matchId} | Format: {report.replay.format.toUpperCase()} | Version: {report.replay.replayVersion ?? "unknown"}
            </p>
            <Link href={`/report/${report.id}`} className="text-sm font-medium text-brand-700 hover:underline">
              Open persisted report view
            </Link>
          </header>

          <div>
            <h3 className="text-sm font-semibold">Top priorities</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {report.coaching.priorities.map((priority) => (
                <li key={priority}>{priority}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Turn-by-turn evidence</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-2 py-2">Turn</th>
                    <th className="px-2 py-2">What Happened</th>
                    <th className="px-2 py-2">Why Risky</th>
                    <th className="px-2 py-2">Safer Alternative</th>
                  </tr>
                </thead>
                <tbody>
                  {report.coaching.turnByTurn.map((turn) => (
                    <tr key={`${turn.turnNumber}-${turn.happened}`} className="border-b border-slate-100 align-top" id={`turn-${turn.turnNumber}`}>
                      <td className="px-2 py-3 font-medium">{turn.turnNumber}</td>
                      <td className="px-2 py-3">{turn.happened}</td>
                      <td className="px-2 py-3">{turn.riskyBecause}</td>
                      <td className="px-2 py-3">{turn.saferAlternative}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {report.replay.unknownCodes.length > 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Unknown replay codes detected. Mapping coverage can be improved using this report.
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
