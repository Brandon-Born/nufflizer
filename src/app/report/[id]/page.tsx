import Link from "next/link";
import { notFound } from "next/navigation";

import { getReplayReportById } from "@/server/services/reportStore";

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const report = await getReplayReportById(params.id);

  if (!report) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Report {report.id}</h1>
        <p className="text-sm text-slate-600">Generated at {new Date(report.generatedAt).toLocaleString()}</p>
        <p className="text-sm text-slate-700">{report.coaching.headline}</p>
      </header>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Top Priorities</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {report.coaching.priorities.map((priority) => (
            <li key={priority}>{priority}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Turn-by-Turn Coaching</h2>
        <div className="mt-4 overflow-x-auto">
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
      </section>

      <div className="mt-8">
        <Link href="/upload" className="text-sm font-medium text-brand-700 hover:underline">
          Analyze another replay
        </Link>
      </div>
    </main>
  );
}
