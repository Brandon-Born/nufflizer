import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { playbackFragment } from "../helpers/playback";

function report(source: string, id: string, home: number[], away: number[]) {
  return LuckReportSchema.parse(
    analyzeReplayLuck(playbackFragment(source, id, home, away))
  );
}

describe("block pools and actual resolutions (NUF-010/013/014)", () => {
  it.each([
    ["001", "UI-068", [6], [37], [3], "0", "0", 1 / 3, 3, 6],
    ["005", "UI-059", [4], [41], [2, 3], "0", "1", 1 / 9, 2, 4],
    ["002", "UI-061", [4], [38], [3, 3, 1], "1", "1", 19 / 27, 3, 4]
  ] as const)(
    "%s %s counts one pool separately from its selected result",
    (
      source,
      id,
      home,
      away,
      faces,
      teamId,
      chooser,
      chance,
      selectedFace,
      finalOutcome
    ) => {
      const r = report(source, id, [...home], [...away]);
      const pools = r.events.filter(
        (e) => e.type === "block" && e.metadata.isRollCandidate
      );
      expect(pools).toHaveLength(1);
      expect(pools[0]).toMatchObject({
        scoringStatus: "scored",
        teamId,
        metadata: {
          block: {
            pool: { faces },
            chooserTeamId: chooser,
            selectedFace,
            finalOutcome
          }
        }
      });
      expect(pools[0]!.probabilitySuccess).toBeCloseTo(chance, 12);
      expect(
        pools[0]!.metadata.block!.distribution.reduce((a, b) => a + b)
      ).toBeCloseTo(1, 12);
      expect(
        r.events
          .filter((e) => e.metadata.sourceTag === "ResultBlockRoll")
          .every((e) => !e.metadata.isRollCandidate)
      ).toBe(true);
    }
  );
  it("retains double skulls and the failed Loner without inventing a second pool", () => {
    const r = report("002", "UI-020", [1], [37]);
    const pools = r.events.filter(
      (e) => e.type === "block" && e.metadata.isRollCandidate
    );
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({
      actualSuccess: false,
      metadata: { block: { pool: { faces: [0, 0] }, finalOutcome: 0 } }
    });
    expect(pools[0]!.probabilitySuccess).toBeCloseTo(5 / 9, 12);
    expect(
      r.events.find((e) => e.metadata.rollType === 71)!.scoringStatus
    ).toBe("excluded");
  });
  it("conditions Brawler's replacement odds on the unrolled Both Down", () => {
    const r = report("007", "UI-071", [7], [38]);
    const pools = r.events.filter(
      (e) => e.type === "block" && e.scoringStatus === "scored"
    );
    expect(pools).toHaveLength(2);
    expect(pools[0]!.metadata.block!.pool.faces).toEqual([1, 1]);
    expect(pools[1]).toMatchObject({
      actualSuccess: true,
      metadata: {
        block: {
          reroll: "brawler",
          pool: { faces: [4, 1], rolledIndexes: [0] }
        }
      }
    });
    expect(pools[1]!.probabilitySuccess).toBeCloseTo(1 / 3, 12);
    expect(pools[1]!.metadata.block!.distribution).toEqual([
      0,
      1 / 3,
      1 / 3,
      1 / 6,
      1 / 6
    ]);
  });
  it("retains Wrestle's applied result without treating it as fresh dice", () => {
    const r = report("012", "UI-073", [11], [42]);
    const pool = r.events.find((e) => e.metadata.block)!;
    expect(pool.metadata.block).toMatchObject({
      selectedFace: 1,
      finalOutcome: 2
    });
    expect(
      r.events.filter((e) => e.type === "block" && e.metadata.isRollCandidate)
    ).toHaveLength(1);
  });
  it("does not attach a pool to an unrelated block across an activation", () => {
    const replay = playbackFragment("005", "UI-059", [4], [41]);
    const events = replay.turns.flatMap((t) => t.events);
    const selection = events.findIndex(
      (e) => e.sourceTag === "ResultBlockRoll"
    );
    events.splice(selection, 0, {
      type: "step",
      sourceTag: "PlayerStep",
      stepTag: "PlayerStep",
      stepType: 0,
      stepActorId: "99"
    });
    replay.turns[0]!.events = events;
    const r = analyzeReplayLuck(replay);
    expect(
      r.events.every(
        (e) => e.type !== "block" || e.scoringStatus === "excluded"
      )
    ).toBe(true);
  });
});

describe("armor perspective and fixed modifiers (NUF-011/013)", () => {
  it("charges UI-009's self-fall armor break to the player who fell", () => {
    const r = report("001", "UI-009", [], [38]);
    const armor = r.events.find((e) => e.type === "armor_break")!;
    expect(armor).toMatchObject({
      teamId: "1",
      actualSuccess: false,
      scoringStatus: "scored",
      label: "Armor broke",
      metadata: {
        damage: {
          subjectId: "38",
          subjectTeamId: "1",
          perspective: "subject_team",
          sourceCode: 9
        }
      }
    });
    expect(armor.probabilitySuccess).toBeCloseTo(21 / 36, 12);
    expect(armor.weightedDelta).toBeCloseTo(-21 / 36, 12);
  });
  it("uses UI-015's three pre-roll foul assists and attributes the opposing victim", () => {
    const r = report("001", "UI-015", [5, 6, 8, 10], [44]);
    const armor = r.events.find((e) => e.type === "armor_break")!;
    expect(armor).toMatchObject({
      teamId: "1",
      actualSuccess: false,
      scoringStatus: "scored",
      metadata: { difficulty: 5, requirement: 8, modifiersSum: 3 }
    });
    expect(armor.probabilitySuccess).toBeCloseTo(6 / 36, 12);
    expect(
      r.events.find((e) => e.metadata.sourceTag === "ResultInjuryRoll")!
        .scoringStatus
    ).toBe("excluded");
  });
  it.each([
    ["contradictory outcome", { Outcome: 0 }],
    ["contradictory target", { Difficulty: 7 }],
    [
      "post-roll skill modifier",
      {
        Modifiers: {
          Modifier: { Value: 1, ModifierType: 27, Skill: 13, Effect: -1 }
        },
        Difficulty: 7
      }
    ]
  ])("excludes %s", (_label, payload) => {
    const replay = playbackFragment("001", "UI-009", [], [38]);
    const armor = replay.turns
      .flatMap((t) => t.events)
      .find((e) => e.rollType === 10)!;
    armor.payload = { ...armor.payload, ...payload };
    expect(
      analyzeReplayLuck(replay).events.find((e) => e.type === "armor_break")
    ).toMatchObject({ scoringStatus: "excluded", probabilitySuccess: null });
  });
  it("does not resolve duplicate roster IDs as a damage beneficiary", () => {
    const r = report("001", "UI-009", [38], [38]);
    expect(r.events.find((e) => e.type === "armor_break")!.scoringStatus).toBe(
      "excluded"
    );
  });
});
