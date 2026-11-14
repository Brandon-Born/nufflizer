import { it, expect } from "vitest";
import { qualifyExecutionSources } from "@/domain/replay/executionSources";
import { numericRerollPolicy } from "../helpers/numericRerollPolicy";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";

const source = () =>
  numericRerollPolicy({ family: 1, target: 2, first: 1, second: 6, use: true });
it("scopes exclusions to their own action and sequence and preserves the input", () => {
  const p = source(),
    es = p.turns[0]!.events;
  es.unshift({
    type: "step",
    sourceTag: "PlayerStep",
    sourceIndex: 0,
    id: "header",
    actionId: "step-1",
    sequenceId: "sequence-1",
    payload: { IsEvaluation: 1 }
  });
  const copy = structuredClone(p),
    r = qualifyExecutionSources(p);
  expect(p).toEqual(copy);
  expect(r).not.toBe(p);
  expect(
    r.turns[0]!.events.find((e) => e.sourceTag === "QuestionTeamRerollUsage")!
      .executionExclusion
  ).toContain("evaluation");
  expect(
    r.turns[0]!.events.find((e) => e.sourceTag === "ResultTeamRerollUsage")!
      .executionExclusion
  ).toBeUndefined();
});
it("does not trust a stale derived type to erase explicit header flags", () => {
  const p = source();
  p.turns[0]!.events.unshift({
    type: "unknown",
    sourceTag: "PlayerStep",
    actionId: "step-1",
    sequenceId: "sequence-1",
    payload: { IsEvaluation: 1 }
  });
  const r = qualifyExecutionSources(p);
  expect(
    r.turns[0]!.events.find((e) => e.sourceTag === "QuestionTeamRerollUsage")!
      .executionExclusion
  ).toContain("evaluation");
});
it("does not confuse a reused partial action ID in a different sequence", () => {
  const p = source();
  p.turns[0]!.events.unshift({
    type: "step",
    sourceTag: "PlayerStep",
    actionId: "step-1",
    sequenceId: "other-sequence",
    payload: { IsEvaluation: 1 }
  });
  const r = qualifyExecutionSources(p);
  expect(
    r.turns[0]!.events.slice(1).every((e) => e.executionExclusion === undefined)
  ).toBe(true);
});
it.each([undefined, "", false, 0, "fake source exclusion"])(
  "recomputes a supplied internal annotation %s rather than trusting it",
  (value) => {
    const p = source();
    Object.assign(p.turns[0]!.events[0]!, { executionExclusion: value });
    const r = qualifyExecutionSources(p);
    expect(Object.hasOwn(r.turns[0]!.events[0]!, "executionExclusion")).toBe(
      false
    );
    expect(
      analyzeReplayLuck(r).events.some((e) => e.metadata.rerollDraws)
    ).toBe(true);
  }
);
it("does not turn omitted header flags into positive execution evidence", () => {
  const p = source();
  p.turns[0]!.events.unshift({
    type: "step",
    sourceTag: "PlayerStep",
    actionId: "step-1",
    sequenceId: "sequence-1",
    payload: {}
  });
  expect(qualifyExecutionSources(p)).toBe(p);
  expect(p.turns[0]!.events[0]!.payload).toEqual({});
});
