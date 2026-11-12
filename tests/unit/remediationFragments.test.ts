import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { playbackFragment } from "../helpers/playback";

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
        .every((e) => e.metadata.probabilityPolicy!=="two_attempt")
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
  it("charges player 50's own armor break to the affected team and leaves unknown injury unscored", () => {
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
    const armor = damage.find((e) => e.type === "armor_break")!;
    expect(armor).toMatchObject({
      teamId: "1",
      scoringStatus: "scored",
      actualSuccess: false,
      metadata: { dice: [1, 6], difficulty: 6 }
    });
    // The ten ordered pairs summing 2–5 hold armor; [1,6] fails that check.
    expect(armor.weightedDelta).toBeCloseTo(-10 / 36, 12);
    expect(
      damage
        .filter((e) => e.type === "injury")
        .every((e) => e.scoringStatus === "excluded" && e.weightedDelta === 0)
    ).toBe(true);
    expect(report.verdict.luckierTeam).toBe("unknown");
  });
});

describe("NUF-008 ordered movement and direct results", () => {
  it("keeps UI-002's declaration and two risk-free moves before the pickup step", () => {
    const replay = playbackFragment("001", "UI-002", [], [44]);
    const events = replay.turns.flatMap((turn) => turn.events);
    const declaration = events.find(
      (event) => event.sourceTag === "ResultUseAction"
    )!;
    const moves = events.filter(
      (event) => event.sourceTag === "ResultMoveOutcome"
    );
    expect(declaration).toMatchObject({
      playerId: "44",
      stepType: 0,
      locator: { stepIndex: 0 }
    });
    expect(
      moves.map((event) => [event.playerId, event.locator?.stepIndex])
    ).toEqual([
      ["44", 1],
      ["44", 2],
      ["44", 3]
    ]);
    const moveSteps = events.filter(
      (event) => event.sourceTag === "PlayerStep" && event.stepType === 1
    );
    expect(moveSteps.map((event) => event.payload?.CellTo)).toEqual([
      { X: 16, Y: 11 },
      { X: 17, Y: 10 },
      { X: 18, Y: 10 }
    ]);
    expect(
      events
        .filter((event) => event.rollType === 4)
        .map((event) => event.actionId)
    ).toEqual([moves[2]!.actionId, moves[2]!.actionId]);
    expect(
      new Set([declaration, ...moves].map((event) => event.actionId)).size
    ).toBe(4);
  });

  it("retains demo1's direct referee and removal records with stable order across a clock insertion", () => {
    const xml = decodeReplayInput(
      readFileSync("demo-replays/demo1.bbr", "utf8")
    ).xml;
    const marker = "<QuestionBribeUsage>";
    const withClock = xml.replace(marker, "<Clock/>" + marker);
    expect(withClock).not.toBe(xml);
    for (const input of [xml, withClock]) {
      const replay = parseReplayXml(input);
      const events = replay.turns.flatMap((turn) => turn.events);
      const direct = events.filter(
        (event) =>
          [369, 370].includes(event.locator?.replayStep ?? 0) &&
          event.actionId === undefined &&
          [
            "QuestionBribeUsage",
            "ResultRoll",
            "ResultPlayerSentOff",
            "ResultPlayerRemoval"
          ].includes(event.sourceTag)
      );
      expect(
        direct.map((event) => [
          event.sourceTag,
          event.locator?.replayStep,
          event.locator?.childIndex
        ])
      ).toEqual([
        ["QuestionBribeUsage", 369, input === xml ? 3 : 4],
        ["ResultRoll", 370, 1],
        ["ResultPlayerSentOff", 370, 2],
        ["ResultPlayerRemoval", 370, 3]
      ]);
      expect(direct[3]).toMatchObject({
        playerId: "10",
        payload: { Situation: "5", Reason: "2", Status: "6" }
      });
      const roll = analyzeReplayLuck(replay).events.find(
        (event) => event.metadata.sourceId === direct[1]!.id
      );
      expect(roll).toMatchObject({
        teamId: "unresolved",
        type: "argue_call",
        scoringStatus: "excluded",
        probabilitySuccess: null,
        metadata: {
          dice: [3],
          rollType: 30,
          outcomeCode: 2,
          isRollCandidate: true
        }
      });
    }
  });
});
