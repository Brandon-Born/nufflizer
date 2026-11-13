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

const count = z.number().int().min(0).max(REPLAY_LIMITS.events);
const observedCode = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const text = z.string().max(REPLAY_LIMITS.decodedBytes);
const gamer = z.union([z.literal(0), z.literal(1)]);
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
  modelVersion: z.literal("recorded-reroll-resources-1"),
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
  let signature: string | undefined,
    currentEpoch = 0;
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
  }
  const byTeam = teamIds.map((teamId) => ({ teamId, used: 0, notUsed: 0 }));
  const decisions: RerollResources["decisions"] = [];
  let cursor = 0,
    epoch = 0;
  let last: (typeof checkpoints)[number] | undefined;
  let pending: { question: ReplayEvent; epoch: number } | undefined;
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
    }
    if (e.type === "step") steps.set(e.actionId, e);
    if (recordedRerollOffer(e)) {
      pending = { question: e, epoch };
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
        (pending?.epoch === epoch && last?.board !== null) ||
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
    modelVersion: "recorded-reroll-resources-1",
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
  const nextDecisions = new Map(
    ledger.decisions
      .slice(0, -1)
      .map((d, i) => [d.decisionEventId, ledger.decisions[i + 1]!.sourceIndex])
  );
  for (const e of events) {
    const after = e.metadata.teamRerollCounter?.after;
    if (
      after &&
      nextDecisions.has(e.id) &&
      (nextDecisions.get(e.id) === null ||
        nextDecisions.get(e.id)! <= after.checkpointAfter)
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
        d.namespace !== null
      )
        return false;
      continue;
    }
    const offer = q?.metadata.recordedRerollOffer;
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
  return ledger.byTeam.every(
    (t) =>
      t.used === totals.get(t.teamId)?.used &&
      t.notUsed === totals.get(t.teamId)?.notUsed
  );
}
