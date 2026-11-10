import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { playbackFragment } from "../helpers/playback";

function fixture(home: number[] = []) {
  return playbackFragment("007", "UI-040", home, [37, 40], true);
}

describe("direct KO recovery evidence (NUF-009/011/013)", () => {
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
        damage: { koRecovery: true, subjectTeamId: "1" },
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
