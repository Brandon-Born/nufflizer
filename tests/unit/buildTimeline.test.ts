import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildTimeline } from "@/domain/replay/buildTimeline";
import { parseReplayXml } from "@/domain/replay/parseXml";

function readFixture(name: string): string {
  return readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "replays", name), "utf-8");
}

describe("buildTimeline", () => {
  it("generates timeline with keyword counts", () => {
    const replay = parseReplayXml(readFixture("sample-basic.xml"));
    const timeline = buildTimeline(replay);

    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({
      turnNumber: 1,
      teamId: "home"
    });

    expect(timeline[0]?.keywordHits.turnover).toBeGreaterThanOrEqual(1);
    expect(timeline[0]?.keywordHits.dodge).toBeGreaterThanOrEqual(1);
    expect(timeline[1]?.keywordHits.reroll).toBeGreaterThanOrEqual(1);
    expect(timeline[1]?.keywordHits.blitz).toBeGreaterThanOrEqual(1);
  });
});
