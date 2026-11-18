import {
  mentalTraitTest,
  recordedConfusedProvider,
  type ActivationSkill
} from "./mentalEffects";
import {
  ownerAt,
  type OwnershipTimeline,
  type OwnershipProof
} from "./ownershipTimeline";
import type { ReplayEvent, ReplayModel } from "./types";

type ActivationCheck = {
  skillId: ActivationSkill;
  declarationSourceId: string;
  skillSourceId: string;
  assistantId?: string;
  draw?: "original" | "replacement";
};

export type ActivationDraw = {
  evidence: ActivationCheck;
  owner: OwnershipProof;
  target: 2 | 4;
  passed: boolean;
  face: number;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function fields(value: Record<string, unknown> | undefined, allowed: string[]) {
  return !!value && Object.keys(value).every((key) => allowed.includes(key));
}

export function readActivationDie(
  event: ReplayEvent,
  payload: Record<string, unknown> | undefined,
  skillId: ActivationCheck["skillId"],
  status: 1 | 2,
  fresh: 0 | 1,
  owners: OwnershipTimeline,
  teamId: string
) {
  const passed = mentalTraitTest(payload, skillId, status, fresh);
  const dice = record(payload?.Dice);
  const die = record(dice?.Die);
  if (
    passed === null ||
    !fields(payload, [
      "Status",
      "Requirement",
      "Modifiers",
      "Dice",
      "Difficulty",
      "RollType",
      "Outcome",
      "NewRoll"
    ]) ||
    !fields(dice, ["Die"]) ||
    !fields(die, ["DieType", "Value"])
  )
    return;
  const target = payload!.Difficulty as 2 | 4;
  let assistantId: string | undefined;
  if (skillId !== 31 && target === 2) {
    const modifiers = record(payload!.Modifiers);
    const modifier = record(modifiers?.Modifier);
    if (
      !fields(modifiers, ["Modifier"]) ||
      !fields(modifier, [
        "PlayerId",
        "ModifierType",
        "Value",
        "Skill",
        "Effect"
      ]) ||
      !Number.isSafeInteger(modifier?.PlayerId) ||
      (skillId === 51 && Number(modifier?.PlayerId) < 0)
    )
      return;
    if (skillId === 51) {
      assistantId = String(modifier!.PlayerId);
      if (
        assistantId === event.playerId ||
        ownerAt(owners, assistantId, event) !== teamId
      )
        return;
    }
  }
  return { target, passed, assistantId, face: Number(die!.Value) };
}

function sameStep(
  header: ReplayEvent,
  event: ReplayEvent,
  messageIndex: number
) {
  const at = event.locator;
  const from = header.locator;
  return (
    !!at &&
    !!from &&
    Number.isSafeInteger(from.replayStep) &&
    Number.isSafeInteger(from.childIndex) &&
    from.stepIndex === 0 &&
    from.messageIndex === undefined &&
    at.replayStep === from.replayStep &&
    at.childIndex === from.childIndex &&
    at.stepIndex === 0 &&
    at.messageIndex === messageIndex &&
    Number.isSafeInteger(header.sourceIndex) &&
    event.sourceIndex === header.sourceIndex! + messageIndex + 1 &&
    event.id === `source-${event.sourceIndex}` &&
    event.stepTag === "PlayerStep" &&
    event.stepType === 0 &&
    event.stepActorId === header.stepActorId &&
    event.playerId === header.stepActorId &&
    event.sequenceId === header.sequenceId &&
    event.actionId === header.actionId
  );
}

// The declaration proves the first die whether emitted directly or inside a
// team reroll menu. Any continuation is qualified on its own record.
export function findDeclaredActivationChecks(
  replay: ReplayModel,
  owners: OwnershipTimeline
): Map<string, ActivationDraw> {
  const results = new Map<string, ActivationDraw>();
  if (replay.replayVersion !== "1-4-0-0") return results;
  for (const { events } of replay.turns) {
    for (const [index, roll] of events.entries()) {
      const question = roll.sourceTag === "QuestionTeamRerollUsage";
      if (!question && roll.sourceTag !== "ResultRoll") continue;
      const payload = question ? record(roll.payload?.RollInfos) : roll.payload;
      if (
        payload?.RollType !== 33 &&
        payload?.RollType !== 34 &&
        payload?.RollType !== 36
      )
        continue;
      const skillId =
        payload.RollType === 33 ? 31 : payload.RollType === 34 ? 51 : 84;
      const messageIndex = roll.locator?.messageIndex;
      if (messageIndex !== 2 && messageIndex !== 3) continue;

      const header = events[index - messageIndex - 1];
      const declaration = events[index - messageIndex];
      const skill = events[index - 1];
      const actor = header?.stepActorId;
      const team = declaration?.payload?.TeamId;
      if (
        !header ||
        !declaration?.id ||
        !skill?.id ||
        !roll.id ||
        !actor ||
        header.sourceTag !== "PlayerStep" ||
        header.playerId !== actor ||
        header.id !== `source-${header.sourceIndex}` ||
        header.payload?.PlayerId !== Number(actor) ||
        header.payload?.Skill !== 0 ||
        header.payload?.IsEvaluation !== 0 ||
        ![1, 2, 3].includes(Number(header.payload?.State)) ||
        !header.sequenceId ||
        !header.actionId ||
        declaration.sourceTag !== "ResultUseAction" ||
        ![1, 2, 3, 4, 5, 6].includes(declaration.actionCode ?? 0) ||
        declaration.payload?.Action !== declaration.actionCode ||
        !fields(declaration.payload, ["Action", "TeamId"]) ||
        team !== 0 ||
        skill.sourceTag !== "ResultSkillUsage" ||
        skill.payload?.PlayerId !== Number(actor) ||
        skill.payload.Skill !== skillId ||
        skill.payload.Used !== 1 ||
        !fields(skill.payload, ["PlayerId", "Skill", "Used"]) ||
        !sameStep(header, declaration, 0) ||
        !sameStep(header, skill, messageIndex - 1) ||
        !sameStep(header, roll, messageIndex)
      )
        continue;

      // The declaration emits TeamId=0 for both sides. Player ownership comes
      // from the time-local roster and the compatible attributed source chain.
      const current = owners.resolve(actor, roll);
      if (current.status !== "confirmed") continue;
      const teamId = current.proof.teamId;
      if (
        question &&
        (!fields(roll.payload, [
          "GamerId",
          "CanUseProReroll",
          "CanUseTeamReroll",
          "StarSpecialRule",
          "RollInfos"
        ]) ||
          (roll.payload?.GamerId !== 0 && roll.payload?.GamerId !== 1) ||
          String(roll.payload.GamerId) !== teamId ||
          roll.payload.CanUseProReroll !== 0 ||
          roll.payload.CanUseTeamReroll !== 1 ||
          roll.payload.StarSpecialRule !== -1)
      )
        continue;
      const prefix = messageIndex === 3 ? events[index - 2] : undefined;
      if (
        (prefix &&
          (prefix.sourceTag !== "ResultEndPlayerEffect" ||
            prefix.payload?.PlayerId !== Number(actor) ||
            recordedConfusedProvider(prefix.payload?.Effect) !== skillId ||
            (skillId === 84 &&
              (
                prefix.payload?.Effect as
                  { AdditionalSkills?: unknown } | undefined
              )?.AdditionalSkills !== "") ||
            !sameStep(header, prefix, 1))) ||
        (messageIndex === 3 && !prefix) ||
        [header, declaration, skill, roll, ...(prefix ? [prefix] : [])].some(
          (event) =>
            event.attributionConflict ||
            event.executionExclusion ||
            (event.teamId !== undefined && event.teamId !== teamId) ||
            (event.actorTeamId !== undefined &&
              event.actorTeamSource !== "turn_inferred" &&
              event.actorTeamId !== teamId)
        )
      )
        continue;

      const die = readActivationDie(
        roll,
        payload,
        skillId,
        1,
        1,
        owners,
        teamId
      );
      if (!die || (question && die.passed)) continue;
      if (skillId === 84) {
        const action = declaration.actionCode;
        const target = header.stepTargetId;
        const opposing =
          target === undefined ? undefined : ownerAt(owners, target, roll);
        if (
          (action !== 1 && action !== 2 && action !== 3) ||
          die.target !== (action === 1 ? 4 : 2) ||
          (action === 1
            ? target !== "-1"
            : opposing === undefined || opposing === teamId)
        )
          continue;
      }
      results.set(roll.id, {
        evidence: {
          skillId,
          declarationSourceId: declaration.id,
          skillSourceId: skill.id,
          assistantId: die.assistantId,
          ...(question ? { draw: "original" } : {})
        },
        owner: current.proof,
        target: die.target,
        passed: die.passed,
        face: die.face
      });
    }
  }
  return results;
}
