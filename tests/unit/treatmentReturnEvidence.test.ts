import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import type { ReplayBoardCheckpoint } from "@/domain/replay/boardState";

type Locator = {
  replayStep?: number | null;
  childIndex?: number | null;
  stepIndex?: number;
  messageIndex?: number;
};
type Snapshot = {
  locator: Locator;
  phase: number | null;
  stable: number | null;
  activeGamerId: number | null;
  periodCode: number | null;
  teamTurns: (number | null)[];
  teams: {
    rosterIndex: number;
    teamId: number | null;
    playerIds: (number | null)[];
  }[];
  members: {
    rosterIndex: number;
    id: number | null;
    dataId: number | null;
    dataTeamId: number | null;
    playerTypeId: number | null;
    cell: { x: number | null; y: number | null };
    statusCode: number | null;
    situationCode: number | null;
    canAct: number | null;
    tackleZone: number | null;
  }[];
};
type Case = {
  file: string;
  sha256: string;
  treatmentLocator: Locator;
  reserveLocator: Locator;
  subjectId: number;
  reserve: Snapshot;
  setup: Snapshot | null;
  playing: Snapshot | null;
  declaration: null | {
    locator: Locator;
    before: Snapshot;
    step: Record<string, unknown>;
    message: Record<string, unknown>;
  };
  eventFingerprint: { count: number; sha256: string };
  boardFingerprint: { count: number; sha256: string };
};
const evidence = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-treatment-returns.json", "utf8")
) as { cases: Case[] };
const attrs = [
  "PlayerId",
  "TargetId",
  "AttackerId",
  "DefenderId",
  "Skill",
  "Effect",
  "Used",
  "IsEvaluation",
  "StepType",
  "Source",
  "GamerId",
  "RollType",
  "RollStatus",
  "Status",
  "Action",
  "TeamId",
  "MercenaryId",
  "MercenaryType",
  "HolderType",
  "Reason",
  "FinishingTurnType",
  "NewActiveGamer",
  "NextPlayingGamer",
  "Phase",
  "ActiveGamer"
];
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, canonical(x)])
    );
  return v;
}
const digest = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(v)))
    .digest("hex");
const rank = (l: Locator) => [
  l.replayStep ?? -1,
  l.childIndex ?? -1,
  l.stepIndex ?? -1,
  l.messageIndex ?? -1
];
function compare(a: Locator, b: Locator) {
  const x = rank(a),
    y = rank(b);
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
}
const integer = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v)
    ? v
    : typeof v === "string" &&
        /^-?\d+$/.test(v) &&
        Number.isSafeInteger(Number(v))
      ? Number(v)
      : null;
function observation(cp: ReplayBoardCheckpoint, subject: number): Snapshot {
  const b = cp.board!;
  return {
    locator: { replayStep: cp.replayStep, childIndex: cp.childIndex },
    phase: b.phaseCode,
    stable: b.stable === null ? null : Number(b.stable),
    activeGamerId: b.activeGamerId,
    periodCode: b.periodCode,
    teamTurns: b.teams.map((t) => t.gameTurn),
    teams: b.teams.map((t) => ({
      rosterIndex: t.rosterIndex,
      teamId: t.explicitTeamId,
      playerIds: t.players.map((p) => p.id)
    })),
    members: b.teams.flatMap((t) =>
      t.players
        .filter((p) => p.id === subject)
        .map((p) => ({
          rosterIndex: t.rosterIndex,
          id: p.id,
          dataId: p.traitsDataPlayerId ?? null,
          dataTeamId: p.traitsDataTeamId ?? null,
          playerTypeId: p.traitsPlayerTypeId ?? null,
          cell: p.cell,
          statusCode: p.statusCode,
          situationCode: p.situationCode,
          canAct: p.canAct === null ? null : Number(p.canAct),
          tackleZone: p.tackleZone === null ? null : Number(p.tackleZone)
        }))
    )
  };
}
describe("independent raw treated-player return evidence", () => {
  it("reproduces three raw treatment prefixes without using the application admission policy", () => {
    const result = spawnSync(
      "python3",
      ["scripts/extract-treatment-return-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(evidence.cases).toHaveLength(3);
    expect(evidence.cases.filter((c) => c.setup)).toHaveLength(3);
  });
  it.each(["demo1.bbr", "demo3.bbr"])(
    "joins every ordered continuity event and roster/player board in %s",
    (file) => {
      const bytes = readFileSync(`demo-replays/${file}`),
        replay = parseReplayXml(decodeReplayInput(bytes.toString("utf8")).xml, {
          omitRawReplaySteps: true
        }),
        r = LuckReportSchema.parse(analyzeReplayLuck(replay));
      const raw = replay.turns.flatMap((t) => t.events);
      for (const c of evidence.cases.filter((c) => c.file === file)) {
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(c.sha256);
        const end = c.declaration?.locator;
        const events = raw
          .filter(
            (e) =>
              e.locator &&
              e.sourceTag !== "Carrier" &&
              compare(e.locator, c.reserveLocator) > 0 &&
              (!end || compare(e.locator, end) <= 0)
          )
          .map((e) => ({
            locator: {
              replayStep: e.locator!.replayStep,
              childIndex: e.locator!.childIndex,
              ...(e.locator!.stepIndex === undefined
                ? {}
                : { stepIndex: e.locator!.stepIndex }),
              ...(e.locator!.messageIndex === undefined
                ? {}
                : { messageIndex: e.locator!.messageIndex })
            },
            tag: e.sourceTag,
            fields: Object.keys(e.payload ?? {}).sort(),
            integers: Object.fromEntries(
              attrs.flatMap((k) => {
                const n = integer(e.payload?.[k]);
                return n === null ? [] : [[k, n]];
              })
            )
          }));
        expect(events.length).toBe(c.eventFingerprint.count);
        expect(digest(events)).toBe(c.eventFingerprint.sha256);
        const boards = replay
          .boardCheckpoints!.filter(
            (cp) =>
              compare(cp, c.reserveLocator) > 0 &&
              (!end || compare(cp, end) < 0)
          )
          .map((cp) => observation(cp, c.subjectId));
        expect(boards.length).toBe(c.boardFingerprint.count);
        expect(digest(boards)).toBe(c.boardFingerprint.sha256);
        for (const observed of [
          c.reserve,
          c.setup,
          c.playing,
          c.declaration?.before
        ])
          if (observed) {
            const cp = replay.boardCheckpoints!.find(
              (cp) => compare(cp, observed.locator) === 0
            )!;
            expect(observation(cp, c.subjectId)).toEqual(observed);
          }
        const e = r.events.find(
            (e) =>
              e.metadata.locator &&
              compare(e.metadata.locator, c.treatmentLocator) === 0
          )!,
          trace = e.metadata.treatmentReturn;
        expect(Number(e.playerId)).toBe(c.subjectId);
        expect(e.weightedDelta).toBe(0);
        expect(trace).toBeDefined();
        if (c.subjectId === 45) {
          expect(trace).toEqual({
            status: "unverified",
            stop: { reason: "identity_transition", sourceIndex: 2466 }
          });
        } else {
          expect(trace!.status).toBe("observed");
          if (trace?.status !== "observed")
            throw new Error("Missing qualified treatment return");
          for (const [actual, observed] of [
            [trace!.setup, c.setup],
            [trace!.playing, c.playing],
            [trace!.activation?.before, c.declaration?.before]
          ] as [object | undefined, Snapshot | null | undefined][]) {
            expect(actual).toBeDefined();
            const m = observed!.members[0]!;
            expect(actual).toMatchObject({
              replayStep: observed!.locator.replayStep,
              childIndex: observed!.locator.childIndex,
              phase: observed!.phase,
              rosterIndex: m.rosterIndex,
              cell: m.cell,
              statusCode: m.statusCode,
              situationCode: m.situationCode,
              canAct: m.canAct === null ? null : m.canAct === 1,
              tackleZone: m.tackleZone === null ? null : m.tackleZone === 1,
              activeGamerId: observed!.activeGamerId,
              periodCode: observed!.periodCode,
              teamTurn: observed!.teamTurns[m.rosterIndex]
            });
          }
          expect(trace!.stop).toBeUndefined();
          expect(trace!.activation?.sourceId).toBe(
            c.subjectId === 37 ? "source-5397" : "source-4175"
          );
          if (c.subjectId === 37)
            expect(trace!.activation!.budget).toEqual({
              actionCode: 4,
              kind: "pass",
              headerState: 3,
              headerTargetId: -1,
              headerCellFrom: { x: 13, y: 7 },
              headerCellTo: { x: 13, y: 8 }
            });
          else expect(trace!.activation!.budget).toBeUndefined();
          const use = r.events.find(
            (e) => e.metadata.sourceId === trace!.activation!.sourceId
          )!;
          expect(compare(use.metadata.locator!, c.declaration!.locator)).toBe(
            0
          );
          expect(use.metadata).toHaveProperty(
            "treatmentReturnActivation.treatmentSourceId",
            e.metadata.sourceId
          );
          expect(use.scoringStatus).toBe("excluded");
          expect(use.weightedDelta).toBe(0);
        }
      }
    }
  );
});
