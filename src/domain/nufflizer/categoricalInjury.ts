import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import {
  findParticipantTraitEvidence,
  type CurrentTraitEvidence
} from "@/domain/replay/traitContinuity";
import type { LuckEvent } from "./types";
import { recordedInjuryName } from "./injuryObservation";
import {
  injuryOtherActionScope,
  isOtherActionInjurySkill
} from "./injurySkillScope";
import { validReportedDamageSpp } from "./damageSpp";
import type { ObservedBlockConsequence } from "./blockConsequences";
import { knockedDownSubjects } from "./blockConsequences";
import { LUCK_CATEGORY_WEIGHTS } from "./constants";
import { validReportedArmorModifierUse } from "./armorModifierBudget";

// Ordinal dice deviation, not a price for losing the player. Badly Hurt and a
// pending Casualty roll share one injury tier; no league damage is valued.
// P(an independent equal-policy result is worse) - P(it is better) has mean
// zero. For a binary distribution it is exactly actualSuccess - p(success).
export function injuryOrderDeviation(
  counts: readonly number[],
  outcome: string
) {
  if (
    counts.length !== 4 ||
    counts.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    counts.reduce((a, b) => a + b, 0) !== 36
  )
    return;
  const tier =
    outcome === "stunned"
      ? 0
      : outcome === "ko"
        ? 1
        : outcome === "badly_hurt" || outcome === "casualty"
          ? 2
          : undefined;
  if (tier === undefined) return;
  const tiers = [counts[0]!, counts[1]!, counts[2]! + counts[3]!];
  if (tiers[tier] === 0) return;
  const lessSevereChance = tiers.slice(0, tier).reduce((a, b) => a + b, 0) / 36;
  const moreSevereChance =
    tiers.slice(tier + 1).reduce((a, b) => a + b, 0) / 36;
  return {
    lessSevereChance,
    sameSeverityChance: tiers[tier]! / 36,
    moreSevereChance,
    delta:
      (tiers.slice(tier + 1).reduce((a, b) => a + b, 0) -
        tiers.slice(0, tier).reduce((a, b) => a + b, 0)) /
      36
  };
}
// Only known intrinsic skills which cannot modify injury on an ordinary Block.
// Mighty Blow needs a separate same-damage armor-spend receipt. Pro cannot
// reroll Armour/Injury/Casualty
// (BB2020 p77); special and unknown skills remain outside this contract.
const ordinaryBlockDamageSkills = new Set([
  6, 7, 10, 15, 19, 26, 27, 30, 38, 44, 50, 57, 59, 61, 63, 68, 75, 81, 83, 1008
]);
export function hasFixedBlockInjuryPolicy(
  proof: CurrentTraitEvidence,
  armorSpent = false
) {
  const t = proof.traits;
  return (
    t.dataPlayerId !== null &&
    String(t.dataPlayerId) === proof.playerId &&
    t.playerTypeId !== null &&
    t.innateSkills !== null &&
    t.acquiredSkills !== null &&
    [t.innateSkills, t.acquiredSkills].every(
      (a) => new Set(a).size === a.length
    ) &&
    [...t.innateSkills, ...t.acquiredSkills].every(
      (s) =>
        ordinaryBlockDamageSkills.has(s) ||
        isOtherActionInjurySkill(s) ||
        (armorSpent && s === 13)
    ) &&
    (!armorSpent ||
      [...t.innateSkills, ...t.acquiredSkills].filter((s) => s === 13)
        .length === 1)
  );
}
function cell(p: unknown) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return;
  const c = p as Record<string, unknown>;
  if (
    Object.keys(c).some((k) => k !== "X" && k !== "Y") ||
    !Number.isInteger(c.X) ||
    !Number.isInteger(c.Y) ||
    Number(c.X) < 0 ||
    Number(c.X) > 25 ||
    Number(c.Y) < 0 ||
    Number(c.Y) > 14
  )
    return;
  return { x: Number(c.X), y: Number(c.Y) };
}
// A recorded award bridges this damage transaction only for the opposing
// participant in the same block. Either participant can be the injured player.
function sppMatchesBlockPeer(
  spp: LuckEvent,
  injuredId: string | undefined,
  block: NonNullable<LuckEvent["metadata"]["block"]>,
  attackerTeamId: LuckEvent["teamId"]
) {
  if (injuredId === block.defenderId)
    return spp.playerId === block.attackerId && spp.teamId === attackerTeamId;
  if (injuredId === block.attackerId)
    return (
      spp.playerId === block.defenderId && spp.teamId === block.defenderTeamId
    );
  return false;
}
function selfFallCause(
  events: readonly ReplayEvent[],
  index: number,
  sources: ReadonlyMap<string, LuckEvent>
) {
  const damage = events[index]!,
    outcome = events[index - 1],
    move = events[index - 2],
    raw = events[index - 3];
  const roll = raw?.id ? sources.get(raw.id) : undefined;
  const step = events
    .slice(Math.max(0, index - 128), index - 3)
    .reverse()
    .find((e) => e.actionId === raw?.actionId && e.sourceTag === "PlayerStep");
  const from = cell(step?.payload?.CellFrom),
    to = cell(step?.payload?.CellTo),
    fallen = cell(damage.payload?.CellFrom);
  const summary = outcome?.payload?.Rolls as
    { RollSummary?: { RollType?: number; Outcome?: number } } | undefined;
  if (
    !roll ||
    roll.scoringStatus !== "scored" ||
    roll.actualSuccess !== false ||
    ![1, 2].includes(roll.metadata.rollType ?? -1) ||
    raw?.sourceTag !== "ResultRoll" ||
    !step ||
    step.stepType !== 1 ||
    step.stepTargetId !== "-1" ||
    step.payload?.Skill !== 0 ||
    step.payload.IsEvaluation !== 0 ||
    Object.keys(step.payload).some(
      (k) =>
        ![
          "Probability",
          "PlayerId",
          "TargetId",
          "TeamId",
          "IsEvaluation",
          "StepType",
          "CellTo",
          "State",
          "CellFrom",
          "Skill"
        ].includes(k)
    ) ||
    [step, raw, move, outcome, damage].some(
      (e) =>
        !e ||
        e.playerId !== roll.playerId ||
        e.attributionConflict ||
        e.sequenceId !== raw.sequenceId
    ) ||
    [step, move, outcome].some((e) => e!.actionId !== raw.actionId) ||
    move?.sourceTag !== "ResultDoMove" ||
    Object.keys(move.payload ?? {}).length !== 0 ||
    outcome?.sourceTag !== "ResultMoveOutcome" ||
    outcome.payload?.Moved !== 1 ||
    outcome.payload.TentacleUsed !== 0 ||
    outcome.payload.FumbleRooskieUsed !== 0 ||
    Object.keys(outcome.payload).some(
      (k) =>
        ![
          "Moved",
          "TentacleUsed",
          "FumbleRooskieUsed",
          "Rolls",
          "Pushbacks"
        ].includes(k)
    ) ||
    (outcome.payload.Pushbacks !== undefined &&
      outcome.payload.Pushbacks !== "") ||
    !summary?.RollSummary ||
    Object.keys(summary).join() !== "RollSummary" ||
    Object.keys(summary.RollSummary).some(
      (k) => k !== "RollType" && k !== "Outcome"
    ) ||
    summary.RollSummary.RollType !== roll.metadata.rollType ||
    summary.RollSummary.Outcome !== 0 ||
    damage.damageSource !== (roll.metadata.rollType === 1 ? 9 : 0) ||
    damage.targetId !== roll.playerId ||
    damage.locator?.stepIndex !== (step.locator?.stepIndex ?? -2) + 1 ||
    !from ||
    !to ||
    !fallen ||
    Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) !== 1 ||
    JSON.stringify(from) !== JSON.stringify(fallen) ||
    JSON.stringify(fallen) !== JSON.stringify(cell(damage.payload?.CellTo)) ||
    step.sourceIndex === undefined ||
    outcome.sourceIndex === undefined
  )
    return;
  return {
    kind: "self_fall" as const,
    rollSourceId: raw.id!,
    movementStepSourceIndex: step.sourceIndex,
    moveOutcomeSourceIndex: outcome.sourceIndex
  };
}

export function attachCategoricalInjuries(
  replay: ReplayModel,
  sources: ReadonlyMap<string, LuckEvent>,
  blocks: readonly ObservedBlockConsequence[],
  owners: OwnershipTimeline
) {
  if (replay.replayVersion !== "1-4-0-0") return;
  const blockActions = new Map<string, ObservedBlockConsequence[]>();
  for (const block of blocks)
    for (const { actionId } of block.damagePrefixes)
      blockActions.set(actionId, [
        ...(blockActions.get(actionId) ?? []),
        block
      ]);
  const modifierHolders = new Map<string, string>();
  for (const [id, event] of sources) {
    const list = event.metadata.actionId
      ? blockActions.get(event.metadata.actionId)
      : undefined;
    const pool =
      list?.length === 1 ? sources.get(list[0]!.poolSourceId) : undefined;
    const attacker = pool?.metadata.block?.attackerId;
    if (event.metadata.injuryTable && attacker && attacker !== event.playerId)
      modifierHolders.set(id, attacker);
  }
  const holders = findParticipantTraitEvidence(replay, modifierHolders, owners);
  for (const turn of replay.turns)
    for (let i = 0; i < turn.events.length; i++) {
      const damage = turn.events[i]!;
      const use = sources.get(turn.events[i + 1]?.id ?? "");
      const armorUse = use?.metadata.armorModifierUse;
      const rawArmor = turn.events[i + (armorUse ? 2 : 1)];
      const following = turn.events[i + (armorUse ? 3 : 2)];
      const spp = following?.id ? sources.get(following.id) : undefined;
      const sppLink = spp?.metadata.recordedSpp?.damage;
      const rawInjury = turn.events[i + (armorUse ? 3 : 2) + (sppLink ? 1 : 0)];
      const injury = rawInjury?.id ? sources.get(rawInjury.id) : undefined;
      const armor = rawArmor?.id ? sources.get(rawArmor.id) : undefined;
      const table = injury?.metadata.injuryTable,
        observation = injury?.metadata.injuryObservation;
      if (
        damage.sourceTag !== "DamageStep" ||
        ![1, 2, 3].includes(Number(damage.payload?.State)) ||
        !table ||
        !observation ||
        !table.traitEvidence.onPitch ||
        injury?.metadata.rerollUsed === true ||
        !injury ||
        !armor ||
        injury.scoringStatus !== "excluded" ||
        observation.recordKind !== "direct" ||
        observation.damageStepSourceIndex !== damage.sourceIndex ||
        injury.metadata.actionId !== damage.actionId ||
        (!armorUse && armor.scoringStatus !== "scored") ||
        armor.type !== "armor_break" ||
        (!armorUse && armor.actualSuccess !== false) ||
        armor.playerId !== injury.playerId ||
        armor.teamId !== injury.teamId ||
        armor.metadata.actionId !== damage.actionId ||
        armor.metadata.sequenceId !== injury.metadata.sequenceId ||
        (!armorUse &&
          (rawArmor?.payload?.Modifiers !== "" ||
            armor.metadata.modifiersSum !== 0 ||
            armor.metadata.modifiers?.length !== 0)) ||
        (armorUse &&
          (!validReportedArmorModifierUse(use!, sources) ||
            armorUse.armorSourceId !== rawArmor?.id ||
            armorUse.damageStepSourceIndex !== damage.sourceIndex)) ||
        rawInjury?.sourceIndex !== rawArmor.sourceIndex! + (sppLink ? 2 : 1) ||
        (sppLink &&
          (!spp ||
            !validReportedDamageSpp(spp, sources) ||
            sppLink.armorSourceId !== rawArmor?.id ||
            sppLink.injurySourceId !== rawInjury?.id ||
            sppLink.damageStepSourceIndex !== damage.sourceIndex)) ||
        rawArmor.sourceIndex !== damage.sourceIndex! + (armorUse ? 2 : 1)
      )
        continue;
      let cause:
        | NonNullable<LuckEvent["metadata"]["injuryScoring"]>["cause"]
        | undefined;
      const candidates = blockActions.get(damage.actionId ?? "");
      if (candidates?.length === 1 && damage.damageSource === 1) {
        const pool = sources.get(candidates[0]!.poolSourceId),
          block = pool?.metadata.block;
        if (
          !block ||
          !candidates[0]!.damagePrefixes.some(
            (p) =>
              p.actionId === damage.actionId &&
              p.damageStepSourceIndex === damage.sourceIndex
          ) ||
          ![block.attackerId, block.defenderId].includes(injury.playerId!)
        )
          continue;
        const proof = holders.get(rawInjury.id!);
        if (
          sppLink &&
          !sppMatchesBlockPeer(spp!, injury.playerId, block, pool!.teamId)
        )
          continue;
        if (
          (armorUse &&
            (injury.playerId !== block.defenderId ||
              use!.playerId !== block.attackerId ||
              use!.teamId !== pool!.teamId)) ||
          (injury.playerId !== block.attackerId &&
            (!proof ||
              !proof.onPitch ||
              !hasFixedBlockInjuryPolicy(proof, !!armorUse) ||
              proof.playerId !== block.attackerId ||
              proof.teamId !== pool!.teamId ||
              proof.currentCheckpointAfter >= damage.sourceIndex!))
        )
          continue;
        cause = {
          kind: "block",
          poolSourceId: candidates[0]!.poolSourceId,
          appliedOutcomeSourceId: candidates[0]!.finalSourceId,
          damageStepSourceIndex: damage.sourceIndex!,
          ...(armorUse
            ? {
                armorModifierBudget: {
                  useSourceId: use!.metadata.sourceId!,
                  available: 1 as const,
                  spent: 1 as const,
                  remaining: 0 as const
                }
              }
            : {}),
          ...(proof
            ? {
                attackerTraitEvidence: proof,
                ...(injuryOtherActionScope(proof)
                  ? { attackerOtherActionSkills: injuryOtherActionScope(proof) }
                  : {})
              }
            : {})
        };
      } else if (!candidates && !armorUse)
        cause = selfFallCause(turn.events, i, sources);
      if (!cause || (sppLink && cause.kind !== "block")) continue;
      const rank = injuryOrderDeviation(table.counts, observation.outcome);
      const subject = injury.playerId
        ? owners.resolve(injury.playerId, rawInjury!)
        : undefined;
      if (
        !rank ||
        subject?.status !== "confirmed" ||
        subject.proof.teamId !== injury.teamId ||
        injury.metadata.ownershipConflict
      )
        continue;
      injury.metadata.ownership = { ...subject.proof, role: "subject" };
      injury.metadata.injuryScoring = {
        policy: "injury_table_order",
        armorSourceId: rawArmor.id!,
        ...(sppLink ? { sppSourceId: spp!.metadata.sourceId! } : {}),
        cause,
        lessSevereChance: rank.lessSevereChance,
        sameSeverityChance: rank.sameSeverityChance,
        moreSevereChance: rank.moreSevereChance
      };
      injury.metadata.probabilityPolicy = "categorical_injury";
      injury.scoringStatus = "scored";
      injury.delta = rank.delta;
      injury.explainability.weight = LUCK_CATEGORY_WEIGHTS.injury;
      injury.weightedDelta = rank.delta * LUCK_CATEGORY_WEIGHTS.injury;
      injury.label = `Injury: ${recordedInjuryName(observation.outcome)}`;
      injury.statusReason =
        "verified unmodified categorical injury under a source-qualified damage policy";
      injury.explainability.target =
        "initial injury severity tier, before treatment or recovery";
      injury.explainability.formulaSummary =
        "weighted delta = (chance of a more severe tier - chance of a less severe tier) × injury weight";
      injury.explainability.inputsSummary = `Initial injury tier: ${observation.outcome}; less severe ${(100 * rank.lessSevereChance).toFixed(1)}%, same tier ${(100 * rank.sameSeverityChance).toFixed(1)}%, more severe ${(100 * rank.moreSevereChance).toFixed(1)}%. No binary success, treatment, final availability or contextual value is inferred.`;
    }
}

// Structural validation of the exported source/probability/role join. As with
// other receipts, this cannot attest to raw replay bytes absent from the report.
export function validReportedCategoricalInjury(
  event: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>
) {
  const score = event.metadata.injuryScoring;
  if (!score) return event.metadata.probabilityPolicy !== "categorical_injury";
  const table = event.metadata.injuryTable,
    observation = event.metadata.injuryObservation;
  const rank =
    table && observation
      ? injuryOrderDeviation(table.counts, observation.outcome)
      : undefined;
  const armor = sources.get(score.armorSourceId);
  const budget =
    score.cause.kind === "block" ? score.cause.armorModifierBudget : undefined;
  const use = budget ? sources.get(budget.useSourceId) : undefined;
  const spp = score.sppSourceId ? sources.get(score.sppSourceId) : undefined;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-12;
  if (
    !table ||
    !table.traitEvidence.onPitch ||
    !rank ||
    !observation ||
    event.scoringStatus !== "scored" ||
    event.metadata.probabilityPolicy !== "categorical_injury" ||
    event.probabilitySuccess !== null ||
    event.actualSuccess !== null ||
    event.metadata.rerollUsed === true ||
    event.explainability.baseOdds !== undefined ||
    event.explainability.rerollAdjustedOdds !== undefined ||
    !near(event.delta, rank.delta) ||
    !near(event.weightedDelta, rank.delta * LUCK_CATEGORY_WEIGHTS.injury) ||
    event.explainability.weight !== LUCK_CATEGORY_WEIGHTS.injury ||
    !near(score.lessSevereChance, rank.lessSevereChance) ||
    !near(score.moreSevereChance, rank.moreSevereChance) ||
    !near(score.sameSeverityChance, rank.sameSeverityChance) ||
    observation.recordKind !== "direct" ||
    event.metadata.sourceTag !== "ResultInjuryRoll" ||
    !armor ||
    armor.type !== "armor_break" ||
    armor.teamId !== event.teamId ||
    armor.playerId !== event.playerId ||
    armor.metadata.actionId !== event.metadata.actionId ||
    armor.metadata.sequenceId !== event.metadata.sequenceId ||
    (!budget &&
      (armor.scoringStatus !== "scored" ||
        armor.actualSuccess !== false ||
        armor.metadata.modifiersSum !== 0 ||
        armor.metadata.modifiers?.length !== 0 ||
        armor.metadata.damage?.sourceCode !== observation.sourceCode)) ||
    (budget &&
      (!use ||
        !validReportedArmorModifierUse(use, sources) ||
        use.metadata.armorModifierUse?.armorSourceId !== score.armorSourceId ||
        use.metadata.armorModifierUse.damageStepSourceIndex !==
          observation.damageStepSourceIndex)) ||
    (armor.metadata.sourceIndex ?? -2) + (score.sppSourceId ? 2 : 1) !==
      event.metadata.sourceIndex ||
    (score.sppSourceId &&
      (!spp ||
        !validReportedDamageSpp(spp, sources) ||
        spp.metadata.recordedSpp?.damage?.armorSourceId !==
          score.armorSourceId ||
        spp.metadata.recordedSpp.damage.injurySourceId !==
          event.metadata.sourceId ||
        spp.metadata.recordedSpp.damage.damageStepSourceIndex !==
          observation.damageStepSourceIndex)) ||
    observation.damageStepSourceIndex + (budget ? 2 : 1) !==
      armor.metadata.sourceIndex ||
    event.contextualImpact ||
    event.contextualBounds ||
    event.possessionBounds ||
    event.catchPossessionBounds
  )
    return false;
  const cause = score.cause;
  if (cause.kind === "self_fall") {
    if (score.sppSourceId) return false;
    const fall = sources.get(cause.rollSourceId),
      i = fall?.metadata.sourceIndex;
    return (
      fall?.scoringStatus === "scored" &&
      fall.actualSuccess === false &&
      fall.playerId === event.playerId &&
      fall.teamId === event.teamId &&
      fall.metadata.sourceTag === "ResultRoll" &&
      fall.metadata.stepType === 1 &&
      fall.metadata.targetId === "-1" &&
      [1, 2].includes(fall.metadata.rollType ?? -1) &&
      fall.metadata.sequenceId === event.metadata.sequenceId &&
      observation.sourceCode === (fall.metadata.rollType === 1 ? 9 : 0) &&
      i !== undefined &&
      cause.movementStepSourceIndex < i &&
      cause.moveOutcomeSourceIndex === i + 2 &&
      observation.damageStepSourceIndex === i + 3 &&
      fall.metadata.locator?.stepIndex !== undefined &&
      event.metadata.locator?.stepIndex === fall.metadata.locator.stepIndex + 1
    );
  }
  const pool = sources.get(cause.poolSourceId),
    block = pool?.metadata.block,
    resolution = pool?.metadata.blockResolution,
    final = sources.get(cause.appliedOutcomeSourceId),
    finalStep = final?.metadata.locator?.stepIndex,
    injuryStep = event.metadata.locator?.stepIndex;
  if (
    !block ||
    !resolution ||
    observation.sourceCode !== 1 ||
    !event.metadata.actionId ||
    cause.appliedOutcomeSourceId !== block.finalSourceId ||
    cause.damageStepSourceIndex !== observation.damageStepSourceIndex ||
    final?.metadata.sourceTag !== "ResultBlockOutcome" ||
    final.metadata.sequenceId !== event.metadata.sequenceId ||
    final.metadata.locator?.replayStep !== event.metadata.locator?.replayStep ||
    final.metadata.locator?.childIndex !== event.metadata.locator?.childIndex ||
    finalStep === undefined ||
    injuryStep === undefined ||
    (injuryStep !== finalStep + 1 &&
      !(resolution.outcome === "both_down" && injuryStep === finalStep + 2)) ||
    (final.metadata.sourceIndex ?? Infinity) >= cause.damageStepSourceIndex ||
    (pool?.metadata.sourceIndex ?? Infinity) >=
      observation.damageStepSourceIndex ||
    !knockedDownSubjects(
      resolution.outcome,
      block.attackerId,
      block.defenderId
    ).includes(event.playerId!)
  )
    return false;
  if (spp && !sppMatchesBlockPeer(spp, event.playerId, block, pool!.teamId))
    return false;
  if (
    budget &&
    (event.playerId !== block.defenderId ||
      use!.playerId !== block.attackerId ||
      use!.teamId !== pool!.teamId)
  )
    return false;
  if (event.playerId === block.attackerId)
    return (
      cause.attackerTraitEvidence === undefined &&
      cause.attackerOtherActionSkills === undefined &&
      pool!.teamId === event.teamId
    );
  const proof = cause.attackerTraitEvidence;
  return (
    !!proof &&
    hasFixedBlockInjuryPolicy(proof, !!budget) &&
    JSON.stringify(cause.attackerOtherActionSkills) ===
      JSON.stringify(injuryOtherActionScope(proof)) &&
    proof.onPitch &&
    proof.playerId === block.attackerId &&
    proof.teamId === pool!.teamId &&
    proof.teamId !== event.teamId &&
    proof.rosterIndex !== table.traitEvidence.rosterIndex &&
    proof.observedCheckpointAfter <= proof.currentCheckpointAfter &&
    proof.prayersCheckpointAfter <= proof.currentCheckpointAfter &&
    proof.currentCheckpointAfter ===
      table.traitEvidence.currentCheckpointAfter &&
    proof.currentCheckpointAfter < observation.damageStepSourceIndex
  );
}
