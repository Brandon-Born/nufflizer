import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-16">
      <section className="space-y-4">
        <p className="inline-flex rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-900">
          Blood Bowl 3 Replay Coaching
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">BB Trainer</h1>
        <p className="max-w-3xl text-lg text-slate-700">
          Upload a replay XML file, get a macro performance summary, and review turn-by-turn suggestions that
          prioritize safer lines and better sequencing.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Current capability</h2>
          <p className="mt-2 text-sm text-slate-700">
            Initial parser and rule engine scaffold. Recommendations are deterministic and explainable.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Next milestone</h2>
          <p className="mt-2 text-sm text-slate-700">
            Expand Blood Bowl-specific heuristics using real fixture replays and stronger event mapping.
          </p>
        </div>
      </section>

      <div>
        <Link
          href="/upload"
          className="inline-flex rounded-lg bg-brand-500 px-5 py-3 font-medium text-white transition hover:bg-brand-700"
        >
          Upload Replay
        </Link>
      </div>
    </main>
  );
}
