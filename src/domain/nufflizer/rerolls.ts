import type { CatchRerollResume } from "./catchRerollResume";
import { ownerAt, type OwnershipLookup } from "@/domain/replay/ownershipTimeline";
import { verifyLonerTest } from "@/domain/replay/loner";
import type { ReplayEvent } from "@/domain/replay/types";
import { numericCheckExclusion } from "./numericCheckContract";

export type RerollLink = {
  twoAttemptPolicy: boolean;
  catchResume?: CatchRerollResume["receipt"];
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
  lonerGate?: {
    passed: boolean;
    gamerId: 0 | 1;
    skillSourceId: string;
    threshold: 3 | 4;
    skillId: 44 | 1008;
  };
  proGate?: { passed: boolean; successChance: number; skillSourceId: string };
  teamDecisionGamerId?: 0 | 1;
};
function orderedSources(first: ReplayEvent, choice: ReplayEvent, last: ReplayEvent): boolean {
  return [first, choice, last].every(event => Number.isSafeInteger(event.sourceIndex) && event.sourceIndex! >= 0) &&
    first.sourceIndex! < choice.sourceIndex! && choice.sourceIndex! < last.sourceIndex!;
}
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
  owners: OwnershipLookup,
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
    const owner = ownerAt(owners,actor,roll);
    const choice = events[index - 2];
    const skill = events[index - 1];
    const gamerId = choice?.payload?.GamerId;
    if (
      !owner ||
      !choice?.id ||
      !skill?.id ||
      !roll.id ||
      !orderedSources(choice, skill, roll) ||
      choice.sourceTag !== "ResultTeamRerollUsage" ||
      choice.payload?.Used !== 1 ||
      (gamerId !== 0 && gamerId !== 1) ||
      skill.sourceTag !== "ResultSkillUsage" ||
      skill.payload?.Used !== 1 ||
      String(skill.payload?.PlayerId) !== actor ||
      !verifyLonerTest(skill, roll)
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
    const verified = verifyLonerTest(skill, roll)!;
    const passed = verified.passed;
    links.set(index, {
      twoAttemptPolicy: false,
      rerollUsed: false,
      resource: "team",
      teamRerollsSpent: 1,
      decisionId: choice.id,
      lonerGate: { ...verified, gamerId, skillSourceId: skill.id },
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
  owners: OwnershipLookup,
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
          twoAttemptPolicy: false,
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
    const owner = actor ? ownerAt(owners,actor,roll) : undefined;
    const p = roll.payload;
    if (
      roll.sourceTag !== "ResultRoll" ||
      roll.rollType !== 15 ||
      !roll.actionId ||
      counts.get(roll.actionId) !== 1 ||
      !owner ||
      !skill?.id ||
      !roll.id ||
      !Number.isSafeInteger(skill.sourceIndex) || skill.sourceIndex! < 0 ||
      !Number.isSafeInteger(roll.sourceIndex) || skill.sourceIndex! >= roll.sourceIndex! ||
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
      twoAttemptPolicy: false,
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
  events: ReplayEvent[],
  checkpointEpochs?: ReadonlyMap<number, number>,
  owners?:OwnershipLookup,
  replayVersion?: string,
  questionCopies?: ReadonlyMap<number,{original:ReplayEvent;emittedOriginal?:ReplayEvent}>,
  ambiguousQuestionIds?: ReadonlySet<string>,
  catchResumes?: ReadonlyMap<string,CatchRerollResume>
): Map<number, RerollLink> {
  const links = new Map<number, RerollLink>();
  const indices=new Map(events.map((event,index)=>[event,index]));
  const roleOwner=(event:ReplayEvent)=>{
    if(!owners || !event.playerId || event.attributionConflict)return;
    const known=ownerAt(owners,event.playerId,event);
    if(known)return (!event.actorTeamId || event.actorTeamId===known) && (!event.teamId || event.teamId===known) ? known : undefined;
    // The simple numeric contract also admits an explicit source TeamId.
    // It cannot override an overlap, current conflict or pending replacement.
    if("resolve" in owners) {
      const result=owners.resolve(event.playerId,event);
      if(result.status === "unresolved" && result.reason === "missing_evidence" && !event.attributionConflict &&
        event.actorTeamSource === "explicit" && (event.actorTeamId === "0" || event.actorTeamId === "1") &&
        (!event.teamId || event.teamId===event.actorTeamId))return event.actorTeamId;
    }
  };
  const initialRollsInStep = new Map<string, { index: number; unique: boolean }>();
  const emittedFamiliesInStep = new Set<string>();
  const completedTeamChecks = new Map<string, number>();
  const seenQuestions = new Set<string>();
  let lastInitialIndex: number | undefined;
  let pending:
    | {
        question: ReplayEvent;
        choice?: ReplayEvent;
        originalAlreadyReported: boolean;
        emittedOriginalIndex?: number;
        conflictingOriginal: boolean;
        copiedQuestionOriginal?:ReplayEvent;
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
  const familyKey=(event:ReplayEvent,family:unknown)=>JSON.stringify([
    event.actionId,event.playerId,event.stepType,event.targetId,family
  ]);
  for (const [index, event] of events.entries()) {
    const family=event.rollType ?? ((event.sourceTag==="QuestionTeamRerollUsage")
      ? (event.payload?.RollInfos as {RollType?:number}|undefined)?.RollType : undefined);
    const completed=event.actionId && family!==undefined ? completedTeamChecks.get(familyKey(event,family)) : undefined;
    if(completed!==undefined && index>completed){
      if(event.sourceTag==="QuestionTeamRerollUsage") {pending=undefined;continue;}
      if(event.sourceTag==="ResultRoll" && event.payload?.NewRoll===1){
        links.set(index,{twoAttemptPolicy:false,rerollUsed:false,exclusionReason:"another fresh emission after this check's supported replacement needs its own policy"});
        pending=undefined;continue;
      }
    }
    if (event.sourceTag === "QuestionTeamRerollUsage") {
      const original = event.payload?.RollInfos as
        Record<string, unknown> | undefined;
      const emitted = original && event.actionId !== undefined
        ? initialRollsInStep.get(originalKey(event, original.RollType, original)) : undefined;
      const questionKey=familyKey(event,original?.RollType);
      const repeatedQuestion=seenQuestions.has(questionKey) || ambiguousQuestionIds?.has(event.id??"")===true;
      const copiedQuestionOriginal=questionCopies?.get(index)?.original;
      seenQuestions.add(questionKey);
      pending = {
        question: event,
        originalAlreadyReported: !!emitted || !!questionCopies?.get(index)?.emittedOriginal,
        copiedQuestionOriginal,
        conflictingOriginal: (repeatedQuestion && !copiedQuestionOriginal) || (!!original && !emitted && emittedFamiliesInStep.has(familyKey(event,original.RollType))),
        emittedOriginalIndex: questionCopies?.get(index)?.emittedOriginal
          ? indices.get(questionCopies.get(index)!.emittedOriginal!)
          : replayVersion === "1-4-0-0" && emitted?.unique && lastInitialIndex === emitted.index ? emitted.index : undefined
      };
      initialRollsInStep.clear();
      emittedFamiliesInStep.clear();
      lastInitialIndex = undefined;
      continue;
    }
    if (
      pending &&
      !catchResumes?.get(pending.question.id??"")?.span.has(event) &&
      checkpointEpochs &&
      checkpointEpochs.get(event.sourceIndex ?? -1) !==
        checkpointEpochs.get(pending.question.sourceIndex ?? -1)
    )
      pending = undefined;
    if (!pending) {
      if (
        event.sourceTag === "PlayerStep" ||
        event.sourceTag === "ResultUseAction"
      )
      { initialRollsInStep.clear(); emittedFamiliesInStep.clear(); }
      if(event.sourceTag === "ResultRoll" && event.actionId !== undefined)
        emittedFamiliesInStep.add(familyKey(event,event.rollType));
      if (
        event.sourceTag === "ResultRoll" &&
        event.actionId !== undefined &&
        event.payload?.Status === 1 &&
        event.payload?.NewRoll === 1
      )
      {
        const key = originalKey(event, event.rollType, event.payload);
        initialRollsInStep.set(key, { index, unique: !initialRollsInStep.has(key) });
        lastInitialIndex = index;
      } else if (!(event.sourceTag === "Carrier" && event.checkpointCarrier))
        lastInitialIndex = undefined;
      continue;
    }
    // Only a matching continuation step can intervene in this simple policy.
    // Unknown messages, skill gates, declarations and turn/controller changes
    // break the link; proximity or a later matching actor is insufficient.
    // A checkpoint's repeated carrier marker is an observation, not another
    // roll, choice or ball mutation. An actual unmarked Carrier still breaks.
    const resume=catchResumes?.get(pending.question.id??"");
    if(resume && (resume.ready===event || resume.timer===event))continue;
    if (event.sourceTag === "Carrier" && event.checkpointCarrier) continue;
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
      const owner=roleOwner(event);
      const owned=!owners || !!(owner && question.playerId && choice.playerId &&
        roleOwner(question)===owner && roleOwner(choice)===owner &&
        (question.payload?.GamerId===0 || question.payload?.GamerId===1) && String(question.payload.GamerId)===owner);
      const emittedIndex = pending.emittedOriginalIndex;
      const emitted = emittedIndex === undefined ? undefined : events[emittedIndex];
      const replacementFace = singleD6(event.payload);
      const matchedEmitted = !!emitted?.id && !!event.id && !!question.id && !!choice.id &&
        Number.isSafeInteger(emitted.sourceIndex) && emitted.sourceIndex! > 0 &&
        emitted.sourceIndex! < (question.sourceIndex ?? -1) &&
        question.sourceIndex! < (choice.sourceIndex ?? -1) && choice.sourceIndex! < (event.sourceIndex ?? -1) &&
        emitted.locator?.replayStep !== undefined && emitted.locator.childIndex !== undefined &&
        emitted.locator.stepIndex !== undefined && emitted.locator.messageIndex !== undefined &&
        emitted.locator.replayStep === question.locator?.replayStep &&
        emitted.locator.childIndex === question.locator?.childIndex &&
        emitted.locator.stepIndex === question.locator?.stepIndex &&
        emitted.locator.messageIndex < (question.locator?.messageIndex ?? -1) &&
        sameAction(emitted, question) && emitted.actionId === question.actionId &&
        emitted.sourceTag === "ResultRoll" && emitted.rollType === event.rollType &&
        [1,2,4,7].includes(event.rollType ?? -1) && !!emitted.payload &&
        emitted.payload.Outcome === 0 && isFailedSingleD6(emitted.payload) &&
        !numericCheckExclusion(replayVersion, emitted, false) &&
        (!checkpointEpochs || checkpointEpochs.get(emitted.sourceIndex ?? -1) ===
          checkpointEpochs.get(question.sourceIndex ?? -1)) &&
        (!owners || roleOwner(emitted) === owner);
      const validFreshReplacement = !numericCheckExclusion(replayVersion,event,true) && replacementFace !== undefined &&
        event.payload.Outcome === Number(replacementFace >= Number(event.payload.Difficulty));
      const matchedReplacement = matchedEmitted && validFreshReplacement;
      const numericFamily=[1,2,4,7].includes(event.rollType??-1);
      const numericPolicyExclusion=numericFamily
        ? numericCheckExclusion(replayVersion,{...question,sourceTag:"ResultRoll",rollType:event.rollType,payload:roll},false) ?? numericCheckExclusion(replayVersion,event,true)
        : undefined;
      const missingCatchResume = event.rollType === 7 &&
        question.locator?.replayStep !== undefined && event.locator?.replayStep !== undefined &&
        event.locator.replayStep > question.locator.replayStep + 1 &&
        !(resume?.final === event && resume.choice === choice);
      const fullTeam =
        !!question.id && !!choice.id && !!event.id &&
        (question.payload?.GamerId === 0 || question.payload?.GamerId === 1) &&
        owned &&
        validOriginal &&
        question.payload?.CanUseTeamReroll === 1 &&
        choice.payload?.Used === 1 &&
        !missingCatchResume &&
        !pending.conflictingOriginal &&
        (!numericFamily || (orderedSources(question,choice,event) && !numericPolicyExclusion && validFreshReplacement)) &&
        (!pending.originalAlreadyReported || matchedReplacement) &&
        event.payload?.Status === 2 &&
        event.payload?.NewRoll === 1;
      const kept =
        owned &&
        validOriginal &&
        choice.payload?.Used === 0 &&
        event.payload.Status === 1 &&
        event.payload.NewRoll === 0 &&
        event.payload.Outcome === 0 &&
        isFailedSingleD6(event.payload) &&
        sameDie(roll, event.payload);
      const retainedOriginal = kept && !pending.originalAlreadyReported && !pending.conflictingOriginal;
      if(fullTeam && validFreshReplacement && [1,2,4,7].includes(event.rollType??-1) && event.actionId)
        completedTeamChecks.set(familyKey(event,event.rollType),index);
      if (fullTeam && matchedEmitted && emittedIndex !== undefined) {
        links.set(emittedIndex, {
          twoAttemptPolicy: false, rerollUsed: false, mergedIntoId: event.id,
          exclusionReason: "original failed die retained in the committed team-rerolled check; not a separate score"
        });
      }
      links.set(index, {
        retainedOriginal: retainedOriginal || (kept && matchedEmitted),
        exclusionReason:
          !owned ? "reroll participants require matching roster owners and a verified team slot at the original offer, decision and result" : pending.conflictingOriginal
            ? "offered original contradicts an emitted die in this check; no compound or duplicate score is inferred"
            : choice.payload?.Used === 0 && !retainedOriginal
            ? kept
              ? "retained original already reported; repeated summary is not another attempt"
              : "declined reroll summary does not match valid original dice"
            : choice.payload?.Used === 1 && !fullTeam
              ? missingCatchResume ? "Catch across additional replay frames requires a source-qualified readiness/controller continuation" : numericPolicyExclusion ?? "committed reroll lacks a matching source-qualified original and fresh replacement"
              : undefined,
        twoAttemptPolicy: fullTeam,
        catchResume: fullTeam && resume?.final===event && resume.choice===choice ? resume.receipt : undefined,
        rerollUsed: choice.payload?.Used === 1,
        questionId: question.id,
        decisionId: choice.id,
        originalDice: roll?.Dice,
        originalId: (fullTeam || kept) && matchedEmitted ? emitted!.id : (fullTeam || kept) && pending.copiedQuestionOriginal ? pending.copiedQuestionOriginal.id : undefined,
        mergedIntoId: kept && matchedEmitted ? emitted!.id : undefined,
        teamDecisionGamerId: fullTeam ? question.payload!.GamerId as 0 | 1 : undefined,
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
  for (const [index, event] of events.entries()) {
    const previous = events[index - 1];
    const priorLink = links.get(index - 1);
    const anchor =
      priorLink?.mergedIntoId ??
      (priorLink?.retainedOriginal || priorLink?.twoAttemptPolicy ? previous?.id : undefined);
    if (
      !anchor ||
      links.has(index) ||
      event.sourceTag !== "ResultRoll" ||
      previous?.sourceTag !== "ResultRoll" ||
      !event.actionId ||
      event.actionId !== previous.actionId ||
      ![1, 2, 4, 7].includes(event.rollType ?? -1) ||
      event.rollType !== previous.rollType ||
      event.payload?.NewRoll !== 0 ||
      event.payload.Status !== 1 ||
      !previous.payload ||
      event.payload.Outcome !== previous.payload.Outcome ||
      !sameAction(previous, event) ||
      !sameRoll(previous.payload, event.payload) ||
      !sameDie(previous.payload, event.payload)
    )
      continue;
    links.set(index, {
      twoAttemptPolicy: false,
      rerollUsed: false,
      mergedIntoId: anchor,
      exclusionReason:
        "kept result already reported; repeated summary is not another attempt"
    });
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
  playerToTeam: OwnershipLookup,
  links: Map<number, RerollLink>
): void {
  if (replayVersion !== "1-4-0-0") return;
  const key = (event: ReplayEvent, rollType: number) => event.actionId + ":" + rollType;
  const seenInitials = new Set<string>();
  const claimed = new Map<string, {index:number;event:ReplayEvent}>();
  for (const [index, original] of events.entries()) {
    const family = original.rollType ?? ((original.sourceTag === "QuestionTeamRerollUsage" || original.sourceTag === "QuestionSkillUsage")
      ? (original.payload?.RollInfos as {RollType?:number}|undefined)?.RollType : undefined);
    const rule = family === undefined ? undefined : SKILL_CHECKS.get(family);
    if(rule && original.actionId && family !== undefined){
      const group=key(original,family), prior=claimed.get(group);
      if(prior){
        if(original.sourceTag === "ResultRoll" && index > prior.index && !links.has(index)){
          const previous=events[index-1],anchor=links.get(index-1)?.mergedIntoId ?? previous?.id;
          if(original.payload?.Status===1 && original.payload.NewRoll===0 && anchor===prior.event.id &&
            original.playerId===prior.event.playerId && original.targetId===prior.event.targetId && original.actorTeamId===prior.event.actorTeamId &&
            original.payload.Outcome===prior.event.payload?.Outcome && sameRoll(original.payload,prior.event.payload!) && singleD6(original.payload)===singleD6(prior.event.payload!))
            links.set(index,{twoAttemptPolicy:false,rerollUsed:false,mergedIntoId:prior.event.id,exclusionReason:"replacement already reported; repeated summary is not another draw"});
          else if(original.payload?.NewRoll===1)
            links.set(index,{twoAttemptPolicy:false,rerollUsed:false,exclusionReason:"another fresh emission after this check's supported replacement needs its own policy"});
        }
        continue;
      }
      if(original.sourceTag!=="ResultRoll") {seenInitials.add(group);continue;}
      if(original.payload?.Status===1 && original.payload.NewRoll===1){
        if(seenInitials.has(group))continue;
        seenInitials.add(group);
      }
    }
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
      original.stepTargetId !== original.targetId
    )
      continue;
    const skill = events[index + 1];
    const final = events[index + 2];
    const first = original.payload;
    const replacement = final?.payload;
    const owner = ownerAt(playerToTeam,original.playerId,original);
    if (
      !owner ||
      !first ||
      !replacement ||
      !skill?.id ||
      !final?.id ||
      skill.sourceTag !== "ResultSkillUsage" ||
      final.sourceTag !== "ResultRoll" ||
      final.rollType !== family ||
      !orderedSources(original, skill, final) ||
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
    // The fresh replacement is an observed draw at this prefix. A later
    // bounce/fall or unknown reaction cannot select which numeric failures
    // count. Full aftermath/activation policies keep their own guards.
    links.set(index, {
      twoAttemptPolicy: false,
      rerollUsed: false,
      mergedIntoId: final.id,
      exclusionReason:
        "first die retained as evidence for the skill-rerolled check"
    });
    claimed.set(key(original,family),{index:index+2,event:final});
    links.set(index + 2, {
      twoAttemptPolicy: true,
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
