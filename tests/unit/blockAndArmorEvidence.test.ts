import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { playbackFragment } from "../helpers/playback";

describe("damage step accounting (NUF-018/019)", () => {
  it("reconciles the observed UI-068 armor, injury, casualty, removal and recovery", () => {
    const r = report("001", "UI-068", [6], [37]);
    expect(r.damageSteps).toHaveLength(1);
    const step = r.damageSteps[0]!;
    expect(step).toMatchObject({
      teamId: "1",
      playerId: "37",
      scoredRolls: 2,
      unscoredRolls: 2,
      contextRecords: 1
    });
    expect(
      step.eventIds.map(
        (id) => r.events.find((e) => e.id === id)?.metadata.sourceTag
      )
    ).toEqual([
      "ResultRoll",
      "ResultInjuryRoll",
      "ResultCasualtyRoll",
      "ResultPlayerRemoval",
      "ResultRoll"
    ]);
    // 30 of 36 sums hold armor at 10+. Recovery succeeds at 4+ with weight 1.5.
    expect(step.diceContribution).toBeCloseTo(-30 / 36 + (1 - 1 / 2) * 1.5, 12);
    expect(r.teams[1].luckScore).toBeCloseTo(step.diceContribution, 12);
    step.diceContribution++;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });

  it.each(["ResultPlayerRemoval", "armor"] as const)(
    "does not award another contribution from a repeated %s record",
    (duplicate) => {
      const replay = playbackFragment("001", "UI-068", [6], [37]);
      const turn = replay.turns.find((t) =>
        t.events.some((e) => e.rollType === 46)
      )!;
      const index = turn.events.findIndex((e) =>
        duplicate === "armor" ? e.rollType === 10 : e.sourceTag === duplicate
      );
      turn.events.splice(index + 1, 0, {
        ...turn.events[index]!,
        id: "repeated-damage-record"
      });
      turn.eventCount++;
      const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
      const step = r.damageSteps[0]!;
      if (duplicate === "armor") {
        expect(
          r.events
            .filter((e) => e.metadata.rollType === 10)
            .every((e) => e.scoringStatus === "excluded")
        ).toBe(true);
        expect(step.diceContribution).toBe(0.75);
      } else {
        expect(step.contextRecords).toBe(2);
        expect(step.diceContribution).toBeCloseTo(-1 / 12, 12);
      }
    }
  );
});

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
        scoringStatus: "excluded",
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
      expect(pools[0]!.probabilitySuccess).toBeNull();
      expect(pools[0]!.metadata.block!.distribution[3]!+pools[0]!.metadata.block!.distribution[4]!).toBeCloseTo(chance,12);
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
      actualSuccess: null,
      metadata: { block: { pool: { faces: [0, 0] }, finalOutcome: 0 } }
    });
    expect(pools[0]!.probabilitySuccess).toBeNull();
    expect(pools[0]!.metadata.block!.distribution[3]!+pools[0]!.metadata.block!.distribution[4]!).toBeCloseTo(5/9,12);
    expect(r.events.find((e) => e.metadata.rollType === 71)).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      metadata: {
        lonerGate: { passed: false, gamerId: 1 },
        teamRerollsSpent: 1
      }
    });
  });
  it("records a successful Loner gate without assigning its chance to the replacement", () => {
    const r = report("001", "UI-007", [], [37, 46]);
    const gate = r.events.find((e) => e.metadata.rollType === 71)!;
    expect(gate).toMatchObject({
      teamId: "1",
      scoringStatus: "excluded",
      probabilitySuccess: null,
      metadata: {
        lonerGate: { passed: true, gamerId: 1 },
        teamRerollsSpent: 1,
        rerollUsed: false
      }
    });
    expect(gate.metadata.probabilityPolicy).toBeUndefined();
    expect(
      r.events.find((e) => e.metadata.rollType === 34)?.probabilitySuccess
    ).toBeNull();
  });
  it("withholds Loner resource claims when skill ownership disagrees", () => {
    const replay = playbackFragment("001", "UI-007", [], [37, 46]);
    const skill = replay.turns
      .flatMap((t) => t.events)
      .find(
        (e) => e.sourceTag === "ResultSkillUsage" && e.payload?.Skill === 44
      )!;
    skill.payload!.PlayerId = 46;
    const gate = analyzeReplayLuck(replay).events.find(
      (e) => e.metadata.rollType === 71
    )!;
    expect(gate.metadata.lonerGate).toBeUndefined();
    expect(gate.metadata.teamRerollsSpent).toBeUndefined();
    expect(gate.metadata.isRollCandidate).toBe(true);
  });
  it("conditions Brawler's replacement odds on the unrolled Both Down", () => {
    const r = report("007", "UI-071", [7], [38]);
    const pools = r.events.filter(
      (e) => !!e.metadata.block
    );
    expect(pools).toHaveLength(2);
    expect(pools[0]!.metadata.block!.pool.faces).toEqual([1, 1]);
    expect(pools[1]).toMatchObject({
      actualSuccess: null,
      metadata: {
        block: {
          reroll: "brawler",
          pool: { faces: [4, 1], rolledIndexes: [0] }
        }
      }
    });
    expect(pools[1]!.probabilitySuccess).toBeNull();
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
    const pool = r.events.find((e) => e.metadata.block);
    expect(pool?.scoringStatus).toBe("excluded");
    expect(pool?.metadata.block?.finalOutcome).toBeUndefined();
    expect(pool?.metadata.block?.selectedFace).toBeUndefined();
    expect(
      r.events
        .filter((e) => e.metadata.sourceTag === "ResultBlockRoll")
        .every((e) => e.scoringStatus === "excluded")
    ).toBe(true);
  });

  it("keeps UI-047's original and Pro replacement without inventing an applied result", () => {
    const r = report("016", "UI-047", [12], [38]);
    const pools = r.events.filter((e) => e.metadata.block);
    expect(pools).toHaveLength(2);
    expect(pools.map((e) => e.metadata.block!.pool.faces)).toEqual([[0], [2]]);
    expect(pools.map((e) => e.probabilitySuccess)).toEqual([null,null]);
    expect(pools.map(e=>e.metadata.block!.distribution[3]!+e.metadata.block!.distribution[4]!)).toEqual([1/3,1/3]);
    expect(pools[1]!.metadata.block).toMatchObject({
      reroll: "pro",
      pool: { rolledIndexes: [0] },
      previousPoolSourceId: pools[0]!.metadata.sourceId,
      selectedFace: 2,
      selectedOutcome: 4
    });
    const gate = r.events.find((e) => e.metadata.proGate)!;
    expect(pools[1]!.metadata.block!.proGateSourceId).toBe(
      gate.metadata.sourceId
    );
    expect(
      pools.every((e) => e.metadata.block!.finalOutcome === undefined)
    ).toBe(true);
    expect(pools[1]!.explainability.inputsSummary).toContain(
      "applied result is unknown"
    );
    expect(r.teams[1]!.luckScore).toBe(0);
    expect(r.verdict.luckierTeam).toBe("unknown");
    pools[1]!.metadata.block!.proGateSourceId = "missing-gate";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });

  it.each(["gate", "eligibility", "duplicate_initial"] as const)(
    "withholds the unsupported Pro history after %s is changed",
    (change) => {
      const replay = playbackFragment("016", "UI-047", [12], [38]);
      const events = replay.turns[0]!.events;
      const initial = events.findIndex(
        (e) => e.sourceTag === "QuestionBlockDice"
      );
      if (change === "gate")
        events.find((e) => e.rollType === 15)!.payload!.Dice = {
          Die: { DieType: 0, Value: 1 }
        };
      if (change === "eligibility")
        delete events[initial]!.payload!.ProDiceIndexes;
      if (change === "duplicate_initial")
        events.splice(initial + 1, 0, {
          ...events[initial]!,
          id: "duplicate-initial"
        });
      const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
      expect(r.events.some((e) => e.metadata.block?.reroll === "pro")).toBe(
        false
      );
      if (change === "duplicate_initial")
        expect(
          r.events.filter(
            (e) => e.type === "block" && e.scoringStatus === "scored"
          )
        ).toHaveLength(0);
    }
  );
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
describe("post-casualty recovery evidence", () => {
  it.each([
    ["001", "UI-068", [6], [37], 6, true],
    ["027", "UI-054", [], [37], 2, false]
  ] as const)(
    "%s %s scores Regeneration for the injured roster and keeps the other stages distinct",
    (source, id, home, away, die, success) => {
      const report = LuckReportSchema.parse(
        analyzeReplayLuck(playbackFragment(source, id, [...home], [...away]))
      );
      const recovery = report.events.find(
        (event) => event.metadata.rollType === 46
      )!;
      const armor = report.events.find(
        (event) =>
          event.metadata.rollType === 10 &&
          event.metadata.actionId === recovery.metadata.actionId
      )!;
      const casualty = report.events.find(
        (event) => event.metadata.sourceTag === "ResultCasualtyRoll"
      )!;
      const removal = report.events.find(
        (event) =>
          event.metadata.sourceTag === "ResultPlayerRemoval" &&
          event.metadata.actionId === recovery.metadata.actionId
      )!;
      expect(recovery).toMatchObject({
        type: "injury",
        scoringStatus: "scored",
        teamId: "1",
        playerId: "37",
        probabilitySuccess: 1 / 2,
        actualSuccess: success,
        delta: success ? 1 / 2 : -1 / 2,
        metadata: {
          dice: [die],
          damage: {
            subjectTeamId: "1",
            subjectId: "37",
            perspective: "subject_team",
            chainActionId: armor.metadata.actionId,
            regeneration: {
              casualtySourceId: casualty.metadata.sourceId,
              initialRemovalSourceId: removal.metadata.sourceId
            }
          }
        }
      });
      expect(armor.scoringStatus).toBe("scored");
      expect(armor.actualSuccess).toBe(false);
      expect(casualty.scoringStatus).toBe("excluded");
      expect(removal.metadata.isRollCandidate).toBe(false);
      expect(report.coverage.scoredByType.injury).toBe(1);
    }
  );

  it.each([
    "other skill",
    "stale die",
    "duplicate die",
    "different damage step",
    "contradictory outcome"
  ])(
    "keeps an unsupported recovery visible without awarding luck: %s",
    (variant) => {
      const replay = playbackFragment("001", "UI-068", [6], [37]);
      const turn = replay.turns.find((t) =>
        t.events.some((e) => e.rollType === 46)
      )!;
      const index = turn.events.findIndex((event) => event.rollType === 46);
      const die = turn.events[index]!;
      if (variant === "other skill")
        turn.events[index - 1]!.payload!.Skill = 13;
      if (variant === "stale die") die.payload!.NewRoll = 0;
      if (variant === "duplicate die") turn.events.splice(index, 0, { ...die });
      if (variant === "different damage step") die.actionId += "-other";
      if (variant === "contradictory outcome") die.payload!.Outcome = 0;
      const report = analyzeReplayLuck(replay);
      const recovery = report.events.find(
        (event) => event.metadata.rollType === 46
      )!;
      expect(recovery).toMatchObject({
        scoringStatus: "excluded",
        probabilitySuccess: null,
        metadata: { isRollCandidate: true }
      });
      expect(report.coverage.scoredByType.injury).toBe(0);
    }
  );
});
