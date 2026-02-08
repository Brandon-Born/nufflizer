import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseReplayXml } from "@/domain/replay/parseXml";

function readFixture(name: string): string {
  return readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "replays", name), "utf-8");
}

describe("parseReplayXml", () => {
  it("parses teams and turns from fixture XML variants", () => {
    const replay = parseReplayXml(readFixture("sample-basic.xml"));

    expect(replay.matchId).toBe("fixture-001");
    expect(replay.teams).toHaveLength(2);
    expect(replay.teams[0]).toMatchObject({
      id: "home",
      name: "Reikland Reavers",
      coach: "Coach A"
    });

    expect(replay.turns).toHaveLength(2);
    expect(replay.turns[0]).toMatchObject({
      turnNumber: 1,
      teamId: "home"
    });
    expect(replay.turns[0]?.eventCount).toBeGreaterThanOrEqual(1);
    expect(replay.turns[0]?.actionTexts).toContain("turnover");
  });

  it("parses basic explicit Team/Turn replay shape", () => {
    const xml = `
      <Replay>
        <MatchId>abc-123</MatchId>
        <Teams>
          <Team>
            <id>home</id>
            <name>Home Team</name>
          </Team>
          <Team>
            <id>away</id>
            <name>Away Team</name>
          </Team>
        </Teams>
        <Turns>
          <Turn>
            <number>1</number>
            <teamId>home</teamId>
            <event>turnover</event>
          </Turn>
          <Turn>
            <number>2</number>
            <teamId>away</teamId>
            <event>reroll</event>
          </Turn>
        </Turns>
      </Replay>
    `;

    const replay = parseReplayXml(xml);

    expect(replay.matchId).toBe("abc-123");
    expect(replay.teams).toHaveLength(2);
    expect(replay.turns).toHaveLength(2);
    expect(replay.turns[0]?.turnNumber).toBe(1);
  });

  it("throws on invalid XML", () => {
    expect(() => parseReplayXml("<Replay>")).toThrow();
  });
});
