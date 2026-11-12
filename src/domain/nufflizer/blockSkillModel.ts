import type { BlockPool } from "./blockPools";
import type { BlockTraitEvidence } from "@/domain/replay/traitContinuity";
// Supported intrinsic skills for this single-pool knockdown component only.
// Strength/armor/recovery/ball skills below do not change a selected block
// symbol's immediate knockdown resolution. Unknown skills are not guessed.
const supported = new Set([
  6, 7, 10, 13, 15, 19, 26, 27, 30, 38, 44, 50, 57, 61, 63, 68, 75, 81, 1008
]);
const die = [0, 1, 2, 2, 3, 4];
export const BLOCK_KNOCKDOWN_VALUES = [-1, 0, 0, 0, 0, 1, 1] as const;
export type WrestlePolicy = "decline" | "improve_knockdown_balance";
export function faceOutcome(
  face: number,
  attacker: ReadonlySet<number>,
  defender: ReadonlySet<number>,
  wrestle: WrestlePolicy
) {
  if (face === 0) return 0;
  if (face === 1) {
    const a = attacker.has(30),
      d = defender.has(30),
      base = a ? (d ? 3 : 5) : d ? 0 : 1;
    const value = BLOCK_KNOCKDOWN_VALUES[base];
    if (
      wrestle === "improve_knockdown_balance" &&
      ((attacker.has(68) && value < 0) || (defender.has(68) && value > 0))
    )
      return 2;
    return base;
  }
  if (face === 2) return 4;
  if (face === 3) return defender.has(7) && !attacker.has(57) ? 4 : 6;
  return 6;
}
export function enumerateSkillBlock(
  pool: BlockPool,
  evidence: BlockTraitEvidence,
  wrestle: WrestlePolicy = "improve_knockdown_balance"
) {
  if (
    [evidence.attacker, evidence.defender].some(
      (p) =>
        !p.onPitch ||
        p.tackleZone !== true ||
        (p.statusCode !== null && p.statusCode !== 0)
    )
  )
    return;
  const lists = [evidence.attacker.traits, evidence.defender.traits];
  if (
    lists.some(
      (t) =>
        t.dataPlayerId === null ||
        t.playerTypeId === null ||
        t.innateSkills === null ||
        t.acquiredSkills === null ||
        [...t.innateSkills, ...t.acquiredSkills].some((s) => !supported.has(s))
    )
  )
    return;
  if (
    pool.faces.length < 1 ||
    pool.faces.length > 3 ||
    pool.rolledIndexes.length < 1 ||
    pool.rolledIndexes.length > 3 ||
    new Set(pool.rolledIndexes).size !== pool.rolledIndexes.length ||
    pool.rolledIndexes.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= pool.faces.length
    ) ||
    pool.faces.some((f) => !Number.isInteger(f) || f < 0 || f > 4)
  )
    return;
  const attacker = new Set([
      ...lists[0]!.innateSkills!,
      ...lists[0]!.acquiredSkills!
    ]),
    defender = new Set([
      ...lists[1]!.innateSkills!,
      ...lists[1]!.acquiredSkills!
    ]);
  const outcomes: number[] = [0, 1, 2, 3, 4].map((f) =>
    faceOutcome(f, attacker, defender, wrestle)
  );
  // Both coaches optimize this explicit, narrow knockdown-balance component.
  // Equal values use the lower outcome code for deterministic enumeration;
  // that tie rule does not assert tactical preference or actual die selection.
  const select = (faces: readonly number[]) =>
    faces
      .map((f) => outcomes[f]!)
      .reduce((a, b) => {
        const av = BLOCK_KNOCKDOWN_VALUES[a]!,
          bv = BLOCK_KNOCKDOWN_VALUES[b]!;
        return av === bv
          ? Math.min(a, b)
          : (pool.attackerChooses ? bv > av : bv < av)
            ? b
            : a;
      });
  const faces = pool.faces.slice(),
    counts = Array<number>(7).fill(0);
  const enumerate = (depth: number) => {
    const index = pool.rolledIndexes[depth];
    if (index === undefined) {
      counts[select(faces)]!++;
      return;
    }
    for (const face of die) {
      faces[index] = face;
      enumerate(depth + 1);
    }
  };
  enumerate(0);
  const samples = 6 ** pool.rolledIndexes.length,
    distribution = counts.map((n) => n / samples),
    poolOutcome = select(pool.faces);
  return {
    policy: "single_pool_knockdown_balance" as const,
    wrestlePolicy: wrestle,
    traitEvidence: evidence,
    faceOutcomes: outcomes,
    outcomeDistribution: distribution,
    expectedValue: distribution.reduce(
      (sum, p, i) => sum + p * BLOCK_KNOCKDOWN_VALUES[i]!,
      0
    ),
    poolOutcome,
    poolValue: BLOCK_KNOCKDOWN_VALUES[poolOutcome]!,
    positiveChance: distribution.reduce(
      (sum, p, i) => sum + (BLOCK_KNOCKDOWN_VALUES[i]! > 0 ? p : 0),
      0
    )
  };
}
