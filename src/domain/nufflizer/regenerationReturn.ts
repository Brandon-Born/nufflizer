import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type {
  ReplayBoardCheckpoint,
  ObservedPlayer,
  ObservedTeam
} from "@/domain/replay/boardState";
import {
  preservesRosterOwnership,
  type OwnershipTimeline
} from "@/domain/replay/ownershipTimeline";
import type { LuckEvent } from "./types";
import { recruitmentIdentityObservation } from "@/domain/replay/recruitment";
type Trace = NonNullable<LuckEvent["metadata"]["regenerationReturn"]>;
type Observed = Extract<Trace, { status: "observed" }>;
type Snapshot = Observed["setup"];
type Activation = NonNullable<
  LuckEvent["metadata"]["recoveryReturnActivation"]
>;
type Stop = Extract<Trace, { status: "unverified" }>["stop"];
type Member = { team: ObservedTeam; player: ObservedPlayer };
type Pending = {
  sourceId: string;
  playerId: string;
  teamId: string;
  rosterIndex: 0 | 1;
  identitySourceId?: string;
  latest?: Snapshot;
};
function members(cp: ReplayBoardCheckpoint) {
  const result = new Map<string, Member | null>();
  for (const team of cp.board?.teams ?? [])
    for (const player of team.players)
      if (player.id !== null) {
        const id = String(player.id);
        result.set(id, result.has(id) ? null : { team, player });
      }
  return result;
}
function snapshot(cp: ReplayBoardCheckpoint, m: Member): Snapshot | undefined {
  const b = cp.board,
    p = m.player;
  if (
    !b ||
    cp.status !== "observed" ||
    b.stable !== true ||
    ![3, 5].includes(b.phaseCode ?? -1) ||
    !cp.replayStep ||
    !Number.isInteger(cp.childIndex) ||
    Number(cp.childIndex) < 0 ||
    p.pitchLocation !== "on_pitch" ||
    p.cell.x === null ||
    p.cell.y === null ||
    (p.situationCode !== null && p.situationCode !== 0) ||
    (p.statusCode !== null && ![0, 1, 2].includes(p.statusCode)) ||
    (b.activeGamerId !== null && ![0, 1].includes(b.activeGamerId))
  )
    return;
  return {
    checkpointAfter: cp.afterSourceIndex,
    replayStep: cp.replayStep,
    childIndex: cp.childIndex!,
    rosterIndex: m.team.rosterIndex as 0 | 1,
    phase: b.phaseCode as 3 | 5,
    cell: { x: p.cell.x, y: p.cell.y },
    statusCode: p.statusCode,
    situationCode: p.situationCode,
    canAct: p.canAct,
    tackleZone: p.tackleZone,
    activeGamerId: b.activeGamerId as 0 | 1 | null,
    periodCode: b.periodCode,
    teamTurn: m.team.gameTurn
  };
}
const fields = (p: Record<string, unknown> | undefined, keys: string[]) =>
  !!p && Object.keys(p).every((k) => keys.includes(k));
function cell(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return;
  const p = v as Record<string, unknown>;
  if (
    !fields(p, ["X", "Y"]) ||
    !Number.isInteger(p.X) ||
    !Number.isInteger(p.Y) ||
    Number(p.X) < 0 ||
    Number(p.X) > 25 ||
    Number(p.Y) < 0 ||
    Number(p.Y) > 14
  )
    return;
  return { x: Number(p.X), y: Number(p.Y) };
}
function declaration(
  e: ReplayEvent,
  step: ReplayEvent | undefined,
  p: Pending,
  owners: OwnershipTimeline,
  memberIndex: ReadonlyMap<string, Member | null>
): Activation | undefined {
  const before = p.latest,
    action = e.payload?.Action,
    owner = owners.resolve(p.playerId, e),
    from = cell(step?.payload?.CellFrom),
    to = cell(step?.payload?.CellTo);
  if (
    !before ||
    before.phase !== 5 ||
    before.canAct === false ||
    before.statusCode === 2 ||
    (action !== 1 && action !== 2) ||
    !fields(e.payload, ["Action", "TeamId"]) ||
    (e.payload!.TeamId !== undefined &&
      !Number.isSafeInteger(e.payload!.TeamId)) ||
    owner.status !== "confirmed" ||
    owner.proof.teamId !== p.teamId ||
    owner.proof.identitySourceId !== p.identitySourceId ||
    !step?.id ||
    step.sourceTag !== "PlayerStep" ||
    step.stepType !== 0 ||
    step.payload?.Skill !== 0 ||
    step.payload.IsEvaluation !== 0 ||
    !fields(step.payload, [
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
    ]) ||
    [step, e].some(
      (raw) =>
        raw.playerId !== p.playerId ||
        raw.attributionConflict ||
        raw.stepType !== 0 ||
        raw.actorTeamId !== p.teamId
    ) ||
    e.sequenceId !== step.sequenceId ||
    !e.actionId ||
    e.actionId !== step.actionId ||
    e.sourceIndex !== step.sourceIndex! + 1 ||
    before.checkpointAfter >= step.sourceIndex! ||
    e.locator?.messageIndex !== 0 ||
    e.locator.stepIndex !== 0 ||
    step.locator?.stepIndex !== 0 ||
    e.locator.replayStep !== step.locator.replayStep ||
    e.locator.childIndex !== step.locator.childIndex ||
    !from ||
    !to ||
    from.x !== before.cell.x ||
    from.y !== before.cell.y
  )
    return;
  if (action === 1) {
    if (
      e.targetId !== "-1" ||
      step.targetId !== "-1" ||
      to.x !== from.x ||
      to.y !== from.y
    )
      return;
  } else {
    const target = step.targetId ? memberIndex.get(step.targetId) : undefined;
    const targetOwner = step.targetId
      ? owners.resolve(step.targetId, e)
      : undefined;
    if (
      !target ||
      targetOwner?.status !== "confirmed" ||
      targetOwner.proof.teamId === p.teamId ||
      target.player.pitchLocation !== "on_pitch" ||
      target.player.cell.x !== to.x ||
      target.player.cell.y !== to.y ||
      Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) !== 1 ||
      e.targetId !== step.targetId
    )
      return;
  }
  return {
    regenerationSourceId: p.sourceId,
    stepSourceIndex: step.sourceIndex!,
    actionCode: action as 1 | 2,
    before
  };
}

// A bounded merge of raw events and fresh boards. Each stage is committed at
// its own prefix; later gaps cannot revoke an already observed earlier stage.
export function findRegenerationReturns(
  replay: ReplayModel,
  owners: OwnershipTimeline,
  aftermath: ReadonlyMap<
    string,
    NonNullable<LuckEvent["metadata"]["regenerationAftermath"]>
  >
) {
  const traces = new Map<string, Trace>(),
    activations = new Map<string, Activation>();
  if (replay.replayVersion !== "1-4-0-0" || aftermath.size === 0)
    return { traces, activations };
  const events = replay.turns.flatMap((t) => t.events),
    rawSources = new Map(events.map((e) => [e.id, e])),
    pending = new Map<string, Pending>();
  const seeds = new Map<string, Pending[]>();
  for (const [id, a] of aftermath)
    if (a.observation.situationCode === 1) {
      const raw = rawSources.get(id);
      if (!raw?.playerId || raw.payload?.Outcome !== 1) continue;
      const owner = owners.resolve(raw.playerId, raw);
      if (owner.status !== "confirmed") continue;
      const seed = {
        sourceId: id,
        playerId: raw.playerId,
        teamId: owner.proof.teamId,
        rosterIndex: a.rosterIndex,
        identitySourceId: owner.proof.identitySourceId
      };
      const key = `${a.checkpointAfter}/${a.replayStep}/${a.childIndex}`;
      seeds.set(key, [...(seeds.get(key) ?? []), seed]);
      traces.set(id, { status: "not_observed" });
    }
  if (seeds.size === 0) return { traces, activations };
  let cursor = 0,
    lastSourceIndex = 0,
    memberIndex = new Map<string, Member | null>();
  function stop(p: Pending, reason: Stop["reason"], sourceIndex?: number) {
    const prior = traces.get(p.sourceId)!;
    const boundary: Stop =
      reason === "invalid_source"
        ? { reason, sourceIndex: null }
        : { reason, sourceIndex: sourceIndex! };
    traces.set(
      p.sourceId,
      prior.status === "observed"
        ? { ...prior, stop: boundary }
        : { status: "unverified", stop: boundary }
    );
    pending.delete(p.playerId);
  }
  function event(e: ReplayEvent, previous: ReplayEvent | undefined) {
    const index = e.sourceIndex;
    if (index === undefined) {
      for (const p of pending.values()) stop(p, "invalid_source");
      return;
    }
    lastSourceIndex = index;
    if (
      e.sourceTag === "EventBuyMercenary" ||
      e.sourceTag === "EventRemoveMercenary"
    ) {
      const mutation = recruitmentIdentityObservation(e);
      if (
        mutation &&
        fields(e.payload, ["MercenaryId", "MercenaryType", "GamerId"])
      ) {
        const p = pending.get(mutation.playerId);
        if (p) stop(p, "identity_transition", index);
        return;
      }
    }
    if (!preservesRosterOwnership(e)) {
      for (const p of pending.values()) stop(p, "identity_transition", index);
      return;
    }
    if (e.sourceTag === "DamageStep" && e.playerId) {
      const p = pending.get(e.playerId);
      if (p) stop(p, "new_damage", index);
    }
    if (e.sourceTag !== "ResultUseAction" || !e.playerId || !e.id) return;
    const p = pending.get(e.playerId),
      trace = p ? traces.get(p.sourceId) : undefined;
    if (!p || trace?.status !== "observed" || !trace.playing) return;
    const a = declaration(e, previous, p, owners, memberIndex);
    if (!a) {
      stop(p, "unsupported_activation", index);
      return;
    }
    activations.set(e.id, a);
    traces.set(p.sourceId, {
      ...trace,
      activation: {
        sourceId: e.id,
        stepSourceIndex: a.stepSourceIndex,
        actionCode: a.actionCode,
        before: a.before
      }
    });
    pending.delete(p.playerId);
  }
  for (const cp of replay.boardCheckpoints ?? []) {
    while (
      cursor < events.length &&
      (events[cursor]!.sourceIndex !== undefined
        ? events[cursor]!.sourceIndex! <= cp.afterSourceIndex
        : lastSourceIndex < cp.afterSourceIndex)
    ) {
      event(events[cursor]!, events[cursor - 1]);
      cursor++;
    }
    memberIndex = members(cp);
    for (const p of pending.values()) {
      const m = memberIndex.get(p.playerId),
        board = cp.board;
      if (
        !board ||
        cp.status !== "observed" ||
        !m ||
        m.team.rosterIndex !== p.rosterIndex ||
        (m.team.explicitTeamId !== null &&
          String(m.team.explicitTeamId) !== p.teamId) ||
        (m.player.traitsDataPlayerId != null &&
          String(m.player.traitsDataPlayerId) !== p.playerId) ||
        (m.player.traitsDataTeamId != null &&
          String(m.player.traitsDataTeamId) !== p.teamId)
      ) {
        stop(p, "roster_conflict", cp.afterSourceIndex);
        continue;
      }
      if (m.player.pitchLocation === "unknown" || board.phaseCode === null) {
        stop(p, "unknown_position", cp.afterSourceIndex);
        continue;
      }
      if (
        m.player.pitchLocation === "off_pitch" &&
        m.player.situationCode !== null &&
        [2, 4, 5].includes(m.player.situationCode)
      ) {
        stop(p, "new_damage", cp.afterSourceIndex);
        continue;
      }
      const trace = traces.get(p.sourceId)!;
      p.latest = snapshot(cp, m);
      if (
        trace.status !== "observed" &&
        m.player.pitchLocation === "on_pitch"
      ) {
        if (p.latest?.phase !== 3) {
          stop(p, "unsupported_setup", cp.afterSourceIndex);
          continue;
        }
        traces.set(p.sourceId, { status: "observed", setup: p.latest });
      } else if (
        trace.status === "observed" &&
        !trace.playing &&
        board.phaseCode === 5
      ) {
        if (p.latest?.phase !== 5) {
          stop(p, "unknown_position", cp.afterSourceIndex);
          continue;
        }
        traces.set(p.sourceId, { ...trace, playing: p.latest });
      }
    }
    for (const seed of seeds.get(
      `${cp.afterSourceIndex}/${cp.replayStep}/${cp.childIndex}`
    ) ?? []) {
      const prior = pending.get(seed.playerId);
      if (prior) stop(prior, "new_damage", cp.afterSourceIndex);
      pending.set(seed.playerId, seed);
    }
  }
  while (cursor < events.length) {
    event(events[cursor]!, events[cursor - 1]);
    cursor++;
  }
  return { traces, activations };
}

function validSnapshot(
  s: Snapshot,
  phase: 3 | 5,
  roster: number,
  count: number
) {
  return (
    s.phase === phase &&
    s.rosterIndex === roster &&
    s.checkpointAfter <= count &&
    (s.situationCode === null || s.situationCode === 0) &&
    (s.statusCode === null || [0, 1, 2].includes(s.statusCode))
  );
}
function after(a: Snapshot, b: Snapshot) {
  return (
    a.checkpointAfter > b.checkpointAfter &&
    (a.replayStep > b.replayStep ||
      (a.replayStep === b.replayStep && a.childIndex > b.childIndex))
  );
}
function sameOrLater(a: Snapshot, b: Snapshot) {
  return (
    a.checkpointAfter >= b.checkpointAfter &&
    (a.replayStep > b.replayStep ||
      (a.replayStep === b.replayStep && a.childIndex >= b.childIndex))
  );
}
export function validReportedRegenerationReturn(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  count: number
) {
  const trace = e.metadata.regenerationReturn;
  if (!trace) return true;
  const base = e.metadata.regenerationAftermath;
  if (
    !base ||
    e.actualSuccess !== true ||
    base.observation.situationCode !== 1 ||
    e.scoringStatus !== "scored"
  )
    return false;
  const stop = "stop" in trace ? trace.stop : undefined;
  if (
    stop &&
    stop.sourceIndex !== null &&
    (stop.sourceIndex < base.checkpointAfter || stop.sourceIndex > count)
  )
    return false;
  if (trace.status !== "observed") return true;
  const s = trace.setup,
    p = trace.playing,
    a = trace.activation;
  if (
    !validSnapshot(s, 3, base.rosterIndex, count) ||
    s.checkpointAfter <= base.checkpointAfter ||
    s.replayStep < base.replayStep ||
    (s.replayStep === base.replayStep && s.childIndex <= base.childIndex) ||
    (p && (!validSnapshot(p, 5, base.rosterIndex, count) || !after(p, s))) ||
    (stop &&
      stop.sourceIndex !== null &&
      stop.sourceIndex < (p ?? s).checkpointAfter)
  )
    return false;
  if (!a) return true;
  const use = sources.get(a.sourceId),
    marker = use?.metadata.recoveryReturnActivation;
  return (
    !!p &&
    !stop &&
    !!use &&
    !!marker &&
    marker.regenerationSourceId === e.metadata.sourceId &&
    use.playerId === e.playerId &&
    use.teamId === e.teamId &&
    validReportedRecoveryReturnActivation(use, sources, count) &&
    a.stepSourceIndex === marker.stepSourceIndex &&
    a.actionCode === marker.actionCode &&
    JSON.stringify(a.before) === JSON.stringify(marker.before) &&
    sameOrLater(a.before, p)
  );
}
export function validReportedRecoveryReturnActivation(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  count: number
) {
  const a = e.metadata.recoveryReturnActivation;
  if (!a) return true;
  const regen = sources.get(a.regenerationSourceId),
    trace = regen?.metadata.regenerationReturn;
  return (
    e.scoringStatus === "excluded" &&
    !e.metadata.isRollCandidate &&
    e.probabilitySuccess === null &&
    e.actualSuccess === null &&
    e.delta === 0 &&
    e.weightedDelta === 0 &&
    !e.contextualImpact &&
    !e.contextualBounds &&
    !e.possessionBounds &&
    !e.catchPossessionBounds &&
    e.metadata.sourceTag === "ResultUseAction" &&
    e.metadata.stepType === 0 &&
    e.metadata.actionCode === a.actionCode &&
    !!e.metadata.actionId &&
    e.metadata.locator?.stepIndex === 0 &&
    e.metadata.locator.messageIndex === 0 &&
    e.metadata.sourceIndex === a.stepSourceIndex + 1 &&
    a.before.checkpointAfter < a.stepSourceIndex &&
    (a.before.replayStep < (e.metadata.locator?.replayStep ?? -1) ||
      (a.before.replayStep === e.metadata.locator?.replayStep &&
        a.before.childIndex < (e.metadata.locator.childIndex ?? -1))) &&
    a.before.canAct !== false &&
    a.before.statusCode !== 2 &&
    !!regen?.metadata.regenerationAftermath &&
    trace?.status === "observed" &&
    trace.activation?.sourceId === e.metadata.sourceId &&
    !!trace.playing &&
    validSnapshot(a.before, 5, trace.setup.rosterIndex, count) &&
    sameOrLater(a.before, trace.playing) &&
    regen.playerId === e.playerId &&
    regen.teamId === e.teamId &&
    (a.actionCode === 1
      ? e.metadata.targetId === "-1"
      : !!e.metadata.targetId && e.metadata.targetId !== e.playerId)
  );
}
