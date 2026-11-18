import type {
  LuckEvent,
  LuckEventType,
  LuckReport
} from "@/domain/nufflizer/types";
import {
  hasArmorUnderReview,
  readerMomentTitle,
  summarizeForReader
} from "@/domain/nufflizer/readerSummary";
import {
  explainVerdictEvidence,
  formatPlayerObservation,
  formatPreRollPosition
} from "@/domain/nufflizer/presentation";

export function ReportOverview({
  report,
  summary,
  onMoment,
  onCategory
}: {
  report: LuckReport;
  summary: ReturnType<typeof summarizeForReader>;
  onMoment: (event: LuckEvent) => void;
  onCategory: (type: LuckEventType) => void;
}) {
  const limitations = explainVerdictEvidence(report);
  return (
    <section aria-label="Report overview" className="space-y-5">
      <div className="rounded-xl border border-amber-300/30 bg-amber-950/30 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
          What this replay tells us
        </p>
        <h3 className="mt-2 text-2xl font-bold text-amber-50">
          {report.verdict.status === "insufficient_evidence"
            ? "Not enough evidence to compare the teams"
            : "Useful dice evidence. No whole-match verdict yet."}
        </h3>
        <p className="mt-2 text-sm text-amber-100/85">
          {report.match.homeTeam} vs {report.match.awayTeam}
        </p>
        <p className="mt-2 text-sm text-amber-100/85">
          {report.verdict.summary}
        </p>
        {limitations.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100/85">
            {limitations.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <strong className="text-2xl text-amber-50">{summary.scored}</strong>
            <p className="text-sm">scored dice checks</p>
          </div>
          <div>
            <strong className="text-2xl text-amber-50">
              {summary.unscored}
            </strong>
            <p className="text-sm">unscored or under review</p>
          </div>
          <div>
            <strong className="text-2xl text-amber-50">
              {summary.observed}
            </strong>
            <p className="text-sm">observed dice checks</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-amber-100/80">
          Checks group linked reroll attempts and exclude known copied
          summaries. These counts measure support, not confidence in who was
          luckier. Unknown evidence is not even luck.
        </p>
      </div>
      {hasArmorUnderReview(report) ? (
        <aside
          aria-label="Armor scoring under review"
          className="rounded-lg border border-orange-300/40 bg-orange-950/30 p-4 text-sm text-orange-100"
        >
          <strong>Armor scoring under review.</strong>
          <p className="mt-1">
            Later skill choices can bias armor estimates. Armor and combined
            team totals are left out of this summary. You can still inspect the
            original dice below.
          </p>
        </aside>
      ) : null}
      {summary.contextMoments.length ? (
        <section aria-labelledby="context-moments" className="space-y-3">
          <h3 id="context-moments" className="text-xl font-bold text-amber-100">
            What was at stake
          </h3>
          <p className="text-sm text-amber-100/80">
            These estimates cover specific consequences supported by the replay.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {summary.contextMoments.map(({ event, text, bounds, point }) => (
              <article
                key={event.id}
                className="flex flex-col items-start rounded-xl border border-amber-300/20 bg-black/20 p-4"
              >
                <p className="text-xs text-amber-100/75">
                  {event.teamName} · {formatPlayerObservation(event)}
                </p>
                <h4 className="mt-1 font-semibold text-amber-50">
                  {readerMomentTitle(event)}
                </h4>
                <p className="mt-2 text-sm">{text}</p>
                <p className="mt-2 text-xs text-amber-100/80">
                  {point
                    ? bounds.lower.toFixed(2)
                    : `${bounds.lower.toFixed(2)} to ${bounds.upper.toFixed(2)}`}{" "}
                  provisional context units
                </p>
                <button
                  type="button"
                  onClick={() => onMoment(event)}
                  className="mt-3 rounded-md border border-amber-300/40 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"
                >
                  Inspect context
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section aria-labelledby="key-dice-moments" className="space-y-3">
        <h3 id="key-dice-moments" className="text-xl font-bold text-amber-100">
          Key dice moments
        </h3>
        <p className="text-sm text-amber-100/80">
          Up to six unlikely successes and likely failures, ordered by how
          unlikely the observed result was. These are dice odds, not a ranking
          of tactical importance.
        </p>
        {summary.moments.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {summary.moments.map(({ event, outcomeChance }) => (
              <article
                key={event.id}
                className="rounded-xl border border-amber-300/20 bg-black/20 p-4"
              >
                <p className="text-xs text-amber-100/75">
                  {event.teamName} · {formatPlayerObservation(event)}
                </p>
                <h4 className="mt-1 font-semibold text-amber-50">
                  {readerMomentTitle(event)}
                </h4>
                <p className="mt-2 text-sm">
                  <strong>{(outcomeChance * 100).toFixed(1)}%</strong> chance of
                  this {event.actualSuccess ? "success" : "failure"}
                  {event.metadata.probabilityPolicy === "two_attempt"
                    ? " under the recorded reroll policy"
                    : ""}
                  .
                </p>
                <p className="mt-2 text-xs text-amber-100/75">
                  Replay segment {event.turn}
                  {formatPreRollPosition(event.metadata.preRoll)
                    ? ` · ${formatPreRollPosition(event.metadata.preRoll)}`
                    : ""}
                </p>
                <button
                  type="button"
                  onClick={() => onMoment(event)}
                  className="mt-3 rounded-md border border-amber-300/40 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"
                >
                  Inspect this moment
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-amber-300/20 p-4 text-sm">
            No supported binary outcome had a 50% or lower chance of occurring.
            Browse the categories below for ordinary results, categorical
            block/injury evidence and unscored dice.
          </p>
        )}
      </section>
      <section aria-labelledby="category-overview" className="space-y-3">
        <h3 id="category-overview" className="text-xl font-bold text-amber-100">
          Explore by category
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {summary.categories
            .filter((c) => c.observed > 0)
            .map((c) => (
              <button
                type="button"
                key={c.type}
                onClick={() => onCategory(c.type)}
                className="rounded-lg border border-amber-300/20 bg-black/20 p-3 text-left hover:bg-amber-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"
              >
                <span className="block font-semibold">{c.label}</span>
                <span className="mt-1 block text-xs text-amber-100/75">
                  {c.scored} scored · {c.observed - c.scored} unscored
                  {c.underReview ? " / under review" : ""}
                </span>
              </button>
            ))}
        </div>
      </section>
    </section>
  );
}
