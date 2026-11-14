import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { skillBlockXml } from "../helpers/skillBlock";
import { encodedMessage } from "../helpers/replay";
import { enumerateSkillBlock } from "@/domain/nufflizer/blockSkillModel";
import { explainBlockSkillModel } from "@/domain/nufflizer/presentation";
import installedEnums from "../fixtures/evidence/bb3-installed-enums.json";

const analyze = (xml: string) => analyzeNufflizerInput(xml);
const pool = (r: ReturnType<typeof analyze>) =>
  r.events.find((e) => e.metadata.block)!;
const aExtra = [47, 59, 100, 102],
  dExtra = [52, 86, 101];

describe("non-knockdown skill policy and source invariants", () => {
  it("pairs the seven literal IDs with the installed BoardDataSkill namespace", () => {
    const expected = [
      [47, "Pass"],
      [52, "RightStuff"],
      [59, "Stunty"],
      [86, "AnimosityAllTeamMates"],
      [100, "AnimosityOrcLinemen"],
      [101, "AnimosityBigUnBlockers"],
      [102, "AnimosityUnderworldGoblinLinemen"]
    ] as const;
    for (const name of ["EBB3BoardDataSkill"]) {
      const table = installedEnums.enums.find((e) => e.name === name)!;
      expect(table).toBeDefined();
      for (const [id, member] of expected)
        expect(table.entries.find((e) => e.value === id)?.member).toBe(member);
    }
  });
  it("matches3096 fair full-pipeline prefixes for six literal Block/Dodge/Tackle/Wrestle profiles", () => {
    const profiles: [number[], number[], number[], number[]][] = [
      [[], [], [0, 1, 4, 6, 6], [-1, 0, 0, 1, 1]],
      [[30], [], [0, 5, 4, 6, 6], [-1, 1, 0, 1, 1]],
      [[30], [7], [0, 5, 4, 4, 6], [-1, 1, 0, 0, 1]],
      [[30, 57], [7], [0, 5, 4, 6, 6], [-1, 1, 0, 1, 1]],
      [[68], [30], [0, 2, 4, 6, 6], [-1, 0, 0, 1, 1]],
      [[30], [68], [0, 2, 4, 6, 6], [-1, 0, 0, 1, 1]]
    ];
    const die = [0, 1, 2, 2, 3, 4];
    let checked = 0;
    for (const [a, d, outcomes, values] of profiles)
      for (const chooser of [true, false])
        for (const size of [1, 2, 3]) {
          let leaves: number[][] = [[]];
          for (let n = 0; n < size; n++)
            leaves = leaves.flatMap((p) => die.map((f) => [...p, f]));
          const value = (p: number[]) =>
            (chooser ? Math.max : Math.min)(...p.map((f) => values[f]!));
          const mean =
            leaves.reduce((sum, p) => sum + value(p), 0) / leaves.length;
          let total = 0;
          for (const faces of leaves) {
            const r = analyze(
              skillBlockXml(
                [...a, ...aExtra],
                [...d, ...dExtra],
                faces,
                faces.map((f) => outcomes[f]!),
                chooser
              )
            );
            const e = pool(r);
            expect(e.scoringStatus).toBe("scored");
            expect(e.delta).toBeCloseTo(value(faces) - mean, 12);
            expect(e.metadata.block!.skillModel!.nonKnockdownSkills).toEqual({
              policy: "outside_current_pool_knockdowns",
              attacker: aExtra,
              defender: dExtra
            });
            total += e.delta;
            checked++;
          }
          expect(total / leaves.length).toBeCloseTo(0, 12);
        }
    expect(checked).toBe(3096);
  }, 90000);
  it.each(["always", "after_attacker_down", "never"])(
    "retains zero mean under %s adaptive team rerolls",
    (policy) => {
      const die = [0, 1, 2, 2, 3, 4],
        outcomes = [0, 5, 4, 4, 6],
        values = [-1, 1, 0, 0, 1];
      let total = 0;
      for (const first of die)
        for (const next of die) {
          const used =
            policy === "always" ||
            (policy === "after_attacker_down" && first === 0);
          const r = analyze(
            skillBlockXml(
              [30, ...aExtra],
              [7, ...dExtra],
              [first],
              [outcomes[first]!],
              true,
              (q) => [
                `<ResultTeamRerollUsage><GamerId>0</GamerId><Used>${Number(used)}</Used></ResultTeamRerollUsage>`,
                ...(used
                  ? [
                      q
                        .replace(
                          "<RollStatus>1</RollStatus>",
                          "<RollStatus>2</RollStatus>"
                        )
                        .replace(
                          `<Value>${first}</Value>`,
                          `<Value>${next}</Value>`
                        )
                        .replace(
                          `<DiceOutcomesItem>${outcomes[first]}</DiceOutcomesItem>`,
                          `<DiceOutcomesItem>${outcomes[next]}</DiceOutcomesItem>`
                        )
                    ]
                  : [])
              ]
            )
          );
          const expected =
            values[first]! - 1 / 6 + (used ? values[next]! - 1 / 6 : 0);
          expect(r.events.filter((e) => e.metadata.block)).toHaveLength(
            used ? 2 : 1
          );
          expect(r.events.reduce((sum, e) => sum + e.delta, 0)).toBeCloseTo(
            expected,
            12
          );
          expect(r.rerollResources.recordedUsedCount).toBe(Number(used));
          expect(LuckReportSchema.safeParse(r).success).toBe(true);
          total += expected;
        }
      expect(total / 36).toBeCloseTo(0, 12);
    }
  );
  it("conditions only on fresh indexes while retaining the other die", () => {
    const r = analyze(skillBlockXml([30, ...aExtra], [7, ...dExtra], [1], [5]));
    const evidence = pool(r).metadata.block!.traitEvidence!;
    const result = enumerateSkillBlock(
      {
        faces: [4, 0],
        rolledIndexes: [1],
        attackerChooses: true,
        outcomes: [6, 0]
      },
      evidence
    )!;
    expect(result.expectedValue).toBe(1);
    expect(result.poolValue).toBe(1);
    expect(result.outcomeDistribution).toEqual([0, 0, 0, 0, 0, 1 / 6, 5 / 6]);
    // A recorded replacement is not made admissible by this function alone;
    // the raw block linker separately validates its choice/source/index chain.
  });
  it("retains complete acquired skill lists separately from innate lists", () => {
    const xml = skillBlockXml([30, 47], [7], [1], [5])
      .replace("<InnateSkillsItem>47</InnateSkillsItem>", "")
      .replace(
        "<AcquiredSkills/>",
        "<AcquiredSkills><AcquiredSkillsItem>47</AcquiredSkillsItem></AcquiredSkills>"
      );
    const r = analyze(xml),
      e = pool(r);
    expect(
      e.metadata.block!.traitEvidence!.attacker.traits.acquiredSkills
    ).toEqual([47]);
    expect(e.metadata.block!.skillModel!.nonKnockdownSkills!.attacker).toEqual([
      47
    ]);
    expect(e.delta).toBeCloseTo(5 / 6, 12);
  });
  it.each([999, 96, 17, 69])(
    "does not classify an unmodeled skill%s from its name",
    (skill) => {
      const r = analyze(skillBlockXml([30, 47, skill], [7], [1], [5]));
      expect(pool(r).metadata.block!.skillModel).toBeUndefined();
      expect(pool(r).scoringStatus).toBe("excluded");
    }
  );
  it.each(["traits", "effects", "zone"])(
    "does not repair missing or contradictory %s evidence",
    (kind) => {
      let xml = skillBlockXml([30, 47], [7], [1], [5]);
      if (kind === "traits") xml = xml.replaceAll("<AcquiredSkills/>", "");
      if (kind === "effects")
        xml = xml.replace(
          "<Effects/>",
          "<Effects><Unknown>1</Unknown></Effects>"
        );
      if (kind === "zone")
        xml = xml.replace(
          "<TackleZone>1</TackleZone>",
          "<TackleZone>0</TackleZone>"
        );
      expect(pool(analyze(xml)).metadata.block!.skillModel).toBeUndefined();
    }
  );
  it("does not use a known skill to repair an unsupported intervening mutation", () => {
    const xml = skillBlockXml([30, 47], [7], [1], [5]);
    const before = `<StringMessage><MessageData>${encodedMessage("<UnknownSkillMutation/>")}</MessageData></StringMessage>`;
    const r = analyze(xml.replace("<Results>", "<Results>" + before));
    const question = r.events.find(
      (e) => e.metadata.sourceTag === "QuestionBlockDice"
    )!;
    expect(question.metadata.dice).toEqual([1]);
    expect(question.scoringStatus).toBe("excluded");
    expect(question.metadata.block?.skillModel).toBeUndefined();
  });
  it("preserves the earlier component after a future unknown mutation", () => {
    const xml = skillBlockXml([30, 47], [7], [1], [5]);
    const before = pool(analyze(xml));
    const after = pool(
      analyze(
        xml.replace(
          "</Replay>",
          "<ReplayStep><UnknownSkillMutation/></ReplayStep></Replay>"
        )
      )
    );
    expect(after).toEqual(before);
  });
  it.each([
    "missing",
    "wrong_side",
    "missing_id",
    "extra_id",
    "duplicate",
    "order",
    "policy",
    "unknown_id"
  ])("rejects a classification receipt forgery: %s", (kind) => {
    const r = analyze(skillBlockXml([30, 47, 59], [7, 102], [1], [5]));
    const model = pool(r).metadata.block!.skillModel!,
      receipt = model.nonKnockdownSkills!;
    if (kind === "missing") delete model.nonKnockdownSkills;
    if (kind === "wrong_side")
      [receipt.attacker, receipt.defender] = [
        receipt.defender,
        receipt.attacker
      ];
    if (kind === "missing_id") receipt.attacker.pop();
    if (kind === "extra_id") receipt.attacker.push(86);
    if (kind === "duplicate") receipt.attacker.push(47);
    if (kind === "order") receipt.attacker.reverse();
    if (kind === "policy") receipt.policy = "unknown" as typeof receipt.policy;
    if (kind === "unknown_id") receipt.attacker = [999 as 47];
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("explains the classified roles without certifying their other effects", () => {
    const r = analyze(skillBlockXml([30, 47], [7, 59], [1], [5]));
    const e = pool(r),
      why = explainBlockSkillModel(e)!;
    expect(why).toContain("attacker Pass; defender Stunty");
    expect(why).toContain(
      "without changing this pool's immediate knockdown table"
    );
    expect(why).toContain("Those other effects are outside this component");
    expect(e.explainability.inputsSummary).toContain(
      "attacker Pass; defender Stunty"
    );
  });
});
