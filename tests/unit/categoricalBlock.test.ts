import { describe, it, expect } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { skillBlockXml } from "../helpers/skillBlock";

const cases = [
  {
    name: "ordinary Push",
    a: [],
    d: [],
    faces: [2],
    outcomes: [4],
    value: 0,
    mean: 1 / 6,
    delta: -1 / 6
  },
  {
    name: "Block prevents the attacker's Both Down knockdown",
    a: [30],
    d: [],
    faces: [1],
    outcomes: [5],
    value: 1,
    mean: 1 / 3,
    delta: 2 / 3
  },
  {
    name: "both Block players stay up",
    a: [30],
    d: [30],
    faces: [1],
    outcomes: [3],
    value: 0,
    mean: 1 / 6,
    delta: -1 / 6
  },
  {
    name: "opposing Block makes Both Down attacker-only",
    a: [],
    d: [30],
    faces: [1],
    outcomes: [0],
    value: -1,
    mean: 0,
    delta: -1
  },
  {
    name: "Dodge converts Stumbles to a push",
    a: [30],
    d: [7],
    faces: [3],
    outcomes: [4],
    value: 0,
    mean: 1 / 6,
    delta: -1 / 6
  },
  {
    name: "Tackle prevents that Dodge resolution",
    a: [30, 57],
    d: [7],
    faces: [3],
    outcomes: [6],
    value: 1,
    mean: 1 / 3,
    delta: 2 / 3
  },
  {
    name: "attacker Wrestle improves a losing Both Down",
    a: [68],
    d: [30],
    faces: [1],
    outcomes: [2],
    value: 0,
    mean: 1 / 6,
    delta: -1 / 6
  },
  {
    name: "defender Wrestle avoids a losing Both Down",
    a: [30],
    d: [68],
    faces: [1],
    outcomes: [2],
    value: 0,
    mean: 1 / 6,
    delta: -1 / 6
  },
  {
    name: "defender chooses from two dice",
    a: [],
    d: [],
    faces: [2, 4],
    outcomes: [4, 6],
    attackerChooses: false,
    value: 0,
    mean: -7 / 36,
    delta: 7 / 36
  },
  {
    name: "three skulls retain all attacker risk",
    a: [],
    d: [],
    faces: [0, 0, 0],
    outcomes: [0, 0, 0],
    value: -1,
    mean: 151 / 216,
    delta: -367 / 216
  }
];
describe("skill-conditioned categorical block luck", () => {
  it.each(cases)("scores $name from its pre-choice pool", (c) => {
    const r = analyzeReplayLuck(
        parseReplayXml(
          skillBlockXml(c.a, c.d, c.faces, c.outcomes, c.attackerChooses)
        )
      ),
      e = r.events.find((e) => e.metadata.block)!;
    expect(e.metadata.block?.skillModel).toBeDefined();
    expect(e.metadata.block!.skillModel!.poolValue).toBe(c.value);
    expect(e.metadata.block!.skillModel!.expectedValue).toBeCloseTo(c.mean, 12);
    expect(e.delta).toBeCloseTo(c.delta, 12);
    expect(e.weightedDelta).toBeCloseTo(c.delta * 0.75, 12);
    expect(e.actualSuccess).toBeNull();
    expect(e.probabilitySuccess).toBeNull();
    expect(e.scoringStatus).toBe("scored");
    {
      const v = LuckReportSchema.safeParse(r);
      expect(v.success, JSON.stringify(v.error?.issues.slice(0, 5))).toBe(true);
    }
  });
  it.each([999, 17])(
    "retains a raw pool with unsupported skill %s without a luck point",
    (skill) => {
      const r = analyzeReplayLuck(
          parseReplayXml(skillBlockXml([skill], [], [4], [6]))
        ),
        e = r.events.find((e) => e.metadata.block)!;
      expect(e).toMatchObject({
        scoringStatus: "excluded",
        probabilitySuccess: null,
        actualSuccess: null,
        delta: 0,
        weightedDelta: 0
      });
      expect(e.metadata.block!.pool.faces).toEqual([4]);
      {
        const v = LuckReportSchema.safeParse(r);
        expect(v.success, JSON.stringify(v.error?.issues.slice(0, 5))).toBe(
          true
        );
      }
    }
  );
});
