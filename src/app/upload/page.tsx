"use client";

import { useState } from "react";

type ReportResponse = {
  report: {
    id: string;
    generatedAt: string;
    replay: {
      matchId: string;
      teamCount: number;
      turnCount: number;
    };
    coaching: {
      headline: string;
      priorities: string[];
      turnByTurn: Array<{
        turnNumber: number;
        note: string;
        betterLine: string;
      }>;
    };
  };
};

export default function UploadPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse["report"] | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReport(null);

    const formData = new FormData(event.currentTarget);
    const replayFile = formData.get("replay");

    if (!(replayFile instanceof File)) {
      setError("Please select a replay XML file.");
      return;
    }

    setIsLoading(true);

    try {
      const uploadData = new FormData();
      uploadData.append("replay", replayFile);

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
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unexpected error.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-16">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Upload Replay</h1>
        <p className="text-slate-700">Choose a Blood Bowl 3 replay XML file for analysis.</p>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block space-y-2 text-sm font-medium">
          <span>Replay XML</span>
          <input
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="file"
            name="replay"
            accept=".xml,text/xml,application/xml"
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
      </form>

      {error ? (
        <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</section>
      ) : null}

      {report ? (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Report</h2>
          <p className="text-sm text-slate-600">Generated at {new Date(report.generatedAt).toLocaleString()}</p>
          <p className="text-sm text-slate-700">{report.coaching.headline}</p>

          <div>
            <h3 className="text-sm font-semibold">Top priorities</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {report.coaching.priorities.map((priority) => (
                <li key={priority}>{priority}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Turn notes</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {report.coaching.turnByTurn.slice(0, 8).map((turn) => (
                <li key={turn.turnNumber} className="rounded-md border border-slate-200 p-3">
                  <p className="font-medium">Turn {turn.turnNumber}</p>
                  <p>{turn.note}</p>
                  <p className="mt-1 text-slate-600">Alternative: {turn.betterLine}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
