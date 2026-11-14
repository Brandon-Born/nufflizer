import { findMentalActivationEnds } from "@/domain/replay/activationEnds";
import { readFileSync } from "node:fs";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { describe, it, expect } from "vitest";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
const report = (id: string) =>
  LuckReportSchema.parse(analyzeReplayLuck(parseReplayXml(lonerDriveXml(id))));
describe("source-backed Loner3+ gates and conditional fresh block pools", () => {
  it("scores the fresh full pool conditionally after a passed3+ gate", () => {
    const r = report("loner3_block_pass");
    const gate = r.events.find((e) => e.metadata.lonerGate)!;
    expect(gate).toMatchObject({
      actualSuccess: true,
      probabilitySuccess: null,
      weightedDelta: 0,
      metadata: {
        dice: [5],
        teamRerollsSpent: 1,
        lonerGate: { skillId: 1008, threshold: 3, passed: true }
      }
    });
    const pools = r.events.filter(
      (e) => !!e.metadata.block
    );
    expect(pools).toHaveLength(2);
    expect(pools[1]!.metadata.block).toMatchObject({
      reroll: "loner",
      lonerGateSourceId: gate.metadata.sourceId,
      pool: { faces: [1, 2], rolledIndexes: [0, 1] }
    });
    expect(pools[1]!.probabilitySuccess).toBeNull();
    expect(pools[1]!.metadata.block!.distribution).toEqual([
      1 / 36,
      3 / 36,
      12 / 36,
      9 / 36,
      11 / 36
    ]);

    expect(pools[1]!.weightedDelta).toBe(0);
    expect(pools[1]!.scoringStatus).toBe("excluded");
  });
  it("keeps a failed3+ gate's repeated pool out of fresh randomness", () => {
    const r = report("loner3_block_fail");
    const gate = r.events.find((e) => e.metadata.lonerGate)!;
    expect(gate).toMatchObject({
      actualSuccess: false,
      metadata: {
        dice: [2],
        lonerGate: { skillId: 1008, threshold: 3, passed: false },
        teamRerollsSpent: 1
      }
    });
    expect(
      r.events.filter((e) => !!e.metadata.block)
    ).toHaveLength(1);
    expect(r.events.some((e) => e.metadata.block?.reroll === "loner")).toBe(
      false
    );
  });
  it("accepts the threshold boundary3 and independently observed two-die Defender Down pool", () => {
    const r = report("loner3_boundary_pass");
    expect(r.events.find((e) => e.metadata.lonerGate)?.metadata.dice).toEqual([
      3
    ]);
    const pool = r.events.find((e) => e.metadata.block?.reroll === "loner")!;
    expect(pool.metadata.block?.pool.faces).toEqual([4, 0]);
    expect(pool.probabilitySuccess).toBeNull();
    expect(pool.metadata.block!.distribution[3]!+pool.metadata.block!.distribution[4]!).toBeCloseTo(5/9,12);
    expect(pool.weightedDelta).toBe(0);
  });
  it("applies the same terminal original policy after the observed failed3+ mental gate", () => {
    const r = report("loner3_mental_fail");
    expect(
      r.events.find((e) => e.metadata.activationEnd)?.metadata.activationEnd
        ?.policy
    ).toBe("failed_loner_kept_original");
  });

  it("records a passed3+ mental gate without inventing a failure or a priced replacement", () => {
    const r = report("loner3_mental_pass");
    const gate = r.events.find((e) => e.metadata.lonerGate)!;
    expect(gate.metadata.lonerGate).toMatchObject({
      threshold: 3,
      skillId: 1008,
      passed: true
    });
    expect(gate.metadata.dice).toEqual([5]);
    expect(
      r.events.find((e) => e.metadata.rollType === 34)?.metadata
    ).toMatchObject({ dice: [6], outcomeCode: 1 });
    expect(r.events.some((e) => e.metadata.activationEnd)).toBe(false);
    expect(
      r.events.find((e) => e.metadata.rollType === 34)?.probabilitySuccess
    ).toBeNull();
  });
  it.each([
    "threshold",
    "skill",
    "owner",
    "spent",
    "fresh",
    "face",
    "extra_gate"
  ] as const)("rejects contradictory3+ gate evidence after %s", (change) => {
    const replay = parseReplayXml(lonerDriveXml("loner3_block_pass"));
    const events = replay.turns.flatMap((t) => t.events),
      gate = events.find((e) => e.rollType === 71)!;
    if (change === "threshold") gate.payload!.Requirement = 4;
    if (change === "skill")
      events.find(
        (e) => e.sourceTag === "ResultSkillUsage" && e.payload?.Skill === 1008
      )!.payload!.Skill = 44;
    if (change === "owner") gate.actorTeamId = "0";
    if (change === "spent")
      events.find(
        (e) => e.sourceTag === "ResultTeamRerollUsage"
      )!.payload!.Used = 0;
    if (change === "fresh") gate.payload!.NewRoll = 0;
    if (change === "face")
      gate.payload!.Dice = { Die: { DieType: 0, Value: 2 } };
    if (change === "extra_gate") {
      const t = replay.turns.find((t) => t.events.includes(gate))!;
      t.events.splice(t.events.indexOf(gate) + 1, 0, {
        ...gate,
        id: "duplicate-gate"
      });
    }
    const r = analyzeReplayLuck(replay);
    expect(r.events.some((e) => e.metadata.lonerGate)).toBe(false);
    expect(r.events.some((e) => e.metadata.block?.reroll === "loner")).toBe(
      false
    );
  });
  it.each([
    "partial_indexes",
    "no_offer",
    "unknown_before",
    "unknown_after",
    "different_controller"
  ] as const)("withholds a fresh conditional pool after %s", (change) => {
    const replay = parseReplayXml(lonerDriveXml("loner3_block_pass"));
    const events = replay.turns.flatMap((t) => t.events),
      gate = events.find((e) => e.rollType === 71)!;
    const replacement = events.find(
      (e) => e.sourceTag === "QuestionBlockDice" && e.payload?.RollStatus === 2
    )!;
    if (change === "partial_indexes")
      replacement.payload!.RolledDiceIndexes = { RolledDiceIndexesItem: 1 };
    if (change === "no_offer")
      events.find(
        (e) =>
          e.sourceTag === "QuestionBlockDice" && e.payload?.RollStatus === 1
      )!.payload!.CanUseTeamReroll = 0;
    if (change === "different_controller")
      events.find(
        (e) => e.sourceTag === "ResultTeamRerollUsage"
      )!.payload!.GamerId = 0;
    if (change === "unknown_before" || change === "unknown_after") {
      const t = replay.turns.find((t) => t.events.includes(gate))!;
      const position =
        change === "unknown_after"
          ? t.events.indexOf(gate) + 1
          : t.events.indexOf(gate) - 2;
      t.events.splice(position, 0, {
        ...gate,
        id: "unknown",
        sourceTag: "ResultUnknownMutation",
        type: "unknown",
        rollType: undefined,
        payload: {}
      });
    }
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(r.events.some((e) => e.metadata.block?.reroll === "loner")).toBe(
      false
    );
  });
  it("keeps earlier raw-pool odds invariant under truncation before the gate", () => {
    const replay = parseReplayXml(lonerDriveXml("loner3_block_pass"));
    const full = analyzeReplayLuck(replay);
    const gate = full.events.find((e) => e.metadata.lonerGate)!;
    replay.turns = replay.turns.map((t) => ({
      ...t,
      events: t.events.filter(
        (e) => e.sourceIndex! < gate.metadata.sourceIndex!
      )
    }));
    const prefix = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const first = prefix.events.find((e) => e.metadata.block)!;
    const original = full.events.find(
      (e) => e.metadata.sourceId === first.metadata.sourceId
    )!;
    expect(first.probabilitySuccess).toBe(original.probabilitySuccess);
    expect(first.weightedDelta).toBe(original.weightedDelta);
    expect(first.metadata.preRoll).toEqual(original.metadata.preRoll);
  });
  it("rejects forged gate identities and conditional-pool source links", () => {
    const r = report("loner3_block_pass");
    const gate = r.events.find((e) => e.metadata.lonerGate)!;
    gate.metadata.lonerGate!.threshold = 4;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
    gate.metadata.lonerGate!.threshold = 3;
    r.events.find(
      (e) => e.metadata.block?.reroll === "loner"
    )!.metadata.block!.lonerGateSourceId = "missing";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("accepts all nine independently inventoried3+ gates across the public sources", () => {
    let pass = 0,
      fail = 0;
    for (const file of [
      "demo-goblins1.bbr",
      "demo11.bbr",
      "demo2.bbr",
      "demo6.bbr",
      "demo7.bbr"
    ]) {
      const r = analyzeNufflizerInput(
        readFileSync(`demo-replays/${file}`, "utf8")
      );
      for (const e of r.events)
        if (e.metadata.lonerGate?.skillId === 1008)
          e.metadata.lonerGate.passed ? pass++ : fail++;
    }
    expect([pass, fail]).toEqual([5, 4]);
  });

  it.each(["die_types", "modifier", "distribution"] as const)(
    "rejects impossible conditional probability evidence: %s",
    (change) => {
      const r = report("loner3_block_pass");
      const gate = r.events.find((e) => e.metadata.lonerGate)!;
      if (change === "die_types") gate.metadata.dieTypes!.push(2);
      if (change === "modifier") {
        gate.metadata.modifiers = [1];
        gate.metadata.modifiersSum = 1;
      }
      if (change === "distribution") {
        const b = r.events.find((e) => e.metadata.block?.reroll === "loner")!
          .metadata.block!;
        b.distribution[0]! += 1 / 36;
        b.distribution[1]! -= 1 / 36;
      }
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  );
  it.each(["phase", "controller", "unknown_field"] as const)(
    "withholds mental aftermath for a contradictory wait marker: %s",
    (change) => {
      const replay = parseReplayXml(lonerDriveXml("loner3_mental_fail"));
      const events = replay.turns.flatMap((t) => t.events),
        effect = events.find((e) => e.sourceTag === "ResultAddPlayerEffect")!;
      const wait = events.find(
        (e) =>
          e.sourceTag === "EventRulesEngineStandBy" &&
          e.sourceIndex! > effect.sourceIndex!
      )!;
      if (change === "phase") wait.payload!.Phase = "3";
      if (change === "controller") wait.payload!.ActiveGamer = "0";
      if (change === "unknown_field") wait.payload!.Unknown = 1;
      expect(findMentalActivationEnds(replay)).toHaveLength(0);
    }
  );
});
