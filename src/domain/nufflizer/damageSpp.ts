import type { ReplayModel } from "@/domain/replay/types";
import type {
  OwnershipProof,
  OwnershipTimeline
} from "@/domain/replay/ownershipTimeline";
import type { LuckEvent } from "./types";

// Retains a recorded annotation, not proof that the SPP award is legal, that
// a skill was learned, or that any casualty/availability value is known.
export function findDamageSppNotices(
  replay: ReplayModel,
  owners: OwnershipTimeline
) {
  const result = new Map<string, { ownership: OwnershipProof }>();
  if (replay.replayVersion !== "1-4-0-0") return result;
  for (const turn of replay.turns)
    for (const [i, e] of turn.events.entries()) {
      const armor = turn.events[i - 1],
        injury = turn.events[i + 1],
        p = e.payload;
      if (
        e.sourceTag !== "ResultGainSpp" ||
        !e.id ||
        !e.playerId ||
        !p ||
        !Number.isSafeInteger(p.PlayerId) ||
        Number(p.PlayerId) < 0 ||
        String(p.PlayerId) !== e.playerId ||
        p.SppGained !== 2 ||
        Object.keys(p).some((k) => k !== "PlayerId" && k !== "SppGained") ||
        e.attributionConflict ||
        e.actorTeamSource === "turn_inferred" ||
        e.stepTag !== "DamageStep" ||
        e.stepType !== 2 ||
        e.damageSource !== 1 ||
        armor?.sourceTag !== "ResultRoll" ||
        armor.rollType !== 10 ||
        injury?.sourceTag !== "ResultInjuryRoll" ||
        injury.rollType !== 11 ||
        !e.actionId ||
        !e.sequenceId ||
        [armor, injury].some(
          (r) =>
            r.actionId !== e.actionId ||
            r.sequenceId !== e.sequenceId ||
            r.attributionConflict
        ) ||
        armor.playerId !== injury.playerId ||
        e.playerId === injury.playerId ||
        armor.sourceIndex === undefined ||
        e.sourceIndex !== armor.sourceIndex + 1 ||
        injury.sourceIndex !== e.sourceIndex + 1
      )
        continue;
      const owner = owners.resolve(e.playerId, e);
      if (owner.status !== "confirmed" || owner.proof.teamId !== e.actorTeamId)
        continue;
      result.set(e.id, { ownership: owner.proof });
    }
  return result;
}

export function attachDamageSppLinks(sources: ReadonlyMap<string, LuckEvent>) {
  const byIndex = new Map(
    [...sources.values()].map((e) => [e.metadata.sourceIndex, e])
  );
  for (const e of sources.values())
    if (e.metadata.recordedSpp) {
      const index = e.metadata.sourceIndex;
      if (index === undefined) continue;
      const armor = byIndex.get(index - 1),
        injury = byIndex.get(index + 1),
        observation = injury?.metadata.injuryObservation;
      if (
        !armor ||
        !injury ||
        !observation ||
        observation.recordKind !== "direct" ||
        observation.sourceCode !== 1 ||
        armor.type !== "armor_break" ||
        armor.metadata.rollType !== 10 ||
        armor.playerId !== injury.playerId ||
        armor.teamId !== injury.teamId ||
        e.teamId === injury.teamId ||
        [armor, injury].some(
          (r) =>
            r.metadata.actionId !== e.metadata.actionId ||
            r.metadata.sequenceId !== e.metadata.sequenceId
        )
      )
        continue;
      e.metadata.recordedSpp.damage = {
        armorSourceId: armor.metadata.sourceId!,
        injurySourceId: injury.metadata.sourceId!,
        damageStepSourceIndex: observation.damageStepSourceIndex
      };
    }
}

export function validReportedDamageSpp(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>
) {
  const notice = e.metadata.recordedSpp;
  if (!notice) return true;
  const m = e.metadata;
  if (
    m.sourceTag !== "ResultGainSpp" ||
    m.isRollCandidate !== false ||
    m.stepType !== 2 ||
    e.scoringStatus !== "excluded" ||
    e.probabilitySuccess !== null ||
    e.actualSuccess !== null ||
    e.delta !== 0 ||
    e.weightedDelta !== 0 ||
    e.explainability.weight !== 0 ||
    !e.playerId ||
    e.teamId === "unresolved" ||
    m.ownership?.role !== "actor" ||
    m.ownership.playerId !== e.playerId ||
    m.ownership.teamId !== e.teamId ||
    m.sourceIndex === undefined ||
    (m.ownership.checkpointAfter !== undefined &&
      m.ownership.checkpointAfter >= m.sourceIndex) ||
    m.dice?.length ||
    m.injuryScoring
  )
    return false;
  if (!notice.damage) return true;
  const d = notice.damage,
    armor = sources.get(d.armorSourceId),
    injury = sources.get(d.injurySourceId),
    o = injury?.metadata.injuryObservation;
  return (
    !!armor &&
    !!injury &&
    !!o &&
    o.recordKind === "direct" &&
    o.sourceCode === 1 &&
    o.damageStepSourceIndex === d.damageStepSourceIndex &&
    d.damageStepSourceIndex < armor.metadata.sourceIndex! &&
    armor.type === "armor_break" &&
    armor.metadata.rollType === 10 &&
    armor.playerId === injury.playerId &&
    armor.teamId === injury.teamId &&
    e.playerId !== injury.playerId &&
    e.teamId !== injury.teamId &&
    armor.metadata.sourceIndex! + 1 === m.sourceIndex &&
    injury.metadata.sourceIndex === m.sourceIndex + 1 &&
    [armor, injury].every(
      (r) =>
        r.metadata.actionId === m.actionId &&
        r.metadata.sequenceId === m.sequenceId
    )
  );
}
