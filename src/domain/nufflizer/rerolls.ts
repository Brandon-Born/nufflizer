import type { ReplayEvent } from "@/domain/replay/types";
import { numericCheckExclusion } from "./numericCheckContract";

export type RerollLink = {
  rerollAvailable: boolean;
  rerollUsed: boolean;
  questionId?: string;
  originalDice?: unknown;
  retainedOriginal?: boolean;
  exclusionReason?: string;
  resource?: "team" | "skill";
  teamRerollsSpent?: 0 | 1;
  skill?: "Catch" | "Dodge" | "Sure Hands";
  originalId?: string;
  decisionId?: string;
  mergedIntoId?: string;
  policy?: string;
  lonerGate?: { passed: boolean; gamerId: 0 | 1; skillSourceId: string };
  proGate?: { passed: boolean; successChance: number; skillSourceId: string };
};
function singleD6(roll: Record<string, unknown>): number | undefined {
  const dice = roll.Dice as
    { Die?: { DieType?: unknown; Value?: unknown } } | undefined;
  const die = dice?.Die;
  return die?.DieType === 0 &&
    Number.isInteger(die.Value) &&
    Number(die.Value) >= 1 &&
    Number(die.Value) <= 6
    ? Number(die.Value)
    : undefined;
}
function isFailedSingleD6(roll: Record<string, unknown>): boolean {
  const face = singleD6(roll);
  return (
    face !== undefined &&
    Number.isInteger(roll.Difficulty) &&
    Number(roll.Difficulty) >= 2 &&
    Number(roll.Difficulty) <= 6 &&
    face < Number(roll.Difficulty)
  );
}

// UI-007/020/050 distinguish the resource spend from the gate and from
// any subsequent replacement dice. Attach the spend to this gate only.
export function linkLonerGates(
  events: readonly ReplayEvent[],
  version: string | undefined,
  owners: ReadonlyMap<string, string>,
  links: Map<number, RerollLink>
): void {
  if (version !== "1-4-0-0") return;
  const counts = new Map<string, number>();
  for (const event of events) {
    if (
      event.sourceTag === "ResultRoll" &&
      event.rollType === 71 &&
      event.actionId
    )
      counts.set(event.actionId, (counts.get(event.actionId) ?? 0) + 1);
  }
  for (const [index, roll] of events.entries()) {
    if (
      roll.sourceTag !== "ResultRoll" ||
      roll.rollType !== 71 ||
      links.has(index) ||
      !roll.actionId ||
      counts.get(roll.actionId) !== 1 ||
      !roll.stepActorId
    )
      continue;
    const actor = roll.stepActorId;
    const owner = owners.get(actor);
    const choice = events[index - 2];
    const skill = events[index - 1];
    const gamerId = choice?.payload?.GamerId;
    const p = roll.payload;
    if (
      !owner ||
      !choice?.id ||
      !skill?.id ||
      choice.sourceTag !== "ResultTeamRerollUsage" ||
      choice.payload?.Used !== 1 ||
      (gamerId !== 0 && gamerId !== 1) ||
      skill.sourceTag !== "ResultSkillUsage" ||
      skill.payload?.Skill !== 44 ||
      skill.payload.Used !== 1 ||
      String(skill.payload.PlayerId) !== actor ||
      p?.Status !== 1 ||
      p.NewRoll !== 1 ||
      p.Requirement !== 4 ||
      p.Difficulty !== 4 ||
      (p.Modifiers !== undefined && p.Modifiers !== "")
    )
      continue;
    if (
      [choice, skill, roll].some(
        (event) =>
          event.actionId !== roll.actionId ||
          event.stepActorId !== actor ||
          event.playerId !== actor ||
          event.targetId !== roll.stepTargetId ||
          event.actorTeamId !== owner ||
          event.attributionConflict ||
          (event.teamId !== undefined && event.teamId !== owner)
      )
    )
      continue;
    const die = singleD6(p);
    if (die === undefined || p.Outcome !== Number(die >= 4)) continue;
    const passed = die >= 4;
    links.set(index, {
      rerollAvailable: false,
      rerollUsed: false,
      resource: "team",
      teamRerollsSpent: 1,
      decisionId: choice.id,
      lonerGate: { passed, gamerId, skillSourceId: skill.id },
      exclusionReason: passed
        ? "Loner passed after one team reroll was spent. The replacement requires its own dice evidence."
        : "Loner failed after one team reroll was spent. The gate granted no replacement dice."
    });
  }
}

// GR-025 and UI-047/087 distinguish the 3+ gate from the die it may reroll.
export function linkProGates(
  events: readonly ReplayEvent[],
  version: string | undefined,
  owners: ReadonlyMap<string, string>,
  links: Map<number, RerollLink>
): void {
  if (version !== "1-4-0-0") return;
  const bySource = new Map(events.map((event, index) => [event.id, index]));
  const counts = new Map<string, number>();
  for (const event of events)
    if (
      event.sourceTag === "ResultRoll" &&
      event.rollType === 15 &&
      event.actionId
    )
      counts.set(event.actionId, (counts.get(event.actionId) ?? 0) + 1);
  for (const [index, roll] of events.entries()) {
    let link = links.get(index);
    // UI-087 uses an AccuracyStep continuation, outside the ordinary
    // numeric reroll path. Match that kept Pro gate's complete local shape.
    if (
      !link &&
      roll.sourceTag === "ResultRoll" &&
      roll.rollType === 15 &&
      roll.stepTag === "AccuracyStep" &&
      roll.stepType === 24 &&
      roll.payload?.NewRoll === 0
    ) {
      const question = events[index - 3];
      const continuation = events[index - 2];
      const decision = events[index - 1];
      const original = question?.payload?.RollInfos as
        Record<string, unknown> | undefined;
      const gamer = question?.payload?.GamerId;
      if (
        question?.sourceTag === "QuestionTeamRerollUsage" &&
        question.id &&
        question.payload?.CanUseProReroll === 0 &&
        question.payload.CanUseTeamReroll === 1 &&
        (gamer === 0 || gamer === 1) &&
        continuation?.sourceTag === "AccuracyStep" &&
        decision?.sourceTag === "ResultTeamRerollUsage" &&
        decision.id &&
        decision.payload?.GamerId === gamer &&
        decision.payload.Used === 0 &&
        original?.RollType === 15 &&
        original.Status === 1 &&
        original.NewRoll === 1 &&
        original.Outcome === 0 &&
        sameRoll(original, roll.payload) &&
        singleD6(original) === singleD6(roll.payload) &&
        [question, continuation, decision].every(
          (event) =>
            event.stepTag === roll.stepTag &&
            event.stepType === roll.stepType &&
            event.stepActorId === roll.stepActorId &&
            event.stepTargetId === roll.stepTargetId &&
            event.playerId === roll.playerId &&
            event.actorTeamId === roll.actorTeamId &&
            !event.attributionConflict
        )
      )
        link = {
          rerollAvailable: false,
          rerollUsed: false,
          retainedOriginal: true,
          questionId: question.id,
          decisionId: decision.id,
          originalDice: original.Dice
        };
    }
    const questionIndex = link?.questionId
      ? bySource.get(link.questionId)
      : undefined;
    const skill =
      events[
        (link?.retainedOriginal && questionIndex !== undefined
          ? questionIndex
          : index) - 1
      ];
    const actor = roll.stepActorId;
    const owner = actor ? owners.get(actor) : undefined;
    const p = roll.payload;
    if (
      roll.sourceTag !== "ResultRoll" ||
      roll.rollType !== 15 ||
      !roll.actionId ||
      counts.get(roll.actionId) !== 1 ||
      !owner ||
      !skill?.id ||
      skill.sourceTag !== "ResultSkillUsage" ||
      skill.payload?.Skill !== 50 ||
      skill.payload.Used !== 1 ||
      String(skill.payload.PlayerId) !== actor ||
      !(
        (roll.stepTag === "PlayerStep" && roll.stepType === 6) ||
        (roll.stepTag === "AccuracyStep" && roll.stepType === 24)
      ) ||
      p?.Status !== 1 ||
      p.Requirement !== 3 ||
      p.Difficulty !== 3 ||
      (p.Modifiers !== undefined && p.Modifiers !== "") ||
      !(
        (p.NewRoll === 1 && skill.actionId === roll.actionId) ||
        (p.NewRoll === 0 && link?.retainedOriginal)
      )
    )
      continue;
    if (
      [roll, skill].some(
        (event) =>
          event.playerId !== actor ||
          event.stepActorId !== actor ||
          event.stepTag !== roll.stepTag ||
          event.stepType !== roll.stepType ||
          event.stepTargetId !== roll.stepTargetId ||
          event.targetId !== roll.targetId ||
          event.actorTeamId !== owner ||
          event.attributionConflict ||
          (event.teamId !== undefined && event.teamId !== owner)
      )
    )
      continue;
    const die = singleD6(p);
    if (die === undefined || p.Outcome !== Number(die >= 3)) continue;
    links.set(index, {
      ...link,
      rerollAvailable: false,
      rerollUsed: false,
      resource: "skill",
      teamRerollsSpent: 0,
      decisionId: link?.decisionId ?? skill.id,
      proGate: {
        passed: die >= 3,
        successChance: 2 / 3,
        skillSourceId: skill.id
      },
      exclusionReason: "Pro gate observed separately from any replacement die"
    });
  }
}

function sameRoll(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  return (
    a.Difficulty === b.Difficulty &&
    a.Requirement === b.Requirement &&
    JSON.stringify(a.Modifiers) === JSON.stringify(b.Modifiers)
  );
}
// Questions carry the original failed dice. Choice and result often occur in a later sequence.
// Match the explicit actor/step/target/roll contract; proximity alone is never sufficient.
export function linkTeamRerolls(
  events: ReplayEvent[]
): Map<number, RerollLink> {
  const links = new Map<number, RerollLink>();
  const initialRollsInStep = new Set<string>();
  let pending:
    | {
        question: ReplayEvent;
        choice?: ReplayEvent;
        originalAlreadyReported: boolean;
      }
    | undefined;
  function sameAction(a: ReplayEvent, b: ReplayEvent): boolean {
    return (
      a.playerId !== undefined &&
      a.playerId === b.playerId &&
      a.stepType !== undefined &&
      a.stepType === b.stepType &&
      a.targetId !== undefined &&
      a.targetId === b.targetId &&
      (!a.actorTeamId || !b.actorTeamId || a.actorTeamId === b.actorTeamId)
    );
  }
  function sameDie(
    a: Record<string, unknown>,
    b: Record<string, unknown>
  ): boolean {
    const die = (value: Record<string, unknown>) =>
      (
        value.Dice as
          { Die?: { DieType?: unknown; Value?: unknown } } | undefined
      )?.Die;
    return (
      die(a)?.DieType === die(b)?.DieType && die(a)?.Value === die(b)?.Value
    );
  }
  // Retain all initial dice within the source step, including an earlier
  // family separated from its question by another numeric result. Team
  // ambiguity conservatively suppresses a second contribution.
  function originalKey(
    event: ReplayEvent,
    family: unknown,
    roll: Record<string, unknown>
  ): string {
    const die = (
      roll.Dice as { Die?: { DieType?: unknown; Value?: unknown } } | undefined
    )?.Die;
    return JSON.stringify([
      event.actionId,
      event.playerId,
      event.stepType,
      event.targetId,
      family,
      roll.Difficulty,
      roll.Requirement,
      roll.Modifiers,
      die?.DieType,
      die?.Value
    ]);
  }
  for (const [index, event] of events.entries()) {
    if (event.sourceTag === "QuestionTeamRerollUsage") {
      const original = event.payload?.RollInfos as
        Record<string, unknown> | undefined;
      pending = {
        question: event,
        originalAlreadyReported: Boolean(
          original &&
          event.actionId !== undefined &&
          initialRollsInStep.has(
            originalKey(event, original.RollType, original)
          )
        )
      };
      initialRollsInStep.clear();
      continue;
    }
    if (!pending) {
      if (
        event.sourceTag === "PlayerStep" ||
        event.sourceTag === "ResultUseAction"
      )
        initialRollsInStep.clear();
      if (
        event.sourceTag === "ResultRoll" &&
        event.actionId !== undefined &&
        event.payload?.Status === 1 &&
        event.payload?.NewRoll === 1
      )
        initialRollsInStep.add(
          originalKey(event, event.rollType, event.payload)
        );
      continue;
    }
    // Only a matching continuation step can intervene in this simple policy.
    // Unknown messages, skill gates, declarations and turn/controller changes
    // break the link; proximity or a later matching actor is insufficient.
    if (event.sourceTag === "PlayerStep" && sameAction(pending.question, event))
      continue;
    if (!["ResultTeamRerollUsage", "ResultRoll"].includes(event.sourceTag)) {
      pending = undefined;
      continue;
    }
    if (event.sourceTag === "ResultTeamRerollUsage") {
      if (!pending.choice && sameAction(pending.question, event))
        pending.choice = event;
      else pending = undefined;
      continue;
    }
    if (event.sourceTag !== "ResultRoll") continue;
    const { question, choice } = pending;
    const roll = question.payload?.RollInfos as
      Record<string, unknown> | undefined;
    if (
      roll &&
      sameAction(question, event) &&
      choice &&
      roll?.RollType === event.rollType &&
      Number.isSafeInteger(question.payload?.GamerId) &&
      Number(question.payload?.GamerId) >= 0 &&
      question.payload?.GamerId === choice.payload?.GamerId &&
      event.payload &&
      sameRoll(roll, event.payload)
    ) {
      const validOriginal =
        roll.Status === 1 &&
        roll.NewRoll === 1 &&
        roll.Outcome === 0 &&
        isFailedSingleD6(roll);
      const fullTeam =
        validOriginal &&
        question.payload?.CanUseTeamReroll === 1 &&
        choice.payload?.Used === 1 &&
        !pending.originalAlreadyReported &&
        event.payload?.Status === 2 &&
        event.payload?.NewRoll === 1;
      const kept =
        validOriginal &&
        choice.payload?.Used === 0 &&
        event.payload.Status === 1 &&
        event.payload.NewRoll === 0 &&
        event.payload.Outcome === 0 &&
        isFailedSingleD6(event.payload) &&
        sameDie(roll, event.payload);
      const retainedOriginal = kept && !pending.originalAlreadyReported;
      links.set(index, {
        retainedOriginal,
        exclusionReason:
          choice.payload?.Used === 0 && !retainedOriginal
            ? kept
              ? "retained original already reported; repeated summary is not another attempt"
              : "declined reroll summary does not match valid original dice"
            : undefined,
        rerollAvailable: fullTeam,
        rerollUsed: choice.payload?.Used === 1,
        questionId: question.id,
        decisionId: choice.id,
        originalDice: roll?.Dice,
        resource: fullTeam ? "team" : undefined,
        teamRerollsSpent: fullTeam ? 1 : retainedOriginal ? 0 : undefined,
        policy: fullTeam
          ? "Full team reroll on the recorded failed initial attempt; choice quality is not scored."
          : retainedOriginal
            ? "Retained original after declining the team reroll; one single attempt, not fresh dice."
            : "Single attempt; availability alone does not change odds."
      });
    }
    pending = undefined;
  }
  return links;
}

const SKILL_CHECKS = new Map<
  number,
  { code: number; stepType: number; name: NonNullable<RerollLink["skill"]> }
>([
  [2, { code: 7, stepType: 1, name: "Dodge" }],
  [4, { code: 61, stepType: 1, name: "Sure Hands" }],
  [7, { code: 6, stepType: 4, name: "Catch" }]
]);

// UI-002/028/094/097 independently identify these same-step fresh pairs.
// Do not infer that a modifier, an available skill or a stale result rerolled dice.
export function linkObservedSkillRerolls(
  events: ReplayEvent[],
  replayVersion: string | undefined,
  playerToTeam: ReadonlyMap<string, string>,
  links: Map<number, RerollLink>,
  terminalDodgeSourceId?: string
): void {
  if (replayVersion !== "1-4-0-0") return;
  const records = new Map<string, number>();
  const key = (event: ReplayEvent, rollType: number) =>
    event.actionId + ":" + rollType;
  for (const event of events) {
    if (!event.actionId) continue;
    const family =
      event.sourceTag === "ResultRoll"
        ? event.rollType
        : event.sourceTag === "QuestionTeamRerollUsage" ||
            event.sourceTag === "QuestionSkillUsage"
          ? (event.payload?.RollInfos as { RollType?: unknown } | undefined)
              ?.RollType
          : undefined;
    if (typeof family !== "number" || !SKILL_CHECKS.has(family)) continue;
    const group = key(event, family);
    records.set(group, (records.get(group) ?? 0) + 1);
  }

  for (const [index, original] of events.entries()) {
    const family = original.rollType;
    const rule = family === undefined ? undefined : SKILL_CHECKS.get(family);
    if (
      !rule ||
      family === undefined ||
      original.sourceTag !== "ResultRoll" ||
      !original.actionId ||
      !original.id ||
      !original.playerId ||
      original.stepTag !== "PlayerStep" ||
      original.stepType !== rule.stepType ||
      original.stepActorId !== original.playerId ||
      original.targetId !== "-1" ||
      original.stepTargetId !== original.targetId ||
      records.get(key(original, family)) !== 2
    )
      continue;
    const skill = events[index + 1];
    const final = events[index + 2];
    const first = original.payload;
    const replacement = final?.payload;
    const owner = playerToTeam.get(original.playerId);
    if (
      !owner ||
      !first ||
      !replacement ||
      !skill?.id ||
      !final?.id ||
      skill.sourceTag !== "ResultSkillUsage" ||
      final.sourceTag !== "ResultRoll" ||
      final.rollType !== family ||
      skill.payload?.Used !== 1 ||
      skill.payload.Skill !== rule.code ||
      String(skill.payload.PlayerId) !== original.playerId ||
      links.has(index) ||
      links.has(index + 2)
    )
      continue;
    if (
      [original, skill, final].some(
        (event) =>
          event.actionId !== original.actionId ||
          event.stepTag !== "PlayerStep" ||
          event.stepType !== original.stepType ||
          event.stepActorId !== original.playerId ||
          event.targetId !== original.targetId ||
          event.stepTargetId !== original.targetId ||
          event.playerId !== original.playerId ||
          event.actorTeamId !== owner ||
          event.attributionConflict ||
          (event.teamId !== undefined && event.teamId !== owner)
      )
    )
      continue;
    if (
      first.Status !== 1 ||
      first.Outcome !== 0 ||
      !isFailedSingleD6(first) ||
      replacement.Status !== 2 ||
      !sameRoll(first, replacement) ||
      numericCheckExclusion(replayVersion, original, false) ||
      numericCheckExclusion(replayVersion, final, true)
    )
      continue;
    const face = singleD6(replacement);
    if (
      face === undefined ||
      replacement.Outcome !== Number(face >= Number(replacement.Difficulty))
    )
      continue;
    if (
      replacement.Outcome === 0 &&
      !(family === 2 && final.id === terminalDodgeSourceId)
    ) {
      // A failed replacement alone does not establish that there was no
      // further choice. A Dodge must reach the verified fall and turnover.
      // UI-002 links the other supported failed check to its Pickup bounce.
      const bounce = events[index + 3];
      const direction = events[index + 4];
      if (
        family !== 4 ||
        bounce?.sourceTag !== "BallStep" ||
        bounce.stepType !== 3 ||
        !bounce.actionId ||
        bounce.sequenceId !== original.sequenceId ||
        bounce.actionId === original.actionId ||
        direction?.sourceTag !== "ResultRoll" ||
        direction.rollType !== 25 ||
        direction.actionId !== bounce.actionId
      )
        continue;
    }
    links.set(index, {
      rerollAvailable: false,
      rerollUsed: false,
      mergedIntoId: final.id,
      exclusionReason:
        "first die retained as evidence for the skill-rerolled check"
    });
    links.set(index + 2, {
      rerollAvailable: true,
      rerollUsed: true,
      resource: "skill",
      teamRerollsSpent: 0,
      skill: rule.name,
      originalId: original.id,
      originalDice: first.Dice,
      decisionId: skill.id,
      policy:
        rule.name +
        " rerolled the failed die; no team reroll spent on this check."
    });
  }
}
