import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import {
  ownerAt,
  type OwnershipTimeline
} from "@/domain/replay/ownershipTimeline";
import {
  findParticipantTraitEvidence,
  type CurrentTraitEvidence
} from "@/domain/replay/traitContinuity";
import { linkBlockPools } from "./blockPools";
import {
  findBlockConsequences,
  knockedDownSubjects
} from "./blockConsequences";
import { isOtherActionInjurySkill } from "./injurySkillScope";

export const fixedArmorPolicyKey = (e: ReplayEvent) =>
  JSON.stringify([e.sequenceId, e.actionId]);

export type FixedArmorPolicy = {
  kind: "unknown" | "self_fall" | "ordinary_block" | "foul";
  header: ReplayEvent;
  causeSourceId?: string;
  holderId?: string;
  checkpointAfter?: number;
};

// Known ordinary Block skills which cannot change its armor roll. Claws75
// changes armor (unlike injury); Mighty Blow13 permits a post-roll choice.
// Dirty Player27 is irrelevant to a Block but is excluded for the Foul actor.
const harmless = new Set([
  6, 7, 10, 15, 19, 26, 27, 30, 38, 44, 50, 57, 59, 61, 63, 68, 81, 83, 1008
]);
function fixedTraits(
  p: CurrentTraitEvidence | undefined,
  role: "block_actor" | "foul_actor" | "subject"
) {
  const t = p?.traits;
  if (
    !p?.onPitch ||
    !t ||
    t.dataPlayerId === null ||
    String(t.dataPlayerId) !== p.playerId ||
    t.playerTypeId === null ||
    t.innateSkills === null ||
    t.acquiredSkills === null
  )
    return false;
  if (
    [t.innateSkills, t.acquiredSkills].some((a) => new Set(a).size !== a.length)
  )
    return false;
  return [...t.innateSkills, ...t.acquiredSkills].every(
    (s) =>
      (harmless.has(s) && !(role === "foul_actor" && s === 27)) ||
      isOtherActionInjurySkill(s) ||
      ((role === "subject" || role === "foul_actor") && (s === 13 || s === 75))
  );
}
function headerIsKnown(e: ReplayEvent) {
  const p = e.payload;
  return (
    e.sourceTag === "DamageStep" &&
    !!e.id &&
    !!e.actionId &&
    !!e.sequenceId &&
    e.sourceIndex !== undefined &&
    e.stepType === 2 &&
    !!e.playerId &&
    e.playerId === e.targetId &&
    e.playerId === e.stepActorId &&
    e.playerId === e.stepTargetId &&
    !e.attributionConflict &&
    !e.executionExclusion &&
    p?.Applied === 1 &&
    p.IsEvaluation === 0 &&
    p.Skill === 0 &&
    [1, 2, 3].includes(Number(p.State)) &&
    Object.keys(p).every((k) =>
      [
        "Applied",
        "Probability",
        "Source",
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
    )
  );
}
function sameCell(a: unknown, b: unknown) {
  const c = (x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? (x as Record<string, unknown>)
      : undefined;
  const x = c(a),
    y = c(b);
  return (
    !!x &&
    !!y &&
    Object.keys(x).length === 2 &&
    Object.keys(y).length === 2 &&
    Number.isInteger(x.X) &&
    Number.isInteger(x.Y) &&
    Number(x.X) >= 0 &&
    Number(x.X) <= 25 &&
    Number(x.Y) >= 0 &&
    Number(x.Y) <= 14 &&
    x.X === y.X &&
    x.Y === y.Y
  );
}

// Collect candidates at the damage HEADER, before reading its armor result or
// modifier-use notice. The current-trait reducer independently rejects missing
// lists, unknown effects/prayers, stale instances and unsupported transitions.
export function findFixedArmorPolicies(
  replay: ReplayModel,
  owners: OwnershipTimeline
): ReadonlyMap<string, FixedArmorPolicy> {
  const policies = new Map<string, FixedArmorPolicy>();
  if (replay.replayVersion !== "1-4-0-0") return policies;
  const counts = new Map<string, number>();
  const candidates = new Map<
    ReplayEvent,
    {
      kind: "ordinary_block" | "foul";
      holder: string;
      cause: string;
      self: boolean;
    }
  >();
  const holders = new Map<string, string>(),
    subjects = new Map<string, string>();
  for (const turn of replay.turns) {
    const records = linkBlockPools(turn.events, replay.replayVersion);
    const byId = new Map(turn.events.map((e, i) => [e.id, i]));
    const byIndex = new Map(turn.events.map((e) => [e.sourceIndex, e]));
    for (const e of turn.events)
      if (e.sourceTag === "DamageStep")
        counts.set(
          fixedArmorPolicyKey(e),
          (counts.get(fixedArmorPolicyKey(e)) ?? 0) + 1
        );
    const causes = new Map<
      string,
      { holder: string; cause: string; self: boolean }[]
    >();
    for (const fact of findBlockConsequences(turn.events, records, owners)) {
      const poolIndex = byId.get(fact.poolSourceId) ?? -1;
      const record = records.get(poolIndex),
        block = record?.kind === "pool" ? record.evidence : undefined;
      if (!block) continue;
      const down = knockedDownSubjects(
        fact.outcome,
        block.attackerId,
        block.defenderId
      );
      for (const prefix of fact.damagePrefixes) {
        const damage = byIndex.get(prefix.damageStepSourceIndex);
        if (!damage?.playerId || !down.includes(damage.playerId)) continue;
        causes.set(fixedArmorPolicyKey(damage), [
          ...(causes.get(fixedArmorPolicyKey(damage)) ?? []),
          {
            holder: block.attackerId,
            cause: fact.finalSourceId,
            self: damage.playerId === block.attackerId
          }
        ]);
      }
    }
    for (const [i, header] of turn.events.entries()) {
      if (
        !headerIsKnown(header) ||
        !sameCell(header.payload?.CellFrom, header.payload?.CellTo)
      )
        continue;
      // Preserve execution evidence separately from probability-policy support.
      policies.set(fixedArmorPolicyKey(header), { kind: "unknown", header });
      if (header.damageSource === 0 || header.damageSource === 9) {
        // An applied own Dodge/Rush fall is not a Block/Foul: neither an
        // opposing Mighty Blow nor Dirty Player can modify its armor.
        policies.set(fixedArmorPolicyKey(header), {
          kind: "self_fall",
          header
        });
        continue;
      }
      const block = causes.get(fixedArmorPolicyKey(header));
      if (header.damageSource === 1 && block?.length === 1) {
        const c = block[0]!;
        candidates.set(header, { kind: "ordinary_block", ...c });
        holders.set(header.id!, c.holder);
        subjects.set(header.id!, header.playerId!);
      } else if (header.damageSource === 7) {
        const result = turn.events[i - 1],
          step = turn.events[i - 2],
          p = step?.payload;
        if (
          step?.sourceTag !== "PlayerStep" ||
          step.stepType !== 8 ||
          !step.playerId ||
          step.targetId !== header.playerId ||
          p?.Skill !== 0 ||
          p.IsEvaluation !== 0 ||
          ![1, 2, 3].includes(Number(p.State)) ||
          step.executionExclusion ||
          step.attributionConflict ||
          result?.executionExclusion ||
          result?.attributionConflict ||
          Object.keys(p).some(
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
          !sameCell(p.CellTo, header.payload?.CellFrom) ||
          result?.sourceTag !== "ResultNoRollSuccess" ||
          Object.keys(result.payload ?? {}).length !== 0 ||
          result.actionId !== step.actionId ||
          result.sequenceId !== header.sequenceId ||
          step.sequenceId !== header.sequenceId ||
          result.playerId !== step.playerId ||
          result.targetId !== header.playerId ||
          result.sourceIndex !== step.sourceIndex! + 1 ||
          header.sourceIndex !== result.sourceIndex + 1 ||
          (step.locator?.stepIndex === undefined || header.locator?.stepIndex !== step.locator.stepIndex + 1) ||
          header.locator?.replayStep !== step.locator?.replayStep ||
          header.locator?.childIndex !== step.locator?.childIndex
        )
          continue;
        candidates.set(header, {
          kind: "foul",
          holder: step.playerId,
          cause: result.id!,
          self: false
        });
        holders.set(header.id!, step.playerId);
        subjects.set(header.id!, header.playerId!);
      }
    }
  }
  const holderProofs = findParticipantTraitEvidence(replay, holders, owners),
    subjectProofs = findParticipantTraitEvidence(replay, subjects, owners);
  for (const [header, c] of candidates) {
    const holder = holderProofs.get(header.id!),
      subject = subjectProofs.get(header.id!);
    if (
      !fixedTraits(subject, "subject") ||
      subject?.teamId !== ownerAt(owners, header.playerId!, header)
    )
      continue;
    // An attacker's own knockdown is not damage inflicted by its opponent's
    // Block action. Its own Mighty Blow/Claws cannot modify its own armor.
    if (
      !c.self &&
      (!fixedTraits(holder, c.kind === "foul" ? "foul_actor" : "block_actor") ||
        holder?.teamId === subject?.teamId)
    )
      continue;
    policies.set(fixedArmorPolicyKey(header), {
      kind: c.kind,
      header,
      causeSourceId: c.cause,
      holderId: c.holder,
      checkpointAfter: holder?.currentCheckpointAfter
    });
  }
  for (const key of policies.keys())
    if (counts.get(key) !== 1) policies.delete(key);
  return policies;
}
