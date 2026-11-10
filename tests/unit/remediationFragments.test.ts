import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";

describe("NUF-001 minimal source fragments", () => {
  it("preserves original question dice and adjusts only the explicitly linked replacement", () => {
    const replay = parseReplayXml(
      readFileSync("tests/fixtures/remediation/reroll-cross-link.xml", "utf8")
    );
    const report = analyzeReplayLuck(replay);
    const question = replay.turns
      .flatMap((t) => t.events)
      .find(
        (e) => e.sourceTag === "QuestionTeamRerollUsage" && e.playerId === "42"
      )!;
    expect(
      (question.payload?.RollInfos as { Dice: { Die: { Value: number } } }).Dice
        .Die.Value
    ).toBe(1);
    const rerolled = report.events.filter((e) => e.metadata.rerollUsed);
    expect(rerolled).toHaveLength(1);
    expect(rerolled[0]?.playerId).toBe("42");
    expect(rerolled[0]?.metadata.rollType).toBe(1);
    expect(rerolled[0]?.probabilitySuccess).toBeCloseTo(35 / 36, 12);
    expect(
      report.events
        .filter((e) => e.playerId === "37")
        .every((e) => !e.metadata.rerollAvailable)
    ).toBe(true);
  });
  it("retains actual block faces and injury dice pending rule verification", () => {
    const replay = parseReplayXml(
      readFileSync("tests/fixtures/remediation/real-block-injury.xml", "utf8")
    );
    const events = replay.turns.flatMap((t) => t.events);
    expect(
      events.find((e) => e.sourceTag === "ResultBlockRoll")?.payload?.Die
    ).toBeDefined();
    expect(
      events.find((e) => e.sourceTag === "ResultInjuryRoll")
    ).toBeDefined();
    const report = analyzeReplayLuck(replay);
    expect(
      report.events
        .filter((e) => e.metadata.sourceTag === "ResultBlockRoll")
        .every(
          (e) => e.scoringStatus === "excluded" && e.metadata.isRollCandidate
        )
    ).toBe(true);
  });
  it("does not award positive luck for unverified self-damage", () => {
    const replay = parseReplayXml(
      readFileSync("tests/fixtures/remediation/self-damage.xml", "utf8")
    );
    const events = replay.turns.flatMap((t) => t.events);
    expect(events.some((e) => e.sourceTag === "ResultPlayerRemoval")).toBe(
      true
    );
    const report = analyzeReplayLuck(replay);
    const damage = report.events.filter(
      (e) => e.playerId === "50" && ["armor_break", "injury"].includes(e.type)
    );
    expect(damage.length).toBeGreaterThan(0);
    expect(
      damage.every(
        (e) => e.scoringStatus === "excluded" && e.weightedDelta === 0
      )
    ).toBe(true);
    expect(report.verdict.luckierTeam).toBe("unknown");
  });
});
