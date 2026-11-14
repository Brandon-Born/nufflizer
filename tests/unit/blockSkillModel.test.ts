import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  enumerateSkillBlock,
  faceOutcome,
  BLOCK_KNOCKDOWN_VALUES,
  type WrestlePolicy
} from "@/domain/nufflizer/blockSkillModel";
import type { BlockTraitEvidence } from "@/domain/replay/traitContinuity";
const cases = JSON.parse(
  readFileSync("tests/fixtures/evidence/block-skill-arithmetic.json", "utf8")
).cases as {
  attackerSkills: number[];
  defenderSkills: number[];
  faces: number[];
  rolledIndexes: number[];
  attackerChooses: boolean;
  wrestlePolicy: WrestlePolicy;
  faceOutcomes: number[];
  distribution: string[];
  expectedValue: string;
  positiveChance: string;
  poolOutcome: number;
}[];
const fraction = (s: string) => {
  const [n, d = "1"] = s.split("/");
  return Number(n) / Number(d);
};
const evidence = (a: number[], d: number[]): BlockTraitEvidence => ({
  attacker: {
    playerId: "42",
    teamId: "0",
    rosterIndex: 0,
    observedCheckpointAfter: 0,
    currentCheckpointAfter: 3,
    prayersCheckpointAfter: 0,
    onPitch: true,
    tackleZone: true,
    statusCode: null,
    traits: {
      dataPlayerId: 42,
      playerTypeId: 1,
      innateSkills: a,
      acquiredSkills: []
    }
  },
  defender: {
    playerId: "7",
    teamId: "1",
    rosterIndex: 1,
    observedCheckpointAfter: 0,
    currentCheckpointAfter: 3,
    prayersCheckpointAfter: 0,
    onPitch: true,
    tackleZone: true,
    statusCode: null,
    traits: {
      dataPlayerId: 7,
      playerTypeId: 2,
      innateSkills: d,
      acquiredSkills: []
    }
  }
});
describe("fixed-policy single-pool skill distributions", () => {
  it("matches 1024 independently enumerated exact rational cases including conditional kept dice", () => {
    expect(cases).toHaveLength(1024);
    for (const c of cases) {
      const result = enumerateSkillBlock(
        {
          faces: c.faces,
          rolledIndexes: c.rolledIndexes,
          attackerChooses: c.attackerChooses,
          outcomes: []
        },
        evidence(c.attackerSkills, c.defenderSkills),
        c.wrestlePolicy
      )!;
      expect(result.faceOutcomes).toEqual(c.faceOutcomes);
      expect(result.poolOutcome).toBe(c.poolOutcome);
      result.outcomeDistribution.forEach((p, i) =>
        expect(p).toBeCloseTo(fraction(c.distribution[i]!), 12)
      );
      expect(result.expectedValue).toBeCloseTo(fraction(c.expectedValue), 12);
      expect(result.positiveChance).toBeCloseTo(fraction(c.positiveChance), 12);
      expect(result.outcomeDistribution.reduce((a, b) => a + b)).toBeCloseTo(
        1,
        12
      );
      expect(
        result.outcomeDistribution.reduce(
          (sum, p, i) =>
            sum + p * (BLOCK_KNOCKDOWN_VALUES[i]! - result.expectedValue),
          0
        )
      ).toBeCloseTo(0, 12);
    }
  });
  it("regenerates the stdlib oracle without runtime parser/scorer imports", () => {
    const p = spawnSync(
      "python3",
      ["scripts/verify-block-skill-arithmetic.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stdout + p.stderr).toBe(0);
  });
  it("distinguishes Block, Dodge/Tackle and optional Wrestle from raw symbols", () => {
    expect(faceOutcome(1, new Set([30]), new Set(), "decline")).toBe(5);
    expect(faceOutcome(1, new Set([30]), new Set([30]), "decline")).toBe(3);
    expect(faceOutcome(3, new Set(), new Set([7]), "decline")).toBe(4);
    expect(faceOutcome(3, new Set([57]), new Set([7]), "decline")).toBe(6);
    expect(
      faceOutcome(1, new Set([68]), new Set([30]), "improve_knockdown_balance")
    ).toBe(2);
    expect(
      faceOutcome(1, new Set([68]), new Set(), "improve_knockdown_balance")
    ).toBe(1);
  });
  it.each([999, 17, 96, 69])(
    "withholds unaccepted skill %s instead of treating it as no skill",
    (skill) => {
      expect(
        enumerateSkillBlock(
          {
            faces: [1],
            rolledIndexes: [0],
            attackerChooses: true,
            outcomes: [1]
          },
          evidence([skill], [])
        )
      ).toBeUndefined();
    }
  );
  it.each(
    [[4], [0, 0], [-1], [0, 1, 2, 3]].map((rolledIndexes) => ({
      rolledIndexes
    }))
  )("rejects invalid fresh indices $rolledIndexes", ({ rolledIndexes }) => {
    expect(
      enumerateSkillBlock(
        { faces: [1, 2], rolledIndexes, attackerChooses: true, outcomes: [] },
        evidence([], [])
      )
    ).toBeUndefined();
  });
  it.each(["off-pitch", "no-tackle-zone", "unknown-tackle-zone", "prone"])(
    "withholds an inapplicable %s pool model",
    (kind) => {
      const e = evidence([30], [7]);
      if (kind === "off-pitch") e.defender.onPitch = false;
      if (kind === "no-tackle-zone") e.defender.tackleZone = false;
      if (kind === "unknown-tackle-zone") e.defender.tackleZone = null;
      if (kind === "prone") e.defender.statusCode = 1;
      expect(
        enumerateSkillBlock(
          {
            faces: [1],
            rolledIndexes: [0],
            attackerChooses: true,
            outcomes: [1]
          },
          e
        )
      ).toBeUndefined();
    }
  );
  it("never mutates traits, the observed pool or retained dice", () => {
    const p = {
        faces: [0, 1, 4],
        rolledIndexes: [1],
        attackerChooses: true,
        outcomes: [0, 1, 6]
      },
      e = evidence([30], [7]),
      before = JSON.stringify({ p, e });
    enumerateSkillBlock(p, e);
    expect(JSON.stringify({ p, e })).toBe(before);
  });
});
