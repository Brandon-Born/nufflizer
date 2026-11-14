import { describe, it, expect } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { categoricalInjuryXml } from "../helpers/categoricalInjury";
import { staffInjuryXml, koInjuryXml } from "../helpers/staffInjuryOriginal";

describe("initial Stunty injury is independent of its direct or treatment-question source", () => {
  it.each([false, true])(
    "keeps all fair faces with a treatment-question original and Thick Skull=%s",
    (thick) => {
      const outcomes = thick
        ? [0, 0, 0, 0, 0, 0, 2, 3, 4, 4, 4]
        : [0, 0, 0, 0, 0, 2, 2, 3, 4, 4, 4];
      let sum = 0,
        count = 0;
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++) {
          const o = {
            skills: [59, ...(thick ? [63] : [])],
            dice: [a, b] as [number, number],
            outcome: outcomes[a + b - 2]
          };
          const report = analyzeNufflizerInput(
            o.outcome === 3 ? staffInjuryXml(o) : categoricalInjuryXml(o)
          );
          const e = report.events.find((e) => e.metadata.injuryScoring);
          expect(
            e,
            `initial [${a},${b}] must not vanish because of the source root`
          ).toBeDefined();
          sum += e!.weightedDelta;
          count++;
          if (o.outcome === 3) {
            expect(e!.metadata.sourceTag).toBe(
              "QuestionApothecaryCasualtyUsage"
            );
            expect(e!.metadata.outcomeCode).toBe(1);
            expect(e!.weightedDelta).toBeCloseTo(-13 / 12, 12);
          }
        }
      expect(count).toBe(36);
      expect(sum).toBeCloseTo(0, 12);
    }
  );
  it("keeps a direct result and its repeated staff original as one injury draw", () => {
    const r = analyzeNufflizerInput(
      staffInjuryXml({ skills: [59], dice: [3, 6], outcome: 3 }, true)
    );
    const injuries = r.events.filter((e) => e.metadata.rollType === 11);
    expect(injuries.filter((e) => e.metadata.isRollCandidate)).toHaveLength(1);
    expect(injuries.filter((e) => e.metadata.injuryScoring)).toHaveLength(1);
    const q = injuries.find(
      (e) => e.metadata.sourceTag === "QuestionApothecaryCasualtyUsage"
    )!;
    expect(
      r.diceRecords.find(
        (d) =>
          d.parentSourceId === q.metadata.sourceId &&
          d.path.join() === "RollInfos,Dice"
      )
    ).toMatchObject({ disposition: "summary", aliasOf: expect.any(String) });
  });
  it.each([
    ["ordinary", [], [0, 0, 0, 0, 0, 0, 2, 2, 4, 4, 4]],
    ["ordinary Thick Skull", [63], [0, 0, 0, 0, 0, 0, 0, 2, 4, 4, 4]],
    ["Stunty", [59], [0, 0, 0, 0, 0, 2, 2, 3, 4, 4, 4]],
    ["Stunty Thick Skull", [59, 63], [0, 0, 0, 0, 0, 0, 2, 3, 4, 4, 4]]
  ] as const)(
    "retains every initial face when KO/BH originals use questions: %s",
    (_name, skills, outcomes) => {
      let sum = 0,
        count = 0;
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++) {
          const o = {
            skills: [...skills],
            dice: [a, b] as [number, number],
            outcome: outcomes[a + b - 2]
          };
          const r = analyzeNufflizerInput(
            o.outcome === 2
              ? koInjuryXml(o)
              : o.outcome === 3
                ? staffInjuryXml(o)
                : categoricalInjuryXml(o)
          );
          const e = r.events.find((e) => e.metadata.injuryScoring);
          expect(
            e,
            `initial [${a},${b}] must remain scored before later staff choices`
          ).toBeDefined();
          sum += e!.weightedDelta;
          count++;
        }
      expect(count).toBe(36);
      expect(sum).toBeCloseTo(0, 12);
    }
  );
  it("does not count a repeated KO original as another initial injury", () => {
    const r = analyzeNufflizerInput(
      koInjuryXml({ dice: [4, 4], outcome: 2 }, true)
    );
    expect(
      r.events.filter(
        (e) => e.metadata.rollType === 11 && e.metadata.isRollCandidate
      )
    ).toHaveLength(1);
    expect(r.events.filter((e) => e.metadata.injuryScoring)).toHaveLength(1);
  });
});

describe("complete source-emission policies preserve fair initial injury", () => {
  const profiles = [
    {
      name: "ordinary",
      skills: [],
      rows: [0, 0, 0, 0, 0, 0, 2, 2, 4, 4, 4],
      tiers: [21, 9, 6]
    },
    {
      name: "ordinary Thick Skull",
      skills: [63],
      rows: [0, 0, 0, 0, 0, 0, 0, 2, 4, 4, 4],
      tiers: [26, 4, 6]
    },
    {
      name: "Stunty",
      skills: [59],
      rows: [0, 0, 0, 0, 0, 2, 2, 3, 4, 4, 4],
      tiers: [15, 11, 10]
    },
    {
      name: "Stunty Thick Skull",
      skills: [59, 63],
      rows: [0, 0, 0, 0, 0, 0, 2, 3, 4, 4, 4],
      tiers: [21, 5, 10]
    }
  ];
  const cases = profiles.flatMap((p) =>
    ["defender", "armor_spent", "own_knockdown"].map((cause) => ({
      ...p,
      cause
    }))
  );
  it.each(cases)(
    "keeps 36/36 faces and exact tier arithmetic for $name/$cause",
    (p) => {
      for (const notice of ["none", "badly_hurt_only", "all"])
        for (const duplicate of [false, true]) {
          let sum = 0,
            count = 0;
          for (let a = 1; a <= 6; a++)
            for (let b = 1; b <= 6; b++) {
              const outcome = p.rows[a + b - 2]!,
                o = {
                  skills: p.skills,
                  dice: [a, b] as [number, number],
                  outcome,
                  self: p.cause === "own_knockdown",
                  armorMightyBlow: p.cause === "armor_spent",
                  attackerSkills: p.cause === "armor_spent" ? [13] : [],
                  state: ((a + b) % 3) + 1,
                  interruption:
                    notice === "all" ||
                    (notice === "badly_hurt_only" && outcome === 3)
                      ? "<ResultGainSpp><PlayerId>7</PlayerId><SppGained>2</SppGained></ResultGainSpp>"
                      : undefined
                };
              const input =
                  outcome === 2
                    ? koInjuryXml(o, duplicate)
                    : outcome === 3
                      ? staffInjuryXml(o, duplicate)
                      : categoricalInjuryXml(o),
                r = analyzeNufflizerInput(input),
                e = r.events.find((e) => e.metadata.injuryScoring)!;
              expect(e, `${notice}/${duplicate}/[${a},${b}]`).toBeDefined();
              const tier = outcome === 0 ? 0 : outcome === 2 ? 1 : 2,
                reference =
                  (p.tiers.slice(tier + 1).reduce((a, b) => a + b, 0) -
                    p.tiers.slice(0, tier).reduce((a, b) => a + b, 0)) /
                  24;
              expect(e.weightedDelta).toBeCloseTo(reference, 12);
              expect(e.delta).toBeCloseTo(reference / 1.5, 12);
              expect(e.probabilitySuccess).toBeNull();
              expect(e.actualSuccess).toBeNull();
              expect(
                r.events.filter(
                  (e) =>
                    e.metadata.rollType === 11 && e.metadata.isRollCandidate
                )
              ).toHaveLength(1);
              if ((outcome === 2 || outcome === 3) && duplicate) {
                const q = r.events.find(
                  (e) =>
                    e.metadata.sourceTag ===
                    (outcome === 2
                      ? "QuestionKORecovery"
                      : "QuestionApothecaryCasualtyUsage")
                )!;
                expect(q.metadata.isRollCandidate).toBe(false);
                expect(q.metadata.injuryScoring).toBeUndefined();
                expect(
                  r.diceRecords.find(
                    (d) =>
                      d.parentSourceId === q.metadata.sourceId &&
                      d.path.join() === "RollInfos,Dice"
                  )
                ).toMatchObject({
                  disposition: "summary",
                  aliasOf: expect.any(String)
                });
              }
              sum += e.weightedDelta;
              count++;
            }
          expect(count).toBe(36);
          expect(sum).toBeCloseTo(0, 12);
        }
    }
  );
});
