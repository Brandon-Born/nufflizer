import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { contextReplayXml } from "../helpers/contextReplay";
import { model, rollEvent } from "../helpers/replay";
import { playbackFragment } from "../helpers/playback";

describe("context evidence coverage (NUF-014/015/019)", () => {
  it("keeps an independently observed no-roll stand-up out of the random-outcome denominator", () => {
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(playbackFragment("001", "UI-008", [], [41]))
    );
    const stand = r.events.find(
      (event) => event.metadata.sourceTag === "ResultNoRollSuccess"
    )!;
    expect(stand).toMatchObject({
      scoringStatus: "excluded",
      metadata: { isRollCandidate: false }
    });
    expect(r.coverage.rollCandidates).toMatchObject({
      scoredCount: 2,
      excludedCount: 0
    });
    expect(r.coverage.contextEvidence.rollCount).toBe(2);
  });
  it("reports unknown context independently of supported dice", () => {
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(
        model([
          rollEvent(),
          ...Array.from({ length: 100 }, () => rollEvent({ rollType: 999 }))
        ])
      )
    );
    expect(r.coverage.contextEvidence).toEqual({
      rollCount: 101,
      positionCount: 0,
      possessionCount: 0,
      clockCount: 0,
      activationCount: 0,
      quantifiedCount: 0,
      boundedCount: 0,
      consequenceCount: 0
    });
    expect(r.coverage.rollCandidates.scoredCount).toBe(1);
    expect(r.verdict.luckierTeam).toBe("unknown");
  });

  it("preserves home and away order when the away team has more recorded turns", () => {
    const replay = model([rollEvent({ actorTeamId: "1" })]);
    replay.turns[0]!.teamId = "1";
    const r = analyzeReplayLuck(replay);
    expect(r.match.homeTeam).toBe("Home");
    expect(r.match.awayTeam).toBe("Away");
    expect(r.teams.map((team) => team.teamId)).toEqual(["0", "1"]);
  });

  it("counts one linked check despite an original question and repeated kept summary", () => {
    const single = analyzeNufflizerInput(contextReplayXml());
    const repeated = analyzeNufflizerInput(
      contextReplayXml({ duplicateSummary: true })
    );
    expect(single.coverage.contextEvidence).toMatchObject({
      rollCount: 1,
      positionCount: 1,
      possessionCount: 1,
      clockCount: 1,
      quantifiedCount: 1
    });
    expect(repeated.coverage.contextEvidence).toEqual(
      single.coverage.contextEvidence
    );
    repeated.coverage.contextEvidence.quantifiedCount++;
    expect(LuckReportSchema.safeParse(repeated).success).toBe(false);
  });
});
