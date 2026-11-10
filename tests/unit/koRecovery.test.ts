import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { playbackFragment } from "../helpers/playback";

function fixture(home: number[] = []) {
  return playbackFragment("007", "UI-040", home, [37, 40], true);
}

describe("direct KO recovery evidence (NUF-009/011/013)", () => {
  it("uses the independently corroborated Kegs target for demo1's boundary faces", () => {
    const report = analyzeNufflizerInput(
      readFileSync("demo-replays/demo1.bbr", "utf8")
    );
    // Standalone XML decoding found a 3 succeeding at 654/4 and a 2 failing at 370/6.
    for (const [replayStep, childIndex, die, actualSuccess] of [
      [654, 4, 3, true],
      [370, 6, 2, false]
    ] as const) {
      const outcome = report.events.find(
        (e) =>
          e.metadata.sourceTag === "EventRoll" &&
          e.metadata.locator?.replayStep === replayStep &&
          e.metadata.locator.childIndex === childIndex
      );
      expect(outcome).toMatchObject({
        probabilitySuccess: 2 / 3,
        actualSuccess,
        teamId: "1",
        metadata: {
          requirement: 4,
          difficulty: 3,
          dice: [die],
          modifiers: [1],
          damage: { koRecovery: { target: 3 } }
        }
      });
    }
  });
  it("scores UI-040's annotated failure and success from the affected roster's perspective", () => {
    const report = LuckReportSchema.parse(analyzeReplayLuck(fixture()));
    const [failed, succeeded] = report.events.filter(
      (e) => e.metadata.sourceTag === "EventRoll"
    );
    expect(failed).toMatchObject({
      playerId: "37",
      type: "injury",
      teamId: "1",
      probabilitySuccess: 1 / 2,
      actualSuccess: false,
      delta: -1 / 2,
      metadata: {
        dice: [3],
        dieTypes: [-1],
        damage: { koRecovery: { target: 4 }, subjectTeamId: "1" },
        locator: { replayStep: 287, childIndex: 3 }
      }
    });
    expect(failed!.metadata.outcomeCode).toBeUndefined();
    expect(succeeded).toMatchObject({
      playerId: "40",
      type: "injury",
      teamId: "1",
      probabilitySuccess: 1 / 2,
      actualSuccess: true,
      delta: 1 / 2,
      metadata: {
        dice: [5],
        outcomeCode: 1,
        locator: { replayStep: 287, childIndex: 4 }
      }
    });
    expect(report.teams[1].categoryScores.injury).toBe(0);
    expect(report.verdict.luckierTeam).toBe("unknown");
  });

  it.each([
    "modified",
    "unknown modifier",
    "wrong outcome",
    "wrong location",
    "duplicate",
    "overlapping roster"
  ])(
    "retains recovery dice without estimating odds for %s evidence",
    (variant) => {
      const replay = fixture(variant === "overlapping roster" ? [37] : []);
      const turn = replay.turns.find((t) =>
        t.events.some((e) => e.sourceTag === "EventRoll")
      )!;
      const event = turn.events.find(
        (e) => e.playerId === "37" && e.sourceTag === "EventRoll"
      )!;
      if (variant === "modified") event.payload!.Difficulty = "3";
      if (variant === "unknown modifier") {
        event.payload!.Difficulty = "3";
        event.payload!.Modifiers = {
          Modifier: { ModifierType: "21", Value: "1" }
        };
      }
      if (variant === "wrong outcome") event.payload!.Outcome = "1";
      if (variant === "wrong location") event.locator = undefined;
      if (variant === "duplicate")
        turn.events.push({
          ...event,
          id: "duplicate-recovery",
          sourceIndex: turn.eventCount + 1
        });
      const report = analyzeReplayLuck(replay);
      expect(
        report.events
          .filter(
            (e) => e.playerId === "37" && e.metadata.sourceTag === "EventRoll"
          )
          .every(
            (e) =>
              e.scoringStatus === "excluded" &&
              e.probabilitySuccess === null &&
              e.metadata.isRollCandidate
          )
      ).toBe(true);
    }
  );
});
