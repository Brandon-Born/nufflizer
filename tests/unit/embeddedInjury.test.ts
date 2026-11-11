import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { playbackFragment } from "../helpers/playback";

function fragment() {
  return playbackFragment("002", "UI-025", [], [42]);
}
function report(replay = fragment()) {
  return LuckReportSchema.parse(analyzeReplayLuck(replay));
}

describe("staff-question injury evidence (NUF-011/014)", () => {
  it("retains UI-025's independently observed Stunty injury without recovery odds", () => {
    const r = report();
    const injury = r.events.find(
      (e) => e.metadata.sourceTag === "QuestionKORecovery"
    )!;
    expect(injury).toMatchObject({
      type: "injury",
      teamId: "1",
      playerId: "42",
      scoringStatus: "excluded",
      probabilitySuccess: null,
      actualSuccess: null,
      weightedDelta: 0,
      metadata: {
        rollType: 11,
        dice: [6, 1],
        outcomeCode: 2,
        isRollCandidate: true
      }
    });
    expect(injury.statusReason).toContain("no verified odds");
    expect(
      r.coverage.rollFamilies.find((f) => f.sourceTag === "QuestionKORecovery")
    ).toMatchObject({ rollType: 11, unscoredCount: 1, scoredCount: 0 });
    expect(r.damageSteps[0]!.unscoredRolls).toBe(1);
  });

  it("counts an exact earlier direct injury once and links its copied question", () => {
    const replay = fragment();
    const events = replay.turns[0]!.events;
    const index = events.findIndex((e) => e.sourceTag === "QuestionKORecovery");
    const question = events[index]!;
    events.splice(index, 0, {
      ...question,
      id: "direct-injury",
      sourceTag: "ResultInjuryRoll",
      rollType: 11,
      payload: structuredClone(
        question.payload!.RollInfos as Record<string, unknown>
      )
    });
    const r = report(replay);
    const copied = r.events.find(
      (e) => e.metadata.sourceTag === "QuestionKORecovery"
    )!;
    expect(copied.metadata).toMatchObject({
      embeddedDamageOriginalId: "direct-injury",
      isRollCandidate: false
    });
    expect(r.damageSteps[0]!).toMatchObject({
      unscoredRolls: 1,
      contextRecords: 1
    });
    copied.metadata.embeddedDamageOriginalId = "missing-original";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });

  it.each(["different_action", "different_subject", "different_die"] as const)(
    "preserves a separate candidate after %s changes the possible original",
    (change) => {
      const replay = playbackFragment("002", "UI-025", [], [42, 43]);
      const events = replay.turns[0]!.events;
      const index = events.findIndex(
        (e) => e.sourceTag === "QuestionKORecovery"
      );
      const question = events[index]!;
      const direct = {
        ...question,
        id: "direct-injury",
        sourceTag: "ResultInjuryRoll",
        rollType: 11,
        payload: structuredClone(
          question.payload!.RollInfos as Record<string, unknown>
        )
      };
      if (change === "different_action") direct.actionId = "other-damage";
      if (change === "different_subject") {
        direct.playerId = "43";
        direct.targetId = "43";
        direct.stepActorId = "43";
        direct.stepTargetId = "43";
      }
      if (change === "different_die")
        direct.payload.Dice = {
          Die: [
            { DieType: 0, Value: 5 },
            { DieType: 0, Value: 1 }
          ]
        };
      events.splice(index, 0, direct);
      const copied = report(replay).events.find(
        (e) => e.metadata.sourceTag === "QuestionKORecovery"
      )!;
      expect(copied.metadata.embeddedDamageOriginalId).toBeUndefined();
      expect(copied.metadata.isRollCandidate).toBe(true);
    }
  );

  it("retains malformed nested evidence without inventing injury or recovery odds", () => {
    const replay = fragment();
    const question = replay.turns[0]!.events.find(
      (e) => e.sourceTag === "QuestionKORecovery"
    )!;
    (question.payload!.RollInfos as Record<string, unknown>).Dice = {
      Die: [{ DieType: 0, Value: 1000 }]
    };
    const injury = report(replay).events.find(
      (e) => e.metadata.sourceTag === "QuestionKORecovery"
    )!;
    expect(injury.metadata.isRollCandidate).toBe(true);
    expect(injury.scoringStatus).toBe("excluded");
    expect(injury.probabilitySuccess).toBeNull();
    expect(injury.actualSuccess).toBeNull();
  });

  it("keeps an unsupported-version question visible without promoting its semantics", () => {
    const replay = fragment();
    replay.replayVersion = "unknown-version";
    const injury = report(replay).events.find(
      (e) => e.metadata.sourceTag === "QuestionKORecovery"
    )!;
    expect(injury.metadata.isRollCandidate).toBe(true);
    expect(injury.scoringStatus).toBe("excluded");
    expect(injury.probabilitySuccess).toBeNull();
    expect(injury.metadata.embeddedDamageOriginalId).toBeUndefined();
  });
});
