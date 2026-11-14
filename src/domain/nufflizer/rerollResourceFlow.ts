import { z } from "zod";
import { REPLAY_LIMITS } from "@/domain/replay/limits";
import type { ReplayBoardCheckpoint } from "@/domain/replay/boardState";
import type { ReplayEvent, ReplayModel } from "@/domain/replay/types";
import type { OwnershipLookup } from "@/domain/replay/ownershipTimeline";
import type { LuckEvent } from "./types";

const index = z.number().int().min(0).max(REPLAY_LIMITS.events);
const snapshotIndex = z.number().int().min(0).max(REPLAY_LIMITS.xmlNodes);
const observed = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const text = z.string().max(REPLAY_LIMITS.decodedBytes);
const slot = z.union([z.literal(0), z.literal(1)]);
const source = z.strictObject({
  // Source coordinates are not array lengths or admission limits.
  checkpointAfter: observed,
  kind: z.enum(["initial", "board"]),
  replayStep: observed.nullable(),
  childIndex: observed.nullable()
});
const clock = z.strictObject({
  phaseCode: observed.nullable(),
  periodCode: observed.nullable(),
  activeTeamIndex: observed.nullable(),
  activeGamerId: observed.nullable(),
  teamTurns: z.tuple([observed.nullable(), observed.nullable()])
});
const poolNamespace = z.discriminatedUnion("basis", [
  z.strictObject({
    basis: z.literal("explicit_team"),
    teamId: text,
    rosterAnchorPlayerId: z.null()
  }),
  z.strictObject({
    basis: z.literal("owned_roster"),
    teamId: text,
    rosterAnchorPlayerId: text
  })
]);
const observation = z.strictObject({
  source,
  namespace: poolNamespace,
  rosterIndex: slot,
  teamId: text,
  explicitTeamIds: z.tuple([observed.nullable(), observed.nullable()]),
  count: observed.nullable(),
  clock
});
const reason = z.enum([
  "no_decision",
  "unindexed_choices",
  "unknown_gamer",
  "unknown_usage",
  "unresolved_choice",
  "owner_conflict",
  "missing_snapshot",
  "missing_counter",
  "clock_boundary",
  "regular_play_unverified",
  "unindexed_clock_boundary"
]);
const status = z.enum([
  "observed_agreement",
  "observed_difference",
  "not_comparable"
]);
const accounting = {
  recordedUsedCount: index,
  recordedNotUsedCount: index,
  unknownUsageCount: index,
  unresolvedCount: index,
  netDecrease: z
    .number()
    .int()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER)
    .nullable(),
  status,
  reason: reason.nullable()
};
const pool = z.strictObject({
  gamerId: slot,
  teamId: text.nullable(),
  decisionOrdinals: z.array(index).max(REPLAY_LIMITS.events),
  before: observation.nullable(),
  after: observation.nullable(),
  ...accounting
});
const clockSnapshot = z.strictObject({
  id: snapshotIndex,
  source,
  clockSegment: observed,
  identityStructureObserved: z.boolean(),
  rosterCount: observed.nullable(),
  clock: clock.nullable(),
  explicitTeamIds: z.tuple([observed.nullable(), observed.nullable()]),
  counts: z.tuple([observed.nullable(), observed.nullable()]),
  playerIds: z.tuple([
    z.array(observed.nullable()).max(64),
    z.array(observed.nullable()).max(64)
  ]),
  poolNamespaces: z.tuple([poolNamespace.nullable(), poolNamespace.nullable()])
});
const endNotification = z.strictObject({
  sourceId: text.nullable(),
  sourceIndex: observed.nullable(),
  sourceTag: z.literal("EventEndTurn"),
  replayStep: observed.nullable(),
  childIndex: observed.nullable(),
  reasonCode: observed.nullable()
});
export const RerollResourceFlowSchema = z.strictObject({
  modelVersion: z.literal("observed-reroll-resource-flow-1"),
  unindexedDecisionOrdinals: z.array(index).max(REPLAY_LIMITS.events),
  clockSnapshots: z.array(clockSnapshot).max(REPLAY_LIMITS.xmlNodes),
  endNotifications: z.array(endNotification).max(REPLAY_LIMITS.events),
  intervals: z
    .array(
      z.strictObject({
        id: index,
        beforeSnapshotId: snapshotIndex.nullable(),
        afterSnapshotId: snapshotIndex.nullable(),
        beforeSource: source.nullable(),
        afterSource: source.nullable(),
        decisionOrdinals: z.array(index).min(1).max(REPLAY_LIMITS.events),
        pools: z.tuple([pool, pool])
      })
    )
    .max(REPLAY_LIMITS.events),
  clockWindows: z
    .array(
      z.strictObject({
        id: index,
        clockSegment: observed.nullable(),
        startSnapshotId: snapshotIndex.nullable(),
        endSnapshotId: snapshotIndex.nullable(),
        gamerId: slot,
        teamId: text.nullable(),
        intervalIds: z.array(index).min(1).max(REPLAY_LIMITS.events),
        decisionOrdinals: z.array(index).min(1).max(REPLAY_LIMITS.events),
        before: observation.nullable(),
        after: observation.nullable(),
        gameClockFieldsRecorded: z.boolean(),
        unobservedCounterSnapshotIds: z
          .array(snapshotIndex)
          .max(REPLAY_LIMITS.xmlNodes),
        unqualifiedSnapshotIds: z
          .array(snapshotIndex)
          .max(REPLAY_LIMITS.xmlNodes),
        counterChanges: z
          .array(
            z.strictObject({
              fromSnapshotId: snapshotIndex,
              toSnapshotId: snapshotIndex,
              netDecrease: z
                .number()
                .int()
                .min(-Number.MAX_SAFE_INTEGER)
                .max(Number.MAX_SAFE_INTEGER)
                .nullable(),
              decisionOrdinals: z.array(index).max(REPLAY_LIMITS.events)
            })
          )
          .max(REPLAY_LIMITS.xmlNodes),
        ...accounting
      })
    )
    .max(REPLAY_LIMITS.events)
});
export type RerollResourceFlow = z.infer<typeof RerollResourceFlowSchema>;
type Observation = z.infer<typeof observation>;
type Pool = z.infer<typeof pool>;
type Reason = z.infer<typeof reason>;
type Link = {
  decisionEventId: string;
  decisionSourceId: string | null;
  sourceIndex: number | null;
  teamId: string | null;
  status: "linked" | "unresolved";
};
const cpSource = (cp: ReplayBoardCheckpoint | undefined) =>
  cp
    ? {
        checkpointAfter: cp.afterSourceIndex,
        kind: cp.kind,
        replayStep: cp.replayStep,
        childIndex: cp.childIndex
      }
    : null;
const identityBoard = (cp: ReplayBoardCheckpoint | undefined) =>
  cp?.status === "observed" &&
  !!cp.board &&
  new Set(
    cp.board.teams.flatMap((t) =>
      t.players.flatMap((p) => (p.id === null ? [] : [p.id]))
    )
  ).size ===
    cp.board.teams.reduce(
      (n, t) => n + t.players.filter((p) => p.id !== null).length,
      0
    ) &&
  cp.board.issues.every((i) =>
    ["held_ball_not_reconciled", "conflicting_tackle_zone_effect"].includes(i)
  );
function namespaceAt(
  cp: ReplayBoardCheckpoint,
  gamer: 0 | 1,
  owners: OwnershipLookup,
  teamIds: readonly string[]
): z.infer<typeof poolNamespace> | null {
  const b = cp.board,
    t = b?.teams[gamer],
    other = b?.teams[1 - gamer];
  if (
    !b ||
    !t ||
    !other ||
    !identityBoard(cp) ||
    b.teams.length !== 2 ||
    b.teams.some((t, i) => t.rosterIndex !== i) ||
    b.teams.some(
      (t) =>
        t.explicitTeamId !== null && !teamIds.includes(String(t.explicitTeamId))
    )
  )
    return null;
  if (t.explicitTeamId !== null) {
    const teamId = String(t.explicitTeamId);
    return other.explicitTeamId === t.explicitTeamId
      ? null
      : { basis: "explicit_team", teamId, rosterAnchorPlayerId: null };
  }
  // A current roster member supplies namespace evidence even when this team
  // is not controlling the game. Array position and missing IDs supply none.
  for (const player of t.players) {
    if (player.id === null) continue;
    const id = String(player.id),
      proof =
        "atIndex" in owners
          ? owners.atIndex(id, cp.afterSourceIndex + 1)
          : undefined;
    const teamId = proof
      ? proof.status === "confirmed"
        ? proof.proof.teamId
        : undefined
      : "get" in owners
        ? owners.get(id)
        : undefined;
    if (teamId === undefined) continue;
    if (
      !teamIds.includes(teamId) ||
      (other.explicitTeamId !== null &&
        String(other.explicitTeamId) === teamId) ||
      t.players.filter((p) => p.id === player.id).length !== 1 ||
      other.players.some((p) => p.id === player.id)
    )
      return null;
    return { basis: "owned_roster", teamId, rosterAnchorPlayerId: id };
  }
  return null;
}
function observe(
  s: RerollResourceFlow["clockSnapshots"][number] | undefined,
  gamer: 0 | 1,
  teamId: string | null
): Observation | null {
  const n = s?.poolNamespaces[gamer];
  return s && s.identityStructureObserved && s.clock && n && n.teamId === teamId
    ? {
        source: s.source,
        namespace: n,
        rosterIndex: gamer,
        teamId: n.teamId,
        explicitTeamIds: s.explicitTeamIds,
        count: s.counts[gamer],
        clock: s.clock
      }
    : null;
}

function totals(
  ordinals: readonly number[],
  choices: readonly ReplayEvent[],
  links: readonly Link[]
) {
  return {
    recordedUsedCount: ordinals.filter((i) => choices[i]?.payload?.Used === 1)
      .length,
    recordedNotUsedCount: ordinals.filter(
      (i) => choices[i]?.payload?.Used === 0
    ).length,
    unknownUsageCount: ordinals.filter(
      (i) =>
        ![0, 1].includes(Number(choices[i]?.payload?.Used)) ||
        typeof choices[i]?.payload?.Used !== "number"
    ).length,
    unresolvedCount: ordinals.filter((i) => links[i]?.status !== "linked")
      .length
  };
}
function result(
  before: Observation | null,
  after: Observation | null,
  used: number,
  why: Reason | null
) {
  const netDecrease =
    before?.teamId === after?.teamId &&
    before?.rosterIndex === after?.rosterIndex &&
    before?.count !== null &&
    before?.count !== undefined &&
    after?.count !== null &&
    after?.count !== undefined
      ? before.count - after.count
      : null;
  const reason =
    why ??
    (!before || !after
      ? "missing_snapshot"
      : netDecrease === null
        ? "missing_counter"
        : null);
  return {
    netDecrease,
    reason,
    status: reason
      ? ("not_comparable" as const)
      : netDecrease === used
        ? ("observed_agreement" as const)
        : ("observed_difference" as const)
  };
}
export function resourceClockSnapshotKey(cp: ReplayBoardCheckpoint) {
  const b = cp.board;
  return identityBoard(cp) &&
    b &&
    b.teams.length === 2 &&
    b.teams.every((t, i) => t.rosterIndex === i)
    ? JSON.stringify([
        b.phaseCode,
        b.periodCode,
        b.activeTeamIndex,
        b.teams.map((t) => t.gameTurn)
      ])
    : undefined;
}
const epochKey = resourceClockSnapshotKey;
function snapshotEpochKey(s: RerollResourceFlow["clockSnapshots"][number]) {
  const c = s.clock;
  return s.identityStructureObserved && c
    ? JSON.stringify([
        c.phaseCode,
        c.periodCode,
        c.activeTeamIndex,
        c.teamTurns
      ])
    : undefined;
}
function segmentBounds(snapshots: RerollResourceFlow["clockSnapshots"]) {
  const result = new Map<number, { start: number; end: number }>();
  for (const s of snapshots) {
    const range = result.get(s.clockSegment);
    if (range) range.end = s.id;
    else result.set(s.clockSegment, { start: s.id, end: s.id });
  }
  return result;
}
function windowTrace(
  w: RerollResourceFlow["clockWindows"][number],
  snapshots: RerollResourceFlow["clockSnapshots"],
  byRange: ReadonlyMap<string, RerollResourceFlow["intervals"][number]>,
  bounds: ReturnType<typeof segmentBounds>,
  intervals: RerollResourceFlow["intervals"]
) {
  const range =
      w.clockSegment === null ? undefined : bounds.get(w.clockSegment),
    ids: number[] = [];
  const successor = intervals[w.intervalIds.at(-1)!]?.afterSnapshotId;
  const end = range ? Math.max(range.end, successor ?? range.end) : undefined;
  if (range && end !== undefined)
    for (let id = range.start; id <= end; id++) ids.push(id);
  const unobservedCounterSnapshotIds = ids.filter(
    (id) => snapshots[id]!.counts[w.gamerId] === null
  );
  const counterChanges: RerollResourceFlow["clockWindows"][number]["counterChanges"] =
    [];
  for (const from of ids.slice(0, -1)) {
    const to = from + 1,
      a = snapshots[from]!.counts[w.gamerId],
      b = snapshots[to]!.counts[w.gamerId];
    if (a === b) continue;
    counterChanges.push({
      fromSnapshotId: from,
      toSnapshotId: to,
      netDecrease: a !== null && b !== null ? a - b : null,
      decisionOrdinals:
        byRange.get(`${from}:${to}`)?.pools[w.gamerId].decisionOrdinals ?? []
    });
  }
  return {
    ids,
    startSnapshotId: range?.start ?? null,
    endSnapshotId: end ?? null,
    unobservedCounterSnapshotIds,
    counterChanges,
    gameClockFieldsRecorded:
      ids.length > 0 &&
      ids.every((id) => {
        const c = snapshots[id]!.clock;
        return (
          !!c &&
          c.phaseCode === 5 &&
          c.periodCode !== null &&
          (c.activeTeamIndex === 0 || c.activeTeamIndex === 1) &&
          c.teamTurns.every((n) => n !== null)
        );
      })
  };
}

export function recordedResourceEndNotifications(
  events: readonly ReplayEvent[]
): z.infer<typeof endNotification>[] {
  return events
    .filter((e) => e.sourceTag === "EventEndTurn")
    .map((e) => {
      const raw = e.payload?.Reason,
        v =
          typeof raw === "string" && /^\d{1,16}$/.test(raw) ? Number(raw) : raw;
      return {
        sourceId: e.id ?? null,
        sourceIndex:
          Number.isSafeInteger(e.sourceIndex) && e.sourceIndex! >= 0
            ? e.sourceIndex!
            : null,
        sourceTag: "EventEndTurn",
        replayStep: e.locator?.replayStep ?? null,
        childIndex: e.locator?.childIndex ?? null,
        reasonCode: Number.isSafeInteger(v) && Number(v) >= 0 ? Number(v) : null
      };
    });
}
export function resourceEndIndex(
  ends: readonly z.infer<typeof endNotification>[]
) {
  const unknown = ends.some((e) => e.sourceIndex === null),
    positions = ends
      .flatMap((e) => (e.sourceIndex === null ? [] : [e.sourceIndex]))
      .sort((a, b) => a - b);
  return {
    unknown,
    crosses: (from: number, to: number) => {
      if (unknown) return true;
      let lo = 0,
        hi = positions.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (positions[mid]! <= from) lo = mid + 1;
        else hi = mid;
      }
      return positions[lo] !== undefined && positions[lo]! <= to;
    }
  };
}

export function resourceClockSegments(
  cps: readonly ReplayBoardCheckpoint[],
  ends: readonly z.infer<typeof endNotification>[]
) {
  const endIndex = resourceEndIndex(ends),
    segments: number[] = [];
  let previous: string | undefined,
    epoch = 0,
    previousAfter = -Infinity;
  for (const cp of cps) {
    const key = epochKey(cp);
    if (
      key === undefined ||
      key !== previous ||
      endIndex.crosses(previousAfter, cp.afterSourceIndex)
    )
      epoch++;
    segments.push(epoch);
    previous = key;
    previousAfter = cp.afterSourceIndex;
  }
  return segments;
}

// Actual counter endpoints and all recorded choices, including unresolved ones.
// Agreement is descriptive: it is not proof of eligibility, a legal complete
// turn, a permanent/free pool policy, resets, or tactical resource value.
export function findRerollResourceFlow(
  replay: ReplayModel,
  owners: OwnershipLookup,
  links: readonly Link[],
  teamIds: readonly string[]
): RerollResourceFlow {
  const choices = replay.turns
      .flatMap((t) => t.events)
      .filter((e) => e.sourceTag === "ResultTeamRerollUsage"),
    cps = [...(replay.boardCheckpoints ?? [])].sort(
      (a, b) => a.afterSourceIndex - b.afterSourceIndex
    );
  const endNotifications = recordedResourceEndNotifications(
      replay.turns.flatMap((t) => t.events)
    ),
    endIndex = resourceEndIndex(endNotifications);
  const epochs = resourceClockSegments(cps, endNotifications);
  const clockSnapshots: RerollResourceFlow["clockSnapshots"] = cps.map(
    (cp, id) => {
      const b = cp.board;
      const namespaces: [
        z.infer<typeof poolNamespace> | null,
        z.infer<typeof poolNamespace> | null
      ] = [
        namespaceAt(cp, 0, owners, teamIds),
        namespaceAt(cp, 1, owners, teamIds)
      ];
      if (namespaces[0] && namespaces[0].teamId === namespaces[1]?.teamId) {
        namespaces[0] = null;
        namespaces[1] = null;
      }
      return {
        id,
        source: cpSource(cp)!,
        clockSegment: epochs[id]!,
        identityStructureObserved: epochKey(cp) !== undefined,
        rosterCount: b?.teams.length ?? null,
        clock: b
          ? {
              phaseCode: b.phaseCode,
              periodCode: b.periodCode,
              activeTeamIndex: b.activeTeamIndex,
              activeGamerId: b.activeGamerId,
              teamTurns: [
                b.teams[0]?.gameTurn ?? null,
                b.teams[1]?.gameTurn ?? null
              ]
            }
          : null,
        explicitTeamIds: [
          b?.teams[0]?.explicitTeamId ?? null,
          b?.teams[1]?.explicitTeamId ?? null
        ],
        counts: [b?.teams[0]?.rerolls ?? null, b?.teams[1]?.rerolls ?? null],
        playerIds: [
          b?.teams[0]?.players.map((p) => p.id) ?? [],
          b?.teams[1]?.players.map((p) => p.id) ?? []
        ],
        poolNamespaces: namespaces
      };
    }
  );
  const unknownGamerPresent = choices.some(
    (e) => e.payload?.GamerId !== 0 && e.payload?.GamerId !== 1
  );
  const unindexedDecisionOrdinals: number[] = [],
    groups: { before: number; after: number; ordinals: number[] }[] = [];
  const groupByRange = new Map<string, (typeof groups)[number]>();
  let cursor = 0;
  choices.forEach((choice, i) => {
    if (
      !choice.id ||
      !Number.isSafeInteger(choice.sourceIndex) ||
      choice.sourceIndex! < 0
    ) {
      unindexedDecisionOrdinals.push(i);
      return;
    }
    while (
      cursor < cps.length &&
      cps[cursor]!.afterSourceIndex < choice.sourceIndex!
    )
      cursor++;
    const key = `${cursor - 1}:${cursor}`;
    let group = groupByRange.get(key);
    if (!group) {
      group = { before: cursor - 1, after: cursor, ordinals: [] };
      groupByRange.set(key, group);
      groups.push(group);
    }
    group.ordinals.push(i);
  });
  const intervals: RerollResourceFlow["intervals"] = [];
  groups.forEach((g, id) => {
    const before = cps[g.before],
      after = cps[g.after],
      unknownGamer = g.ordinals.some(
        (i) =>
          ![0, 1].includes(Number(choices[i]?.payload?.GamerId)) ||
          typeof choices[i]?.payload?.GamerId !== "number"
      );
    const pools = ([0, 1] as const).map((gamer) => {
      const ordinals = g.ordinals.filter(
          (i) => choices[i]?.payload?.GamerId === gamer
        ),
        t = totals(ordinals, choices, links);
      const qualified = ordinals.filter(
          (i) => links[i]?.status === "linked" && links[i]?.teamId !== null
        ),
        ids = new Set(qualified.map((i) => links[i]!.teamId!));
      const teamId = ids.size === 1 ? [...ids][0]! : null;
      const pre = observe(clockSnapshots[g.before], gamer, teamId),
        post = observe(clockSnapshots[g.after], gamer, teamId);
      const why: Reason | null = !ordinals.length
        ? "no_decision"
        : unindexedDecisionOrdinals.length
          ? "unindexed_choices"
          : endIndex.unknown
            ? "unindexed_clock_boundary"
            : unknownGamer || unknownGamerPresent
              ? "unknown_gamer"
              : t.unknownUsageCount
                ? "unknown_usage"
                : t.unresolvedCount
                  ? "unresolved_choice"
                  : ids.size !== 1
                    ? "owner_conflict"
                    : !before || !after
                      ? "missing_snapshot"
                      : epochs[g.before] !== epochs[g.after]
                        ? "clock_boundary"
                        : before.board?.phaseCode !== 5 ||
                            after.board?.phaseCode !== 5
                          ? "regular_play_unverified"
                          : null;
      return {
        gamerId: gamer,
        teamId,
        decisionOrdinals: ordinals,
        before: pre,
        after: post,
        ...t,
        ...result(pre, post, t.recordedUsedCount, why)
      };
    }) as [Pool, Pool];
    intervals.push({
      id,
      beforeSnapshotId: before ? g.before : null,
      afterSnapshotId: after ? g.after : null,
      beforeSource: cpSource(before),
      afterSource: cpSource(after),
      decisionOrdinals: g.ordinals,
      pools
    });
  });
  const clockWindows: RerollResourceFlow["clockWindows"] = [],
    byWindow = new Map<string, RerollResourceFlow["clockWindows"][number]>();
  intervals.forEach((interval, i) => {
    for (const p of interval.pools) {
      if (!p.decisionOrdinals.length) continue;
      const key = `${epochs[groups[i]!.before] ?? "missing"}:${p.gamerId}`;
      let w = byWindow.get(key);
      if (!w) {
        w = {
          id: clockWindows.length,
          clockSegment: epochs[groups[i]!.before] ?? null,
          startSnapshotId: null,
          endSnapshotId: null,
          gamerId: p.gamerId,
          teamId: p.teamId,
          intervalIds: [],
          decisionOrdinals: [],
          before: p.before,
          after: null,
          gameClockFieldsRecorded: false,
          unobservedCounterSnapshotIds: [],
          unqualifiedSnapshotIds: [],
          counterChanges: [],
          recordedUsedCount: 0,
          recordedNotUsedCount: 0,
          unknownUsageCount: 0,
          unresolvedCount: 0,
          netDecrease: null,
          status: "not_comparable",
          reason: null
        };
        clockWindows.push(w);
        byWindow.set(key, w);
      }
      if (w.teamId !== p.teamId) w.teamId = null;
      w.intervalIds.push(interval.id);
      w.decisionOrdinals.push(...p.decisionOrdinals);
      w.after = p.after;
      for (const k of [
        "recordedUsedCount",
        "recordedNotUsedCount",
        "unknownUsageCount",
        "unresolvedCount"
      ] as const)
        w[k] += p[k];
      if (p.reason !== null) w.reason ??= p.reason;
    }
  });
  const byRange = new Map(
    intervals.map((i) => [`${i.beforeSnapshotId}:${i.afterSnapshotId}`, i])
  );
  const bounds = segmentBounds(clockSnapshots);
  for (const w of clockWindows) {
    const trace = windowTrace(w, clockSnapshots, byRange, bounds, intervals);
    w.startSnapshotId = trace.startSnapshotId;
    w.endSnapshotId = trace.endSnapshotId;
    if (w.clockSegment !== null) {
      w.before = observe(
        trace.startSnapshotId === null
          ? undefined
          : clockSnapshots[trace.startSnapshotId],
        w.gamerId,
        w.teamId
      );
      w.after = observe(
        trace.endSnapshotId === null
          ? undefined
          : clockSnapshots[trace.endSnapshotId],
        w.gamerId,
        w.teamId
      );
    }
    w.unqualifiedSnapshotIds = trace.ids.filter(
      (id) => !observe(clockSnapshots[id], w.gamerId, w.teamId)
    );
    w.unobservedCounterSnapshotIds = trace.unobservedCounterSnapshotIds;
    w.counterChanges = trace.counterChanges;
    w.gameClockFieldsRecorded = trace.gameClockFieldsRecorded;
    const why =
      w.reason ??
      (trace.ids.some(
        (id) => clockSnapshots[id]!.clockSegment !== w.clockSegment
      )
        ? "clock_boundary"
        : w.unqualifiedSnapshotIds.length
          ? "owner_conflict"
          : trace.unobservedCounterSnapshotIds.length
            ? "missing_counter"
            : null);
    Object.assign(w, result(w.before, w.after, w.recordedUsedCount, why));
  }
  return {
    modelVersion: "observed-reroll-resource-flow-1",
    unindexedDecisionOrdinals,
    clockSnapshots,
    endNotifications,
    intervals,
    clockWindows
  };
}

export function validRerollResourceFlow(
  flow: RerollResourceFlow,
  links: readonly Link[],
  events: readonly LuckEvent[],
  teamIds: readonly string[]
): boolean {
  const byId = new Map(events.map((e) => [e.id, e])),
    raw = links.map(
      (d) => byId.get(d.decisionEventId)?.metadata.recordedRerollChoice
    );
  if (raw.some((c) => !c)) return false;
  const bySource = new Map(events.map((e) => [e.metadata.sourceId, e]));
  const endIds = new Set<string>();
  let lastEndIndex = -1;
  for (const n of flow.endNotifications) {
    if (n.sourceId !== null) {
      if (endIds.has(n.sourceId)) return false;
      endIds.add(n.sourceId);
    }
    if (n.sourceIndex !== null) {
      if (n.sourceIndex <= lastEndIndex) return false;
      lastEndIndex = n.sourceIndex;
    }
    const e = n.sourceId === null ? undefined : bySource.get(n.sourceId);
    if (
      e &&
      (e.metadata.sourceTag !== "EventEndTurn" ||
        (e.metadata.sourceIndex ?? null) !== n.sourceIndex ||
        (e.metadata.locator?.replayStep ?? null) !== n.replayStep ||
        (e.metadata.locator?.childIndex ?? null) !== n.childIndex)
    )
      return false;
  }
  const snapshots = flow.clockSnapshots,
    byLocator = new Map<
      string,
      RerollResourceFlow["clockSnapshots"][number][]
    >();
  const endIndex = resourceEndIndex(flow.endNotifications);
  let segment = 0,
    previousKey: string | undefined,
    previousAfter = -Infinity;
  for (const [id, s] of snapshots.entries()) {
    if (
      s.id !== id ||
      (s.identityStructureObserved &&
        (!s.clock ||
          s.rosterCount !== 2 ||
          new Set(s.playerIds.flat().filter((id) => id !== null)).size !==
            s.playerIds.flat().filter((id) => id !== null).length)) ||
      (id > 0 &&
        s.source.checkpointAfter < snapshots[id - 1]!.source.checkpointAfter)
    )
      return false;
    for (const [g, n] of s.poolNamespaces.entries()) {
      if (!n) continue;
      if (
        !s.identityStructureObserved ||
        !teamIds.includes(n.teamId) ||
        s.explicitTeamIds.some(
          (id, i) =>
            id !== null &&
            (!teamIds.includes(String(id)) ||
              (i !== g && String(id) === n.teamId))
        )
      )
        return false;
      if (n.basis === "explicit_team") {
        if (
          s.explicitTeamIds[g] === null ||
          String(s.explicitTeamIds[g]) !== n.teamId ||
          n.rosterAnchorPlayerId !== null
        )
          return false;
      } else {
        const id = Number(n.rosterAnchorPlayerId);
        if (
          s.explicitTeamIds[g] !== null ||
          !Number.isSafeInteger(id) ||
          n.rosterAnchorPlayerId !== String(id) ||
          s.playerIds[g]!.filter((p) => p === id).length !== 1 ||
          s.playerIds[1 - g]!.includes(id)
        )
          return false;
      }
    }
    if (
      s.poolNamespaces[0] &&
      s.poolNamespaces[0].teamId === s.poolNamespaces[1]?.teamId
    )
      return false;
    const key = snapshotEpochKey(s);
    if (
      key === undefined ||
      key !== previousKey ||
      endIndex.crosses(previousAfter, s.source.checkpointAfter)
    )
      segment++;
    previousAfter = s.source.checkpointAfter;
    previousKey = key;
    if (s.clockSegment !== segment) return false;
    const k = JSON.stringify([
      s.source.checkpointAfter,
      s.source.replayStep,
      s.source.childIndex
    ]);
    const values = byLocator.get(k) ?? [];
    values.push(s);
    byLocator.set(k, values);
  }
  const seen = new Set<number>(),
    windowKeys = new Set<string>(),
    intervalRanges = new Set<string>(),
    memberships = new Set<string>();
  const counts = (ordinals: readonly number[]) => ({
    recordedUsedCount: ordinals.filter((i) => raw[i]?.used === true).length,
    recordedNotUsedCount: ordinals.filter((i) => raw[i]?.used === false).length,
    unknownUsageCount: ordinals.filter((i) => raw[i]?.used === null).length,
    unresolvedCount: ordinals.filter((i) => links[i]?.status !== "linked")
      .length
  });
  const ordered = (xs: readonly number[]) =>
    xs.every(
      (n, i) => n >= 0 && n < links.length && (i === 0 || xs[i - 1]! < n)
    );
  const checkObs = (
    o: Observation | null,
    s: RerollResourceFlow["clockSnapshots"][number] | undefined,
    gamer: 0 | 1,
    teamId: string | null,
    ordinals: readonly number[]
  ) => {
    if (!o) return true;
    return (
      !!s &&
      s.identityStructureObserved &&
      o.rosterIndex === gamer &&
      o.teamId === teamId &&
      teamIds.includes(o.teamId) &&
      JSON.stringify(o.source) === JSON.stringify(s.source) &&
      o.count === s.counts[gamer] &&
      JSON.stringify(o.clock) === JSON.stringify(s.clock) &&
      JSON.stringify(o.explicitTeamIds) === JSON.stringify(s.explicitTeamIds) &&
      JSON.stringify(o.namespace) === JSON.stringify(s.poolNamespaces[gamer]) &&
      o.namespace.teamId === o.teamId &&
      ordinals.some(
        (i) => links[i]?.status === "linked" && links[i]?.teamId === o.teamId
      ) &&
      (o.explicitTeamIds[gamer] === null ||
        String(o.explicitTeamIds[gamer]) === o.teamId) &&
      o.explicitTeamIds.every(
        (id, i) =>
          id === null ||
          (teamIds.includes(String(id)) &&
            (i === gamer || String(id) !== o.teamId))
      )
    );
  };
  if (!ordered(flow.unindexedDecisionOrdinals)) return false;
  for (const i of flow.unindexedDecisionOrdinals) {
    if (
      !links[i] ||
      (links[i]!.sourceIndex !== null && !!links[i]!.decisionSourceId)
    )
      return false;
    seen.add(i);
  }
  for (const [id, interval] of flow.intervals.entries()) {
    const pre =
        interval.beforeSnapshotId === null
          ? undefined
          : snapshots[interval.beforeSnapshotId],
      post =
        interval.afterSnapshotId === null
          ? undefined
          : snapshots[interval.afterSnapshotId];
    const key = `${interval.beforeSnapshotId}:${interval.afterSnapshotId}`;
    if (
      interval.id !== id ||
      !ordered(interval.decisionOrdinals) ||
      intervalRanges.has(key) ||
      JSON.stringify(interval.beforeSource) !==
        JSON.stringify(pre?.source ?? null) ||
      JSON.stringify(interval.afterSource) !==
        JSON.stringify(post?.source ?? null) ||
      (interval.beforeSnapshotId !== null && !pre) ||
      (interval.afterSnapshotId !== null && !post) ||
      (pre && post && post.id !== pre.id + 1) ||
      (!pre && post && post.id !== 0) ||
      (pre && !post && pre.id !== snapshots.length - 1)
    )
      return false;
    intervalRanges.add(key);
    for (const i of interval.decisionOrdinals) {
      const d = links[i];
      if (
        seen.has(i) ||
        !d ||
        d.sourceIndex === null ||
        !d.decisionSourceId ||
        (pre && pre.source.checkpointAfter >= d.sourceIndex) ||
        (post && post.source.checkpointAfter < d.sourceIndex)
      )
        return false;
      seen.add(i);
    }
    for (const [g, p] of interval.pools.entries()) {
      const gamer = g as 0 | 1,
        ordinals = interval.decisionOrdinals.filter(
          (i) => raw[i]?.gamerId === gamer
        ),
        expected = counts(ordinals);
      if (
        p.gamerId !== gamer ||
        JSON.stringify(p.decisionOrdinals) !== JSON.stringify(ordinals) ||
        Object.entries(expected).some(
          ([k, v]) => p[k as keyof typeof expected] !== v
        ) ||
        !checkObs(p.before, pre, gamer, p.teamId, ordinals) ||
        !checkObs(p.after, post, gamer, p.teamId, ordinals)
      )
        return false;
      const r = result(p.before, p.after, p.recordedUsedCount, p.reason);
      if (
        p.status !== r.status ||
        p.reason !== r.reason ||
        p.netDecrease !== r.netDecrease ||
        (p.status !== "not_comparable" &&
          (!ordinals.length ||
            p.unresolvedCount ||
            p.unknownUsageCount ||
            flow.unindexedDecisionOrdinals.length ||
            raw.some((r) => r?.gamerId === null) ||
            endIndex.unknown ||
            pre?.clockSegment !== post?.clockSegment ||
            p.before?.clock.phaseCode !== 5 ||
            p.after?.clock.phaseCode !== 5))
      )
        return false;
    }
  }
  if (seen.size !== links.length) return false;
  for (const e of events) {
    const c = e.metadata.teamRerollCounter,
      g = e.metadata.teamRerollDecision?.gamerId;
    if (!c || g === undefined) continue;
    if (c.after) {
      const anchor = c.decisionBefore ?? c.before;
      const a =
        byLocator.get(
          JSON.stringify([
            anchor.checkpointAfter,
            anchor.replayStep,
            anchor.childIndex
          ])
        ) ?? [];
      const b =
        byLocator.get(
          JSON.stringify([
            c.after.checkpointAfter,
            c.after.replayStep,
            c.after.childIndex
          ])
        ) ?? [];
      if (
        endIndex.unknown ||
        !a.some((x) => b.some((y) => x.clockSegment === y.clockSegment))
      )
        return false;
    }
    for (const o of [c.before, c.decisionBefore, c.after]) {
      if (!o) continue;
      const candidates =
        byLocator.get(
          JSON.stringify([o.checkpointAfter, o.replayStep, o.childIndex])
        ) ?? [];
      if (
        !candidates.some(
          (s) =>
            s.counts[g] === o.count &&
            s.clock?.periodCode === o.periodCode &&
            s.clock.teamTurns[g] === o.teamTurn
        )
      )
        return false;
    }
  }
  const byRange = new Map(
    flow.intervals.map((i) => [`${i.beforeSnapshotId}:${i.afterSnapshotId}`, i])
  );
  const bounds = segmentBounds(snapshots);
  for (const [id, w] of flow.clockWindows.entries()) {
    const key = `${w.clockSegment}:${w.gamerId}`;
    if (
      w.id !== id ||
      windowKeys.has(key) ||
      !ordered(w.decisionOrdinals) ||
      w.intervalIds.some(
        (n, i) => !flow.intervals[n] || (i > 0 && w.intervalIds[i - 1]! >= n)
      )
    )
      return false;
    windowKeys.add(key);
    const ps = w.intervalIds.map((i) => flow.intervals[i]!.pools[w.gamerId]);
    if (
      ps.some((p) => !p.decisionOrdinals.length) ||
      w.teamId !==
        (ps.every((p) => p.teamId === ps[0]!.teamId) ? ps[0]!.teamId : null) ||
      w.intervalIds.some((i) => {
        const b = flow.intervals[i]!.beforeSnapshotId;
        return (
          (b === null ? null : snapshots[b]?.clockSegment) !== w.clockSegment
        );
      }) ||
      JSON.stringify(w.decisionOrdinals) !==
        JSON.stringify(ps.flatMap((p) => p.decisionOrdinals)) ||
      (w.clockSegment === null &&
        (JSON.stringify(w.before) !== JSON.stringify(ps[0]?.before) ||
          JSON.stringify(w.after) !== JSON.stringify(ps.at(-1)?.after)))
    )
      return false;
    for (const i of w.intervalIds) {
      const k = `${i}:${w.gamerId}`;
      if (memberships.has(k)) return false;
      memberships.add(k);
    }
    for (const k of [
      "recordedUsedCount",
      "recordedNotUsedCount",
      "unknownUsageCount",
      "unresolvedCount"
    ] as const)
      if (w[k] !== ps.reduce((n, p) => n + p[k], 0)) return false;
    const trace = windowTrace(w, snapshots, byRange, bounds, flow.intervals),
      range = new Set(trace.ids),
      unqualified = new Set(w.unqualifiedSnapshotIds);
    if (
      w.startSnapshotId !== trace.startSnapshotId ||
      w.endSnapshotId !== trace.endSnapshotId ||
      (w.clockSegment !== null &&
        (JSON.stringify(w.before) !==
          JSON.stringify(
            observe(
              trace.startSnapshotId === null
                ? undefined
                : snapshots[trace.startSnapshotId],
              w.gamerId,
              w.teamId
            )
          ) ||
          JSON.stringify(w.after) !==
            JSON.stringify(
              observe(
                trace.endSnapshotId === null
                  ? undefined
                  : snapshots[trace.endSnapshotId],
                w.gamerId,
                w.teamId
              )
            )))
    )
      return false;
    if (
      JSON.stringify(w.unobservedCounterSnapshotIds) !==
        JSON.stringify(trace.unobservedCounterSnapshotIds) ||
      JSON.stringify(w.counterChanges) !==
        JSON.stringify(trace.counterChanges) ||
      w.unqualifiedSnapshotIds.some(
        (n, i) =>
          !range.has(n) || (i > 0 && w.unqualifiedSnapshotIds[i - 1]! >= n)
      ) ||
      trace.ids.some(
        (n) => !snapshots[n]!.identityStructureObserved && !unqualified.has(n)
      )
    )
      return false;
    const why =
      ps.find((p) => p.reason !== null)?.reason ??
      (trace.ids.some((n) => snapshots[n]!.clockSegment !== w.clockSegment)
        ? "clock_boundary"
        : w.unqualifiedSnapshotIds.length
          ? "owner_conflict"
          : trace.unobservedCounterSnapshotIds.length
            ? "missing_counter"
            : null);
    const r = result(w.before, w.after, w.recordedUsedCount, why);
    if (
      w.status !== r.status ||
      w.reason !== r.reason ||
      w.netDecrease !== r.netDecrease ||
      w.gameClockFieldsRecorded !== trace.gameClockFieldsRecorded
    )
      return false;
  }
  return flow.intervals.every((i) =>
    i.pools.every(
      (p) =>
        !p.decisionOrdinals.length || memberships.has(`${i.id}:${p.gamerId}`)
    )
  );
}
