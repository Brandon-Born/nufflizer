"use client";

import { useState } from "react";
import {
  ROLL_FAMILY_SCOPE,
  rollFamilyLabels
} from "@/domain/nufflizer/presentation";
import type { LuckReport } from "@/domain/nufflizer/types";

const PAGE_SIZE = 25;

export function RollCoveragePanel({
  families,
  teams
}: {
  families: LuckReport["coverage"]["rollFamilies"];
  teams: LuckReport["teams"];
}) {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const pages = Math.ceil(families.length / PAGE_SIZE);
  if (!pages) return null;

  return (
    <details
      className="mt-3 rounded-lg border border-amber-300/20 p-3 text-sm"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold text-amber-100">
        Roll-family coverage
      </summary>
      {expanded && (
        <>
          <p className="my-2 text-xs text-amber-100/85">{ROLL_FAMILY_SCOPE}</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <caption className="sr-only">
                Roll candidates by team and family
              </caption>
              <thead>
                <tr className="border-b border-amber-300/20">
                  <th scope="col" className="p-2">
                    Team
                  </th>
                  <th scope="col" className="p-2">
                    Source and roll code
                  </th>
                  <th scope="col" className="p-2">
                    Scored
                  </th>
                  <th scope="col" className="p-2">
                    Unscored
                  </th>
                  <th scope="col" className="p-2">
                    Unattributed
                  </th>
                  <th scope="col" className="p-2">
                    Malformed
                  </th>
                  <th scope="col" className="p-2">
                    Unresolved identity
                  </th>
                </tr>
              </thead>
              <tbody>
                {families
                  .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                  .map((row) => {
                    const { team, source } = rollFamilyLabels(row, teams);
                    return (
                      <tr
                        key={JSON.stringify([
                          row.teamId,
                          row.sourceTag,
                          row.rollType
                        ])}
                        className="border-b border-amber-300/10"
                      >
                        <td className="p-2">{team}</td>
                        <td className="p-2">{source}</td>
                        <td className="p-2">{row.scoredCount}</td>
                        <td className="p-2">{row.unscoredCount}</td>
                        <td className="p-2">{row.unattributedCount}</td>
                        <td className="p-2">{row.malformedCount}</td>
                        <td className="p-2">{row.unresolvedIdentityCount}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                aria-label="Previous roll family page"
                disabled={page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span aria-live="polite">
                Roll-family page {page + 1} of {pages}
              </span>
              <button
                type="button"
                aria-label="Next roll family page"
                disabled={page + 1 >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}
    </details>
  );
}
