import Image from "next/image";
import Link from "next/link";
import nufflizierLogo from "./nufflizier-logo.png";

export default function HomePage() {
  return (
    <main className="bb-shell mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-16">
      <section className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <p className="inline-flex rounded-full border border-amber-300/50 bg-amber-100/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-100">
            Blood Bowl 3 Luck Analyzer
          </p>
          <h1 className="text-4xl font-black tracking-tight text-amber-100 md:text-5xl">Nufflizier</h1>
          <p className="max-w-3xl text-lg text-amber-50/90">
            Nufflizier parses BB3 replays and scores luck swings across key moments like blocks, dodges, armor breaks, injuries, ball
            handling, movement risk checks, and argue-the-call style events.
          </p>
        </div>
        <div className="mx-auto rounded-2xl border border-amber-300/40 bg-black/30 p-3 shadow-lg md:mx-0">
          <Image
            src={nufflizierLogo}
            alt="Nufflizier goblin logo"
            width={176}
            height={176}
            priority
            className="h-36 w-36 rounded-xl md:h-44 md:w-44"
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-amber-300/20 bg-black/30 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-100">How it works</h2>
          <p className="mt-2 text-sm text-amber-50/90">Upload one replay, get a luck scorecard, and review the top Nuffle swings.</p>
        </div>
        <div className="rounded-xl border border-amber-300/20 bg-black/30 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-100">Privacy</h2>
          <p className="mt-2 text-sm text-amber-50/90">
            Replays are processed in one-shot mode. The app does not store replay files for long-term history.
          </p>
        </div>
        <div className="rounded-xl border border-amber-300/20 bg-black/30 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-amber-100">Project Scope</h2>
          <p className="mt-2 text-sm text-amber-50/90">
            This is a for-fun analysis tool, not an official competitive product. Probabilities are replay-driven and still evolving.
          </p>
        </div>
      </section>

      <div>
        <Link href="/nufflizier" className="inline-flex rounded-lg bg-red-700 px-5 py-3 font-semibold text-white transition hover:bg-red-600">
          Start Nufflizier Analysis
        </Link>
      </div>

      <section className="rounded-xl border border-amber-300/20 bg-black/30 p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-100">Links</h2>
        <p className="mt-2 text-sm text-amber-50/90">
          Source code:{" "}
          <a
            href="https://github.com/Brandon-Born/bb-nuffilizer"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-amber-200 underline decoration-amber-300/60 underline-offset-2 hover:text-amber-100"
          >
            github.com/Brandon-Born/bb-nuffilizer
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
