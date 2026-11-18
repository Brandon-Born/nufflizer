import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import type { ReplayEvent } from "@/domain/replay/types";
import { LUCK_CATEGORY_WEIGHTS } from "./constants";
import type { TeamDiceIdentity } from "./diceIdentityLinks";
import { gatedRetryChance } from "./failedNumericRetry";
import { retryAccessDelta, retryAccessFormula } from "./numericRetryAccess";
import type { LuckEvent, LuckReport } from "./types";

export function scoreActivationRetryAccess(
  identity: TeamDiceIdentity,
  rows: ReadonlyMap<ReplayEvent, LuckEvent>,
  owners: OwnershipTimeline
) {
  const { gate, final, question, choice, gateSkill } = identity;
  if (
    !gate ||
    !gateSkill ||
    !gate.playerId ||
    !final.id ||
    !question.id ||
    !choice.id ||
    !gateSkill.id
  )
    return;
  const row = rows.get(gate);
  const first = rows.get(question);
  const terminal = rows.get(final);
  const observed = row?.metadata.lonerGate;
  const owner = owners.resolve(gate.playerId, gate);
  const odds = gatedRetryChance(
    first?.metadata.difficulty ?? -1,
    observed?.threshold ?? -1
  );
  if (
    !row ||
    !observed ||
    !odds ||
    row.scoringStatus !== "excluded" ||
    owner.status !== "confirmed" ||
    owner.proof.teamId !== row.teamId ||
    observed.passed !== identity.gatePassed ||
    observed.skillSourceId !== gateSkill.id ||
    row.metadata.rerollDecisionId !== choice.id ||
    first?.metadata.activationCheck?.draw !== "original" ||
    first.scoringStatus !== "scored" ||
    first.actualSuccess !== false ||
    first.teamId !== row.teamId ||
    first.playerId !== row.playerId ||
    terminal?.teamId !== row.teamId ||
    terminal.playerId !== row.playerId ||
    (observed.passed
      ? terminal.metadata.activationCheck?.draw !== "replacement"
      : terminal.scoringStatus !== "excluded")
  )
    return;

  const p = odds.baseSuccessChance;
  const g = odds.gateSuccessChance;
  const weight = LUCK_CATEGORY_WEIGHTS.activation_check;
  const delta = retryAccessDelta(p, g, observed.passed);
  const trait = first.metadata.rollType === 33 ? "Bone Head" : "Really Stupid";
  const result = observed.passed ? "passed" : "failed";
  row.type = "activation_check";
  row.scoringStatus = "scored";
  row.actualSuccess = observed.passed;
  row.probabilitySuccess = g;
  row.delta = delta;
  row.weightedDelta = delta * weight;
  row.label = `Loner ${observed.threshold}+ retry access ${result}`;
  row.statusReason = `Verified Loner roll changes the chance of a successful ${trait} replacement.`;
  row.explainability = {
    target: `Loner ${observed.threshold}+`,
    baseOdds: g,
    rerollAdjustedOdds: g,
    weight,
    formulaSummary: retryAccessFormula(p, g, observed.passed, weight),
    inputsSummary: `At this decision, a ${trait} replacement would succeed on ${7 - first.metadata.difficulty!} of 6 faces. Loner ${result} on ${row.metadata.dice?.[0]}. The gate changes access to that replacement. The first die and any rolled replacement each keep their own contribution.`
  };
  row.metadata.probabilityPolicy = "gated_retry_access";
  row.metadata.ownership = { ...owner.proof, role: "actor" };
  row.metadata.preRoll = undefined;
  row.metadata.numericRetryAccess = {
    kind: "loner",
    originalSourceId: question.id,
    choiceSourceId: choice.id,
    skillSourceId: gateSkill.id,
    terminalSourceId: final.id,
    ...odds
  };
}

export function validReportedActivationRetryAccess(
  event: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  die: LuckReport["diceRecords"][number] | undefined
) {
  const m = event.metadata;
  const access = m.numericRetryAccess;
  const loner = m.lonerGate;
  if (!access?.terminalSourceId || !loner) return false;
  const first = sources.get(access.originalSourceId);
  const choice = sources.get(access.choiceSourceId);
  const terminal = sources.get(access.terminalSourceId);
  const identity = terminal?.metadata.teamDiceIdentity;
  const odds = gatedRetryChance(
    first?.metadata.difficulty ?? -1,
    loner.threshold
  );
  const sameActor = (row: LuckEvent | undefined) =>
    !!row &&
    row.playerId === event.playerId &&
    row.teamId === event.teamId &&
    row.metadata.stepType === 0 &&
    row.metadata.targetId === m.targetId;
  return (
    !!first &&
    !!choice &&
    !!terminal &&
    !!identity &&
    !!odds &&
    access.kind === "loner" &&
    event.type === "activation_check" &&
    event.scoringStatus === "scored" &&
    m.probabilityPolicy === "gated_retry_access" &&
    m.isRollCandidate === true &&
    m.sourceTag === "ResultRoll" &&
    m.rollType === 71 &&
    m.stepType === 0 &&
    m.ownership?.role === "actor" &&
    !m.activationCheck &&
    sameActor(first) &&
    sameActor(choice) &&
    sameActor(terminal) &&
    first.metadata.activationCheck?.draw === "original" &&
    first.scoringStatus === "scored" &&
    first.actualSuccess === false &&
    first.probabilitySuccess === odds.baseSuccessChance &&
    access.baseSuccessChance === odds.baseSuccessChance &&
    access.gateSuccessChance === odds.gateSuccessChance &&
    access.fixedPolicySuccessChance === odds.fixedPolicySuccessChance &&
    event.actualSuccess === loner.passed &&
    event.probabilitySuccess === odds.gateSuccessChance &&
    event.explainability.baseOdds === odds.gateSuccessChance &&
    event.explainability.rerollAdjustedOdds === odds.gateSuccessChance &&
    access.choiceSourceId === m.rerollDecisionId &&
    access.skillSourceId === loner.skillSourceId &&
    identity.questionSourceId === access.originalSourceId &&
    identity.decisionSourceId === access.choiceSourceId &&
    identity.gateSkillId === loner.skillId &&
    identity.gateSourceId === m.sourceId &&
    identity.teamUsed &&
    identity.gatePassed === loner.passed &&
    identity.replacementRolled === loner.passed &&
    m.rerollResource === "team" &&
    m.teamRerollsSpent === 1 &&
    m.locator?.messageIndex === 2 &&
    choice.metadata.locator?.messageIndex === 0 &&
    terminal.metadata.locator?.messageIndex === 3 &&
    terminal.metadata.actionId === m.actionId &&
    !!m.actionId &&
    terminal.metadata.sequenceId === m.sequenceId &&
    !!m.sequenceId &&
    m.sourceIndex !== undefined &&
    terminal.metadata.sourceIndex === m.sourceIndex + 1 &&
    choice.metadata.sourceIndex === m.sourceIndex - 2 &&
    (first.metadata.locator?.replayStep ?? NaN) + 1 === m.locator.replayStep &&
    first.metadata.locator?.childIndex === m.locator.childIndex &&
    (loner.passed
      ? terminal.metadata.activationCheck?.draw === "replacement"
      : terminal.scoringStatus === "excluded" &&
        terminal.metadata.isRollCandidate === false &&
        terminal.actualSuccess !== true) &&
    die?.parentEventId === event.id &&
    die.eventId === event.id &&
    die.disposition === "covered_roll" &&
    die.status === 1 &&
    die.newRoll === 1 &&
    die.path.join() === "Dice" &&
    die.rollType === 71 &&
    die.stepActorId === event.playerId &&
    die.dice.length === 1 &&
    die.dice[0]?.value === m.dice?.[0] &&
    die.dice[0]?.dieType === 0 &&
    !die.aliasOf &&
    !m.rerollDraws &&
    !m.preRoll &&
    !event.contextualImpact &&
    !event.contextualBounds &&
    !event.possessionBounds &&
    !event.catchPossessionBounds
  );
}
