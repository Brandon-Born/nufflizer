import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { explainInjuryObservation } from "@/domain/nufflizer/presentation";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { fixedFoulArmorXml } from "../helpers/fixedFoulArmor";
import { playbackFragmentXml } from "../helpers/playback";

describe("initial injury after a verified ordinary Foul", () => {
  it.each([
    {
      name: "ordinary",
      subjectSkills: [],
      counts: [21, 9, 0, 6],
      expectedByTotal: [0, 0, 0, 0, 0, 0, 2, 2, 4, 4, 4],
      numeratorByOutcome: { 0: 15, 2: -15, 3: -30, 4: -30 }
    },
    {
      name: "Stunty with Thick Skull",
      subjectSkills: [59, 63],
      counts: [21, 5, 4, 6],
      expectedByTotal: [0, 0, 0, 0, 0, 0, 2, 3, 4, 4, 4],
      numeratorByOutcome: { 0: 15, 2: -11, 3: -26, 4: -26 }
    }
  ])("conserves a zero mean over all 36 $name injury draws", (profile) => {
    let mean = 0;
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        const outcome = profile.expectedByTotal[a + b - 2]! as 0 | 2 | 3 | 4;
        const report = analyzeNufflizerInput(
          fixedFoulArmorXml(3, 5, [], {
            dice: [a, b],
            outcome,
            subjectSkills: profile.subjectSkills
          })
        );
        const armor = report.events.find(
          (event) => event.metadata.rollType === 10
        )!;
        const injury = report.events.find(
          (event) => event.metadata.rollType === 11
        )!;
        const foul = report.events.find(
          (event) => event.metadata.sourceTag === "ResultNoRollSuccess"
        )!;
        expect(armor).toMatchObject({
          probabilitySuccess: 6 / 36,
          actualSuccess: false,
          delta: -6 / 36
        });
        expect(injury).toMatchObject({
          playerId: "44",
          teamId: "1",
          scoringStatus: "scored",
          probabilitySuccess: null,
          actualSuccess: null,
          delta: profile.numeratorByOutcome[outcome] / 36,
          metadata: {
            injuryTable: { counts: profile.counts },
            injuryScoring: {
              armorSourceId: armor.metadata.sourceId,
              cause: {
                kind: "foul",
                foulResultSourceId: foul.metadata.sourceId,
                foulerTraitEvidence: { playerId: "6", teamId: "0" }
              }
            }
          }
        });
        expect(
          report.damageSteps.find((step) => step.eventIds.includes(armor.id))
            ?.eventIds
        ).toEqual([armor.id, injury.id]);
        expect(injury.contextualImpact).toBeUndefined();
        expect(report.verdict.luckierTeam).toBe("unknown");
        mean += injury.delta / 36;
      }
    }
    expect(mean).toBeCloseTo(0, 12);
  });

  it("retains the paired UI-015 result without assuming missing participant traits", () => {
    const report = analyzeNufflizerInput(
      playbackFragmentXml("001", "UI-015", [5, 6, 8, 10], [44])
    );
    expect(
      report.events.find((event) => event.metadata.rollType === 11)
    ).toMatchObject({
      scoringStatus: "excluded",
      metadata: {
        dice: [1, 4],
        injuryObservation: { sourceCode: 7, outcome: "stunned" }
      }
    });
  });

  it.each([[27], [999]])(
    "withholds an unknown or optional fouler policy (%j)",
    (...skills) => {
      const report = analyzeNufflizerInput(fixedFoulArmorXml(3, 5, skills));
      const injury = report.events.find(
        (event) => event.metadata.rollType === 11
      )!;
      expect(injury.scoringStatus).toBe("excluded");
      expect(injury.metadata.injuryTable?.counts).toEqual([21, 9, 0, 6]);
      expect(injury.metadata.injuryScoring).toBeUndefined();
    }
  );

  it("retains the observed injury if the replay records an injury modifier", () => {
    const replay = parseReplayXml(fixedFoulArmorXml(3, 5));
    const raw = replay.turns
      .flatMap((turn) => turn.events)
      .find((event) => event.sourceTag === "ResultInjuryRoll")!;
    raw.payload!.Modifiers = {
      Modifier: {
        PlayerId: 6,
        Skill: 27,
        Effect: -1,
        Value: 1,
        ModifierType: 27
      }
    };
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const injury = report.events.find(
      (event) => event.metadata.rollType === 11
    )!;
    expect(injury.metadata.injuryObservation?.outcome).toBe("stunned");
    expect(injury.scoringStatus).toBe("excluded");
    expect(injury.metadata.injuryTable).toBeUndefined();
  });

  it("explains the separate foul and injury rolls and rejects forged source or skill evidence", () => {
    const report = analyzeNufflizerInput(fixedFoulArmorXml(3, 5, [13, 75]));
    const injury = report.events.find(
      (event) => event.metadata.rollType === 11
    )!;
    expect(explainInjuryObservation(injury)).toContain(
      "after the applied foul. The recorded assists change the armor odds only"
    );
    const cause = injury.metadata.injuryScoring?.cause;
    if (cause?.kind !== "foul") throw new Error("Expected a foul injury cause");
    const sourceId = cause.foulResultSourceId;
    cause.foulResultSourceId = injury.metadata.sourceId!;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
    cause.foulResultSourceId = sourceId;
    cause.foulerTraitEvidence.traits.innateSkills!.push(27);
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
});
