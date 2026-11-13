import { parseReplayXml } from "@/domain/replay/parseXml";
import { contextReplayXml } from "../helpers/contextReplay";
import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { numericRerollPolicy } from "../helpers/numericRerollPolicy";

const make = (family = 2, target = 3, first = 1) =>
  numericRerollPolicy({ family, target, first, second: 6, use: true });
const analyze = (replay: ReturnType<typeof make>) =>
  LuckReportSchema.parse(analyzeReplayLuck(replay));
const prefix = (family = 2, target = 3, first = 1) => {
  const replay = make(family, target, first);
  replay.turns[0]!.events.length = 1;
  replay.turns[0]!.eventCount = 1;
  return replay;
};
describe("source-qualified first dice inside team-reroll questions", () => {
  it.each([1, 2, 4, 7])(
    "counts a family%s first draw fairly before any later decision",
    (family) => {
      for (const target of [2, 3, 4, 5, 6]) {
        let sum = 0;
        for (let first = 1; first <= 6; first++) {
          const r = analyze(prefix(family, target, first));
          const e = r.events.find((e) => e.scoringStatus === "scored")!;
          expect(
            r.events.filter((e) => e.scoringStatus === "scored")
          ).toHaveLength(1);
          expect(e.probabilitySuccess).toBeCloseTo((7 - target) / 6, 12);
          expect(e.delta).toBeCloseTo(
            Number(first >= target) - (7 - target) / 6,
            12
          );
          expect(r.coverage.diceRecords.coveredCount).toBe(1);
          if (first < target) {
            expect(e.metadata.sourceTag).toBe("QuestionTeamRerollUsage");
            expect(e.metadata.numericOriginal).toEqual({
              gamerId: 0,
              canUseTeamReroll: true,
              canUseProReroll: false
            });
            expect(e.metadata.probabilityPolicy).toBe("single_attempt");
            expect(e.metadata.preRoll).toBeUndefined();
            expect(e.contextualImpact).toBeUndefined();
          }
          sum += e.delta;
        }
        expect(sum).toBeCloseTo(0, 12);
      }
    }
  );
  it.each(["before_choice", "before_replacement", "unknown_gate"])(
    "retains the first draw through %s",
    (where) => {
      const replay = make(),
        events = replay.turns[0]!.events;
      events.splice(where === "before_choice" ? 1 : 2, 0, {
        type: "unknown",
        sourceTag: "EventUnknownRerollPolicy",
        id: "unknown-policy",
        sourceIndex: 2,
        payload: {}
      });
      if (where === "unknown_gate") events[1]!.payload!.Used = 0;
      events.forEach((e, i) => (e.sourceIndex = i + 1));
      replay.turns[0]!.eventCount = events.length;
      const r = analyze(replay),
        original = r.events.find((e) => e.metadata.numericOriginal)!;
      expect(original).toBeDefined();
      expect(original.delta).toBeCloseTo(-2 / 3, 12);
      expect(original.metadata.rerollDraws).toBeUndefined();
      expect(r.events.filter((e) => e.scoringStatus === "scored")).toHaveLength(
        1
      );
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it.each([0, 1])(
    "keeps a complete ordinary choice%s with its existing score owner",
    (used) => {
      const replay = make();
      const es = replay.turns[0]!.events;
      es[1]!.payload!.Used = used;
      if (!used) {
        es[2]!.payload!.Status = 1;
        es[2]!.payload!.NewRoll = 0;
        es[2]!.payload!.Outcome = 0;
        (es[2]!.payload!.Dice as { Die: { Value: number } }).Die.Value = 1;
      }
      const r = analyze(replay),
        score = r.events.find((e) => e.scoringStatus === "scored")!;
      expect(r.events.some((e) => e.metadata.numericOriginal)).toBe(false);
      expect(score.metadata.sourceTag).toBe("ResultRoll");
      expect(score.delta).toBeCloseTo(used ? -1 / 3 : -2 / 3, 12);
      expect(r.coverage.diceRecords.coveredCount).toBe(used ? 2 : 1);
    }
  );
  it.each([
    "namespace",
    "face",
    "outcome",
    "status",
    "freshness",
    "owner",
    "controller",
    "modifier",
    "extra_field",
    "ambiguous_roster",
    "multiple_dice",
    "extra_die_field",
    "step",
    "target",
    "availability"
  ])("withholds an unsupported %s original", (field) => {
    const replay = prefix(),
      q = replay.turns[0]!.events[0]!,
      roll = q.payload!.RollInfos as Record<string, unknown>;
    if (field === "namespace") replay.replayVersion = "unknown";
    if (field === "face")
      (roll.Dice as { Die: { Value: number } }).Die.Value = 7;
    if (field === "outcome") roll.Outcome = 1;
    if (field === "status") roll.Status = 2;
    if (field === "freshness") roll.NewRoll = 0;
    if (field === "owner") {
      q.teamId = "1";
      q.actorTeamId = "1";
      q.attributionConflict = true;
    }
    if (field === "controller") q.payload!.GamerId = 1;
    if (field === "modifier")
      roll.Modifiers = {
        Modifier: {
          PlayerId: 42,
          Skill: 9999,
          Effect: -1,
          ModifierType: 27,
          Value: 1
        }
      };
    if (field === "extra_field") roll.UnknownOriginalPolicy = 1;
    if (field === "multiple_dice")
      roll.Dice = {
        Die: [
          { DieType: 0, Value: 1 },
          { DieType: 0, Value: 1 }
        ]
      };
    if (field === "extra_die_field")
      roll.Dice = { Die: { DieType: 0, Value: 1, Selected: 1 } };
    if (field === "step") q.stepType = 999;
    if (field === "target") {
      q.targetId = "7";
      q.stepTargetId = "7";
    }
    if (field === "availability") q.payload!.CanUseTeamReroll = 2;
    if (field === "ambiguous_roster") replay.playerOwnershipKeys!.push("1:42");
    const r = analyze(replay);
    expect(r.events.some((e) => e.metadata.numericOriginal)).toBe(false);
    expect(r.events.some((e) => e.scoringStatus === "scored")).toBe(false);
    expect(r.verdict.luckierTeam).toBe("unknown");
  });
  it.each([
    "missing_receipt",
    "controller",
    "path",
    "freshness",
    "face",
    "target",
    "policy",
    "future_choice",
    "context",
    "spend",
    "reroll_policy",
    "original_dice",
    "formula"
  ])("rejects the specific embedded-original invariant for %s", (field) => {
    const r = analyze(prefix()),
      e = r.events.find((e) => e.metadata.numericOriginal)!,
      record = r.diceRecords.find((d) => d.eventId === e.id)!;
    if (field === "missing_receipt") delete e.metadata.numericOriginal;
    if (field === "controller") e.metadata.numericOriginal!.gamerId = 1;
    if (field === "path") record.path = ["Dice"];
    if (field === "freshness") record.newRoll = 0;
    if (field === "face") record.dice[0]!.value = 2;
    if (field === "target") e.metadata.difficulty = 4;
    if (field === "policy") e.metadata.probabilityPolicy = "two_attempt";
    if (field === "future_choice")
      e.metadata.rerollDecisionId = "future-choice";
    if (field === "spend") e.metadata.teamRerollsSpent = 1;
    if (field === "reroll_policy") e.metadata.rerollPolicy = "invented policy";
    if (field === "original_dice") e.metadata.originalDice = [1];
    if (field === "formula")
      e.explainability.formulaSummary = "uses a future policy";
    if (field === "context")
      e.metadata.preRoll = LuckReportSchema.parse(
        analyzeReplayLuck(parseReplayXml(contextReplayXml()))
      ).events.find((x) => x.metadata.preRoll)!.metadata.preRoll;
    r.keyMoments = r.events
      .filter((e) => e.scoringStatus === "scored")
      .sort((a, b) => Math.abs(b.weightedDelta) - Math.abs(a.weightedDelta));
    const checked = LuckReportSchema.safeParse(r);
    expect(checked.success).toBe(false);
    if (!checked.success)
      expect(
        checked.error.issues.some((i) =>
          i.message.includes("An embedded numeric original must bind")
        )
      ).toBe(true);
  });
});

describe("adjacent cached original menus", () => {
  it.each([0, 1])(
    "retains choice%s support while repeated menus add no dice",
    (used) => {
      for (const count of [1, 2])
        for (const face of [1, 6]) {
          const replay = make(),
            es = replay.turns[0]!.events,
            q = es[0]!;
          const copies = Array.from({ length: count }, (_, i) => {
            const copy = structuredClone(q);
            copy.id = `menu-copy-${i}`;
            copy.locator!.messageIndex = i + 1;
            return copy;
          });
          es.splice(1, 0, ...copies);
          es.forEach((e, i) => (e.sourceIndex = i + 1));
          replay.turns[0]!.eventCount = es.length;
          es.at(-2)!.payload!.Used = used;
          const last = es.at(-1)!;
          last.payload!.Status = used ? 2 : 1;
          last.payload!.NewRoll = used ? 1 : 0;
          last.payload!.Outcome = used ? Number(face >= 3) : 0;
          (last.payload!.Dice as { Die: { Value: number } }).Die.Value = used
            ? face
            : 1;
          const report = analyze(replay),
            score = report.events.find((e) => e.scoringStatus === "scored")!;
          expect(
            report.events.filter((e) => e.scoringStatus === "scored")
          ).toHaveLength(1);
          expect(score.delta).toBeCloseTo(
            used ? Number(face >= 3) - 4 / 3 : -2 / 3,
            12
          );
          expect(report.events.some((e) => e.metadata.numericOriginal)).toBe(
            false
          );
          expect(
            report.events.filter((e) => e.metadata.numericOriginalCopy)
          ).toHaveLength(count);
          expect(report.coverage.diceRecords.coveredCount).toBe(used ? 2 : 1);
          expect(report.coverage.diceRecords.summaryCount).toBe(
            count + (used ? 0 : 1)
          );
          expect(report.coverage.diceRecords.unscoredCount).toBe(0);
          if (used) {
            expect(score.metadata.rerollDraws!.initialSourceId).toBe(q.id);
            expect(score.probabilitySuccess).toBeCloseTo(8 / 9, 12);
          }
        }
    }
  );
  it.each(["changed_die", "changed_controller", "interrupted"])(
    "withholds an ambiguous %s repetition and preserves the earlier original",
    (field) => {
      const replay = make(),
        es = replay.turns[0]!.events,
        copy = structuredClone(es[0]!);
      copy.id = "ambiguous-menu";
      copy.locator!.messageIndex = 1;
      if (field === "changed_die")
        (
          copy.payload!.RollInfos as { Dice: { Die: { Value: number } } }
        ).Dice.Die.Value = 2;
      if (field === "changed_controller") copy.payload!.GamerId = 1;
      es.splice(1, 0, copy);
      if (field === "interrupted")
        es.splice(1, 0, {
          type: "unknown",
          sourceTag: "EventUnknownMenuPolicy",
          id: "interruption",
          payload: {}
        });
      es.forEach((e, i) => (e.sourceIndex = i + 1));
      replay.turns[0]!.eventCount = es.length;
      const report = analyze(replay),
        score = report.events.find((e) => e.metadata.numericOriginal)!;
      expect(score.delta).toBeCloseTo(-2 / 3, 12);
      expect(
        report.events.filter((e) => e.scoringStatus === "scored")
      ).toHaveLength(1);
      expect(report.events.some((e) => e.metadata.numericOriginalCopy)).toBe(
        false
      );
      expect(report.events.some((e) => e.metadata.rerollDraws)).toBe(false);
    }
  );
});

it.each([0, 1])(
  "composes emitted originals with repeated menus for choice%s",
  (used) => {
    const replay = numericRerollPolicy({
        family: 2,
        target: 3,
        first: 1,
        second: 6,
        use: !!used,
        emitted: true
      }),
      es = replay.turns[0]!.events;
    const q = es[1]!,
      copy = structuredClone(q);
    copy.id = "emitted-menu-copy";
    copy.locator!.messageIndex = q.locator!.messageIndex! + 1;
    es.splice(2, 0, copy);
    es.forEach((e, i) => (e.sourceIndex = i + 1));
    replay.turns[0]!.eventCount = es.length;
    const r = analyze(replay);
    expect(r.events.filter((e) => e.scoringStatus === "scored")).toHaveLength(
      1
    );
    const score = r.events.find((e) => e.scoringStatus === "scored")!;
    expect(score.delta).toBeCloseTo(used ? -1 / 3 : -2 / 3, 12);
    expect(r.coverage.diceRecords.coveredCount).toBe(used ? 2 : 1);
    expect(r.coverage.diceRecords.summaryCount).toBe(used ? 2 : 3);
    if (used)
      expect(score.metadata.rerollDraws!.initialSourceId).toBe(es[0]!.id);
  }
);

it.each(["question", "initial"])(
  "keeps an unanswered original across an unrelated source action before another %s",
  (kind) => {
    const replay = prefix(),
      es = replay.turns[0]!.events,
      q = es[0]!;
    const later =
      kind === "question"
        ? structuredClone(q)
        : {
            ...structuredClone(q),
            type: "roll" as const,
            sourceTag: "ResultRoll",
            payload: structuredClone(
              q.payload!.RollInfos as Record<string, unknown>
            ),
            rollType: 2
          };
    later.id = "later-initial";
    later.sourceIndex = 2;
    later.actionId = "continuation-action";
    later.sequenceId = "continuation-sequence";
    later.locator = { ...later.locator!, replayStep: 2 };
    es.push(later);
    replay.turns[0]!.eventCount = es.length;
    const report = analyze(replay);
    expect(
      report.events.filter((e) => e.scoringStatus === "scored")
    ).toHaveLength(1);
    expect(
      report.events.find((e) => e.metadata.numericOriginal)!.delta
    ).toBeCloseTo(-2 / 3, 12);
    expect(report.verdict.luckierTeam).toBe("unknown");
  }
);

it("allows independent next checks after an observed terminal result", () => {
  const a = make(),
    b = make();
  for (const e of b.turns[0]!.events) {
    e.id = `next-${e.id}`;
    e.actionId = `next-${e.actionId}`;
    e.sequenceId = `next-${e.sequenceId}`;
    e.locator!.replayStep! += 2;
  }
  a.turns[0]!.events.push(...b.turns[0]!.events);
  a.turns[0]!.events.forEach((e, i) => (e.sourceIndex = i + 1));
  a.turns[0]!.eventCount = a.turns[0]!.events.length;
  const r = analyze(a);
  expect(r.events.filter((e) => e.scoringStatus === "scored")).toHaveLength(2);
  expect(r.events.filter((e) => e.metadata.rerollDraws)).toHaveLength(2);
  expect(r.coverage.diceRecords.coveredCount).toBe(4);
});

it("withholds a first-draw claim after an unknown policy inside its source action", () => {
  const replay = prefix(),
    q = replay.turns[0]!.events[0]!;
  q.sourceIndex = 2;
  q.locator!.messageIndex = 1;
  replay.turns[0]!.events.unshift({
    type: "unknown",
    sourceTag: "EventUnknownBeforeOriginal",
    id: "unknown-before",
    actionId: q.actionId,
    sourceIndex: 1,
    payload: {}
  });
  replay.turns[0]!.eventCount = 2;
  const r = analyze(replay);
  expect(r.events.some((e) => e.scoringStatus === "scored")).toBe(false);
  expect(r.events.some((e) => e.metadata.numericOriginal)).toBe(false);
});

it.each(["Dice", "unknown_summary", "failed_summary"])(
  "unknown Move outcome %s before the first die prevents promotion",
  (kind) => {
    const replay = prefix(),
      q = replay.turns[0]!.events[0]!;
    const payload: Record<string, unknown> = {
      Moved: 1,
      TentacleUsed: 0,
      FumbleRooskieUsed: 0,
      Pushbacks: "",
      Rolls: ""
    };
    if (kind === "Dice") payload.Dice = { Die: { DieType: 0, Value: 6 } };
    else
      payload.Rolls = {
        RollSummary: {
          RollType: kind === "unknown_summary" ? 999 : 1,
          Outcome: kind === "failed_summary" ? 0 : 1
        }
      };
    q.sourceIndex = 2;
    q.locator!.messageIndex = 1;
    replay.turns[0]!.events.unshift({
      type: "unknown",
      sourceTag: "ResultMoveOutcome",
      id: "unknown-move-policy",
      sourceIndex: 1,
      actionId: q.actionId,
      payload
    });
    replay.turns[0]!.eventCount = 2;
    expect(analyze(replay).events.some((e) => e.metadata.numericOriginal)).toBe(
      false
    );
  }
);

it.each(["no_roll", "earlier_roll"])(
  "unknown fields inside a known %s prefix prevent first-die admission",
  (kind) => {
    const replay = prefix(),
      q = replay.turns[0]!.events[0]!;
    const payload =
      kind === "no_roll"
        ? { UnknownPolicy: 1 }
        : {
            Status: 1,
            NewRoll: 1,
            RollType: 1,
            Requirement: 2,
            Difficulty: 2,
            Outcome: 1,
            Dice: { Die: { DieType: 0, Value: 6 } },
            UnknownPolicy: 1
          };
    q.sourceIndex = 2;
    q.locator!.messageIndex = 1;
    replay.turns[0]!.events.unshift({
      type: "unknown",
      sourceTag: kind === "no_roll" ? "ResultNoRollSuccess" : "ResultRoll",
      rollType: kind === "no_roll" ? undefined : 1,
      id: "unknown-prefix-field",
      sourceIndex: 1,
      actionId: q.actionId,
      payload
    });
    replay.turns[0]!.eventCount = 2;
    expect(analyze(replay).events.some((e) => e.metadata.numericOriginal)).toBe(
      false
    );
  }
);

it.each(["original", "previous", "freshness", "alias"])(
  "rejects a forged cached-menu %s receipt",
  (kind) => {
    const replay = make(),
      es = replay.turns[0]!.events,
      copy = structuredClone(es[0]!);
    copy.id = "copied-question";
    copy.locator!.messageIndex = 1;
    es.splice(1, 0, copy);
    es.forEach((e, i) => (e.sourceIndex = i + 1));
    replay.turns[0]!.eventCount = es.length;
    const report = analyze(replay),
      e = report.events.find((e) => e.metadata.numericOriginalCopy)!,
      r = report.diceRecords.find(
        (d) => d.parentSourceId === e.metadata.sourceId
      )!;
    if (kind === "original")
      e.metadata.numericOriginalCopy!.originalSourceId = e.metadata.sourceId!;
    if (kind === "previous")
      e.metadata.numericOriginalCopy!.previousSourceId = es.at(-1)!.id!;
    if (kind === "freshness") r.newRoll = 0;
    if (kind === "alias")
      r.aliasOf = report.diceRecords.find(
        (d) => d.parentSourceId === es.at(-1)!.id
      )!.id;
    const checked = LuckReportSchema.safeParse(report);
    expect(checked.success).toBe(false);
    if (!checked.success)
      expect(
        checked.error.issues.some((i) =>
          i.message.includes("A copied numeric question must retain")
        )
      ).toBe(true);
  }
);
