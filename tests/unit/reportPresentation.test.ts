import { describe, expect, it } from "vitest";
import {
  formatDiceContribution,
  scoredEvidenceForTeam
} from "@/domain/nufflizer/presentation";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { model, rollEvent } from "../helpers/replay";

describe("NUF-021 evidence-qualified presentation", () => {
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
