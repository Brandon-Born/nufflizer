import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import type { ReplayEvent } from "@/domain/replay/types";
import { model, rollEvent } from "../helpers/replay";

function chain(): ReplayEvent[] {
  const base = { playerId: "42", stepType: 4, targetId: "-1" };
  return [
    rollEvent({
      ...base,
      id: "question",
      actionId: "initial-step",
      sourceTag: "QuestionTeamRerollUsage",
      payload: {
        GamerId: 0,
        CanUseTeamReroll: 1,
        RollInfos: { ...rollEvent().payload, RollType: 7 }
      }
    }),
    rollEvent({
      ...base,
      sourceTag: "ResultTeamRerollUsage",
      actionId: "continuation-step",
      payload: { GamerId: 0, Used: 0 }
    }),
    rollEvent({
      ...base,
      id: "kept",
      actionId: "continuation-step",
      payload: { ...rollEvent().payload, NewRoll: 0 }
    })
  ];
}
function final(events: ReplayEvent[]) {
  const report = analyzeReplayLuck(model(events));
  expect(LuckReportSchema.safeParse(report).success).toBe(true);
  return report.events.at(-1)!;
}

describe("NUF-012 retained original numeric checks", () => {
  it("deduplicates an exact contiguous kept summary only within the same action", () => {
    const events = chain();
    events.push({ ...events[2]!, id: "repeated" });
    const repeated = analyzeReplayLuck(model(events));
    expect(repeated.events.at(-1)!.metadata.isRollCandidate).toBe(false);
    expect(repeated.coverage.rollCandidates.scoredCount).toBe(1);
    events[3]!.actionId = "different-action";
    const unrelated = analyzeReplayLuck(model(events));
    expect(unrelated.events.at(-1)!.metadata.isRollCandidate).toBe(true);
    expect(unrelated.events.at(-1)!.scoringStatus).toBe("excluded");
  });

  it("scores one failed 2+ attempt at 5/6 despite available but declined reroll", () => {
    const event = final(chain());
    expect(event).toMatchObject({
      scoringStatus: "scored",
      actualSuccess: false,
      metadata: {
        sourceId: "kept",
        rerollQuestionId: "question",
        rerollUsed: false,
        rerollAvailable: false,
        originalDice: { Die: { DieType: 0, Value: 1 } }
      }
    });
    expect(event.probabilitySuccess).toBeCloseTo(5 / 6, 12);
    expect(event.delta).toBeCloseTo(-5 / 6, 12);
    expect(event.explainability.baseOdds).toBeCloseTo(5 / 6, 12);
  });

  it.each([
    [
      "missing question freshness",
      (q: Record<string, unknown>) => {
        delete q.NewRoll;
      }
    ],
    [
      "nonfresh question",
      (q: Record<string, unknown>) => {
        q.NewRoll = 0;
      }
    ],
    [
      "replacement question",
      (q: Record<string, unknown>) => {
        q.Status = 2;
      }
    ],
    [
      "successful question",
      (q: Record<string, unknown>) => {
        q.Outcome = 1;
      }
    ],
    [
      "invalid D6",
      (q: Record<string, unknown>) => {
        q.Dice = { Die: { DieType: 99, Value: 1 } };
      }
    ],
    [
      "different original die",
      (q: Record<string, unknown>) => {
        q.Difficulty = 3;
        q.Dice = { Die: { DieType: 0, Value: 2 } };
      }
    ],
    [
      "contradictory modifier",
      (q: Record<string, unknown>) => {
        q.Requirement = 3;
        q.Modifiers = { Modifier: { Value: 0 } };
      }
    ]
  ] as const)("excludes %s", (_label, change) => {
    const events = chain();
    const original = events[0]!.payload!.RollInfos as Record<string, unknown>;
    change(original);
    // Keep threshold metadata identical to isolate original freshness/dice
    // validation from ordinary threshold mismatch rejection.
    events[2]!.payload = {
      ...events[2]!.payload,
      Difficulty: original.Difficulty,
      Requirement: original.Requirement,
      Modifiers: original.Modifiers
    };
    expect(final(events)).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      weightedDelta: 0
    });
  });

  it.each([
    ["other actor", { playerId: "43" }],
    ["other target", { targetId: "10" }],
    ["other step", { stepType: 1 }],
    ["other team", { actorTeamId: "1" }],
    ["missing step", { stepType: undefined }],
    ["missing target", { targetId: undefined }],
    ["other family", { rollType: 4 }]
  ] as const)("does not attach a summary to %s", (_label, change) => {
    const events = chain();
    Object.assign(events[2]!, change);
    expect(final(events).scoringStatus).toBe("excluded");
  });

  it.each([undefined, 1, -1, "0"])(
    "requires matching explicit gamer IDs (%s)",
    (GamerId) => {
      const events = chain();
      events[1]!.payload!.GamerId = GamerId;
      if (GamerId === undefined) delete events[0]!.payload!.GamerId;
      expect(final(events).scoringStatus).toBe("excluded");
    }
  );

  it.each([
    "ResultSkillUsage",
    "ResultUseAction",
    "EventEndTurn",
    "EventActiveGamerChanged",
    "UnknownMessage"
  ])("invalidates the simple link across %s", (sourceTag) => {
    const events = chain();
    events.splice(1, 0, rollEvent({ sourceTag }));
    expect(final(events).scoringStatus).toBe("excluded");
  });

  it("permits a matching continuation PlayerStep across sequences", () => {
    const events = chain();
    events.splice(
      1,
      0,
      rollEvent({
        playerId: "42",
        stepType: 4,
        targetId: "-1",
        sourceTag: "PlayerStep"
      })
    );
    expect(final(events).scoringStatus).toBe("scored");
  });

  it.each([1, 2, undefined])(
    "rejects unsupported Used=%s for a kept result",
    (Used) => {
      const events = chain();
      events[1]!.payload!.Used = Used;
      expect(final(events).scoringStatus).toBe("excluded");
    }
  );

  it("rejects contradictory fresh dice after a declined choice", () => {
    const events = chain();
    events[2]!.payload!.NewRoll = 1;
    expect(final(events)).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null
    });
  });

  it("does not count an already emitted original and its kept summary twice", () => {
    const events = chain();
    events.unshift(
      rollEvent({
        playerId: "42",
        stepType: 4,
        targetId: "-1",
        actionId: "initial-step"
      })
    );
    const report = analyzeReplayLuck(model(events));
    expect(
      report.events.filter((e) => e.scoringStatus === "scored")
    ).toHaveLength(1);
    expect(report.events.at(-1)!.statusReason).toMatch(/already reported/);
    expect(report.events.at(-1)!.metadata.rerollQuestionId).toBe("question");
    expect(report.teams[0].luckScore).toBeCloseTo(
      report.events[0]!.weightedDelta,
      12
    );
  });

  it("consumes a question once even if the kept summary is repeated", () => {
    const events = chain();
    events.push({ ...events[2]!, id: "repeated" });
    const report = analyzeReplayLuck(model(events));
    expect(
      report.events.filter((e) => e.scoringStatus === "scored")
    ).toHaveLength(1);
    expect(report.events.at(-1)!.scoringStatus).toBe("excluded");
  });

  it("recognizes an emitted original even when another check intervenes in its source step", () => {
    const events = chain();
    events.unshift(
      rollEvent({
        playerId: "42",
        stepType: 4,
        targetId: "-1",
        actionId: "initial-step"
      }),
      rollEvent({
        playerId: "42",
        stepType: 4,
        targetId: "-1",
        actionId: "initial-step",
        rollType: 4
      })
    );
    expect(final(events).statusReason).toMatch(/already reported/);
  });

  it("does not add combined reroll odds to an independently scored initial attempt", () => {
    const events = chain();
    events[1]!.payload!.Used = 1;
    events[2]!.payload = {
      ...events[2]!.payload,
      Status: 2,
      NewRoll: 1,
      Outcome: 1,
      Dice: { Die: { DieType: 0, Value: 6 } }
    };
    events.unshift(
      rollEvent({
        playerId: "42",
        stepType: 4,
        targetId: "-1",
        actionId: "initial-step"
      })
    );
    const report = analyzeReplayLuck(model(events));
    expect(
      report.events.filter((e) => e.scoringStatus === "scored")
    ).toHaveLength(1);
    expect(report.events.at(-1)!.scoringStatus).toBe("excluded");
    expect(report.teams[0].luckScore).toBeCloseTo(
      report.events[0]!.weightedDelta,
      12
    );
  });

  it("does not carry an unresolved question across an end-turn boundary", () => {
    const events = chain();
    const replay = model(events);
    replay.turns = [
      { ...replay.turns[0]!, events: events.slice(0, 1) },
      { ...replay.turns[0]!, turnNumber: 2, events: events.slice(1) }
    ];
    expect(analyzeReplayLuck(replay).events.at(-1)!.scoringStatus).toBe(
      "excluded"
    );
  });
});
