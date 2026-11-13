import { preservesTraitContinuity } from "@/domain/replay/traitTransitions";
import type { ReplayEvent } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import type { LuckEvent, LuckReport } from "./types";
import { numericCheckExclusion } from "./numericCheckContract";

export type NumericQuestionOriginal = {
  roll: Record<string, unknown>;
  receipt: {
    gamerId: 0 | 1;
    canUseTeamReroll: boolean;
    canUseProReroll: boolean;
  };
};
const obj = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
const families = new Set([1, 2, 4, 7]);
const supportedStep = (family: number, step: number | undefined) =>
  (family === 1 ? [1, 6, 31] : family === 7 ? [4] : [1]).includes(step ?? -1);
const supportedTarget = (
  family: number,
  step: number | undefined,
  target: string | undefined
) =>
  target === "-1" ||
  (family === 1 &&
    [6, 31].includes(step ?? -1) &&
    target !== undefined &&
    /^\d{1,10}$/.test(target) &&
    Number.isSafeInteger(Number(target)));

function qualifyQuestion(
  e: ReplayEvent,
  version: string | undefined,
  ownership: OwnershipTimeline
): NumericQuestionOriginal | undefined {
  const roll = obj(e.payload?.RollInfos),
    family = roll?.RollType;
  if (
    e.sourceTag !== "QuestionTeamRerollUsage" ||
    typeof family !== "number" ||
    !families.has(family)
  )
    return;
  if (
    !e.actionId ||
    version !== "1-4-0-0" ||
    !roll ||
    !e.id ||
    !Number.isSafeInteger(e.sourceIndex) ||
    e.sourceIndex! < 1 ||
    e.locator?.replayStep === undefined ||
    e.locator.childIndex === undefined ||
    e.locator.stepIndex === undefined ||
    e.locator.messageIndex === undefined ||
    e.stepTag !== "PlayerStep" ||
    !supportedStep(family, e.stepType) ||
    !e.sequenceId ||
    !e.playerId ||
    e.stepActorId !== e.playerId ||
    !supportedTarget(family, e.stepType, e.targetId) ||
    e.stepTargetId !== e.targetId ||
    e.attributionConflict ||
    e.unclassifiedDice ||
    Object.keys(e.payload!).some(
      (k) =>
        ![
          "GamerId",
          "CanUseProReroll",
          "CanUseTeamReroll",
          "StarSpecialRule",
          "RollInfos"
        ].includes(k)
    ) ||
    Object.keys(roll).some(
      (k) =>
        ![
          "Status",
          "NewRoll",
          "Requirement",
          "Difficulty",
          "RollType",
          "Outcome",
          "Modifiers",
          "Dice"
        ].includes(k)
    ) ||
    (e.payload!.StarSpecialRule !== undefined &&
      e.payload!.StarSpecialRule !== -1) ||
    ![0, 1].includes(Number(e.payload!.GamerId)) ||
    (e.payload!.GamerId !== 0 && e.payload!.GamerId !== 1) ||
    ![0, 1].includes(Number(e.payload!.CanUseTeamReroll)) ||
    ![0, 1].includes(Number(e.payload!.CanUseProReroll)) ||
    typeof e.payload!.CanUseTeamReroll !== "number" ||
    typeof e.payload!.CanUseProReroll !== "number"
  )
    return;
  const owner = ownership.resolve(e.playerId, e);
  if (
    owner.status !== "confirmed" ||
    String(e.payload!.GamerId) !== owner.proof.teamId ||
    (e.actorTeamId !== undefined && e.actorTeamId !== owner.proof.teamId) ||
    (e.teamId !== undefined && e.teamId !== owner.proof.teamId)
  )
    return;
  const dice = obj(roll.Dice),
    die = obj(dice?.Die);
  if (
    !dice ||
    !die ||
    Object.keys(dice).some((k) => k !== "Die") ||
    Object.keys(die).some((k) => !["DieType", "Value"].includes(k)) ||
    roll.Status !== 1 ||
    roll.NewRoll !== 1 ||
    roll.Outcome !== 0 ||
    die?.DieType !== 0 ||
    !Number.isInteger(die.Value) ||
    Number(die.Value) < 1 ||
    Number(die.Value) >= Number(roll.Difficulty) ||
    numericCheckExclusion(
      version,
      { ...e, sourceTag: "ResultRoll", rollType: family, payload: roll },
      false
    )
  )
    return;
  return {
    roll,
    receipt: {
      gamerId: e.payload!.GamerId as 0 | 1,
      canUseTeamReroll: e.payload!.CanUseTeamReroll === 1,
      canUseProReroll: e.payload!.CanUseProReroll === 1
    }
  };
}

function knownMoveRolls(value: unknown): boolean {
  if (value === undefined || value === "") return true;
  const container = obj(value),
    summary = obj(container?.RollSummary);
  return (
    !!container &&
    Object.keys(container).length === 1 &&
    !!summary &&
    Object.keys(summary).length === 2 &&
    summary.RollType === 1 &&
    summary.Outcome === 1
  );
}
function knownPrefix(e: ReplayEvent, version: string | undefined) {
  if (e.unclassifiedDice || e.attributionConflict) return false;
  if (e.sourceTag === "Carrier") return e.checkpointCarrier === true;
  if (e.sourceTag === "PlayerStep")
    return (
      e.payload?.Skill === 0 &&
      e.payload.IsEvaluation === 0 &&
      e.payload.State === 1 &&
      Object.keys(e.payload).every((k) =>
        [
          "Probability",
          "PlayerId",
          "TargetId",
          "IsEvaluation",
          "StepType",
          "CellTo",
          "State",
          "CellFrom",
          "Skill"
        ].includes(k)
      )
    );
  if (e.sourceTag === "ResultSkillUsage") return preservesTraitContinuity(e);
  if (e.sourceTag === "ResultDoMove")
    return !e.payload || Object.keys(e.payload).length === 0;
  if (e.sourceTag === "ResultMoveOutcome")
    return (
      e.payload?.Moved === 1 &&
      e.payload.TentacleUsed === 0 &&
      e.payload.FumbleRooskieUsed === 0 &&
      knownMoveRolls(e.payload.Rolls) &&
      (e.payload.Pushbacks === undefined || e.payload.Pushbacks === "") &&
      Object.keys(e.payload).every((k) =>
        [
          "Moved",
          "TentacleUsed",
          "FumbleRooskieUsed",
          "Rolls",
          "Pushbacks"
        ].includes(k)
      )
    );
  if (e.sourceTag === "ResultNoRollSuccess")
    return !e.payload || Object.keys(e.payload).length === 0;
  if (e.sourceTag === "ResultUseAction") return preservesTraitContinuity(e);
  if (e.sourceTag === "ResultRoll" && families.has(e.rollType ?? -1)) {
    const dice = obj(e.payload?.Dice),
      d = obj(dice?.Die);
    return (
      !!e.payload &&
      Object.keys(e.payload).every((k) =>
        [
          "Status",
          "NewRoll",
          "RollType",
          "Requirement",
          "Difficulty",
          "Outcome",
          "Modifiers",
          "Dice"
        ].includes(k)
      ) &&
      !!dice &&
      Object.keys(dice).every((k) => k === "Die") &&
      !!d &&
      Object.keys(d).every((k) => ["DieType", "Value"].includes(k)) &&
      d.DieType === 0 &&
      Number.isInteger(d.Value) &&
      Number(d.Value) >= 1 &&
      Number(d.Value) <= 6 &&
      e.payload?.Outcome ===
        Number(Number(d.Value) >= Number(e.payload?.Difficulty)) &&
      !numericCheckExclusion(version, e, true)
    );
  }
  return false;
}
// Qualification is prefix-only. An unfinished question remains an identity
// boundary across continuation actions; a real terminal roll retires it.
export function findNumericQuestionOriginals(
  events: readonly ReplayEvent[],
  version: string | undefined,
  ownership: OwnershipTimeline
) {
  const originals = new Map<number, NumericQuestionOriginal>(),
    headers = new Map<number, NumericQuestionOriginal>();
  const ambiguousQuestions = new Set<number>(),
    ambiguousInitials = new Set<ReplayEvent>();
  const emittedCopies = new Map<ReplayEvent, ReplayEvent>();
  const initialCounts = new Map<string, number>();
  const seen = new Set<string>(),
    blockedActions = new Set<string>();
  const pending = new Map<
    string,
    { question: ReplayEvent; roll: Record<string, unknown> }
  >();
  for (const [index, e] of events.entries()) {
    if (e.sourceTag === "EventEndTurn" || e.sourceTag === "EventNewGamePhase")
      pending.clear();
    const q = e.sourceTag === "QuestionTeamRerollUsage",
      roll = q ? obj(e.payload?.RollInfos) : e.payload;
    const family = q ? roll?.RollType : e.rollType;
    if (!q && e.actionId && !knownPrefix(e, version))
      blockedActions.add(e.actionId);
    if (
      !e.actionId ||
      typeof family !== "number" ||
      !families.has(family) ||
      (!q && e.sourceTag !== "ResultRoll")
    )
      continue;
    const scope = JSON.stringify([e.playerId, e.stepType, e.targetId, family]);
    const waiting = pending.get(scope);
    const action = JSON.stringify([
      e.actionId,
      e.playerId,
      e.stepType,
      e.targetId,
      family
    ]);
    const prior = seen.has(action);
    seen.add(action);
    if (!q) {
      if (roll?.Status === 1 && roll.NewRoll === 1)
        initialCounts.set(action, (initialCounts.get(action) ?? 0) + 1);
      if (waiting) {
        const die = obj(obj(roll?.Dice)?.Die),
          originalDie = obj(obj(waiting.roll.Dice)?.Die);
        const terminal =
          !!die &&
          die.DieType === 0 &&
          Number.isInteger(die.Value) &&
          Number(die.Value) >= 1 &&
          Number(die.Value) <= 6 &&
          roll?.Outcome ===
            Number(Number(die.Value) >= Number(roll?.Difficulty)) &&
          ((roll?.Status === 2 &&
            roll.NewRoll === 1 &&
            !numericCheckExclusion(version, e, true)) ||
            (roll?.Status === 1 &&
              roll.NewRoll === 0 &&
              die.Value === originalDie?.Value &&
              roll.Outcome === 0 &&
              !numericCheckExclusion(version, e, false, true)));
        if (terminal) pending.delete(scope);
        else if (roll?.Status === 1 && roll.NewRoll === 1)
          ambiguousInitials.add(e);
      }
      continue;
    }
    if (waiting) ambiguousQuestions.add(index);
    if (roll) pending.set(scope, { question: e, roll });
    const original = qualifyQuestion(e, version, ownership);
    if (!original) {
      blockedActions.add(e.actionId);
      continue;
    }
    if (blockedActions.has(e.actionId)) continue;
    headers.set(index, original);
    if (!prior && !waiting) originals.set(index, original);
    const previous = events[index - 1];
    if (
      initialCounts.get(action) === 1 &&
      previous?.id &&
      previous.sourceTag === "ResultRoll" &&
      !ambiguousInitials.has(previous) &&
      previous.actionId === e.actionId &&
      previous.sequenceId === e.sequenceId &&
      previous.playerId === e.playerId &&
      previous.stepActorId === e.stepActorId &&
      previous.targetId === e.targetId &&
      previous.stepType === e.stepType &&
      previous.sourceIndex! + 1 === e.sourceIndex &&
      previous.locator?.replayStep === e.locator?.replayStep &&
      previous.locator?.childIndex === e.locator?.childIndex &&
      previous.locator?.stepIndex === e.locator?.stepIndex &&
      (previous.locator?.messageIndex ?? NaN) + 1 === e.locator?.messageIndex &&
      previous.rollType === family &&
      previous.payload?.Status === 1 &&
      previous.payload.NewRoll === 1 &&
      previous.payload.Outcome === 0 &&
      previous.payload.Difficulty === roll!.Difficulty &&
      previous.payload.Requirement === roll!.Requirement &&
      JSON.stringify(canonical(previous.payload.Modifiers ?? "")) ===
        JSON.stringify(canonical(roll!.Modifiers ?? "")) &&
      JSON.stringify(canonical(previous.payload.Dice)) ===
        JSON.stringify(canonical(roll!.Dice))
    ) {
      const owner = ownership.resolve(e.playerId!, previous);
      if (
        owner.status === "confirmed" &&
        owner.proof.teamId === String(original.receipt.gamerId)
      )
        emittedCopies.set(e, previous);
    }
  }
  return {
    originals,
    headers,
    emittedCopies,
    ambiguousQuestions,
    ambiguousInitials
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  const node = obj(value);
  return node
    ? Object.fromEntries(
        Object.keys(node)
          .sort()
          .map((k) => [k, canonical(node[k])])
      )
    : value;
}
// A repeated adjacent menu carries the same cached original, not a second
// fresh die. Unknown intervening messages cannot establish this copy proof.
export function findNumericQuestionCopies(
  events: readonly ReplayEvent[],
  scan: ReturnType<typeof findNumericQuestionOriginals>
) {
  const copies = new Map<
      number,
      {
        original: ReplayEvent;
        previous: ReplayEvent;
        emittedOriginal?: ReplayEvent;
      }
    >(),
    anchors = new Map<number, number>();
  for (let i = 1; i < events.length; i++) {
    const e = events[i]!,
      previous = events[i - 1]!,
      anchor = anchors.get(i - 1) ?? i - 1;
    const original = events[anchor]!,
      proof =
        scan.originals.get(anchor) ??
        (scan.emittedCopies.has(original)
          ? scan.headers.get(anchor)
          : undefined);
    const roll = obj(e.payload?.RollInfos),
      dice = obj(roll?.Dice),
      die = obj(dice?.Die);
    if (
      !proof ||
      !roll ||
      !dice ||
      !die ||
      Object.keys(e.payload ?? {}).some(
        (k) =>
          ![
            "GamerId",
            "CanUseProReroll",
            "CanUseTeamReroll",
            "StarSpecialRule",
            "RollInfos"
          ].includes(k)
      ) ||
      Object.keys(roll).some(
        (k) =>
          ![
            "Status",
            "NewRoll",
            "Requirement",
            "Difficulty",
            "RollType",
            "Outcome",
            "Modifiers",
            "Dice"
          ].includes(k)
      ) ||
      Object.keys(dice).some((k) => k !== "Die") ||
      Object.keys(die).some((k) => !["DieType", "Value"].includes(k)) ||
      e.payload?.GamerId !== proof.receipt.gamerId ||
      e.payload?.CanUseTeamReroll !== Number(proof.receipt.canUseTeamReroll) ||
      e.payload?.CanUseProReroll !== Number(proof.receipt.canUseProReroll) ||
      (e.payload?.StarSpecialRule !== undefined &&
        e.payload.StarSpecialRule !== -1) ||
      die.DieType !== 0 ||
      !Number.isInteger(die.Value) ||
      numericCheckExclusion(
        "1-4-0-0",
        {
          ...e,
          sourceTag: "ResultRoll",
          rollType: Number(roll.RollType),
          payload: roll
        },
        false
      ) ||
      e.sourceTag !== "QuestionTeamRerollUsage" ||
      previous.sourceTag !== e.sourceTag ||
      !e.id ||
      !original.id ||
      !previous.id ||
      e.attributionConflict ||
      e.actionId !== original.actionId ||
      e.sequenceId !== original.sequenceId ||
      e.playerId !== original.playerId ||
      e.teamId !== original.teamId ||
      e.actorTeamId !== original.actorTeamId ||
      e.stepType !== original.stepType ||
      e.targetId !== original.targetId ||
      e.stepActorId !== original.stepActorId ||
      e.stepTargetId !== original.stepTargetId ||
      e.sourceIndex! !== previous.sourceIndex! + 1 ||
      e.locator?.replayStep !== original.locator?.replayStep ||
      e.locator?.childIndex !== original.locator?.childIndex ||
      e.locator?.stepIndex !== original.locator?.stepIndex ||
      e.locator?.messageIndex !== (previous.locator?.messageIndex ?? NaN) + 1 ||
      JSON.stringify(canonical(e.payload)) !==
        JSON.stringify(canonical(original.payload))
    )
      continue;
    copies.set(i, {
      original,
      previous,
      emittedOriginal: scan.emittedCopies.get(original)
    });
    anchors.set(i, anchor);
  }
  return copies;
}

export function validReportedNumericQuestionCopy(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  originals: ReadonlyMap<string | undefined, LuckReport["diceRecords"][number]>
) {
  const m = e.metadata,
    c = m.numericOriginalCopy;
  if (!c) return true;
  const first = sources.get(c.originalSourceId),
    previous = sources.get(c.previousSourceId);
  const r = originals.get(m.sourceId),
    target = originals.get(c.originalSourceId);
  const same = (x: LuckEvent | undefined) =>
    !!x &&
    x.metadata.sourceTag === "QuestionTeamRerollUsage" &&
    x.playerId === e.playerId &&
    x.teamId === e.teamId &&
    x.metadata.actionId === m.actionId &&
    x.metadata.sequenceId === m.sequenceId &&
    x.metadata.stepType === m.stepType &&
    x.metadata.targetId === m.targetId &&
    x.metadata.locator?.replayStep === m.locator?.replayStep &&
    x.metadata.locator?.childIndex === m.locator?.childIndex &&
    x.metadata.locator?.stepIndex === m.locator?.stepIndex;
  return (
    m.sourceTag === "QuestionTeamRerollUsage" &&
    e.scoringStatus === "excluded" &&
    m.isRollCandidate === false &&
    !m.numericOriginal &&
    same(first) &&
    same(previous) &&
    (previous === first ||
      previous!.metadata.numericOriginalCopy?.originalSourceId ===
        c.originalSourceId) &&
    m.sourceIndex !== undefined &&
    m.sourceIndex === previous!.metadata.sourceIndex! + 1 &&
    m.sourceIndex > first!.metadata.sourceIndex! &&
    m.locator?.messageIndex !== undefined &&
    m.locator.messageIndex ===
      (previous!.metadata.locator?.messageIndex ?? NaN) + 1 &&
    !!r &&
    !!target &&
    r.disposition === "summary" &&
    r.aliasOf === target.id &&
    !r.eventId &&
    r.path.join(".") === "RollInfos.Dice" &&
    target.path.join(".") === "RollInfos.Dice" &&
    r.status === 1 &&
    r.newRoll === 1 &&
    target.status === 1 &&
    target.newRoll === 1 &&
    families.has(r.rollType ?? -1) &&
    r.rollType === target.rollType &&
    r.actionId === target.actionId &&
    r.quality === "complete" &&
    target.quality === "complete" &&
    JSON.stringify(r.dice) === JSON.stringify(target.dice)
  );
}

export function validReportedNumericQuestionOriginal(
  e: LuckEvent,
  originals: ReadonlyMap<string | undefined, LuckReport["diceRecords"][number]>
) {
  const m = e.metadata,
    receipt = m.numericOriginal;
  if (!receipt)
    return !(
      m.sourceTag === "QuestionTeamRerollUsage" && e.scoringStatus === "scored"
    );
  const r = originals.get(m.sourceId),
    type = m.rollType,
    target = m.difficulty;
  const category =
    type === 1 ? "movement_risk" : type === 2 ? "dodge" : "ball_handling";
  if (
    !r ||
    m.sourceTag !== "QuestionTeamRerollUsage" ||
    e.scoringStatus !== "scored" ||
    !families.has(type ?? -1) ||
    e.type !== category ||
    !e.playerId ||
    String(receipt.gamerId) !== e.teamId ||
    !m.actionId ||
    !m.sequenceId ||
    m.sourceIndex === undefined ||
    m.sourceIndex < 1 ||
    m.locator?.replayStep === undefined ||
    m.locator.childIndex === undefined ||
    m.locator.stepIndex === undefined ||
    m.locator.messageIndex === undefined ||
    !supportedStep(type!, m.stepType) ||
    !supportedTarget(type!, m.stepType, m.targetId) ||
    m.isRollCandidate !== true ||
    r.path.length !== 2 ||
    r.path[0] !== "RollInfos" ||
    r.path[1] !== "Dice" ||
    r.parentEventId !== e.id ||
    r.parentSourceId !== m.sourceId ||
    r.eventId !== e.id ||
    r.disposition !== "covered_roll" ||
    r.quality !== "complete" ||
    r.aliasOf ||
    r.parentSourceIndex !== m.sourceIndex ||
    r.actionId !== m.actionId ||
    JSON.stringify(r.locator) !== JSON.stringify(m.locator) ||
    r.stepTag !== "PlayerStep" ||
    r.stepType !== m.stepType ||
    r.stepActorId !== e.playerId ||
    r.stepTargetId !== m.targetId ||
    r.status !== 1 ||
    r.newRoll !== 1 ||
    r.rollType !== type ||
    r.dice.length !== 1 ||
    r.dice[0]?.dieType !== 0 ||
    r.dice[0].value !== m.dice?.[0] ||
    m.dice?.length !== 1 ||
    m.dieTypes?.length !== 1 ||
    m.dieTypes[0] !== 0 ||
    typeof target !== "number" ||
    m.outcomeCode !== 0 ||
    e.actualSuccess !== false ||
    m.dice[0]! >= target ||
    m.probabilityPolicy !== "single_attempt" ||
    m.rerollUsed !== undefined ||
    m.teamRerollsSpent !== undefined ||
    m.rerollPolicy !== undefined ||
    m.rerollSkill !== undefined ||
    m.originalDice !== undefined ||
    m.ownershipConflict !== undefined ||
    m.rerollQuestionId ||
    m.rerollOriginalId ||
    m.rerollDecisionId ||
    m.rerollResource ||
    m.rerollDraws ||
    m.mergedRerollAnchorId ||
    m.preRoll ||
    e.contextualImpact ||
    e.contextualBounds ||
    e.possessionBounds ||
    e.catchPossessionBounds
  )
    return false;
  const p = (7 - target) / 6,
    fixed = m.fixedNumericModifiers;
  const payload = {
    Status: 1,
    NewRoll: 1,
    RollType: type,
    Outcome: 0,
    Difficulty: target,
    Requirement: m.requirement,
    Modifiers:
      m.requirement !== undefined || fixed?.length
        ? {
            Modifier: (fixed ?? []).map((x) => ({
              PlayerId: x.playerId,
              Skill: x.skillId,
              Effect: x.effectId,
              Value: x.value,
              ModifierType: x.modifierType
            }))
          }
        : undefined
  };
  return (
    !numericCheckExclusion(
      "1-4-0-0",
      { sourceTag: "ResultRoll", type: "roll", rollType: type, payload },
      false
    ) &&
    Math.abs((e.probabilitySuccess ?? -1) - p) < 1e-9 &&
    Math.abs(e.delta + p) < 1e-9 &&
    e.explainability.formulaSummary ===
      `weighted delta = (0 - ${p.toFixed(3)}) x ${e.explainability.weight.toFixed(2)} = ${e.weightedDelta.toFixed(3)}`
  );
}
