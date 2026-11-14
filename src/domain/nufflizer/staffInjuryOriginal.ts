import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import { findSubjectTraitEvidence } from "@/domain/replay/traitContinuity";
import { injuryTableForTraits } from "./injuryTable";
import { staffInjuryRoll } from "./initialInjurySources";
const fields = (p: Record<string, unknown> | undefined, keys: string[]) =>
  !!p && Object.keys(p).every((k) => keys.includes(k));
import type { LuckEvent } from "./types";
import type { DiceRecord } from "./diceEvidence";

export type StaffInjuryOriginal = {
  table: NonNullable<ReturnType<typeof injuryTableForTraits>>;
};
export function findStaffInjuryOriginals(
  replay: ReplayModel,
  owners: OwnershipTimeline
) {
  const result = new Map<string, StaffInjuryOriginal>();
  if (replay.replayVersion !== "1-4-0-0") return result;
  const candidates = new Map<
    string,
    { raw: ReplayEvent; step: ReplayEvent; dice: number[] }
  >();
  for (const turn of replay.turns) {
    const headers = new Map<string, ReplayEvent>(),
      ambiguous = new Set<string>();
    for (const e of turn.events)
      if (e.sourceTag === "DamageStep" && e.actionId) {
        if (headers.has(e.actionId)) ambiguous.add(e.actionId);
        headers.set(e.actionId, e);
      }
    for (const e of turn.events) {
      const read = staffInjuryRoll(e),
        step = headers.get(e.actionId ?? "");
      if (
        !read ||
        !step ||
        !e.id ||
        !e.actionId ||
        ambiguous.has(e.actionId) ||
        !e.playerId
      )
        continue;
      const owner = owners.resolve(e.playerId, e),
        p = step.payload;
      if (
        owner.status !== "confirmed" ||
        owner.proof.teamId !== e.actorTeamId ||
        e.actorTeamSource === "turn_inferred" ||
        step.actorTeamSource === "turn_inferred" ||
        step.actorTeamId !== e.actorTeamId ||
        [e, step].some(
          (x) =>
            x.attributionConflict ||
            x.stepType !== 2 ||
            x.stepTag !== "DamageStep" ||
            x.playerId !== e.playerId ||
            x.targetId !== e.playerId ||
            x.stepActorId !== e.playerId ||
            x.stepTargetId !== e.playerId ||
            x.damageSource !== read.roll.Source ||
            (x.teamId && x.teamId !== owner.proof.teamId)
        ) ||
        !fields(p, [
          "Applied",
          "Probability",
          "Source",
          "PlayerId",
          "TargetId",
          "IsEvaluation",
          "StepType",
          "CellTo",
          "State",
          "CellFrom",
          "Skill"
        ]) ||
        p?.Applied !== 1 ||
        p.IsEvaluation !== 0 ||
        p.Skill !== 0 ||
        p.StepType !== 2 ||
        p.Source !== read.roll.Source ||
        !Number.isSafeInteger(p.State) ||
        ![1, 2, 3].includes(Number(p.State)) ||
        step.sourceIndex === undefined ||
        e.sourceIndex === undefined ||
        step.sourceIndex >= e.sourceIndex ||
        step.sequenceId !== e.sequenceId
      )
        continue;
      candidates.set(e.id, { raw: e, step, dice: read.dice });
    }
  }
  const proofs = findSubjectTraitEvidence(
    replay,
    new Map([...candidates].map(([id, c]) => [id, c.raw.playerId!])),
    owners
  );
  for (const [id, c] of candidates) {
    const proof = proofs.get(id);
    if (
      !proof ||
      !proof.onPitch ||
      proof.currentCheckpointAfter >= c.step.sourceIndex!
    )
      continue;
    const table = injuryTableForTraits(proof, c.dice, "badly_hurt");
    if (table?.stunty) result.set(id, { table });
  }
  return result;
}

export function validReportedStaffInjuryOriginal(
  event: LuckEvent,
  dice: DiceRecord | undefined
) {
  const m = event.metadata,
    o = m.injuryObservation,
    receipt = m.initialInjuryOriginal,
    table = m.injuryTable;
  const ko = o?.recordKind === "embedded_ko" && !!table;
  if (!receipt && !ko) return o?.recordKind !== "apothecary_original";
  return (
    !!o &&
    (ko
      ? !receipt &&
        o.outcome === "ko" &&
        m.outcomeCode === 2 &&
        m.sourceTag === "QuestionKORecovery"
      : o.recordKind === "apothecary_original" &&
        o.outcome === "badly_hurt" &&
        receipt?.policy === "stunty_nine_usage_original" &&
        receipt.wireOutcomeCode === 1 &&
        m.outcomeCode === 1 &&
        m.sourceTag === "QuestionApothecaryCasualtyUsage") &&
    m.rollType === 11 &&
    m.isRollCandidate === true &&
    !!table &&
    (ko || (table.stunty === true && table.traitEvidence.onPitch)) &&
    m.modifiers?.length === 0 &&
    m.modifiersSum === 0 &&
    m.dice?.length === 2 &&
    (ko || m.dice[0]! + m.dice[1] === 9) &&
    !!dice &&
    dice.parentSourceId === m.sourceId &&
    dice.parentEventId === event.id &&
    dice.parentSourceIndex === m.sourceIndex &&
    dice.parentSourceTag === m.sourceTag &&
    dice.actionId === m.actionId &&
    dice.path.join() === "RollInfos,Dice" &&
    dice.rollType === 11 &&
    dice.status === 1 &&
    dice.stepTag === "DamageStep" &&
    dice.stepType === 2 &&
    dice.stepActorId === event.playerId &&
    dice.stepTargetId === event.playerId &&
    dice.damageSource === o.sourceCode &&
    dice.quality === "complete" &&
    !dice.aliasOf &&
    dice.disposition ===
      (event.scoringStatus === "scored" ? "covered_roll" : "unscored_roll") &&
    dice.dice.length === 2 &&
    dice.dice.every((d, i) => d.dieType === 0 && d.value === m.dice![i]) &&
    m.dieTypes?.join() === "0,0"
  );
}
