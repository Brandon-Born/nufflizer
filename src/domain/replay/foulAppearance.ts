import { unmodifiedD6Check } from "./numericCheck";
import type { OwnershipProof, OwnershipTimeline } from "./ownershipTimeline";
import type { ReplayEvent, ReplayModel } from "./types";

type Check = {
  attacker: OwnershipProof;
  defender: OwnershipProof;
  skillSourceId: string;
  triggerSourceId: string;
  previousBlockSourceId?: string;
  passed: boolean;
};

function participant(event: ReplayEvent, owner: OwnershipProof) {
  return (
    event.playerId === owner.playerId &&
    !event.attributionConflict &&
    !event.executionExclusion &&
    (event.teamId === undefined || event.teamId === owner.teamId) &&
    (event.actorTeamId === undefined ||
      event.actorTeamSource === "turn_inferred" ||
      event.actorTeamId === owner.teamId)
  );
}

function sameStep(
  header: ReplayEvent,
  event: ReplayEvent,
  messageIndex: number
) {
  const from = header.locator;
  const at = event.locator;
  return (
    !!from &&
    !!at &&
    at.replayStep === from.replayStep &&
    at.childIndex === from.childIndex &&
    at.stepIndex === from.stepIndex &&
    at.messageIndex === messageIndex &&
    event.sourceIndex === header.sourceIndex! + messageIndex + 1 &&
    event.id === `source-${event.sourceIndex}` &&
    event.stepTag === "PlayerStep" &&
    event.stepType === header.stepType &&
    event.sequenceId === header.sequenceId &&
    event.actionId === header.actionId &&
    event.stepActorId === header.stepActorId &&
    event.stepTargetId === header.stepTargetId
  );
}

function skillUse(event: ReplayEvent, owner: OwnershipProof, skill: number) {
  const p = event.payload;
  return (
    event.sourceTag === "ResultSkillUsage" &&
    p?.PlayerId === Number(owner.playerId) &&
    p.Skill === skill &&
    p.Used === 1 &&
    Object.keys(p).every((key) =>
      ["PlayerId", "Skill", "Used"].includes(key)
    ) &&
    participant(event, owner)
  );
}

function pitchCell(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const c = value as { X?: number; Y?: number };
  if (
    typeof c.X === "number" &&
    typeof c.Y === "number" &&
    Number.isInteger(c.X) &&
    Number.isInteger(c.Y) &&
    c.X >= 0 &&
    c.X <= 25 &&
    c.Y >= 0 &&
    c.Y <= 14
  )
    return { x: c.X, y: c.Y };
}

function sameCell(a: unknown, b: unknown) {
  const from = pitchCell(a);
  const to = pitchCell(b);
  return !!from && !!to && from.x === to.x && from.y === to.y;
}

function precedingFrenzyBlock(
  events: readonly ReplayEvent[],
  index: number,
  header: ReplayEvent,
  attacker: OwnershipProof,
  defender: OwnershipProof
) {
  const [previous, push, follow, resolution, movement] = events.slice(
    index - 8,
    index - 3
  );
  if (
    !previous ||
    !push ||
    !follow ||
    !resolution?.id ||
    !movement ||
    previous.sourceTag !== "PlayerStep" ||
    previous.stepType !== 6 ||
    previous.payload?.Skill !== 0 ||
    previous.payload?.IsEvaluation !== 0 ||
    previous.payload?.State !== 3 ||
    previous.sourceIndex !== header.sourceIndex! - 5 ||
    previous.locator?.replayStep !== header.locator?.replayStep ||
    previous.locator?.childIndex !== header.locator?.childIndex ||
    previous.locator?.stepIndex !== 0 ||
    previous.locator.messageIndex !== undefined ||
    !previous.actionId ||
    previous.actionId === header.actionId ||
    previous.sequenceId !== header.sequenceId ||
    previous.stepActorId !== header.stepActorId ||
    previous.stepTargetId !== header.stepTargetId ||
    !participant(previous, attacker) ||
    ![push, follow, resolution, movement].every((part, i) =>
      sameStep(previous, part, i)
    ) ||
    !participant(push, defender) ||
    ![follow, resolution, movement].every((part) =>
      participant(part, attacker)
    ) ||
    push.sourceTag !== "ResultPushBack" ||
    push.payload?.PushedPlayerId !== Number(defender.playerId) ||
    push.payload.Resolution !== 3 ||
    follow.sourceTag !== "ResultFollowUp" ||
    follow.payload?.Follow !== 1 ||
    resolution.sourceTag !== "ResultBlockOutcome" ||
    resolution.payload?.AttackerId !== Number(attacker.playerId) ||
    resolution.payload?.DefenderId !== Number(defender.playerId) ||
    resolution.payload?.Outcome !== 4 ||
    resolution.payload.Follow !== 1 ||
    movement.sourceTag !== "ResultMoveOutcome" ||
    movement.payload?.Moved !== 0 ||
    !sameCell(push.payload.CellFrom, previous.payload.CellTo) ||
    !sameCell(push.payload.CellTo, header.payload?.CellTo) ||
    !sameCell(follow.payload.CellFrom, previous.payload.CellFrom) ||
    !sameCell(follow.payload.CellTo, previous.payload.CellTo) ||
    !sameCell(follow.payload.CellTo, header.payload?.CellFrom)
  )
    return;
  return resolution.id;
}

// UI-017/018 and UI-099 identify the unmodified attacker-facing 2+ check.
// The opposing skill use and any later block or lost activation carry their
// own roles. The second Frenzy block has an applied push and follow-up prefix.
export function findFoulAppearanceChecks(
  replay: ReplayModel,
  owners: OwnershipTimeline
) {
  const result = new Map<string, Check>();
  if (replay.replayVersion !== "1-4-0-0") return result;
  for (const { events } of replay.turns) {
    for (const [index, roll] of events.entries()) {
      if (roll.rollType !== 37 || !roll.id || roll.sourceTag !== "ResultRoll")
        continue;
      const passed = roll.payload?.Outcome === 1;
      if (unmodifiedD6Check(roll, 37, 1, passed) !== 2) continue;

      const [header, trigger, skill] = events.slice(index - 3, index);
      const at = header?.locator;
      const from = pitchCell(header?.payload?.CellFrom);
      const to = pitchCell(header?.payload?.CellTo);
      const actor = header?.stepActorId;
      const target = header?.stepTargetId;
      if (
        !header ||
        !trigger?.id ||
        !skill?.id ||
        !actor ||
        !target ||
        actor === target ||
        target === "-1" ||
        header.sourceTag !== "PlayerStep" ||
        header.id !== `source-${header.sourceIndex}` ||
        !Number.isSafeInteger(header.sourceIndex) ||
        header.payload?.PlayerId !== Number(actor) ||
        header.payload?.TargetId !== Number(target) ||
        header.payload?.Skill !== 0 ||
        header.payload.IsEvaluation !== 0 ||
        ![1, 2, 3].includes(Number(header.payload.State)) ||
        !header.sequenceId ||
        !header.actionId ||
        !at ||
        !Number.isSafeInteger(at.replayStep) ||
        !Number.isSafeInteger(at.childIndex) ||
        at.messageIndex !== undefined ||
        !from ||
        !to ||
        ![trigger, skill, roll].every((part, i) => sameStep(header, part, i))
      )
        continue;
      const own = owners.resolve(actor, roll);
      const opposing = owners.resolve(target, roll);
      if (
        own.status !== "confirmed" ||
        opposing.status !== "confirmed" ||
        own.proof.teamId === opposing.proof.teamId ||
        ![header, trigger, roll].every((part) =>
          participant(part, own.proof)
        ) ||
        !skillUse(skill, opposing.proof, 10)
      )
        continue;

      const adjacent =
        Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1;
      let previousBlockSourceId: string | undefined;
      if (header.stepType === 0 && at.stepIndex === 0) {
        const action = trigger.payload?.Action;
        if (
          trigger.sourceTag !== "ResultUseAction" ||
          action !== trigger.actionCode ||
          (action !== 2 && action !== 3) ||
          trigger.payload?.TeamId !== 0 ||
          Object.keys(trigger.payload).some(
            (key) => key !== "Action" && key !== "TeamId"
          ) ||
          (action === 2 && !adjacent)
        )
          continue;
      } else if (
        header.stepType === 6 &&
        at.stepIndex === 1 &&
        adjacent &&
        header.payload.State === 1 &&
        skillUse(trigger, own.proof, 36)
      ) {
        previousBlockSourceId = precedingFrenzyBlock(
          events,
          index,
          header,
          own.proof,
          opposing.proof
        );
        if (!previousBlockSourceId) continue;
      } else continue;
      result.set(roll.id, {
        attacker: own.proof,
        defender: opposing.proof,
        skillSourceId: skill.id,
        triggerSourceId: trigger.id,
        previousBlockSourceId,
        passed
      });
    }
  }
  return result;
}
