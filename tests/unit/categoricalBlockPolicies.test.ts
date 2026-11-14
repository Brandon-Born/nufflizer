import { describe, it, expect } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import type { LuckEvent } from "@/domain/nufflizer/types";
import { skillBlockXml } from "../helpers/skillBlock";

const analyze = (xml: string) => analyzeReplayLuck(parseReplayXml(xml));
function valid(r: ReturnType<typeof analyze>) {
  const v = LuckReportSchema.safeParse(r);
  expect(v.success, JSON.stringify(v.error?.issues.slice(0, 4))).toBe(true);
}

describe("categorical block prefix and choice accounting", () => {
  it("checks 2064 fair prefixes across four skill profiles, both choosers and one/two/three dice", () => {
    const die = [0, 1, 2, 2, 3, 4];
    let checked = 0;
    const profiles: [number[], number[], number[], number[]][] = [
      [[], [], [0, 1, 4, 6, 6], [-1, 0, 0, 1, 1]],
      [[30], [], [0, 5, 4, 6, 6], [-1, 1, 0, 1, 1]],
      [[30], [7], [0, 5, 4, 4, 6], [-1, 1, 0, 0, 1]],
      [[30, 57], [7], [0, 5, 4, 6, 6], [-1, 1, 0, 1, 1]]
    ];
    for (const [a, d, outcomes, values] of profiles)
      for (const choose of [true, false])
        for (const size of [1, 2, 3]) {
          let leaves: number[][] = [[]];
          for (let i = 0; i < size; i++)
            leaves = leaves.flatMap((p) => die.map((f) => [...p, f]));
          const value = (faces: number[]) =>
            choose
              ? Math.max(...faces.map((f) => values[f]!))
              : Math.min(...faces.map((f) => values[f]!));
          const mean = leaves.reduce((n, f) => n + value(f), 0) / leaves.length;
          let total = 0;
          for (const faces of leaves) {
            const r = analyze(
                skillBlockXml(
                  a,
                  d,
                  faces,
                  faces.map((f) => outcomes[f]!),
                  choose
                )
              ),
              e = r.events.find((e) => e.metadata.block)!;
            expect(e.scoringStatus).toBe("scored");
            expect(e.probabilitySuccess).toBeNull();
            expect(e.delta).toBeCloseTo(value(faces) - mean, 12);
            total += e.delta;
            checked++;
          }
          expect(total / leaves.length).toBeCloseTo(0, 12);
        }
    expect(checked).toBe(2064);
  }, 90000);
  it.each(["always", "after_attacker_down", "never"])(
    "retains zero mean with %s team rerolls",
    (policy) => {
      const die = [0, 1, 2, 2, 3, 4],
        outcomes = [0, 5, 4, 6, 6],
        values = [-1, 1, 0, 1, 1];
      let sum = 0;
      for (const first of die)
        for (const next of die) {
          const use =
            policy === "always" ||
            (policy === "after_attacker_down" && first === 0);
          const r = analyze(
            skillBlockXml([30], [], [first], [outcomes[first]!], true, (q) => [
              `<ResultTeamRerollUsage><GamerId>0</GamerId><Used>${Number(use)}</Used></ResultTeamRerollUsage>`,
              ...(use
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
            ])
          );
          const pools = r.events.filter((e) => e.metadata.block),
            expected =
              values[first]! - 1 / 3 + (use ? values[next]! - 1 / 3 : 0);
          expect(pools).toHaveLength(use ? 2 : 1);
          expect(pools.reduce((n, e) => n + e.delta, 0)).toBeCloseTo(
            expected,
            12
          );
          expect(r.rerollResources.recordedUsedCount).toBe(Number(use));
          valid(r);
          sum += expected;
        }
      expect(sum / 36).toBeCloseTo(0, 12);
    }
  );
  it.each([
    [1, 5],
    [2, 4]
  ])(
    "retains offered opportunity when the coach chooses face %s",
    (face, outcome) => {
      const r = analyze(
          skillBlockXml([30], [], [1, 2], [5, 4], true, () => [
            `<ResultBlockRoll><RollStatus>1</RollStatus><Die><DieType>2</DieType><Value>${face}</Value></Die><RollType>3</RollType><Outcome>${outcome}</Outcome><NewRoll>1</NewRoll></ResultBlockRoll>`
          ])
        ),
        e = r.events.find((e) => e.metadata.block)!;
      expect(e.metadata.block!.selectedFace).toBe(face);
      expect(e.delta).toBeCloseTo(5 / 18, 12);
      valid(r);
    }
  );
  it("keeps the first draw but withholds an unavailable team replacement", () => {
    const r = analyze(
      skillBlockXml(
        [30],
        [],
        [0],
        [0],
        true,
        (q) => [
          "<ResultTeamRerollUsage><GamerId>0</GamerId><Used>1</Used></ResultTeamRerollUsage>",
          q
            .replace("<RollStatus>1</RollStatus>", "<RollStatus>2</RollStatus>")
            .replace("<Value>0</Value>", "<Value>4</Value>")
            .replace(
              "<DiceOutcomesItem>0</DiceOutcomesItem>",
              "<DiceOutcomesItem>6</DiceOutcomesItem>"
            )
        ],
        false
      )
    );
    const qs = r.events.filter(
      (e) => e.metadata.sourceTag === "QuestionBlockDice"
    );
    expect(qs).toHaveLength(2);
    expect(qs[0]!.delta).toBeCloseTo(-4 / 3, 12);
    expect(qs[1]!.scoringStatus).toBe("excluded");
    expect(qs[1]!.metadata.blockScoring).toBeUndefined();
    expect(r.rerollResources.recordedUsedCount).toBe(1);
    expect(r.rerollResources.linkedCount).toBe(0);
    valid(r);
  });
  it("does not erase the qualified pool after an unknown later event", () => {
    const xml = skillBlockXml([30], [], [1], [5]),
      before = analyze(xml).events.find((e) => e.metadata.block)!;
    const after = analyze(
      xml.replace(
        "</Replay>",
        "<ReplayStep><EventUnknownMutation/></ReplayStep></Replay>"
      )
    ).events.find((e) => e.metadata.block)!;
    expect(after).toEqual(before);
  });
  it.each([
    "control",
    "unknown policy",
    "unknown base odds",
    "unknown adjusted odds"
  ])("rejects misplaced categorical policy or fabricated odds: %s", (kind) => {
    const r = analyze(
      skillBlockXml(
        [999],
        [],
        [4],
        [6],
        true,
        kind === "control"
          ? () => [
              "<ResultTeamRerollUsage><GamerId>0</GamerId><Used>0</Used></ResultTeamRerollUsage>"
            ]
          : undefined
      )
    );
    valid(r);
    const e = r.events.find((e) =>
      kind === "control" ? !e.metadata.block : !!e.metadata.block
    )!;
    if (kind.includes("base")) e.explainability.baseOdds = 0.5;
    else if (kind.includes("adjusted"))
      e.explainability.rerollAdjustedOdds = 0.5;
    else e.metadata.probabilityPolicy = "categorical_block";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  const forgeries: [string, (e: LuckEvent) => void][] = [
    [
      "rarity tag",
      (e) => {
        e.tags = ["blessed"];
      }
    ],
    [
      "offered value",
      (e) => {
        e.metadata.blockScoring!.observedValue = 0;
      }
    ],
    [
      "mean",
      (e) => {
        e.metadata.blockScoring!.expectedValue = 0;
      }
    ],
    [
      "source",
      (e) => {
        e.metadata.blockScoring!.poolSourceId = "invented";
      }
    ],
    [
      "deviation",
      (e) => {
        e.delta = 0;
      }
    ],
    [
      "weight",
      (e) => {
        e.weightedDelta = 0;
      }
    ],
    [
      "removed receipt",
      (e) => {
        delete e.metadata.blockScoring;
      }
    ],
    [
      "binary success",
      (e) => {
        e.actualSuccess = true;
        e.probabilitySuccess = 1 / 2;
      }
    ],
    [
      "changed choice policy",
      (e) => {
        e.metadata.block!.skillModel!.wrestlePolicy = "decline";
      }
    ],
    [
      "unknown tackle zone",
      (e) => {
        e.metadata.block!.traitEvidence!.attacker.tackleZone = null;
      }
    ]
  ];
  it.each(forgeries)(
    "rejects public block scoring forgery: %s",
    (_name, mutate) => {
      const r = analyze(skillBlockXml([30], [], [1], [5])),
        e = r.events.find((e) => e.metadata.block)!;
      mutate(e);
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  );
});
