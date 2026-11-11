import { describe, expect, it } from "vitest";
import {
  formatDiceContribution,
  formatPlayerObservation,
  scoredEvidenceForTeam
} from "@/domain/nufflizer/presentation";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { model, rollEvent } from "../helpers/replay";

describe("NUF-021 evidence-qualified presentation", () => {
  it("labels available initial names without claiming a current identity", () => {
    const replay = model([rollEvent(), rollEvent({ playerId: "43" })]);
    replay.playerNamesByTeamAndId = { "0:42": "Initial Runner" };
    const report = analyzeReplayLuck(replay);
    expect(report.events[0]!.metadata.initialRosterName).toBe("Initial Runner");
    expect(formatPlayerObservation(report.events[0]!)).toBe(
      "Player 42 (initial roster: Initial Runner)"
    );
    expect(formatPlayerObservation(report.events[1]!)).toBe("Player 43");
    replay.playerNamesByTeamAndId["1:42"] = "Conflicting Runner";
    const conflict = analyzeReplayLuck(replay).events[0]!;
    expect(conflict.teamId).toBe("unresolved");
    expect(conflict.metadata.initialRosterName).toBeUndefined();
  });
  it("distinguishes unmeasured zero from a measured zero contribution", () => {
    expect(formatDiceContribution(0, 0)).toBe("Not scored");
    expect(formatDiceContribution(0, 2)).toBe("0.00");
    expect(formatDiceContribution(1.234, 1)).toBe("1.23");
  });
  it("counts only scored evidence owned by the requested team/category", () => {
    const report = analyzeReplayLuck(
      model([
        rollEvent(),
        rollEvent({ rollType: 999 }),
        rollEvent({ actorTeamId: "1" })
      ])
    );
    expect(scoredEvidenceForTeam(report, "0")).toMatchObject({
      total: 1,
      byType: { ball_handling: 1, block: 0 }
    });
    expect(scoredEvidenceForTeam(report, "1").total).toBe(1);
    expect(scoredEvidenceForTeam(report, "missing").total).toBe(0);
  });
});
