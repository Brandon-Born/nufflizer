import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildTimeline } from "@/domain/replay/buildTimeline";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayInput } from "@/server/services/analyzeReplay";

const DEMO_REPLAYS = ["demo1.bbr", "demo2.bbr", "demo3.bbr"] as const;

function readDemoReplay(name: (typeof DEMO_REPLAYS)[number]): string {
  return readFileSync(path.resolve(process.cwd(), "demo-replays", name), "utf-8");
}

describe("demo replay structured extraction", () => {
  for (const replayName of DEMO_REPLAYS) {
    it(`extracts typed events from ${replayName}`, () => {
      const decoded = decodeReplayInput(readDemoReplay(replayName));
      const replay = parseReplayXml(decoded.xml);

      expect(replay.turns.length).toBeGreaterThan(20);
      expect(replay.teams.length).toBeGreaterThanOrEqual(2);
      expect(replay.teams.slice(0, 2).every((team) => team.id !== "")).toBe(true);
      expect(replay.teams.slice(0, 2).every((team) => !/^\d+$/.test(team.name))).toBe(true);

      const allEvents = replay.turns.flatMap((turn) => turn.events);
      const eventTypes = new Set(allEvents.map((event) => event.type));

      expect(eventTypes.has("block")).toBe(true);
      expect(eventTypes.has("blitz")).toBe(true);
      expect(eventTypes.has("reroll")).toBe(true);
      expect(eventTypes.has("casualty")).toBe(true);

      expect(replay.turns.some((turn) => turn.possibleTurnover)).toBe(true);
      expect(replay.turns.some((turn) => turn.ballCarrierPlayerId !== undefined)).toBe(true);
      expect(replay.parserDiagnostics).toBeDefined();
      expect(replay.parserDiagnostics!.unknownCodeTotal).toBeLessThanOrEqual(5);
      expect(replay.parserDiagnostics!.turnAttribution.totalTurns).toBe(replay.turns.length);
      const attributedEvents =
        replay.parserDiagnostics!.eventAttribution.explicit +
        replay.parserDiagnostics!.eventAttribution.player_map +
        replay.parserDiagnostics!.eventAttribution.turn_inferred;
      expect(attributedEvents).toBeGreaterThan(0);
    });

    it(`builds timeline metrics from ${replayName}`, () => {
      const decoded = decodeReplayInput(readDemoReplay(replayName));
      const replay = parseReplayXml(decoded.xml);
      const timeline = buildTimeline(replay);

      expect(timeline.length).toBe(replay.turns.length);
      expect(timeline.some((turn) => turn.keywordHits.block > 0)).toBe(true);
      expect(timeline.some((turn) => turn.keywordHits.reroll > 0)).toBe(true);
      expect(timeline.every((turn) => Number.isFinite(turn.keywordHits.foul))).toBe(true);
    });

    it(`analyzes ${replayName} through service`, () => {
      const report = analyzeReplayInput(readDemoReplay(replayName));

      expect(report.replay.turnCount).toBeGreaterThan(20);
      expect(report.analysis.metrics.totalTurns).toBe(report.replay.turnCount);
      expect(report.coaching.priorities.length).toBeGreaterThan(0);
      expect(report.teamReports.length).toBeGreaterThanOrEqual(2);
      expect(report.teamReports.every((teamReport) => teamReport.analysis.metrics.totalTurns > 0)).toBe(true);
      expect(report.teamReports.every((teamReport) => ["offense", "defense", "mixed"].includes(teamReport.analysis.context.mode))).toBe(true);
      const firstTeam = report.teamReports[0];
      expect(firstTeam).toBeDefined();
      expect(firstTeam!.coaching.turnByTurn.every((turn) => turn.turnNumber <= 16)).toBe(true);
      expect(firstTeam!.coaching.turnByTurn.every((turn) => ["low", "medium", "high"].includes(turn.confidence))).toBe(true);
      expect(firstTeam!.coaching.turnByTurn.every((turn) => !/Result[A-Za-z]+/.test(turn.happened))).toBe(true);
      expect(firstTeam!.coaching.priorities.every((priority) => ["low", "medium", "high"].includes(priority.severity))).toBe(true);
      expect(firstTeam!.coaching.priorities.every((priority) => priority.impactScore >= 0)).toBe(true);
      expect(firstTeam!.coaching.priorities.every((priority, index, arr) => index === 0 || arr[index - 1]!.impactScore >= priority.impactScore)).toBe(
        true
      );
    });
  }

  it("detects dodge-like roll contexts in at least one replay", () => {
    const hasDodgeContext = DEMO_REPLAYS.some((replayName) => {
      const decoded = decodeReplayInput(readDemoReplay(replayName));
      const replay = parseReplayXml(decoded.xml);
      return replay.turns.some((turn) =>
        turn.events.some((event) => event.type === "roll" && event.sourceTag === "ResultRoll" && event.stepType === 1)
      );
    });

    expect(hasDodgeContext).toBe(true);
  });

  it("detects foul events in at least one replay", () => {
    const hasFoul = DEMO_REPLAYS.some((replayName) => {
      const decoded = decodeReplayInput(readDemoReplay(replayName));
      const replay = parseReplayXml(decoded.xml);
      return replay.turns.some((turn) => turn.events.some((event) => event.type === "foul"));
    });

    expect(hasFoul).toBe(true);
  });
});
