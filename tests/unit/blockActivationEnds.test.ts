import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { applyActivationEnds } from "@/domain/replay/activationEnds";
import { isInertReplayControl } from "@/domain/replay/inertControls";
import { rollEvent } from "../helpers/replay";
import { explainActivationLoss } from "@/domain/nufflizer/presentation";
import { blockActivationReplayXml } from "../helpers/blockActivationReplay";
import type { LuckReport } from "@/domain/nufflizer/types";
const report = (o: Parameters<typeof blockActivationReplayXml>[0] = {}) =>
  LuckReportSchema.parse(
    analyzeReplayLuck(parseReplayXml(blockActivationReplayXml(o)))
  );
const endings = (r: LuckReport) =>
  r.events.filter(
    (e) => e.metadata.activationEnd?.kind === "ordinary_block_completed"
  );
const dodge = (r: LuckReport) =>
  r.events.find((e) => e.type === "dodge" && e.scoringStatus === "scored")!;
type Locator = {
  replayStep: number | null;
  childIndex: number | null;
  stepIndex?: number;
  messageIndex?: number;
};
type Frame = {
  index: number;
  locator: Locator;
  phase: number | null;
  stable: number | null;
  period: number | null;
  activeTeam: number | null;
  activeGamer: number | null;
  teams: {
    rosterIndex: number;
    teamId: number | null;
    turn: number | null;
    players: {
      Id: number;
      Cell: { X: number; Y: number };
      CanAct: number | null;
      TackleZone: number | null;
      Status: number | null;
      Situation: number | null;
    }[];
  }[];
};
type RawEvent = {
  locator: Locator;
  payload: Record<string, unknown>;
  step: {
    PlayerStep: {
      PlayerId: number;
      TargetId: number;
      StepType: number;
      CellFrom: { X: number; Y: number };
      CellTo: { X: number; Y: number };
    };
  };
  frame: number;
};
const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-block-activation-ends.json", "utf8")
) as {
  files: {
    file: string;
    sha256: string;
    frames: Frame[];
    controls: {
      locator: Locator;
      tag: string;
      payload: Record<string, unknown> | "";
    }[];
    cases: {
      declaration: RawEvent;
      applied: RawEvent;
      following: RawEvent;
      beforeFrame: number;
      afterFrame: number;
      clockFrames: number[];
      suffixTags: string[];
    }[];
  }[];
};
const priorContexts = JSON.parse(
  readFileSync(
    "tests/fixtures/evidence/block-activation-prior-context.json",
    "utf8"
  )
) as {
  files: {
    file: string;
    rows: {
      sourceId: string;
      preRoll: NonNullable<LuckReport["events"][number]["metadata"]["preRoll"]>;
    }[];
  }[];
};
const loc = (x: Locator) =>
  [
    x.replayStep,
    x.childIndex,
    x.stepIndex ?? null,
    x.messageIndex ?? null
  ].join(":");
describe("source-qualified completed ordinary Block availability", () => {
  it.each([false, true])(
    "records a completed Block with follow=%s without changing observed flags or adding dice",
    (follow) => {
      const replay = parseReplayXml(blockActivationReplayXml({ follow })),
        before = JSON.stringify(replay),
        r = LuckReportSchema.parse(analyzeReplayLuck(replay)),
        [e] = endings(r),
        end = e!.metadata.activationEnd!;
      expect(end).toMatchObject({
        actorId: "42",
        followingPlayerId: "43",
        teamId: "0",
        teamTurn: 9,
        periodCode: 1,
        actorCell: { x: follow ? 6 : 5, y: 5 }
      });
      expect(dodge(r).metadata.preRoll).toMatchObject({
        otherUsefulActivations: 1,
        endedActivationSourceIds: [end.sourceId],
        ordinaryMoveAvailability: {
          knownAvailablePlayerIds: ["44"],
          unknownPlayerIds: []
        }
      });
      expect(dodge(r).contextualImpact?.contribution).toBeCloseTo(-5 / 6, 12);
      expect(e).toMatchObject({
        scoringStatus: "excluded",
        weightedDelta: 0,
        metadata: { isRollCandidate: false }
      });
      const current = replay.boardCheckpoints!.at(-1)!.board!,
        raw = current.teams[0]!.players.find((p) => p.id === 42)!;
      expect(raw.canAct).toBe(true);
      expect(raw.tackleZone).toBe(true);
      const applied = applyActivationEnds(
        current,
        new Map([[end.actorId, end]])
      );
      expect(
        applied.board.teams[0]!.players.find((p) => p.id === 42)
      ).toMatchObject({ canAct: false, tackleZone: true, cell: raw.cell });
      expect(JSON.stringify(replay)).toBe(before);
      expect(explainActivationLoss(e!)).toContain(
        "ordinary Block activation ended"
      );
      expect(r.events.filter((e) => e.scoringStatus === "scored")).toHaveLength(
        2
      );
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it("neutral timer telemetry preserves the commitment and cannot change the active side", () => {
    const timer =
      "<EventPauseActiveTimer/><EventActiveTimerChanged><NewTimer><Duration>240</Duration><Type>7</Type><Value>123.75</Value><Team>1</Team></NewTimer><IsPaused>1</IsPaused></EventActiveTimerChanged><EventStartActiveTimer/>";
    const base = report(),
      timed = report({ interruption: timer });
    expect(endings(timed)).toHaveLength(1);
    expect(dodge(timed).contextualImpact).toEqual(dodge(base).contextualImpact);
    expect(dodge(timed).metadata.preRoll?.activeTeamId).toBe("0");
    expect(timed.teams.map((t) => t.luckScore)).toEqual(
      base.teams.map((t) => t.luckScore)
    );
    const xml = blockActivationReplayXml().replace(
      "</BoardState><EventExecuteSequence>",
      `</BoardState>${timer}<EventExecuteSequence>`
    );
    const before = LuckReportSchema.parse(
      analyzeReplayLuck(parseReplayXml(xml))
    );
    expect(endings(before)).toHaveLength(1);
    expect(dodge(before).contextualImpact).toEqual(
      dodge(base).contextualImpact
    );
  });
  it.each([
    {
      sourceTag: "EventActiveTimerChanged",
      payload: { NewTimer: { Duration: 240, Type: 7, Value: 120, Team: 2 } }
    },
    {
      sourceTag: "EventActiveTimerChanged",
      payload: {
        NewTimer: { Duration: 240, Type: 7, Value: 120, GlobalReset: 1 }
      }
    },
    {
      sourceTag: "EventActiveTimerChanged",
      payload: { NewTimer: { Duration: 240, Type: 7, Value: Number.NaN } }
    },
    {
      sourceTag: "EventActiveTimerChanged",
      payload: { NewTimer: { Duration: -1, Type: 7, Value: 120 } }
    },
    {
      sourceTag: "EventActiveTimerChanged",
      payload: { NewTimer: { Duration: 240, Type: 7.5, Value: 120 } }
    },
    {
      sourceTag: "EventActiveTimerChanged",
      payload: {
        NewTimer: { Duration: 240, Type: 7, Value: 120 },
        IsPaused: null
      }
    },
    { sourceTag: "EventStartActiveTimer", payload: { UnknownReset: 1 } },
    { sourceTag: "Clock", payload: { Dice: { Die: { Value: 1 } } } },
    { sourceTag: "EventActiveGamerChanged", payload: {} },
    { sourceTag: "EventEndTurn", payload: { Reason: 1 } }
  ])(
    "does not classify a malformed or game-changing control as inert: %j",
    (e) => expect(isInertReplayControl(rollEvent(e))).toBe(false)
  );
  it("a declaration alone cannot spend an activation or shrink the later context component", () => {
    const ordinary = report(),
      uncommitted = report({ commit: false });
    expect(endings(uncommitted)).toHaveLength(0);
    expect(dodge(uncommitted).metadata.preRoll?.otherUsefulActivations).toBe(2);
    expect(dodge(uncommitted).contextualImpact?.contribution).toBeCloseTo(
      -5 / 3,
      12
    );
    expect(dodge(ordinary).probabilitySuccess).toBe(
      dodge(uncommitted).probabilitySuccess
    );
    expect(dodge(ordinary).weightedDelta).toBe(
      dodge(uncommitted).weightedDelta
    );
  });
  it.each([
    { following: 42 },
    { interruption: "<EventUnmodeledMutation/>" },
    {
      interruption:
        "<EventEndTurn><Reason>1</Reason><FinishingTurnType>0</FinishingTurnType></EventEndTurn>"
    },
    { interruption: "<EventNewGamePhase><Phase>5</Phase></EventNewGamePhase>" },
    { unknownClock: true },
    { missingActor: true },
    { changedPosition: true },
    { nextTurn: true },
    { action: 3 }
  ])("withholds unsupported or interrupted completion %j", (options) =>
    expect(endings(report(options))).toHaveLength(0)
  );
  it.each([
    "extra-declaration-field",
    "extra-block-step-field",
    "overlapping-defender",
    "unknown-side",
    "inner-clock-change",
    "future-checkpoint",
    "wrong-controller",
    "reversed-checkpoints"
  ])("rejects %s without repairing it from a later matching state", (kind) => {
    const replay = parseReplayXml(blockActivationReplayXml()),
      events = replay.turns.flatMap((t) => t.events),
      cp = replay.boardCheckpoints!.at(-1)!;
    if (kind === "extra-declaration-field")
      events.find(
        (e) => e.sourceTag === "PlayerStep" && e.stepType === 0
      )!.payload!.UnmodeledSkill = 1;
    if (kind === "extra-block-step-field")
      events.find(
        (e) => e.sourceTag === "PlayerStep" && e.stepType === 6
      )!.payload!.UnmodeledSkill = 1;
    if (kind === "overlapping-defender")
      for (const frame of replay.boardCheckpoints!.filter(
        (c) => c.afterSourceIndex === 0
      ))
        frame.board!.teams[0]!.players.push(
          structuredClone(frame.board!.teams[1]!.players[0]!)
        );
    if (kind === "unknown-side") cp.board!.activeTeamIndex = null;
    if (kind === "wrong-controller")
      events.find(
        (e) => e.sourceTag === "EventRulesEngineStandBy"
      )!.payload!.ActiveGamer = "1";
    if (kind === "reversed-checkpoints") replay.boardCheckpoints!.reverse();
    if (kind === "future-checkpoint") cp.afterSourceIndex = 1000;
    if (kind === "inner-clock-change") {
      const interrupted = structuredClone(cp);
      interrupted.afterSourceIndex = 6;
      interrupted.board!.phaseCode = 4;
      const renewed = structuredClone(cp);
      renewed.afterSourceIndex = 7;
      replay.boardCheckpoints!.splice(2, 0, interrupted, renewed);
    }
    const r = analyzeReplayLuck(replay);
    expect(endings(r)).toHaveLength(0);
  });
  it("derives spent status from the commitment when the following raw CanAct is omitted", () => {
    const replay = parseReplayXml(blockActivationReplayXml()),
      p = replay
        .boardCheckpoints!.at(-1)!
        .board!.teams[0]!.players.find((p) => p.id === 42)!;
    p.canAct = null;
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(endings(r)).toHaveLength(1);
    expect(p.canAct).toBeNull();
    expect(dodge(r).metadata.preRoll?.otherUsefulActivations).toBe(1);
  });
  it("never changes an earlier block's pre-roll evidence using later confirmation", () => {
    const replay = parseReplayXml(blockActivationReplayXml()),
      full = LuckReportSchema.parse(analyzeReplayLuck(replay)),
      q = full.events.find((e) => e.metadata.block)!;
    const prefix = structuredClone(replay);
    for (const turn of prefix.turns)
      turn.events = turn.events.filter((e) => (e.sourceIndex ?? Infinity) < 11);
    prefix.boardCheckpoints = prefix.boardCheckpoints!.filter(
      (c) => c.afterSourceIndex < 11
    );
    const earlier = LuckReportSchema.parse(
      analyzeReplayLuck(prefix)
    ).events.find((e) => e.metadata.sourceId === q.metadata.sourceId)!;
    expect(earlier.metadata.preRoll).toEqual(q.metadata.preRoll);
    expect(earlier.weightedDelta).toBe(q.weightedDelta);
    expect(
      endings(LuckReportSchema.parse(analyzeReplayLuck(prefix)))
    ).toHaveLength(0);
  });
  it("retains an earlier witnessed completion when a later malformed source breaks ordering", () => {
    const replay = parseReplayXml(blockActivationReplayXml());
    const before = endings(LuckReportSchema.parse(analyzeReplayLuck(replay)));
    replay.turns.at(-1)!.events.push({ type: "step", sourceTag: "PlayerStep" });
    expect(endings(LuckReportSchema.parse(analyzeReplayLuck(replay)))).toEqual(
      before
    );
  });
  it("does not persist the spent state across a turn/phase/position change", () => {
    const replay = parseReplayXml(blockActivationReplayXml()),
      r = report(),
      end = endings(r)[0]!.metadata.activationEnd!,
      board = replay.boardCheckpoints!.at(-1)!.board!;
    for (const change of [
      () => {
        board.teams[0]!.gameTurn = 10;
      },
      () => {
        board.phaseCode = 4;
      },
      () => {
        board.teams[0]!.players.find((p) => p.id === 42)!.cell.x = 9;
      }
    ]) {
      const current = structuredClone(board);
      change();
      expect(applyActivationEnds(board, new Map([["42", end]])).ends.size).toBe(
        0
      );
      Object.assign(board, current);
    }
  });
  it("reproduces the independent raw block/clock/declaration extraction", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-block-activation-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stdout + p.stderr).toBe(0);
  });
  it.each(facts.files)(
    "joins every qualified $file completion to raw participant positions, clocks, applied outcome and next declaration",
    (f) => {
      const input = readFileSync(`demo-replays/${f.file}`);
      expect(createHash("sha256").update(input).digest("hex")).toBe(f.sha256);
      const replay = parseReplayXml(decodeReplayInput(input.toString()).xml, {
          omitRawReplaySteps: true
        }),
        r = LuckReportSchema.parse(analyzeReplayLuck(replay)),
        sources = new Map(r.events.map((e) => [e.metadata.sourceId, e]));
      const rawEvents = new Map(
        replay.turns
          .flatMap((t) => t.events)
          .filter((e) => e.locator)
          .map((e) => [loc(e.locator as Locator), e])
      );
      const numeric = (v: unknown): unknown =>
        typeof v === "string" && /^-?\d+(?:\.\d+)?$/.test(v)
          ? Number(v)
          : Array.isArray(v)
            ? v.map(numeric)
            : v && typeof v === "object"
              ? Object.fromEntries(
                  Object.entries(v).map(([k, x]) => [k, numeric(x)])
                )
              : v;
      for (const control of f.controls) {
        const e = rawEvents.get(loc(control.locator))!;
        expect(e?.sourceTag).toBe(control.tag);
        // The app parser represents a present empty XML element as {}.
        expect(numeric(e.payload)).toEqual(
          control.payload === "" ? {} : control.payload
        );
        expect(isInertReplayControl(e)).toBe(true);
      }
      const expected: Record<string, number> = {
        "demo-goblins1.bbr": 4,
        "demo1.bbr": 1,
        "demo10.bbr": 22,
        "demo11.bbr": 3,
        "demo2.bbr": 6,
        "demo3.bbr": 11,
        "demo4.bbr": 8,
        "demo5.bbr": 13,
        "demo6.bbr": 0,
        "demo7.bbr": 3,
        "demo8.bbr": 5,
        "demo9.bbr": 31
      };
      expect(endings(r)).toHaveLength(expected[f.file]!);
      for (const confirmation of endings(r)) {
        const end = confirmation.metadata.activationEnd!,
          block = sources.get(end.blockSourceId!)!,
          decl = sources.get(end.declarationSourceId!)!;
        const raw = f.cases.find(
          (c) =>
            loc(c.applied.locator) === loc(block.metadata.locator as Locator)
        )!;
        expect(raw).toBeDefined();
        expect(loc(raw.declaration.locator)).toBe(
          loc(decl.metadata.locator as Locator)
        );
        expect(loc(raw.following.locator)).toBe(
          loc(confirmation.metadata.locator as Locator)
        );
        expect(raw.declaration.payload.Action).toBe(2);
        expect(raw.declaration.step.PlayerStep.PlayerId).toBe(
          Number(end.actorId)
        );
        expect(raw.following.step.PlayerStep.PlayerId).toBe(
          Number(end.followingPlayerId)
        );
        expect(raw.applied.payload.AttackerId).toBe(Number(end.actorId));
        expect(raw.applied.payload.DefenderId).toBe(
          Number(
            sources.get(end.blockPoolSourceId!)!.metadata.block!.defenderId
          )
        );
        const before = f.frames.find((x) => x.index === raw.beforeFrame)!,
          after = f.frames.find((x) => x.index === raw.afterFrame)!;
        const signature = (x: Frame) => [
          x.phase,
          x.period,
          x.activeTeam,
          x.activeGamer,
          ...x.teams.flatMap((t) => [t.rosterIndex, t.teamId, t.turn])
        ];
        for (const i of raw.clockFrames)
          expect(signature(f.frames.find((x) => x.index === i)!)).toEqual(
            signature(before)
          );
        for (const frame of [before, after]) {
          expect(frame.phase).toBe(5);
          expect(frame.stable).toBe(1);
          expect(frame.activeTeam).toBe(end.rosterIndex);
          expect(frame.period).toBe(end.periodCode);
          expect(frame.teams[end.rosterIndex]!.teamId).toBe(Number(end.teamId));
          expect(frame.teams[end.rosterIndex]!.turn).toBe(end.teamTurn);
        }
        const old = after.teams[end.rosterIndex]!.players.find(
            (p) => p.Id === Number(end.actorId)
          )!,
          fresh = after.teams[end.rosterIndex]!.players.find(
            (p) => p.Id === Number(end.followingPlayerId)
          )!;
        expect(old.Cell).toEqual({ X: end.actorCell.x, Y: end.actorCell.y });
        expect(fresh.CanAct).toBe(1);
        const cp = replay.boardCheckpoints!.find(
          (c) => c.afterSourceIndex === end.checkpointAfter
        )!;
        expect(loc(cp)).toBe(loc(after.locator));
        expect(confirmation.weightedDelta).toBe(0);
        expect(confirmation.metadata.isRollCandidate).toBe(false);
        for (const e of r.events.filter((e) =>
          e.metadata.preRoll?.endedActivationSourceIds?.includes(end.sourceId)
        ))
          expect(
            e.metadata.preRoll!.ordinaryMoveAvailability?.unknownPlayerIds ?? []
          ).not.toContain(end.actorId);
      }
      for (const previous of priorContexts.files.find((x) => x.file === f.file)!
        .rows) {
        const current = structuredClone(
          sources.get(previous.sourceId)!.metadata.preRoll!
        );
        const old = new Set(previous.preRoll.endedActivationSourceIds ?? []);
        const added = (current.endedActivationSourceIds ?? []).filter(
          (id) => !old.has(id)
        );
        expect(added.length).toBeGreaterThan(0);
        const spent = added.map(
          (id) => sources.get(id)!.metadata.activationEnd!
        );
        expect(
          spent.every((end) => end.kind === "ordinary_block_completed")
        ).toBe(true);
        expect(
          spent.every(
            (end) =>
              end.sourceIndex <
              (sources.get(previous.sourceId)!.metadata.sourceIndex ?? -1)
          )
        ).toBe(true);
        if (current.ordinaryMoveAvailability) {
          const legacy = previous.preRoll.ordinaryMoveAvailability!;
          expect(current.ordinaryMoveAvailability.unknownPlayerIds).toEqual(
            legacy.unknownPlayerIds.filter(
              (id) => !spent.some((end) => end.actorId === id)
            )
          );
          current.ordinaryMoveAvailability.unknownPlayerIds =
            legacy.unknownPlayerIds;
        }
        current.endedActivationSourceIds =
          previous.preRoll.endedActivationSourceIds;
        expect(current).toEqual(previous.preRoll);
      }
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    },
    30000
  );
  it.each([
    "missing-pool",
    "wrong-final",
    "future-frame",
    "wrong-action",
    "wrong-team",
    "invented-move",
    "invented-policy",
    "wrong-clock",
    "wrong-period"
  ])("rejects a public %s completion forgery", (kind) => {
    const r = report(),
      e = endings(r)[0]!,
      end = e.metadata.activationEnd!;
    if (kind === "missing-pool") delete end.blockPoolSourceId;
    if (kind === "wrong-final") end.blockSourceId = end.declarationSourceId;
    if (kind === "future-frame") end.checkpointAfter = end.sourceIndex + 1;
    if (kind === "wrong-action")
      r.events.find(
        (e) => e.metadata.sourceId === end.declarationSourceId
      )!.metadata.actionCode = 3;
    if (kind === "wrong-team") end.teamId = "1";
    if (kind === "invented-move") end.moveSourceId = end.blockSourceId;
    if (kind === "invented-policy") end.policy = "fresh_final";
    if (kind === "wrong-clock") end.teamTurn = 99;
    if (kind === "wrong-period") end.periodCode = 0;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("[cli-worker] exports source-backed Block endings in JSON and the shared text explanation", () => {
    const run = (format: string) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          "demo-replays/demo10.bbr",
          "--format",
          format
        ],
        { encoding: "utf8", maxBuffer: 4_000_001 }
      );
    const json = run("json");
    expect(json.status, json.stderr).toBe(0);
    expect(json.error).toBeUndefined();
    const r = LuckReportSchema.parse(JSON.parse(json.stdout)),
      end = r.events.find((e) => e.metadata.sourceId === "source-710")!;
    expect(end.metadata.activationEnd).toMatchObject({
      kind: "ordinary_block_completed",
      actorId: "38",
      followingPlayerId: "45",
      teamTurn: 4,
      periodCode: null
    });
    expect(
      r.events.find((e) => e.metadata.sourceId === "source-712")!.metadata
        .preRoll!.ordinaryMoveAvailability!.unknownPlayerIds
    ).not.toContain("38");
    const text = run("text");
    expect(text.status, text.stderr).toBe(0);
    const injury = r.events.find(e=>e.metadata.sourceId==="source-113")!;
    expect(injury.weightedDelta).toBe(-5/8);
    expect(injury.metadata.injuryScoring!.cause).toMatchObject({kind:"block",armorModifierBudget:{useSourceId:"source-111",available:1,spent:1,remaining:0}});
    expect(text.stdout).toContain("Mighty Blow's +1 was already spent");
    expect(r.events.find(e=>e.metadata.sourceId==="source-444")!.metadata.regenerationAftermath).toMatchObject({checkpointAfter:445,observation:{situationCode:1,statusCode:null,canAct:null}});
    expect(r.events.find(e=>e.metadata.sourceId==="source-1012")!.metadata.regenerationAftermath).toMatchObject({checkpointAfter:1013,observation:{situationCode:4,statusCode:4,canAct:null}});
    expect(r.events.find(e=>e.metadata.sourceId==="source-444")!.metadata.regenerationReturn).toMatchObject({status:"observed",setup:{checkpointAfter:774,phase:3},playing:{checkpointAfter:906,phase:5},activation:{sourceId:"source-1256",actionCode:1,before:{checkpointAfter:1253}}});
    expect(text.stdout).toContain("later observed back on the pitch");expect(text.stdout).toContain("A Move declaration is recorded at source-1256");
    expect(text.stdout).toContain("After Regeneration succeeded");expect(text.stdout).toContain("in reserves");expect(text.stdout).toContain("in the injured box");
    expect(text.stdout).toContain(explainActivationLoss(end)!);
    expect(r.verdict.luckierTeam).toBe("unknown");
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
  }, 20000);
});
