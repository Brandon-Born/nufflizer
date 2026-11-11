import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";

const replay = (name: string) =>
  parseReplayXml(
    decodeReplayInput(readFileSync(`demo-replays/${name}`, "utf8")).xml
  );

const fallAt = (
  report: ReturnType<typeof analyzeReplayLuck>,
  replayStep: number,
  rollType = 1
) =>
  report.events.find(
    (event) =>
      event.metadata.locator?.replayStep === replayStep &&
      event.metadata.rollType === rollType
  )!;

describe("observed movement fall, damage and turnover (NUF-018)", () => {
  it("links the full held-out Rush chain in demo8 and sums only verified chance", () => {
    const report = analyzeReplayLuck(replay("demo8.bbr"));
    // Independent stdlib decode of 463/1: step6 Rush2+ on 1, failure in
    // ResultMoveOutcome. Step7 applied self-damage at [5,3], armor9+ on
    // [6,3], injury [6,6], casualty D16=5 and removal. 463/2 Reason2.
    const rush = fallAt(report, 463);
    expect(rush).toMatchObject({
      playerId: "44",
      probabilitySuccess: 5 / 6,
      actualSuccess: false,
      metadata: {
        locator: {
          replayStep: 463,
          childIndex: 1,
          stepIndex: 6,
          messageIndex: 0
        },
        movementFall: {
          turnoverChildIndex: 2,
          armorHeld: false,
          unscoredDamageRolls: 2,
          playerRemoved: true
        }
      }
    });
    expect(rush.metadata.movementFall!.diceContribution).toBeCloseTo(
      -5 / 6 - 26 / 36,
      12
    );
    const step = report.damageSteps.find(
      (damage) => damage.actionId === rush.metadata.movementFall!.damageActionId
    )!;
    expect(step).toMatchObject({
      scoredRolls: 1,
      unscoredRolls: 2,
      contextRecords: 1
    });
    expect(
      step.eventIds.map(
        (id) =>
          report.events.find((event) => event.id === id)?.metadata.sourceTag
      )
    ).toEqual([
      "ResultRoll",
      "ResultInjuryRoll",
      "ResultCasualtyRoll",
      "ResultPlayerRemoval"
    ]);
    expect(rush.contextualImpact).toBeUndefined();
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    rush.metadata.movementFall!.diceContribution++;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it.each([
    {
      demo: "demo8.bbr",
      step: 331,
      odds: 1 / 2,
      spent: 0,
      armorHeld: false,
      unscoredDamageRolls: 1,
      subtotal: -1.1 / 2 - 30 / 36
    },
    {
      demo: "demo4.bbr",
      step: 462,
      odds: 3 / 4,
      spent: 1,
      armorHeld: true,
      unscoredDamageRolls: 0,
      subtotal: (-1.1 * 3) / 4 + 15 / 36
    }
  ])(
    "counts one resolved Dodge with $spent team rerolls spent ($demo)",
    (example) => {
      // Independent decode: both questions show Dodge4+ on 2. At 331/1
      // the coach keeps 2, armor10+ breaks on [5,6] and injury leads to
      // removal. At 462/1 the coach uses a reroll, rolls 1 and armor8+
      // holds on [4,1]. Both 331/2 and 462/2 explicitly report Reason2.
      const input = replay(example.demo);
      const report = analyzeReplayLuck(input);
      const dodge = fallAt(report, example.step, 2);
      expect(dodge).toMatchObject({
        probabilitySuccess: example.odds,
        actualSuccess: false,
        metadata: {
          teamRerollsSpent: example.spent,
          movementFall: {
            armorHeld: example.armorHeld,
            unscoredDamageRolls: example.unscoredDamageRolls
          }
        }
      });
      expect(dodge.metadata.movementFall!.diceContribution).toBeCloseTo(
        example.subtotal,
        12
      );
      const question = input.turns
        .flatMap((turn) => turn.events)
        .find((event) => event.id === dodge.metadata.rerollQuestionId);
      expect(question).toMatchObject({
        sourceTag: "QuestionTeamRerollUsage",
        locator: { replayStep: example.step - 1, childIndex: 1 }
      });
      expect(
        report.events.filter(
          (event) =>
            event.metadata.sourceId === question!.id &&
            event.metadata.isRollCandidate
        )
      ).toHaveLength(0);
      expect(LuckReportSchema.safeParse(report).success).toBe(true);
    }
  );

  it.each([
    "manual",
    "different_player",
    "contradictory_summary",
    "intervening_action",
    "duplicate_armor"
  ])(
    "abstains from linking unsupported aftermath (%s) without changing verified dice",
    (change) => {
      const original = replay("demo1.bbr");
      const baseline = analyzeReplayLuck(original);
      // Independent raw case at 342/1 steps7 and 8: Rush2+ on1, armor8+
      // on [6,1] holds, and 342/2 marks the turnover. No removal occurs.
      expect(fallAt(baseline, 342).metadata.movementFall).toMatchObject({
        armorHeld: true,
        unscoredDamageRolls: 0,
        playerRemoved: false
      });
      expect(
        fallAt(baseline, 342).metadata.movementFall!.diceContribution
      ).toBeCloseTo(-5 / 12, 12);
      const turn = original.turns.find(
        (turn) => turn.events.at(-1)?.locator?.replayStep === 342
      )!;
      const end = turn.events.at(-1)!;
      const armor = turn.events.at(-2)!;
      const damage = turn.events.at(-3)!;
      const outcome = turn.events.at(-4)!;
      if (change === "manual") end.reasonCode = 1;
      if (change === "different_player") damage.targetId = "41";
      if (change === "contradictory_summary")
        outcome.payload!.Rolls = { RollSummary: { RollType: 1, Outcome: 1 } };
      if (change === "intervening_action")
        turn.events.splice(-1, 0, { type: "step", sourceTag: "PlayerStep" });
      if (change === "duplicate_armor") {
        // A repeated fresh-looking result cannot anchor a movement chain.
        turn.events.splice(-1, 0, { ...armor, id: "duplicate-armor" });
      }
      const report = analyzeReplayLuck(original);
      expect(fallAt(report, 342).metadata.movementFall).toBeUndefined();
      expect(fallAt(report, 342).weightedDelta).toBe(-5 / 6);
      if (change !== "duplicate_armor")
        expect(report.teams).toEqual(baseline.teams);
    }
  );
});
