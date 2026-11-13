import type { LuckEvent, LuckReport } from "./types";

// A reroll choice is made after the original result. Comparing salvaged
// outcomes with a composite chance while first successes use single-die odds
// gives a positive mean. Sum the innovations of the actual independent draws.
export function numericRerollScore(
  initialSourceId: string,
  initialFace: number,
  target: number,
  replacementSucceeded: boolean
) {
  if (
    !initialSourceId ||
    !Number.isInteger(target) ||
    target < 2 ||
    target > 6 ||
    !Number.isInteger(initialFace) ||
    initialFace < 1 ||
    initialFace >= target
  )
    return;
  const baseSuccessChance = (7 - target) / 6;
  return {
    initialSourceId,
    initialFace,
    baseSuccessChance,
    initialDelta: -baseSuccessChance,
    replacementDelta: Number(replacementSucceeded) - baseSuccessChance
  };
}

type Dice = LuckReport["diceRecords"][number];
type Draws = NonNullable<LuckEvent["metadata"]["rerollDraws"]>;
export function formatNumericRerollFormula(
  r: Draws,
  success: boolean,
  weight: number
) {
  return `weighted delta = [(0 - ${r.baseSuccessChance.toFixed(3)}) + (${success ? 1 : 0} - ${r.baseSuccessChance.toFixed(3)})] x ${weight.toFixed(2)} = ${((r.initialDelta + r.replacementDelta) * weight).toFixed(3)}`;
}
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9;
export function validReportedNumericRerollScore(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  initials: ReadonlyMap<string | undefined, Dice>,
  roots: ReadonlyMap<string | undefined, Dice>
) {
  const r = e.metadata.rerollDraws,
    m = e.metadata;
  if (m.probabilityPolicy !== "two_attempt") return !r;
  if (
    !r ||
    e.scoringStatus !== "scored" ||
    ![1, 2, 4, 7].includes(m.rollType ?? -1) ||
    e.actualSuccess === null
  )
    return false;
  const target = m.difficulty,
    base = e.explainability.baseOdds;
  const initial = initials.get(r.initialSourceId),
    final = roots.get(m.sourceId),
    first = sources.get(r.initialSourceId),
    choice = sources.get(m.rerollDecisionId ?? "");
  const original = m.originalDice as
    { Die?: { DieType?: unknown; Value?: unknown } } | undefined;
  const same = (x: LuckEvent | undefined) =>
    !!x &&
    x.playerId === e.playerId &&
    x.teamId === e.teamId &&
    x.metadata.stepType === m.stepType &&
    x.metadata.targetId === m.targetId;
  if (
    typeof target !== "number" ||
    target < 2 ||
    target > 6 ||
    !Number.isInteger(target) ||
    base === undefined ||
    !near(base, (7 - target) / 6) ||
    !near(r.baseSuccessChance, base) ||
    r.initialFace >= target ||
    !near(r.initialDelta, -base) ||
    !near(r.replacementDelta, Number(e.actualSuccess) - base) ||
    !near(e.delta, r.initialDelta + r.replacementDelta) ||
    e.explainability.formulaSummary !==
      formatNumericRerollFormula(r, e.actualSuccess, e.explainability.weight) ||
    original?.Die?.DieType !== 0 ||
    original.Die.Value !== r.initialFace ||
    r.initialSourceId !== (m.rerollOriginalId ?? m.rerollQuestionId) ||
    !same(first) ||
    !same(choice) ||
    first!.scoringStatus !== "excluded" ||
    first!.metadata.isRollCandidate !== false ||
    choice!.scoringStatus !== "excluded" ||
    choice!.metadata.isRollCandidate !== false ||
    first!.metadata.sourceIndex === undefined ||
    choice!.metadata.sourceIndex === undefined ||
    m.sourceIndex === undefined ||
    first!.metadata.sourceIndex >= choice!.metadata.sourceIndex ||
    choice!.metadata.sourceIndex >= m.sourceIndex ||
    !initial ||
    !final ||
    initial.id === final.id ||
    initial.status !== 1 ||
    initial.newRoll !== 1 ||
    final.status !== 2 ||
    final.newRoll !== 1 ||
    initial.rollType !== m.rollType ||
    final.rollType !== m.rollType ||
    initial.quality !== "complete" ||
    final.quality !== "complete" ||
    initial.dice.length !== 1 ||
    initial.dice[0]?.dieType !== 0 ||
    initial.dice[0].value !== r.initialFace ||
    final.dice.length !== 1 ||
    final.dice[0]?.dieType !== 0 ||
    final.dice[0].value !== m.dice?.[0] ||
    typeof final.dice[0].value !== "number" ||
    final.dice[0].value < 1 ||
    final.dice[0].value > 6 ||
    e.actualSuccess !== final.dice[0].value >= target ||
    initial.disposition !== "covered_roll" ||
    final.disposition !== "covered_roll" ||
    initial.eventId !== e.id ||
    final.eventId !== e.id ||
    initial.stepTag !== final.stepTag ||
    initial.stepType !== final.stepType ||
    initial.stepActorId !== final.stepActorId ||
    initial.stepTargetId !== final.stepTargetId ||
    (initial.parentSourceIndex !== undefined &&
      final.parentSourceIndex !== undefined &&
      initial.parentSourceIndex >= final.parentSourceIndex)
  )
    return false;
  if (
    first!.metadata.sourceTag === "ResultRoll" &&
    (first!.metadata.dice?.length !== 1 ||
      first!.metadata.dice[0] !== r.initialFace ||
      first!.metadata.dieTypes?.[0] !== 0 ||
      first!.metadata.outcomeCode !== 0 ||
      first!.metadata.difficulty !== target ||
      first!.metadata.requirement !== m.requirement ||
      JSON.stringify(first!.metadata.modifiers) !== JSON.stringify(m.modifiers))
  )
    return false;
  if (m.rerollResource === "skill") {
    const skill =
      m.rerollSkill === "Dodge"
        ? 7
        : m.rerollSkill === "Sure Hands"
          ? 61
          : m.rerollSkill === "Catch"
            ? 6
            : undefined;
    return (
      !!skill &&
      m.teamRerollsSpent === 0 &&
      first!.metadata.sourceTag === "ResultRoll" &&
      first!.metadata.mergedRerollAnchorId === m.sourceId &&
      first!.metadata.actionId === m.actionId &&
      choice!.metadata.sourceTag === "ResultSkillUsage" &&
      choice!.metadata.skillUsage?.used === true &&
      choice!.metadata.skillUsage.skillId === skill &&
      choice!.metadata.actionId === m.actionId
    );
  }
  if (
    m.rerollResource !== "team" ||
    m.teamRerollsSpent !== 1 ||
    m.rerollSkill ||
    choice!.metadata.sourceTag !== "ResultTeamRerollUsage" ||
    choice!.metadata.teamRerollDecision?.used !== true
  )
    return false;
  const q = sources.get(m.rerollQuestionId ?? "");
  const offer = q?.metadata.rerollOffer;
  if (
    !same(q) ||
    q!.metadata.sourceTag !== "QuestionTeamRerollUsage" ||
    !offer?.canUseTeamReroll ||
    offer.decisionSourceId !== m.rerollDecisionId ||
    offer.gamerId !== choice!.metadata.teamRerollDecision.gamerId ||
    offer.gamerId !== Number(e.teamId)
  )
    return false;
  if (!m.rerollOriginalId) return first === q;
  const o = first!.metadata,
    l = o.locator,
    ql = q!.metadata.locator;
  return (
    o.sourceTag === "ResultRoll" &&
    o.mergedRerollAnchorId === m.sourceId &&
    o.actionId === q!.metadata.actionId &&
    o.sequenceId === q!.metadata.sequenceId &&
    o.sourceIndex !== undefined &&
    o.sourceIndex < (q!.metadata.sourceIndex ?? -1) &&
    q!.metadata.sourceIndex! < (choice!.metadata.sourceIndex ?? -1) &&
    choice!.metadata.sourceIndex! < (m.sourceIndex ?? -1) &&
    l?.replayStep !== undefined &&
    l.replayStep === ql?.replayStep &&
    l.childIndex === ql?.childIndex &&
    l.stepIndex === ql?.stepIndex &&
    l.messageIndex !== undefined &&
    l.messageIndex < (ql?.messageIndex ?? -1)
  );
}
