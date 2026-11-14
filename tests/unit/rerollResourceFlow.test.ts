import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import type { LuckReport } from "@/domain/nufflizer/types";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { explainResourceWindow } from "@/domain/nufflizer/presentation";

function jointInterval(count: number | null = 1, endReason?: number | null) {
  const xml = lonerDriveXml(
    "numeric_rush_spent",
    "tests/fixtures/evidence/bb3-reroll-counters.json",
    (records) => {
      const steps = records.flatMap((r) => r.steps ?? []),
        q = steps.find((s) =>
          s.messages.some((m) => "QuestionTeamRerollUsage" in m)
        )!,
        r = records.find((r) =>
          r.steps?.some((s) =>
            s.messages.some((m) => "ResultTeamRerollUsage" in m)
          )
        )!,
        c = r.steps!.find((s) =>
          s.messages.some((m) => "ResultTeamRerollUsage" in m)
        )!;
      const second = structuredClone(q),
        choice = structuredClone(c);
      const header = second.step.PlayerStep as Record<string, unknown>,
        firstHeader = c.step.PlayerStep as Record<string, unknown>;
      header.CellFrom = structuredClone(firstHeader.CellTo);
      const target = structuredClone(
        (firstHeader.CellTo as Record<string, string[]>[])[0]!
      );
      target.X = [String(Number(target.X![0]) + 1)];
      header.CellTo = [target];
      choice.step = structuredClone(second.step);
      (choice.step.PlayerStep as Record<string, unknown>).State = ["3"];
      choice.messages = choice.messages.filter(
        (m) => "ResultTeamRerollUsage" in m
      );
      // A second independently recorded offer/choice, not a replacement die.
      r.steps!.push(second, choice);
      if (endReason !== undefined)
        choice.messages.push({
          EventEndTurn:
            endReason === null ? {} : { Reason: [String(endReason)] }
        });
      for (const b of records.filter(
        (b) => b.replayStep >= r.replayStep && b.projection?.BoardState
      )) {
        const board = b.projection!.BoardState as Record<string, unknown>;
        const teams = (
          board.ListTeams as { TeamState: Record<string, unknown>[] }[]
        )[0]!.TeamState;
        if (count === null) delete teams[1]!.RerollNumber;
        else teams[1]!.RerollNumber = [String(count)];
      }
    }
  );
  const result = analyzeReplayLuck(parseReplayXml(xml));
  return result;
}

type Locator = {
  replayStep?: number | null;
  childIndex?: number | null;
  stepIndex?: number;
  messageIndex?: number;
  kind?: string;
};
type RawSnapshot = {
  locator: Locator;
  rosterCount: number;
  phaseCode: number | null;
  periodCode: number | null;
  activeTeamIndex: number | null;
  activeGamerId: number | null;
  teamTurns: [number | null, number | null];
  explicitTeamIds: [number | null, number | null];
  counts: [number | null, number | null];
  playerIds: (number | null)[][];
};
type RawChoice = {
  locator: Locator;
  gamerId: 0 | 1;
  used: 0 | 1;
  beforeSnapshotId: number | null;
  afterSnapshotId: number | null;
};
type File = {
  file: string;
  sha256: string;
  snapshots: RawSnapshot[];
  decisions: RawChoice[];
  endNotifications: {
    locator: Locator;
    reasonCode: number | null;
    beforeSnapshotId: number | null;
    afterSnapshotId: number | null;
  }[];
};
const evidence = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-reroll-resource-flow.json", "utf8")
) as { files: File[] };
const reports = new Map<string, LuckReport>();
const key = (l: Locator | undefined) =>
  JSON.stringify([l?.replayStep, l?.childIndex, l?.stepIndex, l?.messageIndex]);
beforeAll(() => {
  for (const f of evidence.files) {
    const bytes = readFileSync(`demo-replays/${f.file}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(f.sha256);
    const report = analyzeReplayLuck(
        parseReplayXml(decodeReplayInput(bytes.toString()).xml, {
          omitRawReplaySteps: true
        })
      ),
      v = LuckReportSchema.safeParse(report);
    expect(v.success, JSON.stringify(v.error?.issues.slice(0, 4))).toBe(true);
    reports.set(f.file, report);
  }
}, 90000);

describe("complete recorded reroll counter flow", () => {
  it("reproduces the source census before application support and retains omitted counters", () => {
    const r = spawnSync(
      "python3",
      ["scripts/extract-reroll-resource-flow-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(r.status, r.stderr).toBe(0);
    expect(evidence.files).toHaveLength(12);
    expect(evidence.files.reduce((n, f) => n + f.snapshots.length, 0)).toBe(
      6798
    );
    expect(evidence.files.reduce((n, f) => n + f.decisions.length, 0)).toBe(
      173
    );
  });
  it.each(evidence.files)(
    "joins all raw snapshots, intervals and choices in $file",
    (f) => {
      const r = reports.get(f.file)!,
        ledger = r.rerollResources,
        flow = ledger.flow;
      expect(flow.clockSnapshots).toHaveLength(f.snapshots.length);
      expect(
        flow.clockSnapshots.map((s) => ({
          locator: {
            kind: s.source.kind,
            replayStep: s.source.replayStep,
            childIndex: s.source.childIndex
          },
          rosterCount: s.rosterCount,
          phaseCode: s.clock?.phaseCode ?? null,
          periodCode: s.clock?.periodCode ?? null,
          activeTeamIndex: s.clock?.activeTeamIndex ?? null,
          activeGamerId: s.clock?.activeGamerId ?? null,
          teamTurns: s.clock?.teamTurns ?? [null, null],
          explicitTeamIds: s.explicitTeamIds,
          counts: s.counts,
          playerIds: s.playerIds
        }))
      ).toEqual(f.snapshots);
      expect(
        flow.endNotifications.map((e) => ({
          locator: { replayStep: e.replayStep, childIndex: e.childIndex },
          reasonCode: e.reasonCode
        }))
      ).toEqual(
        f.endNotifications.map((e) => ({
          locator: {
            replayStep: e.locator.replayStep,
            childIndex: e.locator.childIndex
          },
          reasonCode: e.reasonCode
        }))
      );
      const events = new Map(r.events.map((e) => [e.id, e]));
      expect(flow.unindexedDecisionOrdinals).toEqual([]);
      const covered = flow.intervals.flatMap((i) => i.decisionOrdinals);
      expect(covered).toEqual(f.decisions.map((_d, i) => i));
      let segment = 0,
        previous: string | undefined;
      for (const [id, s] of flow.clockSnapshots.entries()) {
        const raw = f.snapshots[id]!;
        const ids = raw.playerIds.flat().filter((n) => n !== null);
        if (s.identityStructureObserved) {
          expect(raw.rosterCount).toBe(2);
          expect(new Set(ids).size).toBe(ids.length);
        }
        const signature = s.identityStructureObserved
          ? JSON.stringify([
              raw.phaseCode,
              raw.periodCode,
              raw.activeTeamIndex,
              raw.teamTurns
            ])
          : undefined;
        if (
          signature === undefined ||
          signature !== previous ||
          f.endNotifications.some((e) => e.afterSnapshotId === id)
        )
          segment++;
        previous = signature;
        expect(s.clockSegment).toBe(segment);
        for (const [g, n] of s.poolNamespaces.entries()) {
          if (!n) continue;
          expect(["0", "1"]).toContain(n.teamId);
          if (n.basis === "explicit_team")
            expect(raw.explicitTeamIds[g]).toBe(Number(n.teamId));
          else {
            expect(raw.explicitTeamIds[g]).toBeNull();
            expect(raw.playerIds[g]).toContain(Number(n.rosterAnchorPlayerId));
            expect(raw.playerIds[1 - g]).not.toContain(
              Number(n.rosterAnchorPlayerId)
            );
          }
        }
      }
      for (const interval of flow.intervals) {
        for (const ordinal of interval.decisionOrdinals) {
          const source = f.decisions[ordinal]!,
            d = ledger.decisions[ordinal]!,
            e = events.get(d.decisionEventId)!;
          expect(key(e.metadata.locator)).toBe(key(source.locator));
          expect(interval.beforeSnapshotId).toBe(source.beforeSnapshotId);
          expect(interval.afterSnapshotId).toBe(source.afterSnapshotId);
        }
        for (const pool of interval.pools) {
          const ords = interval.decisionOrdinals.filter(
            (i) => f.decisions[i]!.gamerId === pool.gamerId
          );
          expect(pool.decisionOrdinals).toEqual(ords);
          expect(pool.recordedUsedCount).toBe(
            ords.filter((i) => f.decisions[i]!.used === 1).length
          );
          expect(pool.recordedNotUsedCount).toBe(
            ords.filter((i) => f.decisions[i]!.used === 0).length
          );
          for (const [o, id] of [
            [pool.before, interval.beforeSnapshotId],
            [pool.after, interval.afterSnapshotId]
          ] as const) {
            if (!o) continue;
            expect(id).not.toBeNull();
            expect(o.count).toBe(f.snapshots[id!]!.counts[pool.gamerId]);
          }
        }
      }
      const memberships = new Set<string>();
      for (const w of flow.clockWindows) {
        const ords = w.intervalIds.flatMap(
          (id) => flow.intervals[id]!.pools[w.gamerId].decisionOrdinals
        );
        expect(w.decisionOrdinals).toEqual(ords);
        expect(w.recordedUsedCount).toBe(
          ords.filter((i) => f.decisions[i]!.used === 1).length
        );
        for (const id of w.intervalIds) {
          const k = `${id}:${w.gamerId}`;
          expect(memberships.has(k)).toBe(false);
          memberships.add(k);
        }
        const all = flow.clockSnapshots.filter(
          (s) => s.clockSegment === w.clockSegment
        );
        const successor =
          flow.intervals[w.intervalIds.at(-1)!]!.afterSnapshotId;
        const end = Math.max(all.at(-1)?.id ?? -1, successor ?? -1);
        if (all.length)
          for (let n = all.at(-1)!.id + 1; n <= end; n++)
            all.push(flow.clockSnapshots[n]!);
        expect(w.startSnapshotId).toBe(all[0]?.id ?? null);
        expect(w.endSnapshotId).toBe(all.at(-1)?.id ?? null);
        expect(w.unobservedCounterSnapshotIds).toEqual(
          all.filter((s) => s.counts[w.gamerId] === null).map((s) => s.id)
        );
        const changes = [];
        for (let i = 1; i < all.length; i++) {
          const a = all[i - 1]!,
            b = all[i]!,
            from = f.snapshots[a.id]!.counts[w.gamerId],
            to = f.snapshots[b.id]!.counts[w.gamerId];
          if (from === to) continue;
          changes.push({
            fromSnapshotId: a.id,
            toSnapshotId: b.id,
            netDecrease: from === null || to === null ? null : from - to,
            decisionOrdinals: f.decisions.flatMap((d, i) =>
              d.gamerId === w.gamerId &&
              d.beforeSnapshotId === a.id &&
              d.afterSnapshotId === b.id
                ? [i]
                : []
            )
          });
        }
        expect(w.counterChanges).toEqual(changes);
        if (w.status !== "not_comparable")
          expect(w.status === "observed_agreement").toBe(
            w.netDecrease === w.recordedUsedCount
          );
      }
      expect(r.verdict.luckierTeam).toBe("unknown");
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    }
  );
  it.each([
    ["demo1.bbr", 134, 135, 1, 4, 2, false],
    ["demo11.bbr", 422, 430, 1, 3, 1, false],
    ["demo3.bbr", 401, 411, 0, 4, 2, false],
    ["demo4.bbr", 412, 416, 1, 4, 2, true],
    ["demo6.bbr", 450, 460, 0, 3, 1, false],
    ["demo7.bbr", 90, 101, 1, 3, 1, false]
  ] as const)(
    "accounts for both recorded uses in %s at %s/%s",
    (file, first, last, gamer, start, end, knownClock) => {
      const f = evidence.files.find((f) => f.file === file)!,
        r = reports.get(file)!,
        ords = f.decisions.flatMap((d, i) =>
          d.locator.replayStep === first || d.locator.replayStep === last
            ? [i]
            : []
        );
      expect(ords).toHaveLength(2);
      const w = r.rerollResources.flow.clockWindows.find((w) =>
        ords.every((i) => w.decisionOrdinals.includes(i))
      )!;
      expect(w).toBeDefined();
      expect(w).toMatchObject({
        gamerId: gamer,
        teamId: String(gamer),
        recordedUsedCount: 2,
        before: { count: start },
        after: { count: end },
        netDecrease: 2,
        status:
          file === "demo11.bbr" || file === "demo3.bbr"
            ? "not_comparable"
            : "observed_agreement",
        reason:
          file === "demo11.bbr" || file === "demo3.bbr"
            ? "clock_boundary"
            : null,
        gameClockFieldsRecorded: knownClock
      });
      if (gamer === 0) {
        expect(w.before!.explicitTeamIds[0]).toBeNull();
        expect(w.before!.namespace.basis).toBe("owned_roster");
        expect(w.before!.clock.activeTeamIndex).toBeNull();
        expect(w.before!.clock.activeGamerId).toBeNull();
      }
    }
  );
  it.each([
    ["demo11.bbr", 454, 465],
    ["demo8.bbr", 31, 45]
  ] as const)(
    "keeps the last omitted counter unknown in %s",
    (file, first, last) => {
      const f = evidence.files.find((f) => f.file === file)!,
        r = reports.get(file)!,
        ords = f.decisions.flatMap((d, i) =>
          d.locator.replayStep === first || d.locator.replayStep === last
            ? [i]
            : []
        );
      const w = r.rerollResources.flow.clockWindows.find((w) =>
        ords.every((i) => w.decisionOrdinals.includes(i))
      )!;
      expect(w).toMatchObject({
        recordedUsedCount: 2,
        before: { count: 2 },
        after: { count: null },
        netDecrease: null,
        status: "not_comparable",
        reason: "clock_boundary"
      });
      expect(w.unobservedCounterSnapshotIds.length).toBeGreaterThan(0);
    }
  );
  it("preserves the known1→3 reset endpoints without reconciling one use", () => {
    const f = evidence.files.find((f) => f.file === "demo3.bbr")!,
      r = reports.get(f.file)!,
      i = f.decisions.findIndex((d) => d.locator.replayStep === 294);
    expect(i).toBeGreaterThanOrEqual(0);
    const interval = r.rerollResources.flow.intervals.find((x) =>
        x.decisionOrdinals.includes(i)
      )!,
      p = interval.pools[1];
    expect(p).toMatchObject({
      recordedUsedCount: 1,
      before: { count: 1, clock: { phaseCode: 5, periodCode: null } },
      after: { count: 3, clock: { phaseCode: 3, periodCode: 1 } },
      netDecrease: -2,
      status: "not_comparable",
      reason: "clock_boundary"
    });
  });
  it("reconciles two recorded uses once in a shared3→1 interval", () => {
    const r = jointInterval(),
      flow = r.rerollResources.flow;
    {
      const v = LuckReportSchema.safeParse(r);
      expect(v.success, JSON.stringify(v.error?.issues.slice(0, 3))).toBe(true);
    }
    expect(r.rerollResources).toMatchObject({
      decisionCount: 2,
      linkedCount: 2,
      recordedUsedCount: 2
    });
    const first = r.events.find(
      (e) => e.metadata.numericOriginal && e.metadata.rerollOffer
    )!;
    expect(first.scoringStatus).toBe("scored");
    expect(first.delta).toBeCloseTo(-5 / 6, 12);
    expect(first.label).not.toBe("Recorded team reroll offer");
    expect(first.statusReason).not.toContain("with its replacement");
    expect(flow.intervals).toHaveLength(1);
    expect(flow.intervals[0]!.pools[1]).toMatchObject({
      decisionOrdinals: [0, 1],
      recordedUsedCount: 2,
      before: { count: 3 },
      after: { count: 1 },
      netDecrease: 2,
      status: "observed_agreement"
    });
    expect(flow.clockWindows).toHaveLength(1);
    expect(flow.clockWindows[0]).toMatchObject({
      recordedUsedCount: 2,
      netDecrease: 2,
      status: "observed_agreement"
    });
    expect(
      r.events.filter((e) => e.metadata.teamRerollCounter?.after)
    ).toHaveLength(0);
    expect(explainResourceWindow(flow.clockWindows[0]!, r.teams)).toContain(
      "2 recorded uses"
    );
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
  });
  it.each([0, null, 4])(
    "keeps explicit/omitted/granted counter %s without inferring price",
    (count) => {
      const r = jointInterval(count),
        p = r.rerollResources.flow.intervals[0]!.pools[1];
      {
        const v = LuckReportSchema.safeParse(r);
        expect(v.success, JSON.stringify(v.error?.issues.slice(0, 3))).toBe(
          true
        );
      }
      expect(p.after?.count).toBe(count);
      expect(p.netDecrease).toBe(count === null ? null : 3 - count);
      expect(p.status).toBe(
        count === null ? "not_comparable" : "observed_difference"
      );
    }
  );
  it.each([0, 1, 2, null])(
    "preserves raw end reason %s and breaks continuity despite repeated clocks",
    (endReason) => {
      const r = jointInterval(1, endReason),
        f = r.rerollResources.flow;
      {
        const v = LuckReportSchema.safeParse(r);
        expect(v.success, JSON.stringify(v.error?.issues.slice(0, 3))).toBe(
          true
        );
      }
      expect(f.endNotifications).toHaveLength(1);
      expect(f.endNotifications[0]?.reasonCode).toBe(endReason);
      expect(f.intervals[0]!.pools[1]).toMatchObject({
        before: { count: 3 },
        after: { count: 1 },
        netDecrease: 2,
        status: "not_comparable",
        reason: "clock_boundary"
      });
      expect(
        r.events.filter((e) => e.metadata.teamRerollCounter?.after)
      ).toHaveLength(0);
    }
  );
  it.each([
    [
      "duplicate choice",
      (r: LuckReport) => {
        r.rerollResources.flow.intervals[0]!.decisionOrdinals.push(0);
      }
    ],
    [
      "duplicate window",
      (r: LuckReport) => {
        r.rerollResources.flow.clockWindows.push(
          structuredClone(r.rerollResources.flow.clockWindows[0]!)
        );
      }
    ],
    [
      "split interval",
      (r: LuckReport) => {
        r.rerollResources.flow.intervals.push(
          structuredClone(r.rerollResources.flow.intervals[0]!)
        );
      }
    ],
    [
      "altered uses",
      (r: LuckReport) => {
        r.rerollResources.flow.clockWindows[0]!.recordedUsedCount = 1;
      }
    ],
    [
      "altered counter",
      (r: LuckReport) => {
        r.rerollResources.flow.intervals[0]!.pools[1].after!.count = 0;
      }
    ],
    [
      "false agreement",
      (r: LuckReport) => {
        r.rerollResources.flow.clockWindows[0]!.netDecrease = 1;
      }
    ],
    [
      "missing change",
      (r: LuckReport) => {
        r.rerollResources.flow.clockWindows[0]!.counterChanges = [];
      }
    ],
    [
      "shortened window",
      (r: LuckReport) => {
        r.rerollResources.flow.clockWindows[0]!.endSnapshotId =
          r.rerollResources.flow.clockWindows[0]!.startSnapshotId;
      }
    ],
    [
      "altered source",
      (r: LuckReport) => {
        r.rerollResources.flow.intervals[0]!.beforeSource!.childIndex = 999;
      }
    ],
    [
      "altered namespace",
      (r: LuckReport) => {
        r.rerollResources.flow.intervals[0]!.pools[1].before!.namespace.teamId =
          "0";
      }
    ],
    [
      "altered clock",
      (r: LuckReport) => {
        r.rerollResources.flow.intervals[0]!.pools[1].after!.clock.periodCode = 2;
      }
    ],
    [
      "altered segment",
      (r: LuckReport) => {
        r.rerollResources.flow.clockSnapshots.at(-1)!.clockSegment = 999;
      }
    ]
  ] as const)("rejects public report forgery: %s", (_label, mutate) => {
    const r = jointInterval();
    mutate(r);
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
