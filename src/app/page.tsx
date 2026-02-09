import Link from "next/link";

export default function HomePage() {
  return (
    <main className="bb-shell mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-16">
      <section className="space-y-4">
        <p className="inline-flex rounded-full border border-amber-300/50 bg-amber-100/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
          Blood Bowl 3 Replay Coach
        </p>
        <h1 className="text-4xl font-black tracking-tight text-amber-100 md:text-5xl">BB Trainer</h1>
        <p className="max-w-3xl text-lg text-amber-50/90">
          BB Trainer is a replay coach for Blood Bowl 3. Upload one replay, pick your team, and get simple match feedback to help
          you learn safer play patterns turn by turn.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-amber-300/20 bg-black/30 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-100">How it works</h2>
          <p className="mt-2 text-sm text-amber-50/90">Upload once, read your coaching report, then upload your next game.</p>
        </div>
        <div className="rounded-xl border border-amber-300/20 bg-black/30 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-100">Privacy</h2>
          <p className="mt-2 text-sm text-amber-50/90">
            Replays are processed in one shot for coaching output. The app does not store replay files for long-term history.
          </p>
        </div>
        <div className="rounded-xl border border-amber-300/20 bg-black/30 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-100">Project Scope</h2>
          <p className="mt-2 text-sm text-amber-50/90">
            This is a for-fun learning app, not an official competitive tool. Advice is educational and may miss context.
          </p>
        </div>
      </section>

      <div>
        <Link href="/upload" className="inline-flex rounded-lg bg-red-700 px-5 py-3 font-semibold text-white transition hover:bg-red-600">
          Start Replay Coaching
        </Link>
      </div>

      <section className="rounded-xl border border-amber-300/20 bg-black/30 p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-100">Links</h2>
        <p className="mt-2 text-sm text-amber-50/90">
          Source code:{" "}
          <a
            href="https://github.com/Brandon-Born/bb-trainer"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-amber-200 underline decoration-amber-300/60 underline-offset-2 hover:text-amber-100"
          >
            github.com/Brandon-Born/bb-trainer
          </a>
        </p>
        <p className="mt-1 text-sm text-amber-50/90">
          Built by:{" "}
          <a
            href="https://bborn.dev/"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-amber-200 underline decoration-amber-300/60 underline-offset-2 hover:text-amber-100"
          >
            bborn.dev
          </a>
        </p>
      </section>
    </main>
  );
}
