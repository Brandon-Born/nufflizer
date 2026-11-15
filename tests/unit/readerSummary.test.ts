import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import {
  ARMOR_REVIEW_NOTICE,
  summarizeForReader
} from "@/domain/nufflizer/readerSummary";
import { model, rollEvent } from "../helpers/replay";
import { playbackFragmentXml } from "../helpers/playback";

const seed = () =>
  analyzeReplayLuck(model([rollEvent({ id: "seed" })])).events[0]!;
describe("reader summary and honest key dice moments", () => {
  it("ranks observed outcome probability rather than weighted score and bounds rendering", () => {
    const base = seed();
    const events = Array.from({ length: 9 }, (_, i) => ({
      ...base,
      id: `failure-${i}`,
      probabilitySuccess: 0.9 - i / 100,
      actualSuccess: false,
      weightedDelta: -100 + i
    }));
    events.push({
      ...base,
      id: "rare-success",
      probabilitySuccess: 0.05,
      actualSuccess: true,
      weightedDelta: 0.1
    });
    events.push({
      ...base,
      id: "ordinary-success",
      probabilitySuccess: 0.9,
      actualSuccess: true,
      weightedDelta: 100
    });
    const before = structuredClone(events),
      summary = summarizeForReader({ events });
    expect(summary.moments).toHaveLength(6);
    expect(summary.moments[0]!.event.id).toBe("rare-success");
    expect(summary.moments[1]!.event.id).toBe("failure-0");
    expect(summary.moments.some((m) => m.event.id === "ordinary-success")).toBe(
      false
    );
    expect(events).toEqual(before);
  });
  it("never promotes armor or excluded/unknown dice into the reading summary", () => {
    const base = seed();
    const events = [
      base,
      {
        ...base,
        id: "armor",
        type: "armor_break" as const,
        weightedDelta: 100
      },
      ...Array.from({ length: 100 }, (_, i) => ({
        ...base,
        id: `unknown-${i}`,
        scoringStatus: "excluded" as const,
        probabilitySuccess: null,
        actualSuccess: null,
        weightedDelta: 0
      }))
    ];
    const s = summarizeForReader({ events });
    expect(s).toMatchObject({ observed: 102, scored: 1, unscored: 101 });
    expect(s.categories.find((c) => c.type === "armor_break")).toMatchObject({
      observed: 1,
      scored: 0,
      underReview: 1
    });
    expect(s.moments.map((m) => m.event.id)).toEqual([base.id]);
  });
  it("keeps categorical and non-random records visible without inventing binary odds", () => {
    const base = seed();
    const s = summarizeForReader({
      events: [
        {
          ...base,
          probabilitySuccess: null,
          actualSuccess: null,
          type: "block"
        },
        {
          ...base,
          id: "control",
          scoringStatus: "excluded",
          metadata: { ...base.metadata, isRollCandidate: false }
        }
      ]
    });
    expect(s).toMatchObject({
      observed: 1,
      scored: 1,
      unscored: 0,
      moments: []
    });
    expect(s.categories.find((c) => c.type === "block")!.scored).toBe(1);
  });
  it("does not confuse no evidence with even luck", () => {
    expect(summarizeForReader({ events: [] })).toMatchObject({
      observed: 0,
      scored: 0,
      moments: []
    });
  });
  it("shares the armor warning and safe recommendations in the actual serialized report", () => {
    const r = LuckReportSchema.parse(
      analyzeNufflizerInput(playbackFragmentXml("001", "UI-009", [], [38]))
    );
    expect(r.limitations).toContain(ARMOR_REVIEW_NOTICE);
    expect(
      r.events.some(
        (e) => e.type === "armor_break" && e.scoringStatus === "scored"
      )
    ).toBe(true);
    expect(r.keyMoments.every((e) => e.type !== "armor_break")).toBe(true);
    expect(r.verdict.luckierTeam).toBe("unknown");
    expect(r.verdict.status).toBe("partial_analysis");
  });
});
