import type { ReplayEvent } from "@/domain/replay/types";

export const BLOCK_FACES = [
  "Attacker Down",
  "Both Down",
  "Push",
  "Defender Stumbles",
  "Defender Down"
] as const;
const DIE = [0, 1, 2, 2, 3, 4] as const;
export type BlockPool = {
  faces: number[];
  rolledIndexes: number[];
  attackerChooses: boolean;
  outcomes: number[];
  sourceId?: string;
};
export type BlockEvidence = {
  pool: BlockPool;
  attackerId: string;
  defenderId: string;
  chooserGamerId?: number;
  selectedFace: number;
  selectedOutcome: number;
  finalOutcome: number;
  finalSourceId?: string;
  reroll: "initial" | "team" | "brawler";
};
export type BlockRecord =
  | { kind: "pool"; evidence?: BlockEvidence }
  | { kind: "summary"; reason: string };

type RecordLike = Record<string, unknown>;
function record(value: unknown): RecordLike | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordLike)
    : undefined;
}
function values(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
function integer(value: unknown, low: number, high: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= low &&
    value <= high
  );
}
function face(value: unknown): number | undefined {
  const die = record(value);
  return die?.DieType === 2 && integer(die.Value, 0, 4) ? die.Value : undefined;
}
function parsePool(event: ReplayEvent): BlockPool | undefined {
  const p = event.payload;
  const faces = values(record(p?.Dice)?.Die).map(face);
  const indexes = values(record(p?.RolledDiceIndexes)?.RolledDiceIndexesItem);
  const outcomes = values(record(p?.DiceOutcomes)?.DiceOutcomesItem);
  if (
    event.rollType !== 3 ||
    faces.length < 1 ||
    faces.length > 3 ||
    faces.some((f) => f === undefined) ||
    !indexes.every((i) => integer(i, 0, faces.length - 1)) ||
    new Set(indexes).size !== indexes.length ||
    outcomes.length !== faces.length ||
    !outcomes.every((o) => integer(o, 0, 6)) ||
    (p?.AttackerChoice !== 0 && p?.AttackerChoice !== 1)
  )
    return;
  return {
    faces: faces as number[],
    rolledIndexes: indexes as number[],
    outcomes: outcomes as number[],
    attackerChooses: p.AttackerChoice === 1,
    sourceId: event.id
  };
}

// This is a distribution over raw symbols under a stated ordering, independent
// of the coach's selected face and of skill-adjusted resolution. Replacements
// enumerate only the fresh indices, conditioning on dice actually retained.
export function enumerateBlockPool(pool: BlockPool): {
  distribution: number[];
  favoredSymbol: number;
  chance: number;
} {
  const counts = [0, 0, 0, 0, 0];
  const faces = pool.faces.slice();
  const select = (poolFaces: number[]) =>
    pool.attackerChooses ? Math.max(...poolFaces) : Math.min(...poolFaces);
  function enumerate(depth: number) {
    const index = pool.rolledIndexes[depth];
    if (index === undefined) {
      counts[select(faces)]!++;
      return;
    }
    for (const die of DIE) {
      faces[index] = die;
      enumerate(depth + 1);
    }
  }
  enumerate(0);
  const samples = 6 ** pool.rolledIndexes.length;
  return {
    distribution: counts.map((n) => n / samples),
    favoredSymbol: select(pool.faces),
    chance: (counts[3]! + counts[4]!) / samples
  };
}

export function linkBlockPools(
  events: readonly ReplayEvent[],
  version: string | undefined
): Map<number, BlockRecord> {
  const records = new Map<number, BlockRecord>();
  if (version !== "1-4-0-0") return records;
  type Anchor = {
    index: number;
    pool: BlockPool;
    reroll: BlockEvidence["reroll"];
  };
  let chain:
    | {
        attacker: string;
        defender: string;
        pools: Anchor[];
        gamer?: number;
        chooser?: number;
        choice?: "team" | "brawler";
        gated: boolean;
        selected?: { face: number; outcome: number };
      }
    | undefined;
  for (const [index, event] of events.entries()) {
    // A BoardState carrier observation sits between split block sequences.
    // The action messages, not this repeated snapshot field, decide linkage.
    if (event.sourceTag === "Carrier") continue;
    const p = event.payload;
    const sameBlock =
      chain &&
      event.stepTag === "PlayerStep" &&
      event.stepType === 6 &&
      event.stepActorId === chain.attacker &&
      event.stepTargetId === chain.defender;
    if (!sameBlock) chain = undefined;
    if (event.sourceTag === "QuestionBlockDice") {
      const pool = parsePool(event);
      const attacker = event.stepActorId,
        defender = event.stepTargetId;
      const gamer = integer(p?.GamerId, 0, 1) ? p.GamerId : undefined;
      if (
        p?.RollStatus === 1 &&
        pool &&
        pool.rolledIndexes.length === pool.faces.length &&
        event.stepTag === "PlayerStep" &&
        event.stepType === 6 &&
        attacker &&
        defender &&
        attacker !== defender &&
        defender !== "-1" &&
        gamer !== undefined
      ) {
        records.set(index, { kind: "pool" });
        chain = {
          attacker,
          defender,
          pools: [{ index, pool, reroll: "initial" }],
          gamer,
          chooser: p.CanChoseDie === 1 ? gamer : undefined,
          gated: false
        };
        continue;
      }
      const last = chain?.pools.at(-1)?.pool;
      const consistent =
        pool &&
        last &&
        pool.faces.length === last.faces.length &&
        pool.attackerChooses === last.attackerChooses;
      if (
        chain &&
        pool &&
        last &&
        consistent &&
        (p?.RollStatus === 1 || p?.RollStatus === 2) &&
        pool.rolledIndexes.length === 0 &&
        pool.faces.every((value, i) => value === last.faces[i])
      ) {
        // The controller can change with no fresh dice (UI-059); a failed
        // Loner can advance RollStatus without fresh dice (UI-020).
        if (p?.CanChoseDie === 1 && gamer !== undefined) chain.chooser = gamer;
        records.set(index, {
          kind: "summary",
          reason: "repeated block pool with no newly rolled indices"
        });
        continue;
      }
      if (
        chain &&
        pool &&
        last &&
        consistent &&
        p?.RollStatus === 2 &&
        pool.rolledIndexes.length > 0 &&
        chain.choice &&
        !chain.gated &&
        gamer === chain.gamer &&
        pool.faces.every(
          (value, i) =>
            pool.rolledIndexes.includes(i) || value === last.faces[i]
        ) &&
        (chain.choice === "team"
          ? pool.rolledIndexes.length === pool.faces.length
          : pool.rolledIndexes.length === 1 &&
            last.faces[pool.rolledIndexes[0]!] === 1)
      ) {
        records.set(index, { kind: "pool" });
        chain.pools.push({ index, pool, reroll: chain.choice });
        chain.choice = undefined;
        if (p.CanChoseDie === 1 && gamer !== undefined) chain.chooser = gamer;
        continue;
      }
      // Unknown replacement histories remain visible without odds.
      records.set(index, { kind: "pool" });
      chain = undefined;
      continue;
    }
    if (!chain) continue;
    if (
      event.sourceTag === "ResultTeamRerollUsage" &&
      p?.Used === 1 &&
      p.GamerId === chain.gamer
    )
      chain.choice = "team";
    if (event.sourceTag === "ResultSkillUsage" && p?.Used === 1) {
      if (p.Skill === 96 && String(p.PlayerId) === chain.attacker)
        chain.choice = "brawler";
      // Skill 44 is Loner(4+); an actual type-71 result is handled below.
    }
    if (event.sourceTag === "ResultRoll") chain.gated = true;
    if (event.sourceTag === "ResultBlockRoll") {
      const f = face(p?.Die);
      const last = chain.pools.at(-1)!.pool;
      if (
        f === undefined ||
        !last.faces.includes(f) ||
        !integer(p?.Outcome, 0, 6)
      ) {
        chain = undefined;
        continue;
      }
      chain.selected = { face: f, outcome: p.Outcome };
      records.set(index, {
        kind: "summary",
        reason: "selected die from the linked block pool"
      });
    }
    if (event.sourceTag === "ResultBlockOutcome") {
      if (
        String(p?.AttackerId) === chain.attacker &&
        String(p?.DefenderId) === chain.defender &&
        integer(p?.Outcome, 0, 6) &&
        chain.selected &&
        chain.chooser !== undefined
      ) {
        for (const anchor of chain.pools)
          records.set(anchor.index, {
            kind: "pool",
            evidence: {
              pool: anchor.pool,
              attackerId: chain.attacker,
              defenderId: chain.defender,
              chooserGamerId: chain.chooser,
              selectedFace: chain.selected.face,
              selectedOutcome: chain.selected.outcome,
              finalOutcome: p.Outcome,
              finalSourceId: event.id,
              reroll: anchor.reroll
            }
          });
      }
      chain = undefined;
    }
  }
  return records;
}
