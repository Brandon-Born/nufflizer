import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { playbackFragmentXml } from "../helpers/playback";
import { encodedMessage } from "../helpers/replay";
import { numericRerollPolicy } from "../helpers/numericRerollPolicy";

function changeFlags(xml: string, tag: string, field: string, value: number) {
  return xml.replace(/<MessageData>(.*?)<\/MessageData>/g, (all, text) => {
    let payload = Buffer.from(
      Buffer.from(text, "base64").toString(),
      "base64"
    ).toString();
    if (!payload.startsWith(`<${tag}>`)) return all;
    const pattern = new RegExp(`<${field}>[^<]*</${field}>`);
    payload = pattern.test(payload)
      ? payload.replace(pattern, `<${field}>${value}</${field}>`)
      : payload.replace(`<${tag}>`, `<${tag}><${field}>${value}</${field}>`);
    return `<MessageData>${encodedMessage(payload)}</MessageData>`;
  });
}
describe("explicit execution flags cannot certify actual dice policies", () => {
  it.each([
    ["Applied", 0],
    ["IsEvaluation", 1],
    ["IsEvaluation", 2]
  ] as const)("withholds armor from DamageStep %s=%s", (field, value) => {
    const input = changeFlags(
      playbackFragmentXml("001", "UI-009", [], [38]),
      "DamageStep",
      field,
      value
    );
    const r = analyzeNufflizerInput(input),
      e = r.events.find((e) => e.type === "armor_break")!;
    expect(e).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      actualSuccess: null,
      weightedDelta: 0,
      metadata: { isRollCandidate: true, dice: [3, 5] }
    });
  });
  it.each([1, 2])(
    "withholds evaluated original/replacement/numeric damage stages for flag%s",
    (flag) => {
      let input = readFileSync(
        "tests/fixtures/remediation/reroll-cross-link.xml",
        "utf8"
      );
      for (const tag of ["PlayerStep", "DamageStep"])
        input = changeFlags(input, tag, "IsEvaluation", flag);
      const r = analyzeNufflizerInput(input);
      expect(r.events.filter((e) => e.scoringStatus === "scored")).toHaveLength(
        0
      );
      expect(r.events.some((e) => e.metadata.teamRerollsSpent === 1)).toBe(
        false
      );
      expect(r.diceRecords.length).toBeGreaterThan(0);
    }
  );
  it("does not borrow an evaluated original to score a separately resumed replacement", () => {
    const p = numericRerollPolicy({
      family: 1,
      target: 2,
      first: 1,
      second: 6,
      use: true,
      emitted: true
    });
    p.turns[0]!.events.unshift({
      type: "step",
      sourceTag: "PlayerStep",
      stepTag: "PlayerStep",
      stepType: 1,
      actionId: "step-1",
      sequenceId: "sequence-1",
      sourceIndex: 0,
      id: "evaluated-header",
      payload: { IsEvaluation: 1 }
    });
    const before = structuredClone(p),
      r = analyzeReplayLuck(p);
    expect(p).toEqual(before);
    expect(r.events.filter((e) => e.scoringStatus === "scored")).toHaveLength(
      0
    );
    expect(r.events.some((e) => e.metadata.rerollDraws)).toBe(false);
  });
  it("withholds an evaluated recovery chain instead of healing a simulated casualty", () => {
    const input = changeFlags(
      playbackFragmentXml("001", "UI-068", [6], [37]),
      "DamageStep",
      "IsEvaluation",
      1
    );
    const r = analyzeNufflizerInput(input),
      e = r.events.find((e) => e.metadata.rollType === 46)!;
    expect(e).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      actualSuccess: null,
      weightedDelta: 0
    });
  });
});
