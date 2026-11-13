import { LUCK_CATEGORY_WEIGHTS } from "./constants";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import { verifyLonerTest } from "@/domain/replay/loner";
import { numericCheckExclusion } from "./numericCheckContract";
import { gatedRetryChance } from "./failedNumericRetry";
import type { NumericQuestionOriginal } from "./numericQuestionOriginal";
import type { LuckEvent, LuckReport } from "./types";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Obj)
    : undefined;
const keys = (v: unknown, allowed: string[]) =>
  !!obj(v) && Object.keys(obj(v)!).every((k) => allowed.includes(k));
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    obj(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]])
        )
      : x
  );
const rollKeys = [
  "Status",
  "NewRoll",
  "RollType",
  "Requirement",
  "Difficulty",
  "Outcome",
  "Modifiers",
  "Dice"
];
const headerKeys = [
  "Probability",
  "PlayerId",
  "TargetId",
  "IsEvaluation",
  "StepType",
  "CellTo",
  "State",
  "CellFrom",
  "Skill"
];
function cell(v: unknown) {
  const p = obj(v);
  return keys(p, ["X", "Y"]) &&
    Number.isInteger(p?.X) &&
    Number.isInteger(p?.Y) &&
    Number(p?.X) >= 0 &&
    Number(p?.X) <= 25 &&
    Number(p?.Y) >= 0 &&
    Number(p?.Y) <= 14
    ? p
    : undefined;
}
function die(v: unknown) {
  const dice = obj(obj(v)?.Dice),
    d = obj(dice?.Die);
  return keys(dice, ["Die"]) &&
    keys(d, ["DieType", "Value"]) &&
    d?.DieType === 0 &&
    Number.isInteger(d.Value) &&
    Number(d.Value) >= 1 &&
    Number(d.Value) <= 6
    ? Number(d.Value)
    : undefined;
}
type Receipt = NonNullable<LuckEvent["metadata"]["numericRetryAccess"]>;
export type NumericRetryAccess = {
  question: ReplayEvent;
  choice: ReplayEvent;
  skill: ReplayEvent;
  gate: ReplayEvent;
  original: NumericQuestionOriginal;
  receipt: Receipt;
  replacement?: ReplayEvent;
};

// A gate is selected at its own source prefix, never by a later retained or
// replacement result. Choice/skill sources are deterministic controls.
export function findNumericRetryAccess(
  replay: ReplayModel,
  originals: ReadonlyMap<ReplayEvent, NumericQuestionOriginal>,
  owners: OwnershipTimeline
): NumericRetryAccess[] {
  if (replay.replayVersion !== "1-4-0-0") return [];
  const es = replay.turns.flatMap((t) => t.events),
    found: NumericRetryAccess[] = [];
  const cps = replay.boardCheckpoints ?? [];
  const clock = (b: NonNullable<(typeof cps)[number]["board"]>) =>
    canonical([
      b.phaseCode,
      b.periodCode,
      b.activeTeamIndex,
      b.activeGamerId,
      b.teams.map((t) => [t.rosterIndex, t.explicitTeamId, t.gameTurn])
    ]);
  // One pass over ordered checkpoints; no per-question corpus rescan. This
  // only detects observed barriers, and does not fill any omitted clock field.
  const clocks = new Map<ReplayEvent, number>();
  let cursor = 0,
    epoch = 0,
    previous: string | undefined,
    invalid = false;
  for (const e of es) {
    while (
      cursor < cps.length &&
      cps[cursor]!.afterSourceIndex < (e.sourceIndex ?? -1)
    ) {
      const cp = cps[cursor++]!;
      if (!cp.board) {
        epoch++;
        previous = undefined;
        invalid = true;
      } else {
        const signature = clock(cp.board);
        if (previous !== undefined && signature !== previous) epoch++;
        previous = signature;
        invalid = false;
      }
    }
    clocks.set(e, invalid ? -epoch - 1 : epoch);
  }
  for (let i = 0; i < es.length; i++) {
    const q = es[i]!,
      original = originals.get(q);
    if (
      !original ||
      original.roll.RollType !== 2 ||
      q.stepTag !== "PlayerStep" ||
      q.stepType !== 1 ||
      q.targetId !== "-1" ||
      q.payload?.StarSpecialRule !== -1
    )
      continue;
    let hi = i + 1;
    if (es[hi]?.checkpointCarrier && es[hi]?.sourceTag === "Carrier") hi++;
    const header = es[i - 1],
      resume = es[hi],
      choice = es[hi + 1],
      skill = es[hi + 2],
      gate = es[hi + 3];
    if (
      !header ||
      !resume ||
      !choice ||
      !skill ||
      !gate ||
      !q.id ||
      !choice.id ||
      !skill.id ||
      !gate.id ||
      [header, resume].some(
        (h) =>
          h.type !== "step" ||
          h.sourceTag !== "PlayerStep" ||
          !keys(h.payload, headerKeys) ||
          h.payload?.Skill !== 0 ||
          h.payload.IsEvaluation !== 0 ||
          h.payload.PlayerId !== Number(q.playerId) ||
          h.payload.TargetId !== -1 ||
          h.payload.StepType !== 1 ||
          typeof h.payload.Probability !== "number" ||
          !Number.isFinite(h.payload.Probability) ||
          h.payload.Probability < 0 ||
          h.payload.Probability > 100
      ) ||
      header.payload!.State !== 1 ||
      resume.payload!.State !== 2 ||
      header.actionId !== q.actionId ||
      resume.actionId !== choice.actionId ||
      canonical({ ...header.payload, State: 0 }) !==
        canonical({ ...resume.payload, State: 0 }) ||
      q.locator?.messageIndex !== 0 ||
      (q.locator.replayStep ?? NaN) + 1 !== choice.locator?.replayStep ||
      !cell(header.payload!.CellFrom) ||
      !cell(header.payload!.CellTo)
    )
      continue;
    const from = cell(header.payload!.CellFrom)!,
      to = cell(header.payload!.CellTo)!;
    if (
      Math.max(
        Math.abs(Number(from.X) - Number(to.X)),
        Math.abs(Number(from.Y) - Number(to.Y))
      ) !== 1
    )
      continue;
    const owner = owners.resolve(q.playerId ?? "", q);
    if (
      owner.status !== "confirmed" ||
      [header, q, resume, choice, skill, gate].some((e) => {
        const current = owners.resolve(e.playerId ?? "", e);
        return (
          !e.id ||
          !e.actionId ||
          !e.sequenceId ||
          !Number.isSafeInteger(e.sourceIndex) ||
          e.sourceIndex! < 0 ||
          e.unclassifiedDice ||
          e.attributionConflict ||
          e.playerId !== q.playerId ||
          e.stepActorId !== q.playerId ||
          e.targetId !== "-1" ||
          e.stepTargetId !== "-1" ||
          e.stepType !== 1 ||
          e.stepTag !== "PlayerStep" ||
          e.actorTeamId !== owner.proof.teamId ||
          current.status !== "confirmed" ||
          current.proof.teamId !== owner.proof.teamId
        );
      })
    )
      continue;
    if (
      [choice, skill, gate].some(
        (e, j) =>
          e.actionId !== choice.actionId ||
          e.sequenceId !== choice.sequenceId ||
          e.sourceIndex !== choice.sourceIndex! + j ||
          e.locator?.replayStep !== choice.locator?.replayStep ||
          e.locator?.childIndex !== choice.locator?.childIndex ||
          e.locator?.stepIndex !== 0 ||
          e.locator?.messageIndex !== j
      ) ||
      q.sourceIndex! >= choice.sourceIndex! ||
      choice.sourceTag !== "ResultTeamRerollUsage" ||
      !keys(choice.payload, ["GamerId", "Used"]) ||
      choice.payload?.GamerId !== q.payload?.GamerId ||
      skill.sourceTag !== "ResultSkillUsage" ||
      !keys(skill.payload, ["PlayerId", "Skill", "Used"]) ||
      skill.payload?.Used !== 1 ||
      skill.payload.PlayerId !== Number(q.playerId) ||
      gate.sourceTag !== "ResultRoll" ||
      !keys(gate.payload, rollKeys) ||
      gate.payload?.RollType !== gate.rollType
    )
      continue;
    const questionClock = clocks.get(q),
      gateClock = clocks.get(gate);
    if (
      questionClock === undefined ||
      gateClock === undefined ||
      questionClock < 0 ||
      gateClock < 0 ||
      questionClock !== gateClock
    )
      continue;
    const loner = verifyLonerTest(skill, gate),
      gateFace = die(gate.payload);
    const pro =
      skill.payload.Skill === 50 &&
      gate.rollType === 15 &&
      gate.payload?.Status === 1 &&
      gate.payload.NewRoll === 1 &&
      gate.payload.Requirement === 3 &&
      gate.payload.Difficulty === 3 &&
      (gate.payload.Modifiers === undefined || gate.payload.Modifiers === "") &&
      gateFace !== undefined &&
      gate.payload.Outcome === Number(gateFace >= 3);
    const kind =
      loner &&
      choice.payload?.Used === 1 &&
      original.receipt.canUseTeamReroll &&
      !original.receipt.canUseProReroll
        ? "loner"
        : pro &&
            choice.payload?.Used === 0 &&
            original.receipt.canUseProReroll &&
            !original.receipt.canUseTeamReroll
          ? "pro"
          : undefined;
    if (!kind || gateFace === undefined) continue;
    const odds = gatedRetryChance(
      Number(original.roll.Difficulty),
      Number(gate.payload?.Difficulty)
    );
    if (!odds) continue;
    const receipt: Receipt = {
      kind,
      originalSourceId: q.id,
      choiceSourceId: choice.id,
      skillSourceId: skill.id,
      ...odds
    };
    const next = es[hi + 4];
    const replacementOwner = next
      ? owners.resolve(next.playerId ?? "", next)
      : undefined;
    const replacement =
      gate.payload?.Outcome === 1 &&
      next?.sourceTag === "ResultRoll" &&
      !!next.id &&
      replacementOwner?.status === "confirmed" &&
      replacementOwner.proof.teamId === owner.proof.teamId &&
      next.rollType === 2 &&
      next.actionId === gate.actionId &&
      next.sequenceId === gate.sequenceId &&
      next.sourceIndex === gate.sourceIndex! + 1 &&
      next.playerId === q.playerId &&
      next.stepActorId === q.playerId &&
      next.actorTeamId === owner.proof.teamId &&
      !next.attributionConflict &&
      !next.unclassifiedDice &&
      next.stepType === 1 &&
      next.stepTag === "PlayerStep" &&
      next.targetId === "-1" &&
      next.stepTargetId === "-1" &&
      next.locator?.replayStep === gate.locator?.replayStep &&
      next.locator?.childIndex === gate.locator?.childIndex &&
      next.locator?.stepIndex === 0 &&
      next.locator?.messageIndex === 3 &&
      keys(next.payload, rollKeys) &&
      die(next.payload) !== undefined &&
      next.payload?.Outcome ===
        Number(die(next.payload)! >= Number(next.payload?.Difficulty)) &&
      !numericCheckExclusion(replay.replayVersion, next, true) &&
      next.payload?.Status === 2 &&
      next.payload.NewRoll === 1 &&
      canonical({
        ...next.payload,
        Dice: original.roll.Dice,
        Outcome: 0,
        Status: 1
      }) === canonical(original.roll)
        ? next
        : undefined;
    found.push({
      question: q,
      choice,
      skill,
      gate,
      original,
      receipt,
      replacement
    });
  }
  const counts = new Map<ReplayEvent, number>();
  for (const p of found)
    for (const e of [p.question, p.choice, p.skill, p.gate])
      counts.set(e, (counts.get(e) ?? 0) + 1);
  const unique = found.filter((p) =>
    [p.question, p.choice, p.skill, p.gate].every((e) => counts.get(e) === 1)
  );
  const replacements = new Map<ReplayEvent, number>();
  for (const p of unique)
    if (p.replacement)
      replacements.set(
        p.replacement,
        (replacements.get(p.replacement) ?? 0) + 1
      );
  return unique.map((p) =>
    p.replacement && replacements.get(p.replacement) !== 1
      ? { ...p, replacement: undefined }
      : p
  );
}

// Doob increments of the conditional rescue indicator J=G*R: before the gate
// E[J]=g*p, after it E[J|G]=G*p; after the replacement J=G*R.
export const retryAccessDelta = (p: number, g: number, passed: boolean) =>
  p * (Number(passed) - g);
export function retryAccessFormula(
  p: number,
  g: number,
  passed: boolean,
  weight: number
) {
  return `weighted delta = ${p.toFixed(3)} x (${Number(passed)} - ${g.toFixed(3)}) x ${weight.toFixed(2)} = ${(retryAccessDelta(p, g, passed) * weight).toFixed(3)}`;
}

export function scoreNumericRetryAccess(
  proof: NumericRetryAccess,
  row: LuckEvent,
  first: LuckEvent,
  owners: OwnershipTimeline
) {
  const owner = owners.resolve(proof.gate.playerId!, proof.gate);
  if (
    owner.status !== "confirmed" ||
    first.scoringStatus !== "scored" ||
    !first.metadata.numericOriginal ||
    row.scoringStatus !== "excluded"
  )
    return;
  const r = proof.receipt,
    passed = proof.gate.payload!.Outcome === 1,
    g = r.gateSuccessChance,
    p = r.baseSuccessChance,
    weight = LUCK_CATEGORY_WEIGHTS.dodge;
  row.type = "dodge";
  row.scoringStatus = "scored";
  row.probabilitySuccess = g;
  row.actualSuccess = passed;
  row.delta = retryAccessDelta(p, g, passed);
  row.weightedDelta = row.delta * weight;
  row.label = `${r.kind === "loner" ? `Loner ${proof.gate.payload!.Difficulty}+` : "Pro 3+"} retry access ${passed ? "passed" : "failed"}`;
  row.statusReason =
    "scored: observed gate changes access to one Dodge rescue; original and any fresh replacement retain separate contributions";
  row.explainability = {
    target: `${proof.gate.payload!.Difficulty}+ gate`,
    baseOdds: g,
    rerollAdjustedOdds: g,
    weight,
    formulaSummary: retryAccessFormula(p, g, passed, weight),
    inputsSummary: `${r.kind === "loner" ? "Loner" : "Pro"} gate | die ${row.metadata.dice?.[0]} | target ${proof.gate.payload!.Difficulty}+ | fixed Dodge chance ${(100 * p).toFixed(1)}% | gate chance ${(100 * g).toFixed(1)}% | resource choice and tactical cost are separate`
  };
  row.metadata.numericRetryAccess = r;
  row.metadata.probabilityPolicy = "gated_retry_access";
  row.metadata.preRoll = undefined;
  row.metadata.ownership = { ...owner.proof, role: "actor" };
  row.metadata.rerollResource = r.kind === "loner" ? "team" : "skill";
  row.metadata.teamRerollsSpent = r.kind === "loner" ? 1 : 0;
  row.metadata.rerollUsed = false;
  row.metadata.rerollDecisionId = proof.choice.id;
  if (r.kind === "pro")
    row.metadata.proGate = {
      passed,
      successChance: 2 / 3,
      skillSourceId: proof.skill.id!
    };
  else
    row.metadata.lonerGate = {
      ...verifyLonerTest(proof.skill, proof.gate)!,
      gamerId: proof.original.receipt.gamerId,
      skillSourceId: proof.skill.id!
    };
}

export function validReportedNumericRetryAccess(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  roots: ReadonlyMap<string | undefined, LuckReport["diceRecords"][number]>
) {
  const m = e.metadata,
    r = m.numericRetryAccess;
  if (!r) return m.probabilityPolicy !== "gated_retry_access";
  const first = sources.get(r.originalSourceId),
    choice = sources.get(r.choiceSourceId),
    skill = sources.get(r.skillSourceId),
    d = roots.get(m.sourceId),
    original = first?.metadata.numericOriginal;
  const threshold = r.kind === "pro" ? 3 : m.lonerGate?.threshold,
    odds = gatedRetryChance(first?.metadata.difficulty ?? -1, threshold ?? -1);
  const same = (x: LuckEvent | undefined) =>
    !!x &&
    x.playerId === e.playerId &&
    x.teamId === e.teamId &&
    x.metadata.stepType === 1 &&
    x.metadata.targetId === "-1" &&
    !x.metadata.ownershipConflict;
  if (
    !m.sourceId ||
    !m.actionId ||
    !m.sequenceId ||
    m.locator?.childIndex === undefined ||
    !same(first) ||
    !same(choice) ||
    !same(skill) ||
    !original ||
    !odds ||
    first!.scoringStatus !== "scored" ||
    first!.type !== "dodge" ||
    first!.metadata.rollType !== 2 ||
    e.type !== "dodge" ||
    e.scoringStatus !== "scored" ||
    e.actualSuccess === null ||
    e.probabilitySuccess === null ||
    m.probabilityPolicy !== "gated_retry_access" ||
    m.sourceTag !== "ResultRoll" ||
    m.isRollCandidate !== true ||
    m.stepType !== 1 ||
    m.targetId !== "-1" ||
    m.rerollPolicy !== undefined ||
    m.preRoll ||
    e.contextualImpact ||
    e.contextualBounds ||
    e.possessionBounds ||
    e.catchPossessionBounds ||
    m.rerollDraws ||
    m.originalDice !== undefined ||
    m.rerollOriginalId ||
    m.rerollQuestionId ||
    m.rerollSkill ||
    m.catchRerollResume ||
    m.numericGatedReplacement ||
    m.rerollDecisionId !== r.choiceSourceId ||
    m.rerollUsed !== false ||
    m.teamRerollsSpent !== Number(r.kind === "loner") ||
    m.rerollResource !== (r.kind === "loner" ? "team" : "skill") ||
    first!.metadata.sourceIndex! >= choice!.metadata.sourceIndex! ||
    (first!.metadata.locator?.replayStep ?? NaN) + 1 !==
      m.locator?.replayStep ||
    [choice, skill, e].some(
      (x, i) =>
        x!.metadata.sourceIndex !== choice!.metadata.sourceIndex! + i ||
        x!.metadata.actionId !== m.actionId ||
        x!.metadata.sequenceId !== m.sequenceId ||
        x!.metadata.locator?.replayStep !== m.locator?.replayStep ||
        x!.metadata.locator?.childIndex !== m.locator?.childIndex ||
        x!.metadata.locator?.stepIndex !== 0 ||
        x!.metadata.locator?.messageIndex !== i
    ) ||
    choice!.scoringStatus !== "excluded" ||
    choice!.metadata.sourceTag !== "ResultTeamRerollUsage" ||
    choice!.metadata.isRollCandidate !== false ||
    choice!.metadata.teamRerollDecision?.gamerId !== original.gamerId ||
    choice!.metadata.teamRerollDecision.used !== (r.kind === "loner") ||
    skill!.scoringStatus !== "excluded" ||
    skill!.metadata.sourceTag !== "ResultSkillUsage" ||
    skill!.metadata.isRollCandidate !== false ||
    !skill!.metadata.skillUsage?.used ||
    !d ||
    d.quality !== "complete" ||
    d.status !== 1 ||
    d.newRoll !== 1 ||
    d.disposition !== "covered_roll" ||
    d.parentSourceIndex !== m.sourceIndex ||
    d.stepTag !== "PlayerStep" ||
    d.stepType !== 1 ||
    d.stepActorId !== e.playerId ||
    d.stepTargetId !== "-1" ||
    d.eventId !== e.id ||
    d.parentEventId !== e.id ||
    d.rollType !== m.rollType ||
    d.dice.length !== 1 ||
    d.dice[0]?.dieType !== 0 ||
    d.dice[0].value !== m.dice?.[0] ||
    m.requirement !== threshold ||
    m.difficulty !== threshold ||
    m.outcomeCode !== Number(e.actualSuccess) ||
    e.actualSuccess !== Number(d.dice[0].value) >= threshold! ||
    (m.modifiers?.length ?? 0) !== 0 ||
    m.modifiersSum !== 0 ||
    Object.entries(odds).some(
      ([k, v]) => Math.abs(r[k as keyof typeof odds] - v) > 1e-9
    ) ||
    Math.abs(e.probabilitySuccess - r.gateSuccessChance) > 1e-9 ||
    Math.abs(
      e.delta -
        retryAccessDelta(
          r.baseSuccessChance,
          r.gateSuccessChance,
          e.actualSuccess
        )
    ) > 1e-9 ||
    e.explainability.formulaSummary !==
      retryAccessFormula(
        r.baseSuccessChance,
        r.gateSuccessChance,
        e.actualSuccess,
        e.explainability.weight
      )
  )
    return false;
  return r.kind === "loner"
    ? m.rollType === 71 &&
        original.canUseTeamReroll &&
        !original.canUseProReroll &&
        m.lonerGate?.skillSourceId === r.skillSourceId &&
        m.lonerGate.skillId === skill!.metadata.skillUsage!.skillId
    : m.rollType === 15 &&
        original.canUseProReroll &&
        !original.canUseTeamReroll &&
        m.proGate?.skillSourceId === r.skillSourceId &&
        skill!.metadata.skillUsage!.skillId === 50;
}

export function validReportedNumericGatedReplacement(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  roots: ReadonlyMap<string | undefined, LuckReport["diceRecords"][number]>
) {
  const m = e.metadata,
    r = m.numericGatedReplacement;
  if (!r) return true;
  const gate = sources.get(r.gateSourceId),
    access = gate?.metadata.numericRetryAccess,
    first = access ? sources.get(access.originalSourceId) : undefined,
    d = roots.get(m.sourceId);
  return (
    !!m.sourceId &&
    !!m.actionId &&
    !!m.sequenceId &&
    !!gate &&
    !!first &&
    !!access &&
    gate.scoringStatus === "scored" &&
    gate.actualSuccess === true &&
    e.scoringStatus === "scored" &&
    e.type === "dodge" &&
    m.rollType === 2 &&
    m.sourceTag === "ResultRoll" &&
    m.probabilityPolicy === "single_attempt" &&
    m.sourceIndex === gate.metadata.sourceIndex! + 1 &&
    m.actionId === gate.metadata.actionId &&
    m.sequenceId === gate.metadata.sequenceId &&
    m.stepType === 1 &&
    m.targetId === "-1" &&
    e.playerId === gate.playerId &&
    e.teamId === gate.teamId &&
    m.locator?.replayStep === gate.metadata.locator?.replayStep &&
    m.locator?.childIndex === gate.metadata.locator?.childIndex &&
    m.locator?.stepIndex === 0 &&
    m.locator?.messageIndex === 3 &&
    m.rerollUsed === undefined &&
    m.rerollResource === undefined &&
    m.teamRerollsSpent === undefined &&
    m.rerollDecisionId === undefined &&
    !m.rerollDraws &&
    m.originalDice === undefined &&
    !m.rerollQuestionId &&
    !m.rerollOriginalId &&
    !m.rerollSkill &&
    m.rerollPolicy === undefined &&
    m.catchRerollResume === undefined &&
    m.numericOriginal === undefined &&
    m.numericRetryAccess === undefined &&
    !m.preRoll &&
    !e.contextualImpact &&
    !e.contextualBounds &&
    !e.possessionBounds &&
    !e.catchPossessionBounds &&
    m.difficulty === first.metadata.difficulty &&
    m.requirement === first.metadata.requirement &&
    canonical(m.fixedNumericModifiers) ===
      canonical(first.metadata.fixedNumericModifiers) &&
    !!d &&
    d.status === 2 &&
    d.newRoll === 1 &&
    d.quality === "complete" &&
    d.disposition === "covered_roll" &&
    d.parentSourceIndex === m.sourceIndex &&
    d.stepTag === "PlayerStep" &&
    d.stepType === 1 &&
    d.stepActorId === e.playerId &&
    d.stepTargetId === "-1" &&
    d.eventId === e.id &&
    d.rollType === 2 &&
    d.dice.length === 1 &&
    d.dice[0]?.dieType === 0 &&
    d.dice[0].value === m.dice?.[0] &&
    m.outcomeCode === Number(e.actualSuccess) &&
    e.actualSuccess === Number(d.dice[0].value) >= m.difficulty! &&
    Math.abs((e.probabilitySuccess ?? -1) - access.baseSuccessChance) < 1e-9
  );
}
