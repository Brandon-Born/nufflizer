import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { OwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import {
  lastBoardCheckpointBefore,
  type ReplayBoardCheckpoint
} from "@/domain/replay/boardState";
import { isInertReplayControl } from "@/domain/replay/inertControls";
import { linkRegeneration } from "./regeneration";
import type { LuckEvent } from "./types";

type Control = NonNullable<LuckEvent["metadata"]["recoveryControl"]>;
type Aftermath = NonNullable<LuckEvent["metadata"]["regenerationAftermath"]>;
function firstCheckpoint(
  checkpoints: readonly ReplayBoardCheckpoint[],
  index: number
) {
  let low = 0,
    high = checkpoints.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (checkpoints[mid]!.afterSourceIndex < index) low = mid + 1;
    else high = mid;
  }
  return checkpoints[low];
}
const integer = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v)
    ? v
    : typeof v === "string" && /^(0|[1-9]\d{0,15})$/.test(v)
      ? Number(v)
      : undefined;
const gamer = (v: unknown): 0 | 1 | undefined =>
  integer(v) === 0 ? 0 : integer(v) === 1 ? 1 : undefined;
const fields = (p: Record<string, unknown> | undefined, keys: string[]) =>
  !!p && Object.keys(p).every((k) => keys.includes(k));
function control(e: ReplayEvent): Control | undefined {
  if (e.attributionConflict) return;
  const p = e.payload;
  if (
    e.sourceTag === "EventRulesEngineStandBy" &&
    fields(p, ["Phase", "ActiveGamer"]) &&
    integer(p!.Phase) === 5 &&
    (p!.ActiveGamer === undefined || gamer(p!.ActiveGamer) !== undefined)
  )
    return {
      kind: "standby",
      phase: 5,
      gamerId: gamer(p!.ActiveGamer) ?? null
    };
  if (
    e.sourceTag === "EventEndTurn" &&
    fields(p, ["Reason", "NextPlayingGamer"]) &&
    integer(p!.Reason) === 2 &&
    gamer(p!.NextPlayingGamer) !== undefined
  )
    return { kind: "end", reason: 2, gamerId: gamer(p!.NextPlayingGamer)! };
  if (
    e.sourceTag === "EventActiveGamerChanged" &&
    fields(p, ["NewActiveGamer"]) &&
    gamer(p!.NewActiveGamer) !== undefined
  )
    return { kind: "gamer", gamerId: gamer(p!.NewActiveGamer)! };
  if (e.sourceTag === "EventPauseActiveTimer" && isInertReplayControl(e))
    return { kind: "pause" };
  if (e.sourceTag === "EventActiveTimerChanged" && isInertReplayControl(e)) {
    const t = p!.NewTimer as Record<string, unknown>;
    return {
      kind: "timer",
      duration: Number(t.Duration),
      timerType: Number(t.Type),
      value: Number(t.Value),
      ...(t.Team !== undefined ? { team: gamer(t.Team)! } : {}),
      ...(p!.IsPaused !== undefined ? { isPaused: gamer(p!.IsPaused)! } : {})
    };
  }
}
function bridge(controls: readonly Control[]) {
  if (controls.length === 1 && controls[0]?.kind === "standby")
    return { gamerId: controls[0].gamerId };
  if (
    controls.length !== 5 ||
    controls.map((c) => c.kind).join() !== "end,gamer,pause,timer,standby"
  )
    return;
  const first = controls[0]!,
    second = controls[1]!,
    last = controls[4]!;
  if (
    first.kind === "end" &&
    second.kind === "gamer" &&
    last.kind === "standby" &&
    first.gamerId === second.gamerId &&
    (last.gamerId === null || first.gamerId === last.gamerId)
  )
    return { gamerId: first.gamerId };
}
// First following observation only. Never search beyond a missing/contradictory
// board or unknown intervening action, and never synthesize omitted flags.
export function findRegenerationAftermath(
  replay: ReplayModel,
  owners: OwnershipTimeline
) {
  const aftermath = new Map<string, Aftermath>(),
    controls = new Map<string, Control>();
  if (replay.replayVersion !== "1-4-0-0") return { aftermath, controls };
  const checkpoints = replay.boardCheckpoints ?? [];
  const allEvents = replay.turns.flatMap((t) => t.events),
    indices = new Map(allEvents.map((e, i) => [e.id, i]));
  for (const turn of replay.turns)
    for (const [index, regen] of linkRegeneration(
      turn.events,
      replay.replayVersion
    )) {
      const raw = turn.events[index]!;
      if (
        !raw.id ||
        raw.sourceIndex === undefined ||
        !raw.playerId ||
        raw.attributionConflict
      )
        continue;
      const owner = owners.resolve(raw.playerId, raw);
      if (owner.status !== "confirmed") continue;
      const before = lastBoardCheckpointBefore(checkpoints, raw.sourceIndex),
        after = firstCheckpoint(checkpoints, raw.sourceIndex);
      if (
        before?.status !== "observed" ||
        before.board?.phaseCode !== 5 ||
        after?.status !== "observed" ||
        after.board?.phaseCode !== 5 ||
        after.board.stable !== true ||
        after.replayStep !== raw.locator?.replayStep ||
        raw.locator?.childIndex === undefined ||
        after.childIndex === undefined ||
        after.afterSourceIndex <= raw.sourceIndex ||
        after.afterSourceIndex > raw.sourceIndex + 5
      )
        continue;
      const globalIndex = indices.get(raw.id)!;
      const gap = allEvents.slice(
        globalIndex + 1,
        globalIndex + 1 + after.afterSourceIndex - raw.sourceIndex
      );
      if (
        gap.length !== after.afterSourceIndex - raw.sourceIndex ||
        gap.some(
          (e, i) =>
            !e.id ||
            e.sourceIndex !== raw.sourceIndex! + i + 1 ||
            e.locator?.replayStep !== after.replayStep ||
            e.locator?.childIndex !== raw.locator!.childIndex! + i + 1 ||
            e.actionId ||
            e.stepType !== undefined
        )
      )
        continue;
      const parsed = gap.map(control);
      if (parsed.some((p) => !p)) continue;
      const g = bridge(parsed as Control[]);
      if (
        g === undefined ||
        after.childIndex !== raw.locator.childIndex + gap.length + 1 ||
        (g.gamerId !== null &&
          after.board.activeGamerId !== null &&
          after.board.activeGamerId !== g.gamerId)
      )
        continue;
      const members = (b: NonNullable<typeof before.board>) =>
        b.teams.flatMap((t) =>
          t.players
            .filter((p) => String(p.id) === raw.playerId)
            .map((p) => ({ t, p }))
        );
      const a = members(before.board),
        b = members(after.board);
      if (
        a.length !== 1 ||
        b.length !== 1 ||
        a[0]!.t.rosterIndex !== b[0]!.t.rosterIndex ||
        [...a, ...b].some(
          ({ t, p }) =>
            (t.explicitTeamId !== null &&
              String(t.explicitTeamId) !== owner.proof.teamId) ||
            (p.traitsDataPlayerId != null &&
              String(p.traitsDataPlayerId) !== raw.playerId) ||
            (p.traitsDataTeamId != null &&
              String(p.traitsDataTeamId) !== owner.proof.teamId)
        )
      )
        continue;
      const { t, p } = b[0]!;
      if (
        p.pitchLocation !== "off_pitch" ||
        p.cell.x !== -1 ||
        p.cell.y !== -1 ||
        p.situationCode !== (regen.success ? 1 : 4) ||
        (regen.success && p.statusCode !== null && p.statusCode !== 0) ||
        (!regen.success &&
          p.statusCode !== null &&
          ![4, 5].includes(p.statusCode))
      )
        continue;
      aftermath.set(raw.id, {
        beforeCheckpointAfter: before.afterSourceIndex,
        checkpointAfter: after.afterSourceIndex,
        replayStep: after.replayStep!,
        childIndex: after.childIndex,
        rosterIndex: t.rosterIndex as 0 | 1,
        controlSourceIds: gap.map((e) => e.id!),
        observation: {
          cell: { x: -1, y: -1 },
          situationCode: p.situationCode,
          statusCode: p.statusCode,
          canAct: p.canAct,
          tackleZone: p.tackleZone
        }
      });
      gap.forEach((e, i) => controls.set(e.id!, parsed[i]!));
    }
  return { aftermath, controls };
}

export function validReportedRecoveryControl(e: LuckEvent) {
  const c = e.metadata.recoveryControl;
  if (!c) return true;
  const tags = {
    standby: "EventRulesEngineStandBy",
    end: "EventEndTurn",
    gamer: "EventActiveGamerChanged",
    pause: "EventPauseActiveTimer",
    timer: "EventActiveTimerChanged"
  };
  return (
    e.metadata.sourceTag === tags[c.kind] &&
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
    !e.metadata.actionId &&
    e.metadata.stepType === undefined
  );
}
export function validReportedRegenerationAftermath(
  e: LuckEvent,
  sources: ReadonlyMap<string, LuckEvent>,
  sourceCount: number
) {
  const a = e.metadata.regenerationAftermath;
  if (!a) return true;
  const m = e.metadata,
    index = m.sourceIndex;
  if (
    !m.damage?.regeneration ||
    e.scoringStatus !== "scored" ||
    m.rollType !== 46 ||
    e.probabilitySuccess !== 1 / 2 ||
    e.actualSuccess === null ||
    index === undefined ||
    a.beforeCheckpointAfter >= index ||
    a.checkpointAfter <= index ||
    a.checkpointAfter > sourceCount ||
    a.replayStep !== m.locator?.replayStep ||
    a.observation.situationCode !== (e.actualSuccess ? 1 : 4) ||
    (e.actualSuccess &&
      a.observation.statusCode !== null &&
      a.observation.statusCode !== 0) ||
    (!e.actualSuccess &&
      a.observation.statusCode !== null &&
      ![4, 5].includes(a.observation.statusCode))
  )
    return false;
  const controls = a.controlSourceIds.map((id) => sources.get(id));
  if (
    new Set(a.controlSourceIds).size !== controls.length ||
    controls.some(
      (c, i) =>
        !c ||
        !validReportedRecoveryControl(c) ||
        !c.metadata.recoveryControl ||
        c.metadata.sourceIndex !== index + i + 1 ||
        c.metadata.locator?.replayStep !== a.replayStep ||
        c.metadata.locator?.childIndex !==
          (m.locator?.childIndex ?? -100) + i + 1
    )
  )
    return false;
  return (
    bridge(controls.map((c) => c!.metadata.recoveryControl!)) !== undefined &&
    a.checkpointAfter === index + controls.length &&
    a.childIndex === (m.locator?.childIndex ?? -100) + controls.length + 1
  );
}
