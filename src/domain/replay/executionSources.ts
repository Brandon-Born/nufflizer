import type { ReplayModel } from "./types";

export const EXECUTION_EXCLUSION =
  "explicit source flags do not identify an applied, non-evaluation step";

// These flags can disqualify a recorded action, never qualify missing state.
// Recompute from actual headers; do not trust annotations on partial callers.
// Preserve source tags, payloads, locators and all physical dice records.
export function qualifyExecutionSources(input: ReplayModel): ReplayModel {
  const invalid = new Map<string, string>();
  const key = (e: { actionId?: string; sequenceId?: string }) =>
    JSON.stringify([e.actionId, e.sequenceId]);
  for (const turn of input.turns)
    for (const e of turn.events) {
      if (
        (e.type !== "step" && !e.sourceTag.endsWith("Step")) ||
        !e.actionId ||
        !e.payload
      )
        continue;
      const p = e.payload;
      const reason =
        p.IsEvaluation === 1
          ? "the replay marks this step as an evaluation"
          : p.Applied === 0
            ? "the replay marks this step as not applied"
            : (Object.hasOwn(p, "IsEvaluation") && p.IsEvaluation !== 0) ||
                (Object.hasOwn(p, "Applied") && p.Applied !== 1)
              ? EXECUTION_EXCLUSION
              : undefined;
      if (reason) invalid.set(key(e), reason);
    }
  if (
    !invalid.size &&
    !input.turns.some((t) =>
      t.events.some((e) => Object.hasOwn(e, "executionExclusion"))
    )
  )
    return input;
  return {
    ...input,
    turns: input.turns.map((t) => ({
      ...t,
      events: t.events.map((e) => {
        const copy = { ...e };
        delete copy.executionExclusion;
        if (e.actionId && invalid.has(key(e)))
          copy.executionExclusion = invalid.get(key(e));
        return copy;
      })
    }))
  };
}
