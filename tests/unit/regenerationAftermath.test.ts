import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainRegenerationAftermath } from "@/domain/nufflizer/presentation";
import { regenerationStateXml } from "../helpers/regenerationState";
const parse = (o: Parameters<typeof regenerationStateXml>[0] = {}) =>
  parseReplayXml(regenerationStateXml(o));
const analyze = (r: ReturnType<typeof parse>) =>
  LuckReportSchema.parse(analyzeReplayLuck(r));
const report = (o: Parameters<typeof regenerationStateXml>[0] = {}) =>
  analyze(parse(o));
const regen = (r: ReturnType<typeof report>) =>
  r.events.find((e) => e.metadata.damage?.regeneration)!;
describe("first observed Regeneration aftermath", () => {
  it.each([1, 2, 3, 4, 5, 6])(
    "retains the initial removal and observes the independent die%s recovery state",
    (die) => {
      const r = report({ die }),
        e = regen(r),
        a = e.metadata.regenerationAftermath!;
      expect(a).toBeDefined();
      expect(e.weightedDelta).toBe(die >= 4 ? 3 / 4 : -3 / 4);
      expect(e.probabilitySuccess).toBe(1 / 2);
      expect(a.observation).toEqual({
        cell: { x: -1, y: -1 },
        situationCode: die >= 4 ? 1 : 4,
        statusCode: die >= 4 ? null : 4,
        canAct: null,
        tackleZone: null
      });
      const removal = r.events.find(
        (x) =>
          x.metadata.sourceId ===
          e.metadata.damage!.regeneration!.initialRemovalSourceId
      )!;
      expect(removal.metadata.sourceTag).toBe("ResultPlayerRemoval");
      expect(removal.weightedDelta).toBe(0);
      expect(r.events.filter((x) => x.scoringStatus === "scored")).toHaveLength(
        2
      ); // Armor and existing recovery only.
      expect(r.damageSteps[0]!.scoredRolls).toBe(2);
      expect(r.verdict.luckierTeam).toBe("unknown");
      const text = explainRegenerationAftermath(e)!;
      expect(text).toContain(die >= 4 ? "in reserves" : "in the injured box");
      expect(text).toContain("availability flag; it stays unknown");
      expect(text).toContain("No extra luck score");
    }
  );
  it.each([false, true])(
    "supports the exact end/control bridge=%s without making it another chance event",
    (turnBridge) => {
      const r = report({ turnBridge }),
        e = regen(r),
        a = e.metadata.regenerationAftermath!;
      expect(a.controlSourceIds).toHaveLength(turnBridge ? 5 : 1);
      const controls = r.events.filter((x) =>
        a.controlSourceIds.includes(x.metadata.sourceId!)
      );
      expect(controls.map((c) => c.metadata.recoveryControl!.kind)).toEqual(
        turnBridge ? ["end", "gamer", "pause", "timer", "standby"] : ["standby"]
      );
      expect(
        controls.every(
          (c) =>
            c.scoringStatus === "excluded" &&
            !c.metadata.isRollCandidate &&
            c.weightedDelta === 0
        )
      ).toBe(true);
    }
  );
  it("retains an omitted controller and later suffix without inventing availability", () => {
    const e = regen(report({ missingGamer: true })),
      r = report({ missingGamer: true, future: "<UnknownFutureChange/>" });
    expect(regen(r).metadata.regenerationAftermath).toEqual(
      e.metadata.regenerationAftermath
    );
    const bridge = r.events.find((x) => x.metadata.recoveryControl)!;
    expect(bridge.metadata.recoveryControl).toEqual({
      kind: "standby",
      phase: 5,
      gamerId: null
    });
  });
  it.each([
    "unstable",
    "phase",
    "missing_player",
    "duplicate_player",
    "owner",
    "data_identity",
    "position",
    "situation",
    "status",
    "checkpoint",
    "control_phase",
    "unknown_control",
    "gamer_conflict",
    "timer_field"
  ])(
    "withholds a mismatched %s first observation while retaining the original dice",
    (kind) => {
      const replay = parse({
          turnBridge: ["gamer_conflict", "timer_field"].includes(kind)
        }),
        cp = replay.boardCheckpoints!.at(-1)!,
        p = cp.board!.teams[0]!.players[0]!;
      const events = replay.turns.flatMap((t) => t.events),
        standby = events.find(
          (e) => e.sourceTag === "EventRulesEngineStandBy"
        )!;
      if (kind === "unstable") cp.board!.stable = false;
      if (kind === "phase") cp.board!.phaseCode = 3;
      if (kind === "missing_player") cp.board!.teams[0]!.players = [];
      if (kind === "duplicate_player")
        cp.board!.teams[1]!.players.push(structuredClone(p));
      if (kind === "owner") cp.board!.teams[0]!.explicitTeamId = 1;
      if (kind === "data_identity") p.traitsDataPlayerId = 99;
      if (kind === "position") p.cell = { x: 4, y: 5 };
      if (kind === "situation") p.situationCode = 4;
      if (kind === "status") p.statusCode = 4;
      if (kind === "checkpoint") cp.childIndex!++;
      if (kind === "control_phase") standby.payload!.Phase = "3";
      if (kind === "unknown_control") standby.payload!.UnknownReEntry = 1;
      if (kind === "gamer_conflict")
        events.find(
          (e) => e.sourceTag === "EventActiveGamerChanged"
        )!.payload!.NewActiveGamer = "0";
      if (kind === "timer_field")
        (
          events.find((e) => e.sourceTag === "EventActiveTimerChanged")!
            .payload!.NewTimer as Record<string, unknown>
        ).Unknown = 1;
      const e = regen(analyze(replay));
      expect(e.metadata.regenerationAftermath).toBeUndefined();
      expect(e.weightedDelta).toBe(3 / 4);
    }
  );
  it("does not search past a missing first observation for a convenient later board", () => {
    const replay = parse(),
      first = replay.boardCheckpoints!.at(-1)!,
      later = structuredClone(first);
    first.board!.teams[0]!.players = [];
    later.childIndex!++;
    replay.boardCheckpoints!.push(later);
    expect(
      regen(analyze(replay)).metadata.regenerationAftermath
    ).toBeUndefined();
  });
  it("does not let a later same-index changed roster revoke the first observation", () => {
    const replay = parse(),
      first = structuredClone(
        regen(analyze(replay)).metadata.regenerationAftermath
      ),
      later = structuredClone(replay.boardCheckpoints!.at(-1)!);
    later.childIndex!++;
    later.board!.teams[0]!.players = [];
    replay.boardCheckpoints!.push(later);
    expect(regen(analyze(replay)).metadata.regenerationAftermath).toEqual(
      first
    );
  });
  it.each([
    "<UnknownRecoveryReaction/>",
    "<EventRulesEngineStandBy><Phase>3</Phase></EventRulesEngineStandBy>"
  ])(
    "does not cross an unknown or changed phase before the first snapshot %s",
    (gap) => {
      const e = regen(report({ gap }));
      expect(e.metadata.regenerationAftermath).toBeUndefined();
      expect(e.weightedDelta).toBe(3 / 4);
    }
  );
  it("copies explicit raw flags without granting a legal off-pitch activation", () => {
    const replay = parse(),
      p = replay.boardCheckpoints!.at(-1)!.board!.teams[0]!.players[0]!;
    p.canAct = true;
    p.tackleZone = true;
    p.statusCode = 0;
    const e = regen(analyze(replay));
    expect(e.metadata.regenerationAftermath!.observation).toMatchObject({
      canAct: true,
      tackleZone: true,
      statusCode: 0
    });
    expect(explainRegenerationAftermath(e)).toContain(
      "does not establish a legal activation"
    );
  });
  it.each([
    "checkpoint",
    "before",
    "child",
    "control_source",
    "control_type",
    "controller",
    "situation",
    "status",
    "control_score"
  ])("rejects forged public %s joins", (field) => {
    const r = report({ turnBridge: true }),
      e = regen(r),
      a = e.metadata.regenerationAftermath!,
      control = r.events.find(
        (x) => x.metadata.sourceId === a.controlSourceIds[0]
      )!;
    if (field === "checkpoint") a.checkpointAfter++;
    if (field === "before") a.beforeCheckpointAfter = e.metadata.sourceIndex!;
    if (field === "child") a.childIndex++;
    if (field === "control_source")
      a.controlSourceIds[0] = e.metadata.sourceId!;
    if (field === "control_type")
      control.metadata.recoveryControl = { kind: "pause" };
    if (
      field === "controller" &&
      control.metadata.recoveryControl!.kind === "end"
    )
      control.metadata.recoveryControl!.gamerId = 0;
    if (field === "situation") a.observation.situationCode = 4;
    if (field === "status") a.observation.statusCode = 4;
    if (field === "control_score") control.weightedDelta = 1;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    ["demo10.bbr", [444, 1012]],
    ["demo4.bbr", [1425]],
    ["demo7.bbr", [1746]],
    ["demo9.bbr", [1573, 3894, 4576]]
  ] as const)(
    "joins every supported full-source %s aftermath without new scored dice",
    (file, ids) => {
      const r = analyze(
        parseReplayXml(
          decodeReplayInput(readFileSync(`demo-replays/${file}`, "utf8")).xml,
          { omitRawReplaySteps: true }
        )
      );
      expect(
        r.events
          .filter((e) => e.metadata.regenerationAftermath)
          .map((e) => e.metadata.sourceIndex)
      ).toEqual([...ids]);
      for (const e of r.events.filter((e) => e.metadata.regenerationAftermath))
        expect(e.metadata.regenerationAftermath!.observation.canAct).toBeNull();
    }
  );
});

type Projection = { [key: string]: (string | Projection)[] };
type Snapshot = {
  locator: { replayStep: number | null; childIndex: number | null };
  phase: number;
  stable: number;
  activeGamer: number | null;
  teams: {
    rosterIndex: number;
    teamId: number | null;
    playerIds: (number | null)[];
  }[];
  members: { rosterIndex: number; player: Projection }[];
};
const evidence = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-regeneration-states.json", "utf8")
) as {
  rule: { threshold: number; fairSuccessfulFaces: number; totalFaces: number };
  cases: {
    file: string;
    sha256: string;
    rollLocator: {
      replayStep: number;
      childIndex: number;
      stepIndex: number;
      messageIndex: number;
    };
    before: Snapshot;
    after: Snapshot;
    controls: { childIndex: number; tag: string; payload: Projection }[];
    messages: { messageIndex: number; tag: string; payload: Projection }[];
  }[];
};
const n = (p: Projection, k: string) => (p[k] ? Number(p[k]![0]) : null);
const flag = (p: Projection, k: string) =>
  n(p, k) === null ? null : n(p, k) === 1;
describe("independent recovery-state observations", () => {
  it("reproduces seven source chains and the independent 3-of-6 recovery rule", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "python3",
      ["scripts/extract-regeneration-state-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(evidence.cases).toHaveLength(7);
    expect(evidence.rule).toMatchObject({
      threshold: 4,
      fairSuccessfulFaces: 3,
      totalFaces: 6
    });
  });
  it.each([...new Set(evidence.cases.map((c) => c.file))])(
    "joins %s raw roster/state/controls with omitted flags preserved",
    async (file) => {
      const { createHash } = await import("node:crypto");
      const bytes = readFileSync(`demo-replays/${file}`),
        replay = parseReplayXml(decodeReplayInput(bytes.toString()).xml, {
          omitRawReplaySteps: true
        }),
        r = analyze(replay);
      for (const c of evidence.cases.filter((c) => c.file === file)) {
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(c.sha256);
        const e = r.events.find(
            (e) =>
              JSON.stringify(e.metadata.locator) ===
              JSON.stringify(c.rollLocator)
          )!,
          a = e.metadata.regenerationAftermath!;
        expect(a).toBeDefined();
        const p = c.after.members[0]!.player,
          cell = p.Cell![0] as Projection;
        expect(c.after.members).toHaveLength(1);
        expect(c.before.members).toHaveLength(1);
        expect(c.after.members[0]!.rosterIndex).toBe(
          c.before.members[0]!.rosterIndex
        );
        expect(a.rosterIndex).toBe(c.after.members[0]!.rosterIndex);
        expect(n(p, "Id")).toBe(Number(e.playerId));
        expect(
          c.after.teams
            .flatMap((t) => t.playerIds)
            .filter((id) => id === Number(e.playerId))
        ).toHaveLength(1);
        expect(a.observation).toEqual({
          cell: { x: n(cell, "X"), y: n(cell, "Y") },
          situationCode: n(p, "Situation"),
          statusCode: n(p, "Status"),
          canAct: flag(p, "CanAct"),
          tackleZone: flag(p, "TackleZone")
        });
        const before = replay.boardCheckpoints!.find(
            (cp) =>
              cp.replayStep === c.before.locator.replayStep &&
              cp.childIndex === c.before.locator.childIndex
          )!,
          after = replay.boardCheckpoints!.find(
            (cp) =>
              cp.replayStep === c.after.locator.replayStep &&
              cp.childIndex === c.after.locator.childIndex
          )!;
        expect(a.beforeCheckpointAfter).toBe(before.afterSourceIndex);
        expect(a.checkpointAfter).toBe(after.afterSourceIndex);
        expect(a.replayStep).toBe(c.after.locator.replayStep);
        expect(a.childIndex).toBe(c.after.locator.childIndex);
        const controls = a.controlSourceIds.map((id) =>
          r.events.find((e) => e.metadata.sourceId === id)!
        );
        expect(controls).toHaveLength(c.controls.length);
        controls.forEach((e, i) => {
          const raw = c.controls[i]!;
          expect(e.metadata.sourceTag).toBe(raw.tag);
          expect(e.metadata.locator?.childIndex).toBe(raw.childIndex);
          expect(e.metadata.sourceIndex).toBe(
            a.checkpointAfter - controls.length + i + 1
          );
          const control = e.metadata.recoveryControl;
          if (control?.kind === "standby")
            expect(control.gamerId).toBe(n(raw.payload, "ActiveGamer"));
        });
        const removal = r.events.find(
          (x) =>
            x.metadata.sourceId ===
            e.metadata.damage!.regeneration!.initialRemovalSourceId
        )!;
        expect(removal.scoringStatus).toBe("excluded");
        expect(removal.weightedDelta).toBe(0);
        expect(e.weightedDelta).toBe(e.actualSuccess ? 3 / 4 : -3 / 4);
      }
    }
  );
});
