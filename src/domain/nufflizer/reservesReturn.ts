import { readActivationBudget } from "@/domain/replay/activationBudget";
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
import type { LuckEvent, LuckReport } from "./types";
import { recruitmentIdentityObservation } from "@/domain/replay/recruitment";
type Trace = NonNullable<LuckEvent["metadata"]["regenerationReturn"]>;
type Observed = Extract<Trace, { status: "observed" }>;
type Snapshot = Observed["setup"];
type Activation = Omit<
  NonNullable<LuckEvent["metadata"]["recoveryReturnActivation"]>,
  "regenerationSourceId"
> & { originSourceId: string };
type Stop = Extract<Trace, { status: "unverified" }>["stop"];
type Member = { team: ObservedTeam; player: ObservedPlayer };
export type ReservesReturnSeed = {
  checkpointAfter: number;
  replayStep: number;
  childIndex: number;
  sourceId: string;
  playerId: string;
  teamId: string;
  rosterIndex: 0 | 1;
  identitySourceId?: string;
};
type Pending = ReservesReturnSeed & {
  latest?: Snapshot;
  playerTypeId?: number | null;
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
  memberIndex: ReadonlyMap<string, Member | null>,
  version: string | undefined
): Activation | undefined {
  const before = p.latest,
    action = e.payload?.Action,
    owner = owners.resolve(p.playerId, e),
    from = cell(step?.payload?.CellFrom),
    to = cell(step?.payload?.CellTo),
    budget = readActivationBudget(e, step, version);
  if (
    !before ||
    before.phase !== 5 ||
    before.canAct === false ||
    before.statusCode === 2 ||
    (action !== 1 && action !== 2 && !budget) ||
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
  } else if (action === 2) {
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
    originSourceId: p.sourceId,
    stepSourceIndex: step.sourceIndex!,
    actionCode: action as 1 | 2 | 3 | 4 | 5 | 6,
    ...(budget ? { budget } : {}),
    before
  };
}

// A bounded merge of raw events and fresh boards. Each stage is committed at
// its own prefix; later gaps cannot revoke an already observed earlier stage.
export function findReservesReturns(
  replay: ReplayModel,
  owners: OwnershipTimeline,
  initial: readonly ReservesReturnSeed[]
) {
  const traces = new Map<string, Trace>(),
    activations = new Map<string, Activation>();
  if (replay.replayVersion !== "1-4-0-0" || !initial.length)
    return { traces, activations };
  const replayTeamIds = new Set(replay.teams.map((t) => t.id));
  const events = replay.turns.flatMap((t) => t.events),
    pending = new Map<string, Pending>(),
    seeds = new Map<string, Pending[]>();
  for (const seed of initial) {
    const key = `${seed.checkpointAfter}/${seed.replayStep}/${seed.childIndex}`;
    seeds.set(key, [...(seeds.get(key) ?? []), seed]);
    traces.set(seed.sourceId, { status: "not_observed" });
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
    const a = declaration(
      e,
      previous,
      p,
      owners,
      memberIndex,
      replay.replayVersion
    );
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
        ...(a.budget ? { budget: a.budget } : {}),
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
        board.teams.length !== 2 ||
        new Set(board.teams.map((t) => t.rosterIndex)).size !== 2 ||
        board.teams.some(
          (t) =>
            ![0, 1].includes(t.rosterIndex) ||
            (t.explicitTeamId !== null &&
              !replayTeamIds.has(String(t.explicitTeamId)))
        ) ||
        board.teams.some(
          (t) =>
            t.rosterIndex !== p.rosterIndex &&
            t.explicitTeamId !== null &&
            String(t.explicitTeamId) === p.teamId
        ) ||
        (p.playerTypeId != null &&
          m.player.traitsPlayerTypeId != null &&
          p.playerTypeId !== m.player.traitsPlayerTypeId) ||
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
      if (m.player.traitsPlayerTypeId != null)
        p.playerTypeId = m.player.traitsPlayerTypeId;
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
      pending.set(seed.playerId, {
        ...seed,
        playerTypeId:
          memberIndex.get(seed.playerId)?.player.traitsPlayerTypeId ?? null
      });
    }
  }
  while (cursor < events.length) {
    event(events[cursor]!, events[cursor - 1]);
    cursor++;
  }
  return { traces, activations };
}

export function validReservesSnapshot(
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
export function isReturnSnapshotAfter(a: Snapshot, b: Snapshot) {
  return (
    a.checkpointAfter > b.checkpointAfter &&
    (a.replayStep > b.replayStep ||
      (a.replayStep === b.replayStep && a.childIndex > b.childIndex))
  );
}
export function isReturnSnapshotAtOrAfter(a: Snapshot, b: Snapshot) {
  return (
    a.checkpointAfter >= b.checkpointAfter &&
    (a.replayStep > b.replayStep ||
      (a.replayStep === b.replayStep && a.childIndex >= b.childIndex))
  );
}

// Reported observations share the retained clock/roster source, independently
// of whether their origin was recovery or treatment. Missing values stay null.
export function validReturnSnapshotSource(
  s: Snapshot,
  e: LuckEvent,
  report: LuckReport,
  phase: 3 | 5,
  slot: number
) {
  if (!validReservesSnapshot(s, phase, slot, report.coverage.sourceRecordCount))
    return false;
  const cp = report.rerollResources.flow.clockSnapshots.find(
    (c) =>
      c.source.checkpointAfter === s.checkpointAfter &&
      c.source.replayStep === s.replayStep &&
      c.source.childIndex === s.childIndex &&
      c.source.kind === "board"
  );
  if (
    !cp?.clock ||
    !cp.identityStructureObserved ||
    cp.rosterCount !== 2 ||
    cp.clock.phaseCode !== phase ||
    cp.clock.activeGamerId !== s.activeGamerId ||
    cp.clock.periodCode !== s.periodCode ||
    cp.clock.teamTurns[slot] !== s.teamTurn ||
    cp.playerIds.flat().filter((id) => String(id) === e.playerId).length !==
      1 ||
    !cp.playerIds[slot]?.some((id) => String(id) === e.playerId)
  )
    return false;
  const teams = new Set(report.teams.map((t) => t.teamId));
  return (
    cp.explicitTeamIds.every((id) => id === null || teams.has(String(id))) &&
    (cp.explicitTeamIds[slot] === null ||
      String(cp.explicitTeamIds[slot]) === e.teamId) &&
    (cp.explicitTeamIds[1 - slot] === null ||
      String(cp.explicitTeamIds[1 - slot]) !== e.teamId)
  );
}
