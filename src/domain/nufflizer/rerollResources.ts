import { z } from "zod";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import type { ReplayBoardCheckpoint } from "@/domain/replay/boardState";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import {
  ownerAt,
  type OwnershipLookup
} from "@/domain/replay/ownershipTimeline";
import type { LuckEvent } from "./types";
import type { CatchRerollResume } from "./catchRerollResume";
import {
  RerollResourceFlowSchema,
  findRerollResourceFlow,
  validRerollResourceFlow
} from "./rerollResourceFlow";

const count = z.number().int().min(0).max(REPLAY_LIMITS.events);
const observedCode = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const text = z.string().max(REPLAY_LIMITS.decodedBytes);
const gamer = z.union([z.literal(0), z.literal(1)]);
const decisionWaitSchema = z.strictObject({
  activeGamerSourceId: text,
  pauseSourceId: text,
  timerSourceId: text,
  resumedStepSourceId: text,
  // The captured empty controller notification does not mean controller zero.
  controller: z.null()
});
export const RecordedRerollChoiceSchema = z.strictObject({
  gamerId: gamer.nullable(),
  used: z.boolean().nullable(),
  validFields: z.boolean()
});
export const RecordedRerollOfferSchema = z.strictObject({
  kind: z.enum(["numeric", "block"]),
  gamerId: gamer.nullable(),
  teamAvailable: z.boolean().nullable(),
  proAvailable: z.boolean().nullable(),
  rollType: count.nullable()
});
const decisionSchema = z.strictObject({
  decisionEventId: text,
  decisionSourceId: text.nullable(),
  sourceIndex: count.nullable(),
  questionSourceId: text.nullable(),
  teamId: text.nullable(),
  status: z.enum(["linked", "unresolved"]),
  reason: z.enum([
    "matching_offer",
    "unindexed_source",
    "unsupported_version",
    "invalid_choice",
    "missing_offer",
    "invalid_offer",
    "source_or_owner_conflict"
  ]),
  decisionWait: decisionWaitSchema.nullable(),
  clock: z
    .strictObject({
      checkpointAfter: count,
      phaseCode: observedCode.nullable(),
      periodCode: observedCode.nullable(),
      teamTurn: observedCode.nullable()
    })
    .nullable(),
  namespace: z
    .discriminatedUnion("basis", [
      z.strictObject({
        basis: z.literal("observed_roster"),
        actorPlayerId: text,
        rosterIndex: gamer,
        checkpointAfter: count,
        kind: z.enum(["initial", "board"]),
        replayStep: count.nullable(),
        childIndex: count.nullable()
      }),
      z.strictObject({ basis: z.literal("explicit_team"), actorPlayerId: text })
    ])
    .nullable()
});
export const RerollResourcesSchema = z.strictObject({
  modelVersion: z.literal("recorded-reroll-resources-3"),
  flow: RerollResourceFlowSchema,
  decisions: z.array(decisionSchema).max(REPLAY_LIMITS.events),
  decisionCount: count,
  recordedUsedCount: count,
  recordedNotUsedCount: count,
  unknownUsageCount: count,
  linkedCount: count,
  unresolvedCount: count,
  byTeam: z
    .array(
      z.strictObject({
        teamId: text,
        used: count,
        notUsed: count
      })
    )
    .length(2)
});
export type RerollResources = z.infer<typeof RerollResourcesSchema>;
export type RecordedRerollChoice = z.infer<typeof RecordedRerollChoiceSchema>;
export type RecordedRerollOffer = z.infer<typeof RecordedRerollOfferSchema>;
const flag = (v: unknown) => (v === 0 ? false : v === 1 ? true : null);
const slot = (v: unknown): 0 | 1 | null => (v === 0 || v === 1 ? v : null);
const code = (v: unknown) =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= REPLAY_LIMITS.events
    ? Number(v)
    : null;

// Preserve source facts even when the action's dice/eligibility policy is not
// supported. Null never means "not used" or "unavailable".
export function recordedRerollChoice(
  e: ReplayEvent
): RecordedRerollChoice | undefined {
  if (e.sourceTag !== "ResultTeamRerollUsage") return;
  const p = e.payload;
  return {
    gamerId: slot(p?.GamerId),
    used: flag(p?.Used),
    validFields:
      !!p && Object.keys(p).every((k) => k === "GamerId" || k === "Used")
  };
}
export function recordedRerollOffer(
  e: ReplayEvent
): RecordedRerollOffer | undefined {
  if (
    e.sourceTag !== "QuestionTeamRerollUsage" &&
    e.sourceTag !== "QuestionBlockDice"
  )
    return;
  const p = e.payload;
  const original = p?.RollInfos;
  const roll =
    original && typeof original === "object" && !Array.isArray(original)
      ? (original as Record<string, unknown>)
      : undefined;
  const block = e.sourceTag === "QuestionBlockDice";
  return {
    kind: block ? "block" : "numeric",
    gamerId: slot(p?.GamerId),
    teamAvailable: flag(p?.CanUseTeamReroll),
    proAvailable: block ? null : flag(p?.CanUseProReroll),
    rollType: code(block ? p?.RollType : roll?.RollType)
  };
}

function sameParticipant(a: ReplayEvent, b: ReplayEvent) {
  return (
    !!a.playerId &&
    a.playerId === b.playerId &&
    a.stepActorId === a.playerId &&
    b.stepActorId === a.playerId &&
    !!a.stepTag &&
    a.stepTag === b.stepTag &&
    a.stepType !== undefined &&
    a.stepType === b.stepType &&
    a.targetId === b.targetId &&
    a.stepTargetId === b.stepTargetId &&
    !a.attributionConflict &&
    !b.attributionConflict
  );
}

function identityCheckpoint(cp: ReplayBoardCheckpoint | undefined) {
  return (
    cp?.status === "observed" &&
    !!cp.board &&
    cp.board.issues.every(
      (i) =>
        i === "held_ball_not_reconciled" ||
        i === "conflicting_tackle_zone_effect"
    )
  );
}

const object = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
function empty(v: unknown) {
  return !!object(v) && Object.keys(object(v)!).length === 0;
}
function menuWaitControl(e: ReplayEvent, ordinal: number) {
  if (ordinal === 0)
    return e.sourceTag === "EventActiveGamerChanged" && empty(e.payload);
  if (ordinal === 1)
    return e.sourceTag === "EventPauseActiveTimer" && empty(e.payload);
  const p = e.payload,
    timer = object(p?.NewTimer);
  // Direct XML controls retain text, unlike decoded MessageData numbers.
  const exact = (v: unknown, n: number) => v === n || v === String(n);
  return (
    ordinal === 2 &&
    e.sourceTag === "EventActiveTimerChanged" &&
    !!p &&
    Object.keys(p).length === 2 &&
    exact(p.IsPaused, 1) &&
    !!timer &&
    Object.keys(timer).length === 3 &&
    exact(timer.Duration, 30) &&
    exact(timer.Type, 2) &&
    exact(timer.Value, 30)
  );
}

// This matches a recorded identity continuation, not a legal action or retry
// policy. CellTo differs in a recorded continuation; no geometry or choice policy
// is inferred from that difference.
function sameWaitHeader(
  a: ReplayEvent | undefined,
  b: ReplayEvent | undefined
) {
  const key = (e: ReplayEvent | undefined) => {
    const p = e?.payload;
    const cell = (v: unknown) => {
      const c = object(v);
      return (
        !!c &&
        Object.keys(c).length === 2 &&
        Number.isSafeInteger(c.X) &&
        Number(c.X) >= 0 &&
        Number(c.X) <= 25 &&
        Number.isSafeInteger(c.Y) &&
        Number(c.Y) >= 0 &&
        Number(c.Y) <= 14
      );
    };
    if (
      e?.sourceTag !== "PlayerStep" ||
      !p ||
      p.IsEvaluation !== 0 ||
      p.State !== 1 ||
      ![11, 32].includes(Number(p.StepType)) ||
      String(p.PlayerId) !== e.playerId ||
      String(p.TargetId) !== e.targetId ||
      p.StepType !== e.stepType ||
      p.Skill !== (p.StepType === 11 ? -1 : 80) ||
      !cell(p.CellFrom) ||
      !cell(p.CellTo) ||
      Object.keys(p).some(
        (k) =>
          ![
            "Probability",
            "PlayerId",
            "TargetId",
            "IsEvaluation",
            "StepType",
            "CellFrom",
            "CellTo",
            "State",
            "Skill"
          ].includes(k)
      )
    )
      return;
    return JSON.stringify(
      Object.entries(p)
        .filter(([k]) => k !== "Probability" && k !== "CellTo")
        .sort(([a], [b]) => a.localeCompare(b))
    );
  };
  const first = key(a);
  return first !== undefined && first === key(b);
}

// One transaction per recorded team choice, including choices whose action
// remains unscored. This does not simulate eligibility, resets or resource value.
export function findRerollResources(
  replay: ReplayModel,
  owners: OwnershipLookup,
  catchResumes: ReadonlyMap<string, CatchRerollResume> = new Map(),
  teamIds: readonly string[] = replay.teams.slice(0, 2).map((t) => t.id),
  normalized?: ReadonlyMap<ReplayEvent, LuckEvent>
): RerollResources {
  const events = replay.turns.flatMap((t) => t.events);
  const checkpoints = replay.boardCheckpoints ?? [];
  // Ball/tackle-zone uncertainty does not invalidate roster identity. It also
  // must not collapse known clock changes to a shared "unknown" epoch.
  const epochs = new Map<ReplayBoardCheckpoint, number>();
  const identityEpochs = new Map<ReplayBoardCheckpoint, number>();
  let signature: string | undefined,
    identitySignature: string | undefined,
    currentEpoch = 0,
    currentIdentityEpoch = 0;
  for (const cp of checkpoints) {
    const b = cp.board;
    const next =
      identityCheckpoint(cp) && b
        ? JSON.stringify([
            b.phaseCode,
            b.periodCode,
            b.activeTeamIndex,
            b.activeGamerId,
            b.teams.map((t) => [t.rosterIndex, t.explicitTeamId, t.gameTurn])
          ])
        : undefined;
    if (next === undefined || next !== signature) currentEpoch++;
    signature = next;
    epochs.set(cp, currentEpoch);
    const identity =
      identityCheckpoint(cp) && b
        ? JSON.stringify([
            b.phaseCode,
            b.periodCode,
            b.activeTeamIndex,
            b.teams.map((t) => [t.rosterIndex, t.explicitTeamId, t.gameTurn])
          ])
        : undefined;
    if (identity === undefined || identity !== identitySignature)
      currentIdentityEpoch++;
    identitySignature = identity;
    identityEpochs.set(cp, currentIdentityEpoch);
  }
  const byTeam = teamIds.map((teamId) => ({ teamId, used: 0, notUsed: 0 }));
  const decisions: RerollResources["decisions"] = [];
  let cursor = 0,
    epoch = 0,
    identityEpoch = 0;
  let last: (typeof checkpoints)[number] | undefined;
  let pending:
    | {
        question: ReplayEvent;
        epoch: number;
        identityEpoch: number;
        controls: ReplayEvent[];
        resumed?: ReplayEvent;
        start: number;
      }
    | undefined;
  let candidate: ReplayEvent | undefined;
  let candidateNamespace = false;
  const namespace = (
    e: ReplayEvent,
    g: 0 | 1 | null
  ): RerollResources["decisions"][number]["namespace"] => {
    if (g === null || !e.playerId) return null;
    const owner = ownerAt(owners, e.playerId, e);
    if (owner !== String(g)) return null;
    if (!last)
      return e.actorTeamSource === "explicit"
        ? { basis: "explicit_team", actorPlayerId: e.playerId }
        : null;
    const b = last.board;
    if (!b || !identityCheckpoint(last)) return null;
    // Time-local ownership already establishes the identity. Join it to the
    // current unique roster slot; do not fill omitted Data.TeamId or confuse
    // the active side (a reaction can belong to the other team) with ownership.
    const rosters = b.teams.filter((t) =>
      t.players.some((p) => String(p.id) === e.playerId)
    );
    const roster = rosters[0];
    const consistent =
      rosters.length === 1 &&
      roster?.players.filter((p) => String(p.id) === e.playerId).length === 1 &&
      b.teams.length === 2 &&
      b.teams.every(
        (t) =>
          t.explicitTeamId === null ||
          teamIds.includes(String(t.explicitTeamId))
      ) &&
      (roster.explicitTeamId === null ||
        String(roster.explicitTeamId) === owner) &&
      b.teams
        .filter((t) => t !== roster)
        .every(
          (t) => t.explicitTeamId === null || String(t.explicitTeamId) !== owner
        );
    return consistent && roster?.rosterIndex === g
      ? {
          basis: "observed_roster",
          actorPlayerId: e.playerId,
          rosterIndex: g,
          checkpointAfter: last.afterSourceIndex,
          kind: last.kind,
          replayStep: last.replayStep,
          childIndex: last.childIndex
        }
      : null;
  };
  const steps = new Map<string | undefined, ReplayEvent>();
  for (const [eventIndex, e] of events.entries()) {
    while (
      cursor < checkpoints.length &&
      checkpoints[cursor]!.afterSourceIndex < (e.sourceIndex ?? -1)
    ) {
      last = checkpoints[cursor++]!;
      epoch = epochs.get(last)!;
      identityEpoch = identityEpochs.get(last)!;
    }
    if (e.type === "step") steps.set(e.actionId, e);
    if (recordedRerollOffer(e)) {
      pending = {
        question: e,
        epoch,
        identityEpoch,
        controls: [],
        start: eventIndex
      };
      candidate = e;
      candidateNamespace =
        namespace(e, recordedRerollOffer(e)!.gamerId) !== null;
      continue;
    }
    const raw = recordedRerollChoice(e);
    if (!raw) {
      if (!pending) continue;
      const q = pending.question;
      const resume = catchResumes.get(q.id ?? "");
      const previous = pending.controls.at(-1) ?? q;
      if (
        eventIndex - pending.start <= 12 &&
        e.id &&
        previous.id &&
        Number.isSafeInteger(e.sourceIndex) &&
        Number.isSafeInteger(previous.sourceIndex) &&
        e.sourceIndex! > previous.sourceIndex! &&
        !pending.resumed &&
        menuWaitControl(e, pending.controls.length)
      ) {
        pending.controls.push(e);
        continue;
      }
      if (pending.controls.length) {
        if (e.checkpointCarrier && e.sourceTag === "Carrier") continue;
        if (
          pending.controls.length === 3 &&
          !pending.resumed &&
          e.type === "step" &&
          sameParticipant(q, e) &&
          sameWaitHeader(steps.get(q.actionId), e)
        ) {
          pending.resumed = e;
          continue;
        }
        pending = undefined;
        continue;
      }
      if (
        (e.checkpointCarrier && e.sourceTag === "Carrier") ||
        (e.type === "step" && sameParticipant(q, e)) ||
        resume?.span.has(e)
      )
        continue;
      pending = undefined;
      continue;
    }
    // Admitted parser messages have source locators. Preserve unindexed
    // internal/partial inputs too, using the normalized event rather than an
    // invented source identity; they can never fund a linked team total.
    const indexed =
      !!e.id && Number.isSafeInteger(e.sourceIndex) && e.sourceIndex! >= 0;
    const q = candidate;
    const offer = q && recordedRerollOffer(q);
    let reason: RerollResources["decisions"][number]["reason"] =
      "matching_offer";
    const actorOwner = e.playerId ? ownerAt(owners, e.playerId, e) : undefined;
    const questionOwner = q?.playerId
      ? ownerAt(owners, q.playerId, q)
      : undefined;
    const teamId = raw.gamerId === null ? null : String(raw.gamerId);
    const header = steps.get(e.actionId);
    const originalHeader = q && steps.get(q.actionId);
    const resume = q && catchResumes.get(q.id ?? "");
    const currentNamespace = namespace(e, raw.gamerId);
    const wait =
      pending?.controls.length === 3 &&
      pending.resumed &&
      eventIndex - pending.start <= 12 &&
      pending.identityEpoch === identityEpoch &&
      !!last &&
      last.afterSourceIndex < pending.controls[0]!.sourceIndex! &&
      e.actionId === pending.resumed.actionId &&
      e.locator?.messageIndex === 0 &&
      pending.resumed.locator?.messageIndex === undefined &&
      q?.locator?.replayStep !== undefined &&
      [...pending.controls, pending.resumed, e].every(
        (event, i) =>
          event.locator?.replayStep === q.locator!.replayStep! + 1 &&
          event.locator?.childIndex === Math.min(i + 1, 4) &&
          (i >= 3 || event.locator.stepIndex === undefined)
      ) &&
      [q, ...pending.controls, pending.resumed, e].every(
        (event, i, all) =>
          !!event?.id &&
          Number.isSafeInteger(event.sourceIndex) &&
          event.sourceIndex! >= 0 &&
          (i === 0 || all[i - 1]!.sourceIndex! < event.sourceIndex!)
      )
        ? {
            activeGamerSourceId: pending.controls[0]!.id!,
            pauseSourceId: pending.controls[1]!.id!,
            timerSourceId: pending.controls[2]!.id!,
            resumedStepSourceId: pending.resumed.id!,
            controller: null
          }
        : null;
    if (!indexed) reason = "unindexed_source";
    else if (replay.replayVersion !== "1-4-0-0") reason = "unsupported_version";
    else if (raw.gamerId === null || raw.used === null || !raw.validFields)
      reason = "invalid_choice";
    else if (!q || !offer) reason = "missing_offer";
    else if (
      offer.gamerId !== raw.gamerId ||
      offer.teamAvailable === null ||
      offer.rollType === null ||
      (offer.kind === "numeric" && offer.proAvailable === null) ||
      (raw.used && !offer.teamAvailable)
    )
      reason = "invalid_offer";
    else if (
      !q.id ||
      !Number.isSafeInteger(q.sourceIndex) ||
      q.sourceIndex! >= e.sourceIndex! ||
      !sameParticipant(q, e) ||
      !actorOwner ||
      questionOwner !== actorOwner ||
      actorOwner !== teamId ||
      !byTeam.some((t) => t.teamId === teamId) ||
      e.actorTeamId !== actorOwner ||
      q.actorTeamId !== actorOwner ||
      (e.teamId !== undefined && e.teamId !== actorOwner) ||
      (q.teamId !== undefined && q.teamId !== actorOwner) ||
      header?.payload?.IsEvaluation !== 0 ||
      originalHeader?.payload?.IsEvaluation !== 0 ||
      !candidateNamespace ||
      !currentNamespace ||
      !(
        (pending?.controls.length === 0 &&
          pending.epoch === epoch &&
          last?.board !== null) ||
        wait ||
        resume?.choice === e
      )
    )
      reason = "source_or_owner_conflict";
    const linked = reason === "matching_offer";
    const board = last?.board;
    const team =
      currentNamespace?.basis === "observed_roster"
        ? board?.teams.find(
            (t) => t.rosterIndex === currentNamespace.rosterIndex
          )
        : undefined;
    const clock =
      linked && last && board && identityCheckpoint(last) && team
        ? {
            checkpointAfter: last.afterSourceIndex,
            phaseCode: board.phaseCode,
            periodCode: board.periodCode,
            teamTurn: team.gameTurn
          }
        : null;
    decisions.push({
      decisionEventId:
        normalized?.get(e)?.id ?? e.id ?? `unindexed-choice-${eventIndex}`,
      decisionSourceId: e.id ?? null,
      sourceIndex:
        Number.isSafeInteger(e.sourceIndex) && e.sourceIndex! >= 0
          ? e.sourceIndex!
          : null,
      questionSourceId: q?.id ?? null,
      teamId: linked ? teamId : null,
      status: linked ? "linked" : "unresolved",
      reason,
      decisionWait: linked ? wait : null,
      clock,
      namespace: linked ? currentNamespace : null
    });
    if (linked) {
      const total = byTeam.find((t) => t.teamId === teamId)!;
      if (raw.used) total.used++;
      else total.notUsed++;
    }
    pending = undefined;
    candidate = undefined;
    candidateNamespace = false;
  }
  const linkedCount = decisions.filter((d) => d.status === "linked").length;
  return {
    modelVersion: "recorded-reroll-resources-3",
    flow: findRerollResourceFlow(replay, owners, decisions, teamIds),
    decisions,
    decisionCount: decisions.length,
    recordedUsedCount: events.filter(
      (e) => recordedRerollChoice(e)?.used === true
    ).length,
    recordedNotUsedCount: events.filter(
      (e) => recordedRerollChoice(e)?.used === false
    ).length,
    unknownUsageCount: events.filter(
      (e) => recordedRerollChoice(e)?.used === null
    ).length,
    linkedCount,
    unresolvedCount: decisions.length - linkedCount,
    byTeam
  };
}

export function validReportedRerollResources(
  ledger: RerollResources,
  events: readonly LuckEvent[],
  teamIds: readonly string[]
): boolean {
  const sources = new Map(events.map((e) => [e.metadata.sourceId, e]));
  const eventIds = new Map(events.map((e) => [e.id, e]));
  const nested = (e: LuckEvent) =>
    !!e.metadata.diceEvidenceId &&
    e.id === `nested-${e.metadata.diceEvidenceId}` &&
    e.metadata.sourceId === e.id;
  const choices = events.filter(
    (e) => !nested(e) && e.metadata.sourceTag === "ResultTeamRerollUsage"
  );
  for (const e of events) {
    const p = e.metadata.recordedRerollOffer,
      raw = e.metadata.recordedRerollChoice;
    if (nested(e)) {
      if (p || raw) return false;
      continue;
    }
    if (
      (raw !== undefined) !==
        (e.metadata.sourceTag === "ResultTeamRerollUsage") ||
      (p !== undefined) !==
        ["QuestionTeamRerollUsage", "QuestionBlockDice"].includes(
          e.metadata.sourceTag ?? ""
        )
    )
      return false;
    if (
      p &&
      (e.metadata.sourceTag !==
        (p.kind === "numeric"
          ? "QuestionTeamRerollUsage"
          : "QuestionBlockDice") ||
        (e.metadata.numericOriginal &&
          (e.metadata.numericOriginal.gamerId !== p.gamerId ||
            e.metadata.numericOriginal.canUseTeamReroll !== p.teamAvailable ||
            e.metadata.numericOriginal.canUseProReroll !== p.proAvailable)) ||
        (e.metadata.rerollOffer &&
          (e.metadata.rerollOffer.gamerId !== p.gamerId ||
            e.metadata.rerollOffer.canUseTeamReroll !== p.teamAvailable)))
    )
      return false;
  }
  if (
    choices.length !== ledger.decisionCount ||
    choices.length !== ledger.decisions.length ||
    ledger.recordedUsedCount !==
      choices.filter((e) => e.metadata.recordedRerollChoice?.used === true)
        .length ||
    ledger.recordedNotUsedCount !==
      choices.filter((e) => e.metadata.recordedRerollChoice?.used === false)
        .length ||
    ledger.unknownUsageCount !==
      choices.filter((e) => e.metadata.recordedRerollChoice?.used === null)
        .length ||
    new Set(ledger.decisions.map((d) => d.decisionEventId)).size !==
      choices.length ||
    ledger.linkedCount !==
      ledger.decisions.filter((d) => d.status === "linked").length ||
    ledger.unresolvedCount !== ledger.decisionCount - ledger.linkedCount ||
    ledger.byTeam.length !== 2 ||
    ledger.byTeam.some((t, i) => t.teamId !== teamIds[i])
  )
    return false;
  const questions = new Set<string>();
  const totals = new Map(teamIds.map((id) => [id, { used: 0, notUsed: 0 }]));
  const spentDecisions = new Set<string>();
  const controllerChanges = events
    .filter(
      (e) =>
        e.metadata.sourceTag === "EventActiveGamerChanged" &&
        e.metadata.sourceIndex !== undefined
    )
    .map((e) => e.metadata.sourceIndex!)
    .sort((a, b) => a - b);
  const crossesController = (from: number, to: number) => {
    let lo = 0,
      hi = controllerChanges.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (controllerChanges[mid]! <= from) lo = mid + 1;
      else hi = mid;
    }
    return controllerChanges[lo] !== undefined && controllerChanges[lo]! < to;
  };
  const nextDecisions = new Map(
    ledger.decisions
      .slice(0, -1)
      .map((d, i) => [d.decisionEventId, ledger.decisions[i + 1]!.sourceIndex])
  );
  const previousDecisions = new Map(
    ledger.decisions
      .slice(1)
      .map((d, i) => [d.decisionEventId, ledger.decisions[i]!.sourceIndex])
  );
  for (const e of events) {
    const counter = e.metadata.teamRerollCounter,
      after = counter?.after;
    if (
      after &&
      nextDecisions.has(e.id) &&
      (nextDecisions.get(e.id) === null ||
        nextDecisions.get(e.id)! <= after.checkpointAfter)
    )
      return false;
    if (
      after &&
      counter &&
      previousDecisions.has(e.id) &&
      (previousDecisions.get(e.id) === null ||
        previousDecisions.get(e.id)! >
          (counter.decisionBefore ?? counter.before).checkpointAfter)
    )
      return false;
  }
  for (const e of events)
    if (e.metadata.teamRerollsSpent === 1) {
      const id = e.metadata.rerollDecisionId,
        choice = id && sources.get(id)?.metadata.recordedRerollChoice;
      if (!id || !choice || choice.used !== true || spentDecisions.has(id))
        return false;
      spentDecisions.add(id);
    }
  for (const [i, d] of ledger.decisions.entries()) {
    const e = eventIds.get(d.decisionEventId),
      q = sources.get(d.questionSourceId ?? ""),
      raw = e?.metadata.recordedRerollChoice;
    if (
      !e ||
      e.metadata.sourceTag !== "ResultTeamRerollUsage" ||
      !raw ||
      choices[i]?.id !== d.decisionEventId ||
      (e.metadata.sourceId ?? null) !== d.decisionSourceId ||
      (e.metadata.sourceIndex ?? null) !== d.sourceIndex ||
      e.scoringStatus !== "excluded" ||
      e.delta !== 0 ||
      e.weightedDelta !== 0
    )
      return false;
    if (d.status === "unresolved") {
      if (
        d.reason === "matching_offer" ||
        d.teamId !== null ||
        d.clock !== null ||
        d.namespace !== null ||
        d.decisionWait !== null
      )
        return false;
      continue;
    }
    const offer = q?.metadata.recordedRerollOffer;
    if (
      q?.metadata.sourceIndex !== undefined &&
      d.sourceIndex !== null &&
      crossesController(q.metadata.sourceIndex, d.sourceIndex) &&
      !d.decisionWait
    )
      return false;
    if (d.decisionWait) {
      const w = d.decisionWait,
        controls = [
          w.activeGamerSourceId,
          w.pauseSourceId,
          w.timerSourceId,
          w.resumedStepSourceId
        ].map((id) => sources.get(id));
      if (
        !q ||
        !controls.every(
          (control, j) =>
            control &&
            control.metadata.sourceTag ===
              [
                "EventActiveGamerChanged",
                "EventPauseActiveTimer",
                "EventActiveTimerChanged",
                "PlayerStep"
              ][j] &&
            control.scoringStatus === "excluded" &&
            control.delta === 0 &&
            control.weightedDelta === 0 &&
            control.metadata.sourceIndex !== undefined &&
            (j === 0
              ? q.metadata.sourceIndex !== undefined &&
                q.metadata.sourceIndex < control.metadata.sourceIndex
              : controls[j - 1]!.metadata.sourceIndex! <
                control.metadata.sourceIndex) &&
            control.metadata.sourceIndex < (d.sourceIndex ?? -1)
        ) ||
        controls[3]?.playerId !== e.playerId ||
        controls[3]?.metadata.stepType !== e.metadata.stepType ||
        controls[3]?.metadata.targetId !== e.metadata.targetId
      )
        return false;
    }
    if (
      d.sourceIndex === null ||
      d.decisionSourceId === null ||
      d.reason !== "matching_offer" ||
      !q ||
      !d.questionSourceId ||
      questions.has(d.questionSourceId) ||
      !offer ||
      raw.gamerId === null ||
      raw.used === null ||
      !raw.validFields ||
      offer.gamerId !== raw.gamerId ||
      offer.teamAvailable === null ||
      offer.rollType === null ||
      (offer.kind === "numeric" && offer.proAvailable === null) ||
      (raw.used && !offer.teamAvailable) ||
      d.teamId !== String(raw.gamerId) ||
      !totals.has(d.teamId) ||
      e.teamId !== d.teamId ||
      q.teamId !== d.teamId ||
      !e.playerId ||
      q.playerId !== e.playerId ||
      q.metadata.stepType !== e.metadata.stepType ||
      q.metadata.targetId !== e.metadata.targetId ||
      q.metadata.sourceIndex === undefined ||
      q.metadata.sourceIndex >= d.sourceIndex ||
      q.metadata.sourceTag !==
        (offer.kind === "numeric"
          ? "QuestionTeamRerollUsage"
          : "QuestionBlockDice") ||
      (e.metadata.teamRerollDecision &&
        (e.metadata.teamRerollDecision.gamerId !== raw.gamerId ||
          e.metadata.teamRerollDecision.used !== raw.used)) ||
      (e.metadata.teamDiceChoice &&
        (e.metadata.teamDiceChoice.questionSourceId !== d.questionSourceId ||
          e.metadata.teamDiceChoice.used !== raw.used)) ||
      (e.metadata.teamRerollCounter &&
        (e.metadata.teamRerollCounter.questionSourceId !== d.questionSourceId ||
          e.metadata.teamRerollCounter.spent !== Number(raw.used))) ||
      (d.clock && d.clock.checkpointAfter >= d.sourceIndex) ||
      !d.namespace ||
      d.namespace.actorPlayerId !== e.playerId ||
      (d.namespace.basis === "observed_roster" &&
        (d.namespace.rosterIndex !== raw.gamerId ||
          d.namespace.checkpointAfter >= d.sourceIndex ||
          (d.namespace.replayStep === null) !==
            (d.namespace.childIndex === null) ||
          (d.namespace.replayStep !== null &&
            e.metadata.locator?.replayStep !== undefined &&
            (d.namespace.replayStep > e.metadata.locator.replayStep ||
              (d.namespace.replayStep === e.metadata.locator.replayStep &&
                d.namespace.childIndex! >=
                  (e.metadata.locator.childIndex ?? -1)))) ||
          (!!d.clock &&
            d.clock.checkpointAfter !== d.namespace.checkpointAfter))) ||
      (d.namespace.basis === "explicit_team" && d.clock !== null)
    )
      return false;
    questions.add(d.questionSourceId);
    const total = totals.get(d.teamId)!;
    if (raw.used) total.used++;
    else total.notUsed++;
  }
  return (
    validRerollResourceFlow(ledger.flow, ledger.decisions, events, teamIds) &&
    ledger.byTeam.every(
      (t) =>
        t.used === totals.get(t.teamId)?.used &&
        t.notUsed === totals.get(t.teamId)?.notUsed
    )
  );
}
