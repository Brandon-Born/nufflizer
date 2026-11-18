import { describe, it, expect } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { armorChoicePolicyXml } from "../helpers/armorChoicePolicy";
import { playbackFragmentXml } from "../helpers/playback";
import { categoricalInjuryXml } from "../helpers/categoricalInjury";
import { fixedFoulArmorXml } from "../helpers/fixedFoulArmor";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

describe("NUF-036 source-policy admission before the armor result", () => {
  for (const policy of ["never", "on_seven"])
    it(`withholds optional armor policy under ${policy}`, () => {
      const states = [];
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++) {
          const r = analyzeNufflizerInput(
            armorChoicePolicyXml(a, b, policy === "on_seven" && a + b === 7)
          );
          const e = r.events.find((e) => e.metadata.rollType === 10)!;
          states.push(e.scoringStatus);
          expect(e.metadata.dice).toEqual([a, b]);
        }
      expect(states).toEqual(Array(36).fill("excluded"));
    });
  it("withholds an ordinary opposing block without current policy-holder traits", () => {
    const r = analyzeNufflizerInput(
      categoricalInjuryXml().replace(/<AcquiredSkills\/>/g, "")
    );
    expect(r.events.find((e) => e.metadata.rollType === 10)).toMatchObject({
      scoringStatus: "excluded",
      actualSuccess: null,
      probabilitySuccess: null,
      weightedDelta: 0
    });
  });
  it("preserves a fully observed ordinary opposing block without optional armor skills", () => {
    const r = analyzeNufflizerInput(categoricalInjuryXml());
    expect(r.events.find((e) => e.metadata.rollType === 10)).toMatchObject({
      scoringStatus: "scored",
      actualSuccess: false,
      probabilitySuccess: 21 / 36,
      weightedDelta: -21 / 36
    });
  });
  it("preserves source UI-009 self-fall armor independently of opposing Mighty Blow", () => {
    const r = analyzeNufflizerInput(
      playbackFragmentXml("001", "UI-009", [], [38])
    );
    expect(r.events.find((e) => e.metadata.rollType === 10)).toMatchObject({
      scoringStatus: "scored",
      actualSuccess: false,
      probabilitySuccess: 21 / 36,
      weightedDelta: -21 / 36
    });
  });
});

describe("qualified fixed armor policies", () => {
  it("admits every fair ordinary Block face with exact zero-mean deviation", () => {
    let sum = 0;
    for (let a = 1; a <= 6; a++)
      for (let b = 1; b <= 6; b++) {
        const r = analyzeNufflizerInput(armorChoicePolicyXml(a, b, false, [])),
          e = r.events.find((e) => e.metadata.rollType === 10)!;
        expect(e.scoringStatus).toBe("scored");
        expect(e.probabilitySuccess).toBe(21 / 36);
        expect(e.delta).toBe(Number(a + b < 8) - 21 / 36);
        sum += e.delta;
        expect(e.explainability.inputsSummary).toContain(
          "Fixed pre-roll armor policy: ordinary_block"
        );
      }
    expect(sum / 36).toBeCloseTo(0, 12);
  });
  it.each([[], [13], [75]].map(skills => ({skills})))(
    "admits every fixed-assist Foul face, with role-specific harmless skills $skills",
    ({skills}) => {
      let sum = 0;
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++) {
          const r = analyzeNufflizerInput(fixedFoulArmorXml(a, b, skills)),
            e = r.events.find((e) => e.metadata.rollType === 10)!;
          expect(e).toMatchObject({
            scoringStatus: "scored",
            teamId: "1",
            playerId: "44",
            probabilitySuccess: 6 / 36
          });
          expect(e.delta).toBe(Number(a + b < 5) - 6 / 36);
          sum += e.delta;
        }
      expect(sum / 36).toBeCloseTo(0, 12);
    }
  );
  it("does not confuse a Foul holder's optional Dirty Player with fixed assists", () => {
    for (let a = 1; a <= 6; a++)
      for (let b = 1; b <= 6; b++) {
        const r = analyzeNufflizerInput(fixedFoulArmorXml(a, b, [27])),
          e = r.events.find((e) => e.metadata.rollType === 10)!;
        expect(e).toMatchObject({
          scoringStatus: "excluded",
          probabilitySuccess: null,
          actualSuccess: null,
          weightedDelta: 0
        });
      }
  });
  it("retains the unknown armor stage and victim proof instead of reporting an empty even subtotal", () => {
    const r = analyzeNufflizerInput(armorChoicePolicyXml(3, 5, false)),
      e = r.events.find((e) => e.metadata.rollType === 10)!;
    expect(e.metadata.damage).toMatchObject({
      subjectId: "42",
      subjectTeamId: "0"
    });
    expect(e.metadata.ownership).toMatchObject({
      role: "subject",
      playerId: "42",
      teamId: "0"
    });
    const stage = r.damageSteps.find(
      (s) => s.actionId === e.metadata.actionId
    )!;
    expect(stage.eventIds).toContain(e.id);
    expect(stage.unscoredRolls).toBeGreaterThan(0);
    const pool = r.events.find((e) => e.metadata.blockResolution)!;
    expect(pool.metadata.blockResolution!.unscoredDamageRolls).toBeGreaterThan(
      0
    );
    const forged = structuredClone(r);
    forged.events.find((x) => x.id === e.id)!.metadata.ownership!.role =
      "actor";
    expect(LuckReportSchema.safeParse(forged).success).toBe(false);
  });
  it.each([
    "effects",
    "traits",
    "unknown-skill",
    "Claws",
    "duplicate-header",
    "evaluation",
    "unknown-header",
    "unknown-modifier",
    "duplicate-assist"
  ])("withholds unsupported pre-roll/source policy: %s", (kind) => {
    const p = parseReplayXml(
      kind === "unknown-modifier" || kind === "duplicate-assist"
        ? fixedFoulArmorXml(3, 5)
        : categoricalInjuryXml({
            attackerSkills:
              kind === "Claws" ? [75] : kind === "unknown-skill" ? [999] : []
          })
    );
    if (kind === "effects")
      p.boardCheckpoints![0]!.board!.effectsKnownEmpty = false;
    if (kind === "traits")
      p.boardCheckpoints![0]!.board!.teams[1]!.players[0]!.traits!.acquiredSkills =
        null;
    const es = p.turns.flatMap((t) => t.events),
      header = es.find((e) => e.sourceTag === "DamageStep")!;
    if (kind === "evaluation") header.payload!.IsEvaluation = 1;
    if (kind === "unknown-header") header.payload!.Unrecognized = 0;
    if (kind === "duplicate-header")
      p.turns
        .find((t) => t.events.includes(header))!
        .events.splice(
          p.turns
            .find((t) => t.events.includes(header))!
            .events.indexOf(header),
          0,
          { ...header, id: "repeated-header" }
        );
    if (kind === "unknown-modifier" || kind === "duplicate-assist") {
      const roll = es.find((e) => e.rollType === 10)!,
        ms = (
          roll.payload!.Modifiers as { Modifier: Record<string, unknown>[] }
        ).Modifier;
      if (kind === "unknown-modifier") ms[0]!.Unrecognized = 0;
      else ms[1]!.PlayerId = ms[0]!.PlayerId;
    }
    const before = structuredClone(p),
      r = LuckReportSchema.parse(analyzeReplayLuck(p)),
      e = r.events.find((e) => e.metadata.rollType === 10)!;
    expect(p).toEqual(before);
    expect(e).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      weightedDelta: 0
    });
    expect(
      r.diceRecords.some(
        (d) =>
          d.parentSourceId === e.metadata.sourceId &&
          d.disposition === "unscored_roll"
      )
    ).toBe(true);
  });
});

// A known executed header may support an unknown damage stage; a missing or
// malformed header must not be upgraded into an observed damage receipt.
describe("armor execution evidence is distinct from policy support", () => {
  it.each(["missing", "unknown-field", "duplicate"])("does not invent a damage stage from a %s header", (kind) => {
    const p = parseReplayXml(armorChoicePolicyXml(3, 5, false));
    const turn = p.turns.find(t => t.events.some(e => e.sourceTag === "DamageStep"))!;
    const at = turn.events.findIndex(e => e.sourceTag === "DamageStep");
    if (kind === "missing") turn.events.splice(at, 1);
    else if (kind === "unknown-field") turn.events[at]!.payload!.Unrecognized = 0;
    else turn.events.splice(at, 0, {...turn.events[at]!, id: "duplicate-damage-header"});
    const r = LuckReportSchema.parse(analyzeReplayLuck(p));
    const e = r.events.find(e => e.metadata.rollType === 10)!;
    expect(e.scoringStatus).toBe("excluded");
    expect(e.metadata.damage).toBeUndefined();
    expect(r.damageSteps.some(s => s.eventIds.includes(e.id))).toBe(false);
    expect(e.metadata.dice).toEqual([3, 5]);
  });
});

describe("fixed armor assist roles", () => {
  it.each([6, 44, 99])(
    "rejects a foul assist credited to player %s",
    (playerId) => {
      const replay = parseReplayXml(fixedFoulArmorXml(3, 5));
      const armor = replay.turns
        .flatMap((turn) => turn.events)
        .find((e) => e.rollType === 10)!;
      const modifiers = armor.payload!.Modifiers as {
        Modifier: { PlayerId: number }[];
      };
      modifiers.Modifier[0]!.PlayerId = playerId;
      const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
      const rolls = report.events.filter(
        (e) => e.metadata.rollType === 10 || e.metadata.rollType === 11
      );
      expect(rolls).toHaveLength(2);
      for (const event of rolls) {
        expect(event.scoringStatus).toBe("excluded");
        expect(event.probabilitySuccess).toBeNull();
      }
      expect(rolls[1]!.metadata.injuryObservation?.outcome).toBe("stunned");
    }
  );

  it("rejects a defense assist credited to the fouler's team", () => {
    const replay = parseReplayXml(fixedFoulArmorXml(3, 5));
    const armor = replay.turns
      .flatMap((turn) => turn.events)
      .find((e) => e.rollType === 10)!;
    const modifiers = armor.payload!.Modifiers as {
      Modifier: Record<string, number>[];
    };
    Object.assign(modifiers.Modifier[0]!, { ModifierType: 12, Value: -1 });
    armor.payload!.Difficulty = 7;
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(
      report.events.find((e) => e.metadata.rollType === 10)?.scoringStatus
    ).toBe("excluded");
  });

  it("scores offsetting assists when their owners are on the proper foul sides", () => {
    const xml = fixedFoulArmorXml(3, 5).replace(
      "<ListPitchPlayers><PlayerState><Id>44</Id>",
      "<ListPitchPlayers><PlayerState><Id>45</Id></PlayerState><PlayerState><Id>44</Id>"
    );
    const replay = parseReplayXml(xml);
    const armor = replay.turns
      .flatMap((turn) => turn.events)
      .find((e) => e.rollType === 10)!;
    armor.payload!.Modifiers = {
      Modifier: [
        { PlayerId: 10, ModifierType: 11, Value: 1, Skill: -1, Effect: -1 },
        { PlayerId: 45, ModifierType: 12, Value: -1, Skill: -1, Effect: -1 }
      ]
    };
    armor.payload!.Difficulty = 8;
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(report.events.find((e) => e.metadata.rollType === 10)).toMatchObject(
      {
        scoringStatus: "scored",
        probabilitySuccess: 21 / 36
      }
    );
    expect(
      report.events.find((e) => e.metadata.rollType === 11)?.metadata
        .injuryScoring?.cause.kind
    ).toBe("foul");
  });

  it("rejects offsetting foul modifiers in ordinary Block armor", () => {
    const replay = parseReplayXml(categoricalInjuryXml());
    const armor = replay.turns
      .flatMap((turn) => turn.events)
      .find((e) => e.rollType === 10)!;
    armor.payload!.Modifiers = {
      Modifier: [
        { PlayerId: 7, ModifierType: 11, Value: 1, Skill: -1, Effect: -1 },
        { PlayerId: 42, ModifierType: 12, Value: -1, Skill: -1, Effect: -1 }
      ]
    };
    const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(
      report.events.find((e) => e.metadata.rollType === 10)?.scoringStatus
    ).toBe("excluded");
  });
});
