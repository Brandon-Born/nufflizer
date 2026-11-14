import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { preservesTraitContinuity } from "@/domain/replay/traitTransitions";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { categoricalInjuryXml } from "../helpers/categoricalInjury";
import { rollEvent } from "../helpers/replay";
import { injuryTableXml } from "../helpers/injuryTable";

// Independently identified BoardDataSkill values; effects concern actions,
// positions or damage, with no learned skill-list replacement (BB2020 pp75–87).
const intrinsicUses = [
  17, 18, 23, 25, 26, 37, 41, 47, 55, 64, 71, 84, 95, 97, 1009
];
const otherActionSkills = [47, 52, 86, 100, 101, 102];
const spp = (player = 7, points = 2) =>
  `<ResultGainSpp><PlayerId>${player}</PlayerId><SppGained>${points}</SppGained></ResultGainSpp>`;
const scored = (r: ReturnType<typeof analyzeNufflizerInput>) =>
  r.events.find((e) => e.metadata.injuryScoring);

describe("initial injury transaction with learned traits and SPP annotation", () => {
  it.each([false, true])(
    "keeps own knockdown injury fair with the opposing recipient and Stunty=%s",
    (stunty) => {
      for (const thick of [false, true])
        for (const everyFace of [false, true]) {
          const outcomes = stunty
            ? thick
              ? [0, 0, 0, 0, 0, 0, 2, 3, 4, 4, 4]
              : [0, 0, 0, 0, 0, 2, 2, 3, 4, 4, 4]
            : thick
              ? [0, 0, 0, 0, 0, 0, 0, 2, 4, 4, 4]
              : [0, 0, 0, 0, 0, 0, 2, 2, 4, 4, 4];
          let sum = 0,
            faces = 0;
          for (let a = 1; a <= 6; a++)
            for (let b = 1; b <= 6; b++) {
              const outcome = outcomes[a + b - 2]!,
                hasNotice = everyFace || outcome === 3;
              const r = analyzeNufflizerInput(
                categoricalInjuryXml({
                  self: true,
                  skills: [
                    47,
                    ...(stunty ? [52, 59] : []),
                    ...(thick ? [63] : [])
                  ],
                  dice: [a, b],
                  outcome,
                  interruption: hasNotice ? spp(7) : undefined
                })
              );
              const injury = scored(r)!;
              expect(injury).toBeDefined();
              expect(injury.playerId).toBe("42");
              expect(injury.teamId).toBe("0");
              expect(injury.probabilitySuccess).toBeNull();
              expect(injury.actualSuccess).toBeNull();
              expect(injury.metadata.injuryScoring?.cause).toMatchObject({
                kind: "block"
              });
              expect(Boolean(injury.metadata.injuryScoring?.sppSourceId)).toBe(
                hasNotice
              );
              if (hasNotice) {
                const s = r.events.find((e) => e.metadata.recordedSpp)!;
                expect(s).toMatchObject({
                  playerId: "7",
                  teamId: "1",
                  scoringStatus: "excluded",
                  weightedDelta: 0
                });
              }
              sum += injury.weightedDelta;
              faces++;
            }
          expect(faces).toBe(36);
          expect(sum).toBeCloseTo(0, 12);
        }
    }
  );
  it("withholds an SPP recipient outside the two block participants", () => {
    const extra =
      "<PlayerState><Id>99</Id><Cell><X>10</X><Y>10</Y></Cell><Effects/><Data><Id>99</Id><IdPlayerTypes>8</IdPlayerTypes><InnateSkills/><AcquiredSkills/></Data></PlayerState>";
    const input = categoricalInjuryXml({ interruption: spp(99) }).replace(
      "<PlayerState><Id>7</Id>",
      extra + "<PlayerState><Id>7</Id>"
    );
    const r = analyzeNufflizerInput(input);
    expect(r.events.some((e) => e.metadata.recordedSpp)).toBe(true);
    expect(scored(r)).toBeUndefined();
  });
  it.each(intrinsicUses)(
    "keeps learned traits through the documented skill-use notification %i",
    (skill) => {
      const e = rollEvent({
        sourceTag: "ResultSkillUsage",
        payload: { PlayerId: 7, Skill: skill, Used: 1 }
      });
      expect(preservesTraitContinuity(e)).toBe(true);
    }
  );
  it.each(intrinsicUses)(
    "keeps strict payload and physical-state boundaries for use %i",
    (skill) => {
      for (const used of [0, 1]) {
        const input = injuryTableXml({
          skills: [59],
          dice: [6, 3],
          outcome: 3,
          prefix: `<ResultSkillUsage><PlayerId>7</PlayerId><Skill>${skill}</Skill><Used>${used}</Used></ResultSkillUsage>`
        });
        const r = analyzeNufflizerInput(input),
          e = r.events.find((e) => e.metadata.injuryTable)!;
        expect(e.metadata.injuryTable?.counts).toEqual([15, 11, 4, 6]);
        expect(e.metadata.injuryTable?.traitEvidence.statusCode).toBeNull();
        expect(e.scoringStatus).toBe("excluded");
        expect(e.contextualImpact).toBeUndefined();
      }
      for (const change of [
        { Used: undefined },
        { Used: null },
        { Used: 2 },
        { PlayerId: undefined },
        { PlayerId: -1 },
        { PlayerId: 1.5 },
        { ExtraSkills: [] },
        { Effect: 0 }
      ]) {
        expect(
          preservesTraitContinuity(
            rollEvent({
              sourceTag: "ResultSkillUsage",
              payload: { PlayerId: 7, Skill: skill, Used: 1, ...change }
            })
          )
        ).toBe(false);
      }
      expect(
        preservesTraitContinuity(
          rollEvent({
            sourceTag: "ResultSkillUsage",
            payload: { PlayerId: 7, Skill: skill, Used: 1 },
            attributionConflict: true
          })
        )
      ).toBe(false);
    }
  );
  it.each(otherActionSkills)(
    "keeps the initial injury distribution with other-action skill %i on either participant",
    (skill) => {
      for (const holder of ["subject", "attacker"] as const) {
        const r = analyzeNufflizerInput(
          categoricalInjuryXml({
            skills: holder === "subject" ? [skill] : [],
            attackerSkills: holder === "attacker" ? [skill] : []
          })
        );
        expect(scored(r)?.weightedDelta).toBe(-5 / 8);
        expect(LuckReportSchema.safeParse(r).success).toBe(true);
      }
    }
  );
  it.each([false, true])(
    "keeps every face fair across SPP, Thick Skull and spent armor with Stunty=%s",
    (stunty) => {
      for (const thickSkull of [false, true])
        for (const armorMightyBlow of [false, true]) {
          const outcomes = stunty
            ? thickSkull
              ? [0, 0, 0, 0, 0, 0, 2, 3, 4, 4, 4]
              : [0, 0, 0, 0, 0, 2, 2, 3, 4, 4, 4]
            : thickSkull
              ? [0, 0, 0, 0, 0, 0, 0, 2, 4, 4, 4]
              : [0, 0, 0, 0, 0, 0, 2, 2, 4, 4, 4];
          const counts = stunty
            ? thickSkull
              ? [21, 5, 10]
              : [15, 11, 10]
            : thickSkull
              ? [26, 4, 6]
              : [21, 9, 6];
          let sum = 0,
            faces = 0;
          for (let a = 1; a <= 6; a++)
            for (let b = 1; b <= 6; b++) {
              const outcome = outcomes[a + b - 2]!,
                tier = [0, 2, 3, 4].indexOf(outcome),
                i = Math.min(tier, 2);
              const reference =
                ((counts.slice(i + 1).reduce((x, y) => x + y, 0) -
                  counts.slice(0, i).reduce((x, y) => x + y, 0)) /
                  36) *
                1.5;
              const r = analyzeNufflizerInput(
                categoricalInjuryXml({
                  skills: [
                    47,
                    ...(stunty ? [7, 52, 59] : []),
                    ...(thickSkull ? [63] : [])
                  ],
                  attackerSkills: [102, ...(armorMightyBlow ? [13] : [])],
                  dice: [a, b],
                  outcome,
                  armorMightyBlow,
                  interruption: spp()
                })
              );
              const e = scored(r)!;
              expect(e).toBeDefined();
              expect(e.weightedDelta).toBeCloseTo(reference, 12);
              sum += e.weightedDelta;
              faces++;
              expect(e.actualSuccess).toBeNull();
              expect(e.probabilitySuccess).toBeNull();
              expect(LuckReportSchema.safeParse(r).success).toBe(true);
            }
          expect(faces).toBe(36);
          expect(sum).toBeCloseTo(0, 12);
        }
    }
  );
  it("scores the actual demo6 Stunty Badly Hurt after its same-step SPP notification", () => {
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo6.bbr", "utf8")
    );
    const e = r.events.find((e) => e.metadata.sourceId === "source-248")!;
    expect(e.metadata.injuryTable?.counts).toEqual([15, 11, 4, 6]);
    expect(e.metadata.injuryScoring).toBeDefined();
    expect(e.weightedDelta).toBe(-13 / 12);
    expect(e.playerId).toBe("47");
    expect(e.teamId).toBe("1");
    expect(e.probabilitySuccess).toBeNull();
    expect(e.actualSuccess).toBeNull();
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
  });
  it.each(
    [
      spp(42),
      spp(90000),
      spp(7, 1),
      spp(7, 3),
      spp(7, -2),
      "<ResultGainSpp><SppGained>2</SppGained></ResultGainSpp>",
      "<ResultGainSpp><PlayerId>7</PlayerId><SppGained>2</SppGained><Bonus>1</Bonus></ResultGainSpp>",
      [spp(), spp()],
      [spp(), "<UnknownMutation/>"],
      ["<UnknownMutation/>", spp()]
    ].map((interruption) => ({ interruption }))
  )("withholds an unsupported SPP prefix $interruption", ({ interruption }) => {
    const r = analyzeNufflizerInput(categoricalInjuryXml({ interruption }));
    expect(scored(r)).toBeUndefined();
    expect(
      r.events.some(
        (e) =>
          e.type === "injury" &&
          e.metadata.rollType === 11 &&
          e.metadata.dice?.join() === "3,6"
      )
    ).toBe(true);
  });
  it("does not import a Block SPP prefix into self-fall damage", () => {
    expect(
      scored(
        analyzeNufflizerInput(
          categoricalInjuryXml({ fall: true, interruption: spp() })
        )
      )
    ).toBeUndefined();
  });
  it.each(["ordinary", "thick", "stunty", "stunty-thick"])(
    "keeps conditional SPP emission and spent armor budgets fair for %s",
    (profile) => {
      const stunty = profile.includes("stunty"),
        thick = profile.includes("thick");
      const rows = stunty
        ? thick
          ? [0, 0, 0, 0, 0, 0, 2, 3, 4, 4, 4]
          : [0, 0, 0, 0, 0, 2, 2, 3, 4, 4, 4]
        : thick
          ? [0, 0, 0, 0, 0, 0, 0, 2, 4, 4, 4]
          : [0, 0, 0, 0, 0, 0, 2, 2, 4, 4, 4];
      for (const armorMightyBlow of [false, true]) {
        let sum = 0,
          faces = 0;
        for (let a = 1; a <= 6; a++)
          for (let b = 1; b <= 6; b++) {
            const outcome = rows[a + b - 2];
            const r = analyzeNufflizerInput(
              categoricalInjuryXml({
                skills: [
                  47,
                  ...(stunty ? [52, 59] : []),
                  ...(thick ? [63] : [])
                ],
                attackerSkills: [102, ...(armorMightyBlow ? [13] : [])],
                dice: [a, b],
                outcome,
                armorMightyBlow,
                interruption: outcome === 3 ? spp() : undefined
              })
            );
            const e = scored(r)!;
            expect(e).toBeDefined();
            sum += e.weightedDelta;
            faces++;
            expect(Boolean(e.metadata.injuryScoring?.sppSourceId)).toBe(
              outcome === 3
            );
            if (armorMightyBlow)
              expect(e.metadata.injuryScoring?.cause).toMatchObject({
                armorModifierBudget: { available: 1, spent: 1, remaining: 0 }
              });
          }
        expect(faces).toBe(36);
        expect(sum).toBeCloseTo(0, 12);
      }
    }
  );
  it.each([
    "spp-points",
    "spp-owner",
    "spp-injury",
    "spp-armor",
    "spp-order",
    "missing-link",
    "other-source",
    "missing-scope",
    "scope-duplicate",
    "scope-extra",
    "scope-role"
  ])("rejects transaction export forgery %s", (kind) => {
    const r = analyzeNufflizerInput(
      categoricalInjuryXml({
        skills: [52, 59],
        attackerSkills: [102],
        dice: [6, 3],
        outcome: 3,
        interruption: spp()
      })
    );
    const injury = scored(r)!,
      s = r.events.find((e) => e.metadata.recordedSpp)!;
    if (kind === "spp-points")
      (s.metadata.recordedSpp as Record<string, unknown>).points = 3;
    if (kind === "spp-owner") s.metadata.ownership!.playerId = "42";
    if (kind === "spp-injury")
      s.metadata.recordedSpp!.damage!.injurySourceId = s.metadata.sourceId!;
    if (kind === "spp-armor")
      s.metadata.recordedSpp!.damage!.armorSourceId = injury.metadata.sourceId!;
    if (kind === "spp-order")
      s.metadata.sourceIndex = injury.metadata.sourceIndex;
    if (kind === "missing-link")
      delete injury.metadata.injuryScoring!.sppSourceId;
    if (kind === "other-source")
      injury.metadata.injuryScoring!.sppSourceId = injury.metadata.sourceId;
    if (kind === "missing-scope")
      delete injury.metadata.injuryTable!.otherActionSkills;
    if (kind === "scope-duplicate")
      injury.metadata.injuryTable!.otherActionSkills!.skills.push(52);
    if (kind === "scope-extra")
      injury.metadata.injuryTable!.otherActionSkills!.skills.push(47);
    if (
      kind === "scope-role" &&
      injury.metadata.injuryScoring!.cause.kind === "block"
    )
      injury.metadata.injuryScoring!.cause.attackerOtherActionSkills =
        injury.metadata.injuryTable!.otherActionSkills;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
