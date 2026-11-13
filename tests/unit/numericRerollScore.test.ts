import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { numericRerollPolicy } from "../helpers/numericRerollPolicy";
const analyze = (o: Parameters<typeof numericRerollPolicy>[0]) =>
  LuckReportSchema.parse(analyzeReplayLuck(numericRerollPolicy(o)));
describe("NUF-029 actual-draw reroll accounting", () => {
  it.each([1, 2, 4, 7])(
    "has zero mean for family%s over every target and adaptive choice policy",
    (family) => {
      for (const target of [2, 3, 4, 5, 6])
        for (const emitted of [false, true])
          for (const policy of ["all", "odd", "none"]) {
            let total = 0,
              successes = 0,
              observedDraws = 0;
            for (let first = 1; first <= 6; first++)
              for (let second = 1; second <= 6; second++) {
                const use =
                    policy === "all" || (policy === "odd" && first % 2 === 1),
                  r = analyze({ family, target, first, second, use, emitted });
                const rolls = r.events.filter(
                  (e) => e.scoringStatus === "scored"
                );
                expect(rolls).toHaveLength(1);
                const e = rolls[0]!;
                const p = (7 - target) / 6,
                  expected =
                    Number(first >= target) -
                    p +
                    (first < target && use ? Number(second >= target) - p : 0);
                expect(e.delta).toBeCloseTo(expected, 12);
                total += e.delta;
                successes += Number(
                  first >= target || (use && second >= target)
                );
                observedDraws += first < target && use ? 2 : 1;
                expect(r.coverage.diceRecords.coveredCount).toBe(
                  first < target && use ? 2 : 1
                );
                if (first < target && use) {
                  expect(e.probabilitySuccess).toBeCloseTo(
                    1 - ((target - 1) / 6) ** 2,
                    12
                  );
                  expect(e.metadata.rerollDraws).toMatchObject({
                    initialFace: first,
                    baseSuccessChance: p,
                    initialDelta: -p,
                    replacementDelta: Number(second >= target) - p
                  });
                }
              }
            expect(total / 36).toBeCloseTo(0, 12);
            if (policy === "all")
              expect(successes).toBe(36 - (target - 1) ** 2);
            expect(observedDraws).toBeGreaterThanOrEqual(36);
          }
    }
  );
  it.each([2, 4, 7])(
    "has zero mean for every fresh own-skill replacement in family%s",
    (family) => {
      for (const target of [2, 3, 4, 5, 6]) {
        let sum = 0;
        for (let first = 1; first <= 6; first++)
          for (let second = 1; second <= 6; second++) {
            const r = analyze({
                family,
                target,
                first,
                second,
                use: true,
                resource: "skill"
              }),
              e = r.events.find((e) => e.scoringStatus === "scored")!;
            expect(
              r.events.filter((e) => e.scoringStatus === "scored")
            ).toHaveLength(1);
            sum += e.delta;
            if (first < target) expect(e.metadata.teamRerollsSpent).toBe(0);
          }
        expect(sum / 36).toBeCloseTo(0, 12);
      }
    }
  );
});

describe("numeric reroll source and receipt integrity", () => {
  it.each([
    "missing",
    "base",
    "first_face",
    "first_delta",
    "replacement_delta",
    "old_compound_delta",
    "formula",
    "initial_source",
    "original_link",
    "first_metadata_face",
    "first_candidate",
    "first_owner",
    "offer_eligibility",
    "offer_controller",
    "decision_used",
    "decision_controller",
    "resource",
    "spend",
    "original_dice",
    "first_freshness",
    "actual_outcome"
  ])("rejects a forged %s while naming the draw invariant", (field) => {
    const r = analyze({
        family: 2,
        target: 2,
        first: 1,
        second: 6,
        use: true,
        emitted: true
      }),
      e = r.events.find((e) => e.metadata.rerollDraws)!,
      d = e.metadata.rerollDraws!,
      sources = new Map(r.events.map((e) => [e.metadata.sourceId, e])),
      first = sources.get(d.initialSourceId)!,
      q = sources.get(e.metadata.rerollQuestionId!)!,
      choice = sources.get(e.metadata.rerollDecisionId!)!;
    if (field === "missing") delete e.metadata.rerollDraws;
    if (field === "base") d.baseSuccessChance = 0.5;
    if (field === "first_face") d.initialFace = 2;
    if (field === "first_delta") d.initialDelta = 0;
    if (field === "replacement_delta") d.replacementDelta = 0;
    if (field === "old_compound_delta") {
      e.delta = 1 - 35 / 36;
      e.weightedDelta = e.delta * e.explainability.weight;
    }
    if (field === "formula")
      e.explainability.formulaSummary =
        "A composite chance erased the first failure";
    if (field === "initial_source") d.initialSourceId = e.metadata.sourceId!;
    if (field === "original_link") delete e.metadata.rerollOriginalId;
    if (field === "first_metadata_face") first.metadata.dice = [2];
    if (field === "first_candidate") first.metadata.isRollCandidate = true;
    if (field === "first_owner") first.teamId = "1";
    if (field === "offer_eligibility")
      q.metadata.rerollOffer!.canUseTeamReroll = false;
    if (field === "offer_controller") q.metadata.rerollOffer!.gamerId = 1;
    if (field === "decision_used")
      choice.metadata.teamRerollDecision!.used = false;
    if (field === "decision_controller")
      choice.metadata.teamRerollDecision!.gamerId = 1;
    if (field === "resource") {
      e.metadata.rerollResource = "skill";
      e.metadata.rerollSkill = "Dodge";
      e.metadata.teamRerollsSpent = 0;
    }
    if (field === "spend") e.metadata.teamRerollsSpent = 0;
    if (field === "original_dice")
      e.metadata.originalDice = { Die: { DieType: 0, Value: 2 } };
    if (field === "first_freshness")
      r.diceRecords.find(
        (x) => x.parentSourceId === d.initialSourceId && x.path[0] === "Dice"
      )!.newRoll = 0;
    if (field === "actual_outcome") {
      e.actualSuccess = false;
      e.metadata.outcomeCode = 0;
      d.replacementDelta = -d.baseSuccessChance;
      e.delta = d.initialDelta + d.replacementDelta;
      e.weightedDelta = e.delta * e.explainability.weight;
      e.explainability.formulaSummary =
        "weighted delta = [(0 - 0.833) + (0 - 0.833)] x 1.10 = -1.833";
    }
    const checked = LuckReportSchema.safeParse(r);
    expect(checked.success).toBe(false);
    if (!checked.success)
      expect(
        checked.error.issues.some((i) =>
          i.message.includes("Numeric reroll luck must count")
        )
      ).toBe(true);
  });
  it.each([
    "unknown_before_offer",
    "unknown_after_offer",
    "unknown_before_replacement",
    "different_initial",
    "duplicate_initial",
    "changed_owner",
    "wrong_gamer",
    "unoffered",
    "already_replacement",
    "invalid_final",
    "unsupported_version"
  ])("withholds a %s chain and preserves a valid earlier die", (field) => {
    const replay = numericRerollPolicy({
        family: 2,
        target: 3,
        first: 1,
        second: 6,
        use: true,
        emitted: true
      }),
      events = replay.turns[0]!.events,
      original = events[0]!,
      q = events[1]!,
      choice = events[2]!,
      last = events[3]!;
    if (field.startsWith("unknown_")) {
      const index =
        field === "unknown_before_offer"
          ? 1
          : field === "unknown_after_offer"
            ? 2
            : 3;
      events.splice(index, 0, {
        type: "unknown",
        sourceTag: "EventUnknownRerollReaction",
        id: "unknown-reaction",
        payload: {}
      });
    }
    if (field === "different_initial")
      (
        q.payload!.RollInfos as { Dice: { Die: { Value: number } } }
      ).Dice.Die.Value = 2;
    if (field === "duplicate_initial") {
      const copy = structuredClone(original);
      copy.id = "duplicate-initial";
      copy.locator!.messageIndex = 1;
      q.locator!.messageIndex = 2;
      events.splice(1, 0, copy);
    }
    if (field === "changed_owner") {
      choice.actorTeamId = "1";
      choice.teamId = "1";
      choice.attributionConflict = true;
    }
    if (field === "wrong_gamer") choice.payload!.GamerId = 1;
    if (field === "unoffered") q.payload!.CanUseTeamReroll = 0;
    if (field === "already_replacement") original.payload!.Status = 2;
    if (field === "invalid_final")
      (last.payload!.Dice as { Die: { Value: number } }).Die.Value = 7;
    if (field === "unsupported_version") replay.replayVersion = "unsupported";
    events.forEach((e, i) => (e.sourceIndex = i + 1));
    replay.turns[0]!.eventCount = events.length;
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(r.events.some((e) => e.metadata.rerollDraws)).toBe(false);
    if (!["already_replacement", "unsupported_version"].includes(field)) {
      const e = r.events.find((e) => e.metadata.sourceId === original.id)!;
      expect(e.scoringStatus).toBe("scored");
      expect(e.delta).toBeCloseTo(-2 / 3, 12);
      expect(e.metadata.mergedRerollAnchorId).toBeUndefined();
    }
    expect(r.verdict.luckierTeam).toBe("unknown");
  });
  it.each(["team", "skill"] as const)(
    "retains the %s prefix before a future unknown, known copy, or unsupported third emission",
    (resource) => {
      const options = {
          family: 2,
          target: 2,
          first: 1,
          second: 6,
          use: true,
          resource
        },
        base = analyze(options),
        expected = base.events.find((e) => e.metadata.rerollDraws)!;
      for (const suffix of ["unknown", "summary", "fresh"]) {
        const replay = numericRerollPolicy(options),
          events = replay.turns[0]!.events,
          last = events.at(-1)!;
        if (suffix === "unknown")
          events.push({
            type: "unknown",
            sourceTag: "EventUnknownFutureRerollPolicy",
            id: "unknown-future",
            payload: {}
          });
        else {
          const extra = structuredClone(last);
          extra.id = `extra-${suffix}`;
          extra.locator!.messageIndex! += 1;
          extra.payload!.Status = 1;
          extra.payload!.NewRoll = suffix === "summary" ? 0 : 1;
          events.push(extra);
        }
        events.forEach((e, i) => (e.sourceIndex = i + 1));
        replay.turns[0]!.eventCount = events.length;
        const r = LuckReportSchema.parse(analyzeReplayLuck(replay)),
          e = r.events.find((e) => e.metadata.rerollDraws)!;
        expect(e.metadata.rerollDraws).toEqual(expected.metadata.rerollDraws);
        expect(e.weightedDelta).toBe(expected.weightedDelta);
        expect(
          r.events.filter((e) => e.scoringStatus === "scored")
        ).toHaveLength(1);
        if (suffix === "summary") {
          expect(
            r.diceRecords.filter((d) => d.disposition === "covered_roll")
          ).toHaveLength(2);
          expect(
            r.diceRecords.filter((d) => d.disposition === "summary")
          ).toHaveLength(1);
          expect(r.events.at(-1)!.metadata.isRollCandidate).toBe(false);
        }
        if (suffix === "fresh")
          expect(r.events.at(-1)!.scoringStatus).toBe("excluded");
      }
    }
  );
});

describe("numeric own-skill decision conservation", () => {
  it.each([2, 4, 7])(
    "rejects reuse of one family%s skill choice across two checks",
    (family) => {
      const options = {
        family,
        target: 2,
        first: 1,
        second: 6,
        use: true,
        resource: "skill" as const
      };
      const replay = numericRerollPolicy(options),
        second = numericRerollPolicy(options);
      for (const e of second.turns[0]!.events) {
        e.id = `second-${e.id}`;
        e.sourceIndex! += 100;
        e.actionId = "second-action";
        e.sequenceId = "second-sequence";
        e.locator!.replayStep = 2;
      }
      replay.turns[0]!.events.push(...second.turns[0]!.events);
      replay.turns[0]!.eventCount = replay.turns[0]!.events.length;
      const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
      const checks = report.events.filter((e) => e.metadata.rerollDraws);
      expect(checks).toHaveLength(2);
      const initial = report.events.find(
        (e) => e.metadata.sourceId === checks[1]!.metadata.rerollOriginalId
      )!;
      checks[1]!.metadata.rerollDecisionId =
        checks[0]!.metadata.rerollDecisionId;
      checks[1]!.metadata.actionId = checks[0]!.metadata.actionId;
      initial.metadata.actionId = checks[0]!.metadata.actionId;
      // Keep the moment copies coherent so rejection must name the actual
      // duplicate skill decision, not a stale aggregate/moment side effect.
      report.keyMoments = report.events
        .filter((e) => e.scoringStatus === "scored")
        .sort((a, b) => Math.abs(b.weightedDelta) - Math.abs(a.weightedDelta));
      const checked = LuckReportSchema.safeParse(report);
      expect(checked.success).toBe(false);
      if (!checked.success)
        expect(
          checked.error.issues.some(
            (i) =>
              i.message ===
              "A numeric reroll decision must belong to exactly one check."
          )
        ).toBe(true);
    }
  );
});

describe("numeric reroll decision source order", () => {
  it.each([
    { resource: "team", where: "before" },
    { resource: "team", where: "after" },
    { resource: "team", where: "missing" },
    { resource: "skill", where: "before" },
    { resource: "skill", where: "after" },
    { resource: "skill", where: "missing" }
  ] as const)(
    "rejects a $resource decision with $where source order",
    ({ resource, where }) => {
      const report = analyze({
        family: 2,
        target: 2,
        first: 1,
        second: 6,
        use: true,
        resource
      });
      const roll = report.events.find((e) => e.metadata.rerollDraws)!;
      const choice = report.events.find(
        (e) => e.metadata.sourceId === roll.metadata.rerollDecisionId
      )!;
      if (where === "missing") delete choice.metadata.sourceIndex;
      else
        choice.metadata.sourceIndex =
          where === "before" ? 0 : roll.metadata.sourceIndex! + 10;
      const checked = LuckReportSchema.safeParse(report);
      expect(checked.success).toBe(false);
      if (!checked.success)
        expect(
          checked.error.issues.some((i) =>
            i.message.includes("Numeric reroll luck must count")
          )
        ).toBe(true);
    }
  );
});

describe("unindexed or contradictory raw reroll order", () => {
  it.each(["team", "skill"] as const)(
    "withholds the %s compound without erasing valid earlier dice",
    (resource) => {
      for (const where of ["missing", "before", "after"]) {
        const replay = numericRerollPolicy({
          family: 2,
          target: 2,
          first: 1,
          second: 6,
          use: true,
          resource
        });
        const events = replay.turns[0]!.events,
          choice = events[1]!,
          last = events[2]!;
        if (where === "missing") delete choice.sourceIndex;
        else
          choice.sourceIndex = where === "before" ? 0 : last.sourceIndex! + 10;
        const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
        expect(report.events.some((e) => e.metadata.rerollDraws)).toBe(false);
        if (resource === "skill") {
          const original = report.events.find(
            (e) => e.metadata.sourceId === events[0]!.id
          )!;
          expect(original.scoringStatus).toBe("scored");
          expect(original.delta).toBeCloseTo(-5 / 6, 12);
        }
        expect(report.verdict.luckierTeam).toBe("unknown");
      }
    }
  );
});

it.each([1, 2, 4, 7])(
  "rejects a coherently relabeled family%s numeric score",
  (family) => {
    const r = analyze({ family, target: 3, first: 1, second: 6, use: true }),
      e = r.events.find((e) => e.scoringStatus === "scored")!,
      old = e.type;
    e.type =
      family === 1 ? "armor_break" : family === 2 ? "ball_handling" : "dodge";
    r.coverage.scoredByType[old]--;
    r.coverage.scoredByType[e.type]++;
    const team = r.teams.find((t) => t.teamId === e.teamId)!;
    const before =
        family === 1 ? "movementRisk" : family === 2 ? "dodge" : "ballHandling",
      after =
        family === 1 ? "armorBreak" : family === 2 ? "ballHandling" : "dodge";
    team.categoryScores[before] -= e.weightedDelta;
    team.categoryScores[after] += e.weightedDelta;
    r.keyMoments = r.events
      .filter((e) => e.scoringStatus === "scored")
      .sort((a, b) => Math.abs(b.weightedDelta) - Math.abs(a.weightedDelta));
    const parsed = LuckReportSchema.safeParse(r);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(
        parsed.error.issues.some((i) =>
          i.message.includes("A scored numeric check's category must match")
        )
      ).toBe(true);
  }
);
