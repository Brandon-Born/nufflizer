import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import { verifyLonerTest } from "@/domain/replay/loner";
import { numericCheckExclusion } from "./numericCheckContract";
import type { TeamDiceIdentity } from "./diceIdentityLinks";
import type { NumericQuestionOriginal } from "./numericQuestionOriginal";
import type { LuckEvent, LuckReport } from "./types";

// Conditional arithmetic for one fixed policy: retry this single die after
// an initial failure iff the gate passes. This is not an applied dice score,
// a claim that the resource was legally available, or a price for using it.
export function gatedRetryChance(target: number, gateTarget: number) {
  if (
    ![target, gateTarget].every((n) => Number.isInteger(n) && n >= 2 && n <= 6)
  )
    return;
  const baseSuccessChance = (7 - target) / 6;
  const gateSuccessChance = (7 - gateTarget) / 6;
  return {
    baseSuccessChance,
    gateSuccessChance,
    fixedPolicySuccessChance:
      baseSuccessChance +
      (1 - baseSuccessChance) * gateSuccessChance * baseSuccessChance
  };
}
const keys = (v: Record<string, unknown> | undefined, allowed: string[]) =>
  !!v && Object.keys(v).every((k) => allowed.includes(k));
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
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]])
        )
      : x
  );
type Receipt = NonNullable<LuckEvent["metadata"]["failedNumericRetry"]>;
export type FailedNumericRetry = {
  identity: TeamDiceIdentity;
  receipt: Receipt;
};

// The independently recorded ordinary-Move Dodge prefix is deliberately
// narrower than the physical-identity linker. No fallout selects admission.
export function findFailedNumericRetries(
  replay: ReplayModel,
  identities: readonly TeamDiceIdentity[],
  originals: ReadonlyMap<ReplayEvent, NumericQuestionOriginal>,
  ownership: OwnershipTimeline
): FailedNumericRetry[] {
  if (replay.replayVersion !== "1-4-0-0") return [];
  const events = replay.turns.flatMap((t) => t.events),
    positions = new Map(events.map((e, i) => [e, i]));
  const candidates: FailedNumericRetry[] = [];
  for (const identity of identities) {
    const {
      question: q,
      choice,
      gate,
      gateSkill: skill,
      final: kept
    } = identity;
    const original = originals.get(q),
      qi = positions.get(q),
      ci = positions.get(choice);
    if (
      !original ||
      qi === undefined ||
      ci === undefined ||
      !gate ||
      !skill ||
      identity.directOriginal ||
      identity.gatePassed !== false ||
      identity.replacementRolled ||
      q.stepTag !== "PlayerStep" ||
      q.stepType !== 1 ||
      original.roll.RollType !== 2 ||
      q.targetId !== "-1" ||
      !q.id ||
      !choice.id ||
      !gate.id ||
      !skill.id ||
      !kept.id
    )
      continue;
    const header = events[qi - 1],
      resume = events[ci - 1];
    if (
      !header ||
      !resume ||
      [header, resume].some(
        (h) =>
          h.sourceTag !== "PlayerStep" ||
          !keys(h.payload, headerKeys) ||
          h.payload?.Skill !== 0 ||
          h.payload.IsEvaluation !== 0
      ) ||
      header.payload!.State !== 1 ||
      resume.payload!.State !== 2 ||
      header.actionId !== q.actionId ||
      resume.actionId !== choice.actionId ||
      canonical({ ...header.payload, State: 0 }) !==
        canonical({ ...resume.payload, State: 0 }) ||
      q.locator?.messageIndex !== 0 ||
      choice.locator?.messageIndex !== 0 ||
      q.locator.replayStep! + 1 !== choice.locator?.replayStep ||
      choice.locator.stepIndex !== 0 ||
      ci - qi < 2 ||
      ci - qi > 3 ||
      events
        .slice(qi + 1, ci - 1)
        .some((e) => e.sourceTag !== "Carrier" || !e.checkpointCarrier) ||
      events[ci + 1] !== skill ||
      events[ci + 2] !== gate ||
      events[ci + 3] !== kept
    )
      continue;
    const owner = ownership.resolve(q.playerId!, q);
    if (
      owner.status !== "confirmed" ||
      [q, choice, skill, gate, kept, header, resume].some((e) => {
        const current = ownership.resolve(e.playerId ?? "", e);
        return (
          !e.id ||
          e.attributionConflict ||
          e.unclassifiedDice ||
          e.playerId !== q.playerId ||
          e.stepActorId !== q.playerId ||
          e.targetId !== q.targetId ||
          e.stepTargetId !== q.targetId ||
          e.stepTag !== "PlayerStep" ||
          e.stepType !== 1 ||
          e.actorTeamId !== owner.proof.teamId ||
          current.status !== "confirmed" ||
          current.proof.teamId !== owner.proof.teamId
        );
      })
    )
      continue;
    if (
      [choice, skill, gate, kept].some(
        (e, i) =>
          e.actionId !== choice.actionId ||
          e.sequenceId !== choice.sequenceId ||
          e.sourceIndex !== choice.sourceIndex! + i ||
          e.locator?.replayStep !== choice.locator?.replayStep ||
          e.locator?.childIndex !== choice.locator?.childIndex ||
          e.locator?.stepIndex !== 0 ||
          e.locator?.messageIndex !== i
      ) ||
      !keys(choice.payload, ["GamerId", "Used"]) ||
      !keys(skill.payload, ["PlayerId", "Skill", "Used"]) ||
      !keys(gate.payload, rollKeys) ||
      !keys(kept.payload, rollKeys) ||
      gate.payload?.RollType !== gate.rollType ||
      q.sourceIndex! >= choice.sourceIndex! ||
      skill.payload?.PlayerId !== Number(q.playerId) ||
      skill.payload.Used !== 1 ||
      q.payload?.GamerId !== choice.payload?.GamerId ||
      kept.payload?.Outcome !== 0 ||
      kept.payload.Status !== 1 ||
      kept.payload.NewRoll !== 0 ||
      numericCheckExclusion(replay.replayVersion, kept, false, true) ||
      canonical({ ...kept.payload, NewRoll: 1 }) !== canonical(original.roll)
    )
      continue;
    const loner = verifyLonerTest(skill, gate);
    const pro =
      skill.payload.Skill === 50 &&
      choice.payload?.Used === 0 &&
      original.receipt.canUseProReroll &&
      !original.receipt.canUseTeamReroll &&
      gate.sourceTag === "ResultRoll" &&
      gate.rollType === 15 &&
      gate.payload?.RollType === 15 &&
      gate.payload.Status === 1 &&
      gate.payload.NewRoll === 1 &&
      gate.payload.Requirement === 3 &&
      gate.payload.Difficulty === 3 &&
      gate.payload.Outcome === 0 &&
      (gate.payload.Modifiers === "" || gate.payload.Modifiers === undefined);
    const kind =
      loner &&
      choice.payload?.Used === 1 &&
      original.receipt.canUseTeamReroll &&
      !original.receipt.canUseProReroll
        ? "loner"
        : pro
          ? "pro"
          : undefined;
    const dice = gate.payload?.Dice as
      { Die?: { DieType?: unknown; Value?: unknown } } | undefined;
    if (
      !kind ||
      !keys(dice as Record<string, unknown> | undefined, ["Die"]) ||
      !keys(dice?.Die, ["DieType", "Value"]) ||
      dice?.Die?.DieType !== 0 ||
      !Number.isInteger(dice.Die.Value) ||
      Number(dice.Die.Value) < 1 ||
      Number(dice.Die.Value) >= Number(gate.payload?.Difficulty)
    )
      continue;
    const odds = gatedRetryChance(
      Number(original.roll.Difficulty),
      Number(gate.payload?.Difficulty)
    );
    if (!odds) continue;
    candidates.push({
      identity,
      receipt: {
        kind,
        originalSourceId: q.id,
        choiceSourceId: choice.id,
        skillSourceId: skill.id,
        gateSourceId: gate.id,
        ...odds
      }
    });
  }
  // Reject both contenders when any original, decision, skill, gate or kept
  // result would be consumed twice; ordering is not a tie breaker.
  const counts = new Map<ReplayEvent, number>();
  for (const { identity: p } of candidates)
    for (const e of [p.question, p.choice, p.gate!, p.gateSkill!, p.final])
      counts.set(e, (counts.get(e) ?? 0) + 1);
  return candidates.filter(({ identity: p }) =>
    [p.question, p.choice, p.gate!, p.gateSkill!, p.final].every(
      (e) => counts.get(e) === 1
    )
  );
}

export function validReportedFailedNumericRetry(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  roots: ReadonlyMap<string | undefined, LuckReport["diceRecords"][number]>
) {
  const m = e.metadata,
    r = m.failedNumericRetry;
  if (!r) return true;
  const first = sources.get(r.originalSourceId),
    choice = sources.get(r.choiceSourceId),
    skill = sources.get(r.skillSourceId),
    gate = sources.get(r.gateSourceId),
    identity = m.teamDiceIdentity;
  const original = first?.metadata.numericOriginal,
    g = gate?.metadata,
    d = roots.get(g?.sourceId),
    kept = roots.get(m.sourceId);
  const threshold = r.kind === "pro" ? 3 : g?.lonerGate?.threshold;
  const odds = gatedRetryChance(m.difficulty ?? -1, threshold ?? -1);
  const same = (x: LuckEvent | undefined) =>
    !!x &&
    x.playerId === e.playerId &&
    x.teamId === e.teamId &&
    x.metadata.stepType === 1 &&
    x.metadata.targetId === "-1" &&
    !x.metadata.ownershipConflict;
  if (
    !same(first) ||
    !same(choice) ||
    !same(skill) ||
    !same(gate) ||
    !original ||
    !odds ||
    !identity ||
    e.type !== "dodge" ||
    m.rollType !== 2 ||
    m.sourceTag !== "ResultRoll" ||
    m.isRollCandidate !== false ||
    e.scoringStatus !== "excluded" ||
    e.actualSuccess !== null ||
    e.probabilitySuccess !== null ||
    m.probabilityPolicy ||
    m.rerollDraws ||
    m.preRoll ||
    e.contextualImpact ||
    e.contextualBounds ||
    first!.scoringStatus !== "scored" ||
    first!.type !== "dodge" ||
    first!.metadata.rollType !== 2 ||
    first!.metadata.difficulty !== m.difficulty ||
    first!.metadata.requirement !== m.requirement ||
    canonical(first!.metadata.modifiers) !== canonical(m.modifiers) ||
    first!.metadata.modifiersSum !== m.modifiersSum ||
    canonical(first!.metadata.dice) !== canonical(m.dice) ||
    m.outcomeCode !== 0 ||
    first!.metadata.sourceIndex! >= choice!.metadata.sourceIndex! ||
    (first!.metadata.locator?.replayStep ?? NaN) + 1 !==
      m.locator?.replayStep ||
    [choice, skill, gate, e].some(
      (x, i) =>
        x!.scoringStatus !== "excluded" ||
        x!.metadata.sourceIndex !== choice!.metadata.sourceIndex! + i ||
        x!.metadata.actionId !== m.actionId ||
        x!.metadata.sequenceId !== m.sequenceId ||
        x!.metadata.locator?.replayStep !== m.locator?.replayStep ||
        x!.metadata.locator?.childIndex !== m.locator?.childIndex ||
        x!.metadata.locator?.stepIndex !== 0 ||
        x!.metadata.locator?.messageIndex !== i
    ) ||
    choice!.metadata.sourceTag !== "ResultTeamRerollUsage" ||
    choice!.metadata.isRollCandidate !== false ||
    choice!.metadata.teamDiceChoice?.gamerId !== original.gamerId ||
    choice!.metadata.teamDiceChoice.used !== (r.kind === "loner") ||
    skill!.metadata.sourceTag !== "ResultSkillUsage" ||
    skill!.metadata.isRollCandidate !== false ||
    !skill!.metadata.skillUsage?.used ||
    gate!.scoringStatus !== "excluded" ||
    g?.sourceTag !== "ResultRoll" ||
    g.isRollCandidate !== true ||
    g.outcomeCode !== 0 ||
    gate!.actualSuccess !== false ||
    !d ||
    d.quality !== "complete" ||
    d.rollType !== g.rollType ||
    d.parentEventId !== gate!.id ||
    d.eventId !== gate!.id ||
    d.disposition !== "unscored_roll" ||
    d.status !== 1 ||
    d.newRoll !== 1 ||
    d.dice.length !== 1 ||
    d.dice[0]?.dieType !== 0 ||
    d.dice[0].value !== g.dice?.[0] ||
    !Number.isInteger(d.dice[0].value) ||
    Number(d.dice[0].value) < 1 ||
    Number(d.dice[0].value) >= threshold! ||
    !kept ||
    kept.status !== 1 ||
    kept.newRoll !== 0 ||
    kept.disposition !== "summary" ||
    kept.eventId ||
    kept.aliasOf !== identity.originalRecordId ||
    identity.questionSourceId !== r.originalSourceId ||
    identity.decisionSourceId !== r.choiceSourceId ||
    identity.gateSourceId !== r.gateSourceId ||
    identity.gatePassed !== false ||
    identity.replacementRolled ||
    identity.originalDie !== identity.finalDie ||
    identity.teamUsed !== (r.kind === "loner") ||
    identity.gateSkillId !== skill!.metadata.skillUsage.skillId ||
    m.rerollUsed !== undefined ||
    m.teamRerollsSpent !== undefined ||
    m.rerollResource !== undefined ||
    m.rerollPolicy !== undefined ||
    m.rerollSkill !== undefined ||
    m.originalDice !== undefined ||
    m.rerollOriginalId !== undefined ||
    m.rerollQuestionId !== undefined ||
    m.rerollDecisionId !== undefined ||
    m.catchRerollResume !== undefined ||
    e.possessionBounds !== undefined ||
    e.catchPossessionBounds !== undefined ||
    g.teamRerollsSpent !== Number(r.kind === "loner") ||
    g.rerollResource !== (r.kind === "loner" ? "team" : "skill") ||
    Object.entries(odds).some(
      ([key, n]) => Math.abs(r[key as keyof typeof odds] - n) > 1e-9
    )
  )
    return false;
  return r.kind === "loner"
    ? original.canUseTeamReroll &&
        !original.canUseProReroll &&
        g.rollType === 71 &&
        g.lonerGate?.passed === false &&
        g.lonerGate.skillSourceId === r.skillSourceId &&
        g.lonerGate.skillId === skill!.metadata.skillUsage!.skillId
    : original.canUseProReroll &&
        !original.canUseTeamReroll &&
        g.rollType === 15 &&
        g.proGate?.passed === false &&
        g.proGate.skillSourceId === r.skillSourceId &&
        skill!.metadata.skillUsage!.skillId === 50;
}
