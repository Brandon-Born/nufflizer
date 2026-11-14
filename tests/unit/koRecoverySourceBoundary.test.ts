import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { playbackFragmentXml } from "../helpers/playback";

const base = () => playbackFragmentXml("007", "UI-040", [], [37, 40], true);
describe("direct recovery probability requires the known root source shape", () => {
  it("keeps UI-040's verified direct failure and success", () => {
    const r = analyzeNufflizerInput(base());
    const es = r.events.filter((e) => e.metadata.sourceTag === "EventRoll");
    expect(
      es.map((e) => [
        e.playerId,
        e.probabilitySuccess,
        e.actualSuccess,
        e.weightedDelta
      ])
    ).toEqual([
      ["37", 1 / 2, false, -3 / 4],
      ["40", 1 / 2, true, 3 / 4]
    ]);
  });
  it.each([
    "<IsEvaluation>1</IsEvaluation>",
    "<IsEvaluation>0</IsEvaluation>",
    "<Unknown>1</Unknown>",
    "<Skill>81</Skill>"
  ])("retains unsupported root fields without probabilities: %s", (extra) => {
    const r = analyzeNufflizerInput(
      base().replaceAll("<EventRoll>", "<EventRoll>" + extra)
    );
    const first = r.events.find(
      (e) => e.metadata.sourceTag === "EventRoll" && e.playerId === "37"
    )!;
    expect(first).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      actualSuccess: null,
      delta: 0,
      weightedDelta: 0,
      metadata: { isRollCandidate: true, dice: [3] }
    });
    expect(
      r.diceRecords.find((d) => d.parentSourceId === first.metadata.sourceId)
    ).toMatchObject({ dice: [{ value: 3 }], disposition: "unscored_roll" });
    expect(r.verdict.luckierTeam).toBe("unknown");
  });
});
