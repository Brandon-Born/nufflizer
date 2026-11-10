import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { model, rollEvent } from "../helpers/replay";
import { playbackFragment as fragment } from "../helpers/playback";

describe("UI-backed numeric check contracts, replay 1-4-0-0", () => {
  it.each([
    ["UI-008", 41, true],
    ["UI-009", 38, false]
  ] as const)(
    "scores %s Rush separately from Dodge and self-damage",
    (id, player, actualSuccess) => {
      const report = analyzeReplayLuck(fragment("001", id, [], [player]));
      const rush = report.events.find((e) => e.metadata.rollType === 1)!;
      expect(rush).toMatchObject({
        type: "movement_risk",
        teamId: "1",
        actualSuccess,
        scoringStatus: "scored"
      });
      expect(rush.probabilitySuccess).toBeCloseTo(5 / 6, 12);
      expect(
        report.events.some(
          (e) => e.type === "dodge" && e.scoringStatus === "scored"
        )
      ).toBe(true);
      expect(
        report.events
          .filter((e) => e.type === "injury")
          .every((e) => e.scoringStatus !== "scored")
      ).toBe(true);
    }
  );
  it("classifies the two UI-006 Titchy dodges as Dodge with 5/6 odds for the away actor", () => {
    const replay = fragment("001", "UI-006", [], [46]);
    const action = replay.turns
      .flatMap((t) => t.events)
      .find((e) => e.sourceTag === "ResultUseAction")!;
    expect(action.payload?.TeamId).toBe(0); // Raw zero is not the acting side.
    expect(action.actorTeamId).toBe("1");
    expect(action.attributionConflict).toBe(false);
    const report = analyzeReplayLuck(replay);
    const dodges = report.events.filter((e) => e.metadata.rollType === 2);
    expect(dodges).toHaveLength(2);
    for (const dodge of dodges) {
      expect(dodge).toMatchObject({
        type: "dodge",
        teamId: "1",
        actualSuccess: true,
        scoringStatus: "scored"
      });
      expect(dodge.probabilitySuccess).toBeCloseTo(5 / 6, 12);
      expect(dodge.delta).toBeCloseTo(1 / 6, 12);
    }
    expect(report.verdict.luckierTeam).toBe("unknown");
  });
  it("identifies UI-002 Pick up and excludes its unmodeled Sure Hands replacement", () => {
    const report = analyzeReplayLuck(fragment("001", "UI-002", [], [44]));
    const pickup = report.events.filter((e) => e.metadata.rollType === 4);
    expect(pickup).toHaveLength(2);
    expect(pickup[0]).toMatchObject({
      type: "ball_handling",
      teamId: "1",
      actualSuccess: false,
      scoringStatus: "scored"
    });
    expect(pickup[0]!.probabilitySuccess).toBeCloseTo(2 / 3, 12);
    expect(pickup[1]).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      weightedDelta: 0
    });
    expect(pickup[1]!.statusReason).toMatch(/reroll policy/);
  });
  it("links UI-014's hand-off recipient Catch reroll once, with original question dice", () => {
    const report = analyzeReplayLuck(fragment("001", "UI-014", [2, 9], []));
    const catches = report.events.filter((e) => e.metadata.rollType === 7);
    expect(catches).toHaveLength(1);
    expect(catches[0]).toMatchObject({
      playerId: "2",
      type: "ball_handling",
      scoringStatus: "scored",
      actualSuccess: true
    });
    expect(catches[0]!.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(catches[0]!.metadata.originalDice).toEqual({
      Die: { DieType: 0, Value: 1 }
    });
  });
  it("scores UI-022's kept Pickup once from the original question, without reroll odds", () => {
    const report = analyzeReplayLuck(fragment("002", "UI-022", [], [43]));
    const pickups = report.events.filter((e) => e.metadata.rollType === 4);
    expect(pickups).toHaveLength(1);
    expect(pickups[0]).toMatchObject({
      playerId: "43",
      teamId: "1",
      actualSuccess: false,
      scoringStatus: "scored",
      metadata: { rerollAvailable: false, rerollUsed: false }
    });
    expect(pickups[0]!.probabilitySuccess).toBeCloseTo(2 / 3, 12);
    expect(pickups[0]!.metadata.originalDice).toEqual({
      Die: { DieType: 0, Value: 2 }
    });
    expect(pickups[0]!.metadata.rerollPolicy).toMatch(/retained original/i);
  });
  it("retains UI-097's natural-one Catch failure despite Diving Catch +1", () => {
    const report = analyzeReplayLuck(fragment("025", "UI-097", [], [40, 49]));
    const catches = report.events.filter((e) => e.metadata.rollType === 7);
    expect(catches).toHaveLength(2);
    expect(catches[0]).toMatchObject({
      playerId: "40",
      teamId: "1",
      actualSuccess: false,
      scoringStatus: "scored"
    });
    expect(catches[0]!.probabilitySuccess).toBeCloseTo(5 / 6, 12);
    expect(catches[1]!.scoringStatus).toBe("excluded");
  });
  it("scores UI-093's natural-six Catch using the explicit effective target", () => {
    const report = analyzeReplayLuck(
      fragment("011", "UI-093", [3, 5], [38, 40])
    );
    const caught = report.events.find(
      (e) => e.metadata.rollType === 7 && e.playerId === "3"
    )!;
    expect(caught).toMatchObject({
      actualSuccess: true,
      scoringStatus: "scored",
      teamId: "0"
    });
    expect(caught.metadata.modifiersSum).toBe(-4);
    expect(caught.probabilitySuccess).toBeCloseTo(1 / 6, 12);
  });
  it("does not turn a conditional Loner gate into an unconditional full reroll", () => {
    const base = { playerId: "42", stepType: 4, targetId: "-1" };
    const question = rollEvent({
      ...base,
      sourceTag: "QuestionTeamRerollUsage",
      payload: {
        GamerId: 0,
        CanUseTeamReroll: 1,
        RollInfos: {
          RollType: 7,
          Status: 1,
          NewRoll: 1,
          Difficulty: 2,
          Outcome: 0,
          Dice: { Die: { DieType: 0, Value: 1 } }
        }
      }
    });
    const events = [
      question,
      rollEvent({
        ...base,
        sourceTag: "ResultTeamRerollUsage",
        payload: { GamerId: 0, Used: 1 }
      }),
      rollEvent({
        ...base,
        sourceTag: "ResultSkillUsage",
        payload: { PlayerId: 42, Skill: 44, Used: 1 }
      }),
      rollEvent({ ...base, rollType: 71 }),
      rollEvent({ ...base, payload: { ...rollEvent().payload, Status: 2 } })
    ];
    const result = analyzeReplayLuck(model(events));
    expect(result.events.at(-1)).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null
    });
    expect(result.events.every((e) => !e.metadata.rerollAvailable)).toBe(true);
  });
  it.each([
    { Die: { DieType: 99, Value: 1 } },
    { Die: { DieType: 0, Value: 9 } },
    {
      Die: [
        { DieType: 0, Value: 1 },
        { DieType: 0, Value: 1 }
      ]
    },
    { Die: { DieType: 0, Value: 6 } }
  ])(
    "does not award full-reroll odds for malformed or nonfailed original dice %j",
    (Dice) => {
      const base = { playerId: "42", stepType: 4, targetId: "-1" };
      const result = analyzeReplayLuck(
        model([
          rollEvent({
            ...base,
            sourceTag: "QuestionTeamRerollUsage",
            payload: {
              GamerId: 0,
              CanUseTeamReroll: 1,
              RollInfos: {
                RollType: 7,
                Status: 1,
                NewRoll: 1,
                Difficulty: 2,
                Outcome: 0,
                Dice
              }
            }
          }),
          rollEvent({
            ...base,
            sourceTag: "ResultTeamRerollUsage",
            payload: { GamerId: 0, Used: 1 }
          }),
          rollEvent({ ...base, payload: { ...rollEvent().payload, Status: 2 } })
        ])
      );
      expect(result.events.at(-1)).toMatchObject({
        probabilitySuccess: null,
        scoringStatus: "excluded"
      });
    }
  );
  it.each([undefined, "1-3-0-0", "future"])(
    "abstains from numeric scoring for replay version %s",
    (replayVersion) => {
      const result = analyzeReplayLuck({
        ...model([rollEvent()]),
        replayVersion
      });
      expect(result.events[0]).toMatchObject({
        probabilitySuccess: null,
        actualSuccess: null,
        scoringStatus: "excluded"
      });
      expect(result.verdict.status).toBe("insufficient_evidence");
    }
  );
  it.each([0, undefined])(
    "does not score a missing/nonfresh NewRoll=%s",
    (NewRoll) => {
      const event = rollEvent();
      event.payload = { ...event.payload, NewRoll };
      expect(analyzeReplayLuck(model([event])).events[0]!.scoringStatus).toBe(
        "excluded"
      );
    }
  );
  it("rejects unknown/malformed dice and keeps trait/referee gates unscored", () => {
    for (const payload of [
      {
        Dice: {
          Die: [
            { DieType: 0, Value: 2 },
            { DieType: 0, Value: 2 }
          ]
        }
      },
      { Dice: { Die: { DieType: 99, Value: 6 } } },
      { Difficulty: 0 },
      { Outcome: 2 },
      { Status: 2 }
    ]) {
      const event = rollEvent();
      event.payload = { ...event.payload, ...payload };
      expect(analyzeReplayLuck(model([event])).events[0]!.scoringStatus).toBe(
        "excluded"
      );
    }
    for (const rollType of [21, 30, 34, 37, 71]) {
      const result = analyzeReplayLuck(model([rollEvent({ rollType })]))
        .events[0]!;
      expect(result.scoringStatus).toBe("excluded");
      expect(result.probabilitySuccess).toBeNull();
    }
  });
  it.each([
    { Requirement: 3, Difficulty: 4 },
    { Requirement: 3.5 },
    { Requirement: 3, Modifiers: { Modifier: { Value: 0.5 } } },
    { Requirement: 3, Modifiers: { Modifier: { Value: "1" } } },
    { Requirement: 7, Difficulty: 6 },
    { Requirement: 2, Difficulty: 2, Modifiers: { Modifier: { Value: 1 } } }
  ])(
    "excludes inconsistent or unvalidated non-Catch thresholds %j",
    (payload) => {
      const event = rollEvent({ rollType: 2 });
      event.payload = { ...event.payload, ...payload };
      expect(analyzeReplayLuck(model([event])).events[0]).toMatchObject({
        scoringStatus: "excluded",
        probabilitySuccess: null,
        actualSuccess: null
      });
    }
  );
});
