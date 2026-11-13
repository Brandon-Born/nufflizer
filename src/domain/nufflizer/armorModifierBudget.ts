import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import type { LuckEvent } from "./types";

type ArmorUse = NonNullable<LuckEvent["metadata"]["armorModifierUse"]>;
const object = (x: unknown): Record<string, unknown> | undefined =>
  x !== null && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : undefined;
const fields = (x: Record<string, unknown> | undefined, keys: string[]) =>
  !!x && Object.keys(x).every((k) => keys.includes(k));

// Observation of a committed +1, not an unconditional armor probability or
// proof of skill eligibility. The initial injury scorer supplies those roles
// and current traits separately. This budget belongs to one damage action.
export function findMightyBlowArmorUses(
  replay: ReplayModel,
  owners: OwnershipTimeline
) {
  const result = new Map<string, ArmorUse>();
  if (replay.replayVersion !== "1-4-0-0") return result;
  for (const turn of replay.turns)
    for (let i = 0; i < turn.events.length - 2; i++) {
      const [damage, use, armor] = turn.events.slice(i, i + 3) as [
        ReplayEvent,
        ReplayEvent,
        ReplayEvent
      ];
      const d = damage.payload,
        p = use.payload,
        a = armor.payload;
      const modifiers = object(a?.Modifiers),
        modifier = object(modifiers?.Modifier);
      const dice = object(a?.Dice)?.Die;
      if (
        damage.sourceTag !== "DamageStep" ||
        damage.damageSource !== 1 ||
        damage.stepType !== 2 ||
        d?.Applied !== 1 ||
        d.IsEvaluation !== 0 ||
        d.Skill !== 0 ||
        ![1, 2, 3].includes(Number(d.State)) ||
        !damage.playerId ||
        damage.targetId !== damage.playerId ||
        !damage.actionId ||
        damage.sourceIndex === undefined ||
        use.sourceTag !== "ResultSkillUsage" ||
        !use.id ||
        !use.playerId ||
        use.playerId === damage.playerId ||
        !fields(p, ["PlayerId", "Skill", "Used"]) ||
        String(p!.PlayerId) !== use.playerId ||
        p!.Skill !== 13 ||
        p!.Used !== 1 ||
        armor.sourceTag !== "ResultRoll" ||
        armor.rollType !== 10 ||
        !armor.id ||
        armor.playerId !== damage.playerId ||
        [use, armor].some(
          (e, j) =>
            e.actionId !== damage.actionId ||
            e.sequenceId !== damage.sequenceId ||
            e.sourceIndex !== damage.sourceIndex! + j + 1 ||
            e.stepActorId !== damage.playerId ||
            e.stepTargetId !== damage.playerId ||
            e.targetId !== damage.playerId ||
            e.stepType !== 2 ||
            e.damageSource !== 1 ||
            e.locator?.replayStep !== damage.locator?.replayStep ||
            e.locator?.childIndex !== damage.locator?.childIndex ||
            e.locator?.stepIndex !== damage.locator?.stepIndex ||
            e.locator?.messageIndex !== j
        ) ||
        [damage, use, armor].some((e) => e.attributionConflict) ||
        !fields(a, [
          "Status",
          "Requirement",
          "Difficulty",
          "Modifiers",
          "Dice",
          "RollType",
          "Outcome",
          "NewRoll"
        ]) ||
        a!.Status !== 1 ||
        a!.NewRoll !== 1 ||
        a!.Outcome !== 1 ||
        a!.RollType !== 10 ||
        !fields(modifiers, ["Modifier"]) ||
        !fields(modifier, [
          "PlayerId",
          "Skill",
          "Effect",
          "Value",
          "ModifierType"
        ]) ||
        String(modifier!.PlayerId) !== use.playerId ||
        modifier!.Skill !== 13 ||
        modifier!.Effect !== -1 ||
        modifier!.Value !== 1 ||
        modifier!.ModifierType !== 27 ||
        !fields(object(a!.Dice), ["Die"]) ||
        !Array.isArray(dice) ||
        dice.length !== 2 ||
        dice.some(
          (x) =>
            !fields(object(x), ["DieType", "Value"]) ||
            x.DieType !== 0 ||
            !Number.isInteger(x.Value) ||
            x.Value < 1 ||
            x.Value > 6
        ) ||
        !Number.isSafeInteger(a!.Requirement) ||
        Number(a!.Requirement) < 3 ||
        Number(a!.Requirement) > 12 ||
        a!.Difficulty !== Number(a!.Requirement) - 1 ||
        dice.reduce((n, x) => n + x.Value, 0) < Number(a!.Difficulty)
      )
        continue;
      const holder = owners.resolve(use.playerId, use),
        subject = owners.resolve(damage.playerId, armor);
      if (
        holder.status !== "confirmed" ||
        subject.status !== "confirmed" ||
        holder.proof.teamId === subject.proof.teamId ||
        use.actorTeamId !== holder.proof.teamId ||
        armor.actorTeamId !== subject.proof.teamId ||
        damage.actorTeamId !== subject.proof.teamId
      )
        continue;
      result.set(use.id, {
        skillId: 13,
        armorSourceId: armor.id,
        damageStepSourceIndex: damage.sourceIndex,
        subjectId: damage.playerId,
        subjectTeamId: subject.proof.teamId
      });
    }
  return result;
}

export function validReportedArmorModifierUse(
  event: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>
) {
  const use = event.metadata.armorModifierUse;
  if (!use) return true;
  const armor = sources.get(use.armorSourceId),
    a = armor?.metadata,
    m = event.metadata;
  return (
    event.scoringStatus === "excluded" &&
    !m.isRollCandidate &&
    event.probabilitySuccess === null &&
    event.actualSuccess === null &&
    event.delta === 0 &&
    event.weightedDelta === 0 &&
    !event.contextualImpact &&
    !event.contextualBounds &&
    !event.possessionBounds &&
    !event.catchPossessionBounds &&
    m.sourceTag === "ResultSkillUsage" &&
    m.skillUsage?.skillId === 13 &&
    m.skillUsage.used &&
    m.stepType === 2 &&
    !!event.playerId &&
    event.playerId !== use.subjectId &&
    event.teamId !== "unresolved" &&
    use.subjectTeamId !== "unresolved" &&
    !m.ownershipConflict &&
    event.teamId !== use.subjectTeamId &&
    m.targetId === use.subjectId &&
    armor?.playerId === use.subjectId &&
    armor.teamId === use.subjectTeamId &&
    !!m.actionId &&
    m.actionId === a?.actionId &&
    m.sequenceId === a?.sequenceId &&
    m.sourceIndex === use.damageStepSourceIndex + 1 &&
    a.sourceIndex === use.damageStepSourceIndex + 2 &&
    m.locator?.replayStep === a.locator?.replayStep &&
    m.locator?.childIndex === a.locator?.childIndex &&
    m.locator?.stepIndex === a.locator?.stepIndex &&
    m.locator?.messageIndex === 0 &&
    a.locator?.messageIndex === 1 &&
    armor.scoringStatus === "excluded" &&
    armor.probabilitySuccess === null &&
    armor.actualSuccess === null &&
    armor.delta === 0 &&
    armor.weightedDelta === 0 &&
    armor.type === "armor_break" &&
    a.sourceTag === "ResultRoll" &&
    a.rollType === 10 &&
    a.outcomeCode === 1 &&
    a.stepType === 2 &&
    a.targetId === use.subjectId &&
    a.modifiers?.join() === "1" &&
    a.modifiersSum === 1 &&
    a.skillsUsed?.join() === "13" &&
    Number.isSafeInteger(a.requirement) &&
    a.requirement! >= 3 &&
    a.requirement! <= 12 &&
    a.difficulty === a.requirement! - 1 &&
    a.dice?.length === 2 &&
    a.dieTypes?.join() === "0,0" &&
    a.dice.every((n) => Number.isInteger(n) && n >= 1 && n <= 6) &&
    a.dice.reduce((x, y) => x + y, 0) >= a.difficulty
  );
}
