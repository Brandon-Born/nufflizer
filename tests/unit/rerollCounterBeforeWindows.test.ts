import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { findRerollCounterEvidence } from "@/domain/nufflizer/rerollCounters";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainRerollCounter } from "@/domain/nufflizer/presentation";
import { lonerDriveXml } from "../helpers/lonerDrive";

// Partial/untrusted input: another recorded choice shares the old before
// counter. This does not assert that the modified source is a legal match.
function sample(used: unknown, freshMenu = false, missingIndex = false) {
  const xml = lonerDriveXml(
    "numeric_rush_spent",
    "tests/fixtures/evidence/bb3-reroll-counters.json",
    (records) => {
      const qRecord = records.find((r) =>
        r.steps?.some((s) =>
          s.messages.some((m) => "QuestionTeamRerollUsage" in m)
        )
      )!;
      const qStep = qRecord.steps!.find((s) =>
        s.messages.some((m) => "QuestionTeamRerollUsage" in m)
      )!;
      const choice = structuredClone(
        records
          .flatMap((r) => r.steps ?? [])
          .flatMap((s) => s.messages)
          .find((m) => "ResultTeamRerollUsage" in m)!
      );
      const body = choice.ResultTeamRerollUsage as Record<string, unknown>;
      if (used === undefined) delete body.Used;
      else body.Used = [String(used)];
      qStep.messages.splice(
        qStep.messages.findIndex((m) => "QuestionTeamRerollUsage" in m),
        0,
        choice
      );
      if (!freshMenu)
        for (let i = records.length - 1; i >= 0; i--)
          if (
            records[i]!.replayStep === qRecord.replayStep &&
            records[i]!.childIndex > qRecord.childIndex &&
            records[i]!.projection?.BoardState
          )
            records.splice(i, 1);
    }
  );
  const replay = parseReplayXml(xml),
    choices = replay.turns
      .flatMap((t) => t.events)
      .filter((e) => e.sourceTag === "ResultTeamRerollUsage");
  expect(choices).toHaveLength(2);
  const previous = choices[0]!,
    id = choices[1]!.id!;
  if (missingIndex) delete previous.sourceIndex;
  return { replay, id, previous };
}

describe("a later choice cannot borrow a before-counter across an earlier choice", () => {
  it.each([0, 1, 2, undefined])(
    "withholds an individual after-counter after prior Used=%s",
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
  it("keeps an unindexed prior choice as a boundary", () => {
    const { replay, id } = sample(1, false, true);
    expect(findRerollCounterEvidence(replay).get(id)?.reconciliation).toBe(
      "after_unavailable"
    );
  });
  it("keeps an independently refreshed pre-decision counter", () => {
    const { replay, id } = sample(1, true);
    expect(findRerollCounterEvidence(replay).get(id)).toMatchObject({
      before: { count: 3 },
      after: { count: 2 },
      reconciliation: "matched"
    });
  });
  it("retains the refreshed receipt and rejects borrowing the old baseline again", () => {
    const { replay, id } = sample(1, true),
      report = analyzeReplayLuck(replay);
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    const e = report.events.find((e) => e.metadata.sourceId === id)!;
    const c = e.metadata.teamRerollCounter!;
    expect(c.decisionBefore).toMatchObject({ count: 3 });
    expect(c.decisionBefore!.checkpointAfter).toBeGreaterThan(
      c.before.checkpointAfter
    );
    expect(explainRerollCounter(e)).toContain(
      "Refreshed counter after the earlier choice"
    );
    delete c.decisionBefore;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
});
