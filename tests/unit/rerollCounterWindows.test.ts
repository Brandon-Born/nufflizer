import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { findRerollCounterEvidence } from "@/domain/nufflizer/rerollCounters";
import { lonerDriveXml } from "../helpers/lonerDrive";

function sample(used: unknown, afterCounter = false, missingIndex = false) {
  const replay = parseReplayXml(
    lonerDriveXml(
      "numeric_rush_spent",
      "tests/fixtures/evidence/bb3-reroll-counters.json"
    )
  );
  const first = [...findRerollCounterEvidence(replay).entries()][0]!;
  expect(first[1].reconciliation).toBe("matched");
  const choice = replay.turns
    .flatMap((t) => t.events)
    .find((e) => e.id === first[0])!;
  const boundary = first[1].after!.checkpointAfter;
  const extra = structuredClone(choice);
  extra.id = "additional-recorded-choice";
  extra.payload!.Used = used;
  if (afterCounter) {
    extra.sourceIndex = boundary + 1;
    replay.turns[replay.turns.length - 1]!.events.push(extra);
  } else {
    const cut = choice.sourceIndex! + 1;
    for (const t of replay.turns) {
      for (const e of t.events)
        if (e.sourceIndex !== undefined && e.sourceIndex >= cut)
          e.sourceIndex++;
      const i = t.events.indexOf(choice);
      if (i >= 0) t.events.splice(i + 1, 0, extra);
    }
    for (const cp of replay.boardCheckpoints!)
      if (cp.afterSourceIndex >= cut) cp.afterSourceIndex++;
    extra.sourceIndex = missingIndex ? undefined : cut;
  }
  return { replay, id: first[0] };
}

describe("a snapshot cannot reconcile one decision across another recorded choice", () => {
  it.each([0, 1, 2, undefined])(
    "withholds the single-decision after-counter for intervening Used=%s",
    (used) => {
      const { replay, id } = sample(used);
      expect(findRerollCounterEvidence(replay).get(id)).toMatchObject({
        spent: 1,
        before: { count: 3 },
        after: undefined,
        reconciliation: "after_unavailable"
      });
    }
  );
  it("does not skip a malformed unindexed choice to claim independent counter evidence", () => {
    const { replay, id } = sample(1, false, true);
    expect(findRerollCounterEvidence(replay).get(id)?.reconciliation).toBe(
      "after_unavailable"
    );
  });
  it("retains the first immediate counter when the other choice occurs later", () => {
    const { replay, id } = sample(1, true);
    expect(findRerollCounterEvidence(replay).get(id)).toMatchObject({
      spent: 1,
      before: { count: 3 },
      after: { count: 2 },
      reconciliation: "matched"
    });
  });
});
