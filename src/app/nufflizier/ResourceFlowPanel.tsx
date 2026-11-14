"use client";

import { useState } from "react";
import type { LuckReport } from "@/domain/nufflizer/types";
import { explainResourceWindow } from "@/domain/nufflizer/presentation";

const SIZE = 10;
const raw = (n: number | null | undefined) =>
  n === null || n === undefined ? "unknown" : String(n);
function Pager({
  page,
  count,
  onChange,
  label
}: {
  page: number;
  count: number;
  onChange: (page: number) => void;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="my-3 flex flex-wrap items-center gap-3 text-sm"
    >
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page + 1} of {Math.max(1, Math.ceil(count / SIZE))}
      </span>
      <button
        type="button"
        disabled={(page + 1) * SIZE >= count}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

export function ResourceFlowPanel({
  report,
  onChoices
}: {
  report: LuckReport;
  onChoices: (ids: string[]) => void;
}) {
  const [windowPage, setWindowPage] = useState(0),
    [snapshotPage, setSnapshotPage] = useState(0),
    [selected, setSelected] = useState<number | null>(null),
    [intervalPage, setIntervalPage] = useState(0);
  const [browse, setBrowse] = useState(false);
  const flow = report.rerollResources.flow,
    window = selected === null ? null : flow.clockWindows[selected];
  const name = (team: string | null | undefined) =>
    report.teams.find((t) => t.teamId === team)?.teamName ?? "Unresolved team";
  const checkpoint = (id: number | null) =>
    id === null
      ? "unknown"
      : `#${id} (ReplayStep ${raw(flow.clockSnapshots[id]?.source.replayStep)}, child ${raw(flow.clockSnapshots[id]?.source.childIndex)})`;
  return (
    <section
      aria-label="Recorded counter flow"
      className="rounded-xl border border-slate-700 bg-slate-900/60 p-4"
    >
      <h3 className="text-lg font-semibold">Recorded counter flow</h3>
      <p className="mt-2 text-sm text-slate-300">
        {flow.clockSnapshots.length} source checkpoints;{" "}
        {flow.clockWindows.length} observed windows with choices. Windows follow
        unchanged recorded clock fields and stop at end notifications. The first
        following checkpoint is retained even across a boundary. Missing values
        stay unknown. These observations add no luck points and do not establish
        legal turn boundaries, reroll eligibility or resource value.
      </p>
      <details>
        <summary className="mt-3">
          Inspect counter windows and source checkpoints
        </summary>
        <Pager
          page={windowPage}
          count={flow.clockWindows.length}
          onChange={setWindowPage}
          label="Counter window pages"
        />
        <ul className="space-y-3">
          {flow.clockWindows
            .slice(windowPage * SIZE, (windowPage + 1) * SIZE)
            .map((w) => (
              <li
                key={w.id}
                className="rounded border border-slate-700 p-3 text-sm"
              >
                <p>{explainResourceWindow(w, report.teams)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Window {w.id + 1}; checkpoints {checkpoint(w.startSnapshotId)}{" "}
                  → {checkpoint(w.endSnapshotId)}.{" "}
                  {w.unobservedCounterSnapshotIds.length} checkpoints omit this
                  counter; {w.counterChanges.length} observed changes. Phase,
                  period, active side and both turn counters{" "}
                  {w.gameClockFieldsRecorded ? "recorded" : "partly unknown"}.
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    aria-pressed={selected === w.id}
                    onClick={() => {
                      setSelected(w.id);
                      setIntervalPage(0);
                    }}
                  >
                    Inspect window {w.id + 1}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChoices(
                        w.decisionOrdinals.map(
                          (i) =>
                            report.rerollResources.decisions[i]!.decisionEventId
                        )
                      )
                    }
                  >
                    View {w.decisionOrdinals.length} choices from window{" "}
                    {w.id + 1}
                  </button>
                  {w.startSnapshotId !== null && (
                    <button
                      type="button"
                      onClick={() =>
                        setSnapshotPage(Math.floor(w.startSnapshotId! / SIZE))
                      }
                    >
                      Show starting checkpoint for window {w.id + 1}
                    </button>
                  )}
                </div>
              </li>
            ))}
        </ul>
        {window && (
          <div
            aria-label="Selected counter window"
            className="mt-4 rounded border border-slate-600 p-3"
          >
            <h4 className="font-semibold">
              Window {window.id + 1}: {name(window.teamId)}
            </h4>
            <p className="mt-2 text-sm">
              {explainResourceWindow(window, report.teams)}
            </p>
            <p className="mt-1 text-sm">
              Every choice between the same two checkpoints shares one interval.
              A shared decrease is never assigned separately to each choice.
            </p>
            <Pager
              page={intervalPage}
              count={window.intervalIds.length}
              onChange={setIntervalPage}
              label="Counter interval pages"
            />
            <ul className="space-y-2 text-sm">
              {window.intervalIds
                .slice(intervalPage * SIZE, (intervalPage + 1) * SIZE)
                .map((id) => {
                  const i = flow.intervals[id]!,
                    p = i.pools[window.gamerId];
                  return (
                    <li key={id}>
                      {checkpoint(i.beforeSnapshotId)} →{" "}
                      {checkpoint(i.afterSnapshotId)}: {raw(p.before?.count)} →{" "}
                      {raw(p.after?.count)}; {p.recordedUsedCount} uses,{" "}
                      {p.recordedNotUsedCount} non-uses, {p.unknownUsageCount}{" "}
                      unknown.{" "}
                      {p.status === "observed_agreement"
                        ? "Observed numerical agreement"
                        : p.status === "observed_difference"
                          ? "Observed numerical difference"
                          : "Comparison unverified"}
                      . Choice records{" "}
                      {p.decisionOrdinals
                        .slice(0, SIZE)
                        .map((n) => n + 1)
                        .join(", ")}
                      {p.decisionOrdinals.length > SIZE
                        ? ` (+${p.decisionOrdinals.length - SIZE} more; use View choices)`
                        : ""}
                      .
                    </li>
                  );
                })}
            </ul>
            <p className="mt-2 text-xs text-slate-400">
              All intermediate counter changes, including changes outside choice
              intervals, remain in the source checkpoint browser and JSON
              export.
            </p>
          </div>
        )}
        <details
          className="mt-4"
          onToggle={(e) => setBrowse(e.currentTarget.open)}
        >
          <summary>
            Browse all source counter checkpoints ({flow.clockSnapshots.length})
          </summary>
          {browse && (
            <>
              <Pager
                page={snapshotPage}
                count={flow.clockSnapshots.length}
                onChange={setSnapshotPage}
                label="Counter checkpoint pages"
              />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <caption className="pb-2 text-left">
                    Raw clock codes and roster-slot counters. Controller, active
                    side and counter pool ownership are separate fields.
                    Explicit zero is shown as 0.
                  </caption>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Clock</th>
                      <th>First roster pool</th>
                      <th>Second roster pool</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flow.clockSnapshots
                      .slice(snapshotPage * SIZE, (snapshotPage + 1) * SIZE)
                      .map((s) => (
                        <tr
                          key={s.id}
                          className="border-t border-slate-700 align-top"
                        >
                          <td className="min-w-36 py-2">
                            {checkpoint(s.id)}
                            <br />
                            {s.source.kind}; segment {s.clockSegment}
                          </td>
                          <td className="min-w-40 py-2">
                            Phase {raw(s.clock?.phaseCode)}; period{" "}
                            {raw(s.clock?.periodCode)}
                            <br />
                            Active side {raw(s.clock?.activeTeamIndex)};
                            controller {raw(s.clock?.activeGamerId)}
                            <br />
                            Team turns {raw(s.clock?.teamTurns[0])},{" "}
                            {raw(s.clock?.teamTurns[1])}
                          </td>
                          {([0, 1] as const).map((g) => (
                            <td key={g} className="min-w-40 py-2">
                              {name(s.poolNamespaces[g]?.teamId)}:{" "}
                              {raw(s.counts[g])}
                              <br />
                              Explicit team ID {raw(s.explicitTeamIds[g])}
                              <br />
                              {s.poolNamespaces[g]?.basis === "owned_roster"
                                ? `Roster anchor player ${s.poolNamespaces[g]?.rosterAnchorPlayerId}`
                                : s.poolNamespaces[g]
                                  ? "Explicit team identity"
                                  : "Pool identity unverified"}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </details>
      </details>
    </section>
  );
}
