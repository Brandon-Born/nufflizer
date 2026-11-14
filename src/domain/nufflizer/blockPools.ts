import type { ReplayEvent } from "@/domain/replay/types";
import type { RerollLink } from "./rerolls";

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
  proEligibleIndexes?: number[];
};
export type BlockEvidence = {
  pool: BlockPool;
  attackerId: string;
  defenderId: string;
  chooserGamerId?: number;
  selectedFace?: number;
  selectedOutcome?: number;
  selectedSourceId?: string;
  finalOutcome?: number;
  finalSourceId?: string;
  reroll: "initial" | "team" | "brawler" | "pro" | "loner";
  proGateSourceId?: string;
  lonerGateSourceId?: string;
  previousPoolSourceId?: string;
};
export type BlockRecord =
  | { kind: "pool"; evidence?: BlockEvidence }
  | { kind: "summary"; reason: string; poolSourceId?: string };

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
  const proIndexes =
    p?.ProDiceIndexes === undefined
      ? undefined
      : values(record(p.ProDiceIndexes)?.ProDiceIndexesItem);
  if (
    event.rollType !== 3 ||
    faces.length < 1 ||
    faces.length > 3 ||
    faces.some((f) => f === undefined) ||
    !indexes.every((i) => integer(i, 0, faces.length - 1)) ||
    new Set(indexes).size !== indexes.length ||
    outcomes.length !== faces.length ||
    !outcomes.every((o) => integer(o, 0, 6)) ||
    (proIndexes !== undefined &&
      (!proIndexes.every((i) => integer(i, 0, faces.length - 1)) ||
        new Set(proIndexes).size !== proIndexes.length)) ||
    (p?.AttackerChoice !== 0 && p?.AttackerChoice !== 1)
  )
    return;
  return {
    faces: faces as number[],
    rolledIndexes: indexes as number[],
    outcomes: outcomes as number[],
    attackerChooses: p.AttackerChoice === 1,
    sourceId: event.id,
    proEligibleIndexes: proIndexes as number[] | undefined
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

export function explainBlockEvidence(block: BlockEvidence): string {
  return [
    block.pool.faces.map((f) => BLOCK_FACES[f]).join(", ") + ".",
    (block.pool.attackerChooses ? "Attacker" : "Defender") +
      " controls the choice.",
    block.selectedFace === undefined
      ? "The selected die is unknown."
      : "The linked action selected " + BLOCK_FACES[block.selectedFace] + ".",
    block.finalOutcome === undefined
      ? "The applied result is unknown."
      : "Applied outcome " + block.finalOutcome + ".",
    block.reroll === "pro"
      ? "The replacement distribution is conditional on the recorded Pro pass."
      : block.reroll === "loner"
        ? "The fresh full-pool distribution is conditional on the recorded Loner pass. The gate itself adds no score."
        : null,
    "These observed symbols and choices are separate from a qualified skill-conditioned luck score."
  ]
    .filter(Boolean)
    .join(" ");
}

export function linkBlockPools(
  events: readonly ReplayEvent[],
  version: string | undefined,
  rerollLinks: ReadonlyMap<number, RerollLink> = new Map()
): Map<number, BlockRecord> {
  const records = new Map<number, BlockRecord>();
  if (version !== "1-4-0-0") return records;
  const initialCounts = new Map<string, number>();
  for (const event of events) {
    if (
      !event.actionId ||
      event.sourceTag !== "QuestionBlockDice" ||
      event.payload?.RollStatus !== 1
    )
      continue;
    const pool = parsePool(event);
    if (pool && pool.rolledIndexes.length === pool.faces.length)
      initialCounts.set(
        event.actionId,
        (initialCounts.get(event.actionId) ?? 0) + 1
      );
  }
  type Anchor = {
    index: number;
    pool: BlockPool;
    reroll: BlockEvidence["reroll"];
    proGateSourceId?: string;
    lonerGateSourceId?: string;
    previousPoolSourceId?: string;
  };
  let chain:
    | {
        attacker: string;
        defender: string;
        pools: Anchor[];
        gamer?: number;
        chooser?: number;
        choice?: "team" | "brawler" | "pro" | "loner";
        teamOffered: boolean;
        lonerStage: "choice" | "skill" | "gate" | "pool" | "broken";
        proSkillSourceId?: string;
        proGateSourceId?: string;
        lonerGateSourceId?: string;
        gated: boolean;
        selected?: { face: number; outcome: number; sourceId?: string };
      }
    | undefined;
  for (const [index, event] of events.entries()) {
    // A BoardState carrier observation sits between split block sequences.
    // The action messages, not this repeated snapshot field, decide linkage.
    if (event.sourceTag === "Carrier") {
      if (chain && !event.checkpointCarrier) chain.lonerStage = "broken";
      continue;
    }
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
        if (event.actionId && initialCounts.get(event.actionId) !== 1) {
          records.set(index, { kind: "pool" });
          chain = undefined;
          continue;
        }
        records.set(index, {
          kind: "pool",
          evidence: {
            pool,
            attackerId: attacker,
            defenderId: defender,
            chooserGamerId: p.CanChoseDie === 1 ? gamer : undefined,
            reroll: "initial"
          }
        });
        chain = {
          attacker,
          defender,
          pools: [{ index, pool, reroll: "initial" }],
          gamer,
          chooser: p.CanChoseDie === 1 ? gamer : undefined,
          gated: false,
          teamOffered: p.CanUseTeamReroll === 1,
          lonerStage: "choice"
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
          reason: "repeated block pool with no newly rolled indices",
          poolSourceId: last.sourceId
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
        (chain.choice === "team" || chain.choice === "loner"
          ? pool.rolledIndexes.length === pool.faces.length &&
            (chain.choice !== "loner" ||
              (chain.lonerStage === "pool" &&
                !!chain.lonerGateSourceId &&
                !!last.sourceId &&
                !!event.id))
          : chain.choice === "brawler"
            ? pool.rolledIndexes.length === 1 &&
              last.faces[pool.rolledIndexes[0]!] === 1
            : pool.rolledIndexes.length === 1 &&
              last.proEligibleIndexes?.includes(pool.rolledIndexes[0]!))
      ) {
        const lonerGateSourceId =
          chain.choice === "loner" ? chain.lonerGateSourceId : undefined;
        const proGateSourceId =
          chain.choice === "pro" ? chain.proGateSourceId : undefined;
        records.set(index, {
          kind: "pool",
          evidence: {
            pool,
            attackerId: chain.attacker,
            defenderId: chain.defender,
            chooserGamerId: p.CanChoseDie === 1 ? gamer : undefined,
            reroll: chain.choice,
            proGateSourceId,
            lonerGateSourceId,
            previousPoolSourceId: last.sourceId
          }
        });
        chain.pools.push({
          index,
          pool,
          reroll: chain.choice,
          proGateSourceId,
          lonerGateSourceId,
          previousPoolSourceId: last.sourceId
        });
        chain.choice = undefined;
        chain.proGateSourceId = undefined;
        chain.lonerGateSourceId = undefined;
        chain.lonerStage = "broken";
        chain.teamOffered = p.CanUseTeamReroll === 1;
        if (p.CanChoseDie === 1 && gamer !== undefined) chain.chooser = gamer;
        continue;
      }
      // Unknown replacement histories remain visible without odds.
      records.set(index, { kind: "pool" });
      chain = undefined;
      continue;
    }
    if (!chain) continue;
    if (event.sourceTag === "PlayerStep") {
      if (chain.lonerStage !== "choice") chain.lonerStage = "broken";
    } else if (
      !["ResultTeamRerollUsage", "ResultSkillUsage", "ResultRoll"].includes(
        event.sourceTag
      )
    ) {
      chain.lonerStage = "broken";
    }
    if (
      event.sourceTag === "ResultTeamRerollUsage" &&
      p?.Used === 1 &&
      chain.teamOffered &&
      p.GamerId === chain.gamer
    ) {
      chain.choice = "team";
      chain.lonerStage =
        chain.lonerStage === "choice" && chain.teamOffered ? "skill" : "broken";
    }
    if (event.sourceTag === "ResultSkillUsage" && p?.Used === 1) {
      if (p.Skill === 96 && String(p.PlayerId) === chain.attacker)
        chain.choice = "brawler";
      if (p.Skill === 50 && String(p.PlayerId) === chain.attacker)
        chain.proSkillSourceId = event.id;
      if (
        (p.Skill === 44 || p.Skill === 1008) &&
        String(p.PlayerId) === chain.attacker &&
        chain.lonerStage === "skill"
      )
        chain.lonerStage = "gate";
      else chain.lonerStage = "broken";
    }
    if (event.sourceTag === "ResultRoll") {
      const loner = rerollLinks.get(index)?.lonerGate;
      const gate = rerollLinks.get(index)?.proGate;
      const allowedLoner =
        loner?.passed === true &&
        chain.lonerStage === "gate" &&
        chain.choice === "team" &&
        loner.gamerId === chain.gamer &&
        event.id !== undefined;
      const allowedPro =
        gate?.passed === true &&
        event.id !== undefined &&
        gate.skillSourceId === chain.proSkillSourceId;
      chain.gated = !(allowedLoner || allowedPro);
      if (allowedLoner) {
        chain.choice = "loner";
        chain.lonerGateSourceId = event.id;
        chain.lonerStage = "pool";
      } else if (allowedPro) {
        chain.choice = "pro";
        chain.proGateSourceId = event.id;
        chain.lonerStage = "broken";
      } else {
        chain.choice = undefined;
        chain.lonerStage = "broken";
      }
      chain.proSkillSourceId = undefined;
    }
    if (event.sourceTag === "QuestionPushBack" && chain.selected) {
      const copied = record(p?.BlockRoll),
        f = face(copied?.Die),
        last = chain.pools.at(-1)?.pool;
      if (
        copied?.RollType === 3 &&
        f === chain.selected.face &&
        copied.Outcome === chain.selected.outcome &&
        last?.sourceId
      )
        records.set(index, {
          kind: "summary",
          reason: "push-choice copy of the selected block die",
          poolSourceId: last.sourceId
        });
    }
    if (event.sourceTag === "QuestionBlockSkillUsage") {
      const copied = record(p?.RollInfos),
        f = face(copied?.Die),
        last = chain.pools.at(-1)?.pool;
      if (copied?.RollType === 3 && f !== undefined && last?.faces.includes(f))
        records.set(index, {
          kind: "summary",
          reason: "skill-choice copy of a linked block die",
          poolSourceId: last.sourceId
        });
    }
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
      chain.selected = { face: f, outcome: p.Outcome, sourceId: event.id };
      for (const anchor of chain.pools) {
        const observed = records.get(anchor.index);
        if (observed?.kind === "pool" && observed.evidence)
          observed.evidence = {
            ...observed.evidence,
            chooserGamerId: chain.chooser,
            selectedFace: f,
            selectedOutcome: p.Outcome,
            selectedSourceId: event.id
          };
      }
      records.set(index, {
        kind: "summary",
        reason: "selected die from the linked block pool",
        poolSourceId: last.sourceId
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
              selectedSourceId: chain.selected.sourceId,
              finalOutcome: p.Outcome,
              finalSourceId: event.id,
              reroll: anchor.reroll,
              proGateSourceId: anchor.proGateSourceId,
              lonerGateSourceId: anchor.lonerGateSourceId,
              previousPoolSourceId: anchor.previousPoolSourceId
            }
          });
      }
      chain = undefined;
    }
  }
  return records;
}
