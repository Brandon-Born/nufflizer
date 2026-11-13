import type { ReplayEvent } from "@/domain/replay/types";
import type { BlockRecord } from "./blockPools";
import type { LuckEvent } from "./types";
import type { DamageStepSummary } from "./damageSteps";

export type BlockSkillUse = {
  sourceId: string;
  playerId: string;
  teamId: string;
  skillId: 7 | 30 | 57 | 68;
};
export type BlockResolution = {
  outcome:
    | "attacker_down"
    | "both_down"
    | "wrestled_prone"
    | "both_stay_up"
    | "push"
    | "defender_down"
    | "defender_pushed_down";
  skillSourceIds: string[];
  damageActionIds: string[];
  diceByTeam: Record<string, number>;
  unscoredDamageRolls: number;
};
export function blockOutcomeName(
  code: number
): BlockResolution["outcome"] | undefined {
  return (
    [
      "attacker_down",
      "both_down",
      "wrestled_prone",
      "both_stay_up",
      "push",
      "defender_down",
      "defender_pushed_down"
    ] as const
  )[code];
}
export function knockedDownSubjects(
  outcome: BlockResolution["outcome"],
  attacker: string,
  defender: string
): string[] {
  return outcome === "attacker_down"
    ? [attacker]
    : outcome === "both_down"
      ? [attacker, defender]
      : outcome === "defender_down" || outcome === "defender_pushed_down"
        ? [defender]
        : [];
}
// Validate observed resolution, never infer a complete trait list or choose a
// hypothetical die/optional skill. Wrestle is prone without a knockdown armor
// consequence; none of these outcomes alone certifies a team turnover.
export function consistentBlockResolution(
  face: number,
  code: number,
  attacker: string,
  defender: string,
  uses: readonly { playerId: string; skillId: number }[]
): boolean {
  const used = (id: string, skill: number) =>
    uses.some((u) => u.playerId === id && u.skillId === skill);
  if (
    uses.some(
      (u) =>
        ![7, 30, 57, 68].includes(u.skillId) ||
        ![attacker, defender].includes(u.playerId) ||
        (u.skillId === 7 && u.playerId !== defender) ||
        (u.skillId === 57 && u.playerId !== attacker)
    )
  )
    return false;
  if (face === 0) return code === 0 && uses.length === 0;
  if (face === 1) {
    if (uses.some((u) => u.skillId === 7 || u.skillId === 57)) return false;
    if (code === 2) return uses.some((u) => u.skillId === 68);
    if (uses.some((u) => u.skillId === 68)) return false;
    return (
      code ===
      (used(attacker, 30)
        ? used(defender, 30)
          ? 3
          : 5
        : used(defender, 30)
          ? 0
          : 1)
    );
  }
  if (face === 2) return code === 4 && uses.length === 0;
  if (face === 3)
    return (
      uses.every((u) => u.skillId === 7 || u.skillId === 57) &&
      (code === 4
        ? used(defender, 7) && !used(attacker, 57)
        : code === 6 && !used(defender, 7))
    );
  return face === 4 && code === 6 && uses.length === 0;
}
export type ObservedBlockConsequence = {
  poolSourceId: string;
  finalSourceId: string;
  selectedSourceId: string;
  selectedFace: number;
  skills: BlockSkillUse[];
  damageActionIds: string[];
  outcome: BlockResolution["outcome"];
  // Cursor immediately after the validated resolution/damage prefix, in the
  // containing turn. Consumers must validate the next action independently.
  nextEventIndex: number;
  nextStepIndex: number;
};
const allowedResolutionTags = new Set([
  "QuestionBlockDice",
  "QuestionBlockSkillUsage",
  "ResultSkillUsage",
  "ResultBlockRoll",
  "QuestionPushBack",
  "ResultPushBack",
  "QuestionFollowUp",
  "ResultFollowUp",
  "ResultBlockOutcome"
]);
const damageTags = new Set([
  "ResultRoll",
  "ResultInjuryRoll",
  "ResultCasualtyRoll",
  "ResultPlayerRemoval",
  "QuestionApothecaryCasualtyUsage",
  "QuestionApothecaryInjuryUsage",
  "ResultSkillUsage"
]);

export function findBlockConsequences(
  events: readonly ReplayEvent[],
  blocks: ReadonlyMap<number, BlockRecord>,
  owners: ReadonlyMap<string, string>
): ObservedBlockConsequence[] {
  const indices = new Map(
    events.flatMap((e, i) => (e.id ? [[e.id, i] as const] : []))
  );
  const steps = new Map(
    events
      .filter((e) => e.sourceTag === "PlayerStep" && e.actionId)
      .map((e) => [e.actionId!, e])
  );
  const terminal = new Map<string, number>();
  for (const [i, record] of blocks)
    if (record.kind === "pool" && record.evidence?.finalSourceId)
      terminal.set(
        record.evidence.finalSourceId,
        Math.max(i, terminal.get(record.evidence.finalSourceId) ?? -1)
      );
  const results: ObservedBlockConsequence[] = [];
  for (const [finalSourceId, poolIndex] of terminal) {
    const record = blocks.get(poolIndex),
      poolEvent = events[poolIndex];
    const block = record?.kind === "pool" ? record.evidence : undefined;
    const finalIndex = indices.get(finalSourceId),
      selectedIndex = block?.selectedSourceId
        ? indices.get(block.selectedSourceId)
        : undefined;
    if (
      !block ||
      !poolEvent?.id ||
      finalIndex === undefined ||
      selectedIndex === undefined ||
      selectedIndex <= poolIndex ||
      finalIndex <= selectedIndex ||
      finalIndex - poolIndex > 256 ||
      block.selectedFace === undefined ||
      block.finalOutcome === undefined
    )
      continue;
    const step = poolEvent.actionId ? steps.get(poolEvent.actionId) : undefined;
    if (
      step?.stepType !== 6 ||
      step.stepActorId !== block.attackerId ||
      step.stepTargetId !== block.defenderId ||
      step.payload?.Skill !== 0 ||
      step.payload.IsEvaluation !== 0
    )
      continue;
    const attackerTeam = owners.get(block.attackerId),
      defenderTeam = owners.get(block.defenderId);
    if (
      !attackerTeam ||
      !defenderTeam ||
      attackerTeam === defenderTeam ||
      block.attackerId === block.defenderId
    )
      continue;
    const skills: BlockSkillUse[] = [];
    let clear = true,
      selections = 0;
    for (let i = poolIndex + 1; i <= finalIndex; i++) {
      const event = events[i]!;
      if (event.sourceTag === "Carrier" && event.checkpointCarrier) continue;
      if (event.sourceTag === "PlayerStep") {
        if (
          event.stepType === 6 &&
          event.stepActorId === block.attackerId &&
          event.stepTargetId === block.defenderId &&
          event.payload?.Skill === 0 &&
          event.payload.IsEvaluation === 0
        )
          continue;
        clear = false;
        break;
      }
      if (
        !allowedResolutionTags.has(event.sourceTag) ||
        event.stepTag !== "PlayerStep" ||
        event.stepType !== 6 ||
        event.stepActorId !== block.attackerId ||
        event.stepTargetId !== block.defenderId ||
        event.attributionConflict
      ) {
        clear = false;
        break;
      }
      if (event.sourceTag === "ResultSkillUsage") {
        const skillId = event.payload?.Skill,
          playerId = String(event.payload?.PlayerId),
          teamId = owners.get(playerId);
        if (
          typeof skillId !== "number" ||
          ![7, 30, 57, 68].includes(skillId) ||
          event.payload?.Used !== 1 ||
          Object.keys(event.payload).some(
            (k) => !["PlayerId", "Skill", "Used"].includes(k)
          ) ||
          !event.id ||
          !teamId ||
          i > selectedIndex ||
          skills.some(
            (u) => u.skillId === skillId && u.playerId === playerId
          ) ||
          (event.actorTeamId && event.actorTeamId !== teamId)
        ) {
          clear = false;
          break;
        }
        skills.push({
          sourceId: event.id,
          playerId,
          teamId,
          skillId: skillId as BlockSkillUse["skillId"]
        });
      }
      if (event.sourceTag === "ResultBlockRoll") {
        selections++;
        const die = event.payload?.Die as
          { DieType?: unknown; Value?: unknown } | undefined;
        if (
          event.id !== block.selectedSourceId ||
          event.rollType !== 3 ||
          (event.payload?.RollStatus !== 1 &&
            event.payload?.RollStatus !== 2) ||
          event.payload?.RollStatus !== poolEvent.payload?.RollStatus ||
          die?.DieType !== 2 ||
          die.Value !== block.selectedFace ||
          event.payload?.Outcome !== block.selectedOutcome ||
          block.selectedOutcome !== block.finalOutcome ||
          (event.payload?.NewRoll !== 0 && event.payload?.NewRoll !== 1)
        ) {
          clear = false;
          break;
        }
      }
    }
    const applied = events[finalIndex]!.payload;
    if (
      !applied ||
      (applied.Follow !== 0 && applied.Follow !== 1) ||
      Object.keys(applied).some(
        (k) =>
          ![
            "AttackerId",
            "DefenderId",
            "Outcome",
            "Pushbacks",
            "Follow"
          ].includes(k)
      )
    )
      continue;
    const outcome = blockOutcomeName(block.finalOutcome);
    if (
      !clear ||
      selections !== 1 ||
      !outcome ||
      !consistentBlockResolution(
        block.selectedFace,
        block.finalOutcome,
        block.attackerId,
        block.defenderId,
        skills
      )
    )
      continue;
    const final = events[finalIndex]!;
    const damageActionIds: string[] = [],
      subjects = knockedDownSubjects(
        outcome,
        block.attackerId,
        block.defenderId
      ),
      seen = new Set<string>();
    let next = finalIndex + 1,
      stepIndex = (final.locator?.stepIndex ?? -100) + 1;
    const moveSummary = events[next];
    if (
      moveSummary?.sourceTag === "ResultMoveOutcome" &&
      moveSummary.actionId === final.actionId &&
      moveSummary.playerId === block.attackerId &&
      !moveSummary.attributionConflict &&
      moveSummary.payload?.Moved === 0 &&
      moveSummary.payload.TentacleUsed === 0 &&
      moveSummary.payload.FumbleRooskieUsed === 0 &&
      (moveSummary.payload.Rolls === "" ||
        moveSummary.payload.Rolls === undefined) &&
      Object.keys(moveSummary.payload).every((k) =>
        [
          "Moved",
          "TentacleUsed",
          "FumbleRooskieUsed",
          "Rolls",
          "Pushbacks"
        ].includes(k)
      ) &&
      JSON.stringify(moveSummary.payload.Pushbacks) ===
        JSON.stringify(final.payload?.Pushbacks)
    )
      next++;
    // Only directly adjacent, ordinary block damage steps. A ball reaction,
    // removal/surf, different sequence or unmodeled choice ends this scope.
    for (let count = 0; count < 2; count++) {
      const step = events[next];
      if (
        step?.sourceTag !== "DamageStep" ||
        !step.actionId ||
        !step.playerId ||
        !subjects.includes(step.playerId) ||
        seen.has(step.playerId) ||
        step.targetId !== step.playerId ||
        step.stepType !== 2 ||
        step.damageSource !== 1 ||
        step.payload?.Applied !== 1 ||
        step.payload.IsEvaluation !== 0 ||
        step.sequenceId !== final.sequenceId ||
        step.locator?.stepIndex !== stepIndex ||
        step.attributionConflict
      )
        break;
      let end = next + 1,
        supported = true;
      while (end < events.length && events[end]!.actionId === step.actionId) {
        const event = events[end]!;
        if (
          event.sourceTag === "ResultGainSpp" &&
          event.playerId === block.attackerId &&
          event.payload?.SppGained === 2 &&
          Object.keys(event.payload).every(
            (k) => k === "PlayerId" || k === "SppGained"
          ) &&
          !event.attributionConflict
        ) {
          end++;
          continue;
        }
        if (
          !damageTags.has(event.sourceTag) ||
          event.playerId !== step.playerId ||
          event.attributionConflict ||
          (event.sourceTag === "ResultRoll" &&
            event.rollType !== 10 &&
            event.rollType !== 46)
        ) {
          supported = false;
          break;
        }
        end++;
      }
      if (!supported || end === next + 1) break;
      damageActionIds.push(step.actionId);
      seen.add(step.playerId);
      next = end;
      stepIndex++;
    }
    results.push({
      poolSourceId: poolEvent.id,
      finalSourceId,
      selectedSourceId: block.selectedSourceId!,
      selectedFace: block.selectedFace,
      skills,
      damageActionIds,
      outcome,
      nextEventIndex: next,
      nextStepIndex: stepIndex
    });
  }
  return results;
}

export function summarizeBlockConsequence(
  pool: LuckEvent,
  damage: readonly DamageStepSummary[]
): Pick<BlockResolution, "diceByTeam" | "unscoredDamageRolls"> {
  const diceByTeam: Record<string, number> = {};
  // A subtotal references the one terminal pool and linked damage contributions.
  // Earlier purchased/replaced pools remain separately visible dice evidence.
  if (pool.scoringStatus === "scored")
    diceByTeam[pool.teamId] = pool.weightedDelta;
  let unscoredDamageRolls = 0;
  for (const step of damage) {
    // An unscored-only crowd injury has no known contribution for its victim.
    // Do not display an empty subtotal as that team's measured even luck.
    if(step.scoredRolls>0) diceByTeam[step.teamId] =
      (diceByTeam[step.teamId] ?? 0) + step.diceContribution;
    unscoredDamageRolls += step.unscoredRolls;
  }
  return { diceByTeam, unscoredDamageRolls };
}
