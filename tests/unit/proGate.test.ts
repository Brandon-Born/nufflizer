import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { playbackFragment } from "../helpers/playback";

describe("source-linked Pro gate evidence (NUF-012/014)", () => {
  it.each([
    {
      source: "016",
      id: "UI-047",
      home: [12],
      away: [38],
      face: 3,
      passed: true
    },
    {
      source: "008",
      id: "UI-087",
      home: [11],
      away: [48],
      face: 1,
      passed: false
    }
  ])("preserves the independently observed $passed gate ($id)", (example) => {
    const replay = playbackFragment(
      example.source,
      example.id,
      example.home,
      example.away
    );
    const report = analyzeReplayLuck(replay);
    const gates = report.events.filter((event) => event.metadata.proGate);
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      actualSuccess: example.passed,
      weightedDelta: 0,
      metadata: {
        dice: [example.face],
        rollType: 15,
        proGate: { passed: example.passed, successChance: 2 / 3 },
        teamRerollsSpent: 0,
        rerollResource: "skill",
        isRollCandidate: true
      }
    });
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    gates[0]!.metadata.proGate!.passed = !example.passed;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it("rejects the claimed gate when skill ownership or the original die contradicts it", () => {
    const replay = playbackFragment("008", "UI-087", [11], [48]);
    const baseline = analyzeReplayLuck(replay);
    const skill = replay.turns
      .flatMap((turn) => turn.events)
      .find(
        (event) =>
          event.sourceTag === "ResultSkillUsage" && event.payload?.Skill === 50
      )!;
    skill.payload!.PlayerId = 11;
    expect(
      analyzeReplayLuck(replay).events.some((e) => e.metadata.proGate)
    ).toBe(false);
    skill.payload!.PlayerId = 48;
    const roll = replay.turns
      .flatMap((turn) => turn.events)
      .find(
        (event) => event.rollType === 15 && event.sourceTag === "ResultRoll"
      )!;
    roll.payload!.Dice = { Die: { DieType: 0, Value: 6 } };
    const report = analyzeReplayLuck(replay);
    expect(report.events.some((e) => e.metadata.proGate)).toBe(false);
    expect(report.teams).toEqual(baseline.teams);
  });
});
