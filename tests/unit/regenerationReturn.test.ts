import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainRegenerationReturn } from "@/domain/nufflizer/presentation";
import { regenerationReturnXml } from "../helpers/regenerationReturn";
const parse = (o: Parameters<typeof regenerationReturnXml>[0] = {}) =>
  parseReplayXml(regenerationReturnXml(o));
const analyze = (r: ReturnType<typeof parse>) =>
  LuckReportSchema.parse(analyzeReplayLuck(r));
const report = (o: Parameters<typeof regenerationReturnXml>[0] = {}) =>
  analyze(parse(o));
const recovery = (r: ReturnType<typeof report>) =>
  r.events.find((e) => e.metadata.regenerationReturn)!;
describe("observed recovered-player return through setup and play", () => {
  it.each([1, 2])(
    "links a later action%s without making setup flags legal-activation proof",
    (action) => {
      const r = report({ action }),
        e = recovery(r),
        t = e.metadata.regenerationReturn!;
      expect(t.status).toBe("observed");
      if (t.status !== "observed") throw new Error("Missing return");
      expect(t.setup).toMatchObject({
        phase: 3,
        canAct: true,
        periodCode: null,
        cell: { x: 4, y: 5 }
      });
      expect(t.playing).toMatchObject({ phase: 5, canAct: true });
      expect(t.activation!.actionCode).toBe(action);
      const use = r.events.find(
        (e) => e.metadata.sourceId === t.activation!.sourceId
      )!;
      expect(use.metadata.recoveryReturnActivation!.regenerationSourceId).toBe(
        e.metadata.sourceId
      );
      expect(use.scoringStatus).toBe("excluded");
      expect(use.metadata.isRollCandidate).toBe(false);
      expect(use.weightedDelta).toBe(0);
      expect(e.weightedDelta).toBe(3 / 4);
      expect(r.events.filter((e) => e.scoringStatus === "scored")).toHaveLength(
        2
      );
      expect(r.damageSteps[0]!.scoredRolls).toBe(2);
      expect(explainRegenerationReturn(e)).toContain(
        "Setup CanAct flags are not legal-activation evidence"
      );
      expect(explainRegenerationReturn(use)).toContain("not another roll");
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it("does not fill playing flags or controllers from setup", () => {
    const t = recovery(report({ missingFlags: true, missingGamer: true }))
      .metadata.regenerationReturn!;
    if (t.status !== "observed") throw new Error("Missing return");
    expect(t.setup.canAct).toBe(true);
    expect(t.playing!.canAct).toBeNull();
    expect(t.playing!.tackleZone).toBeNull();
    expect(t.setup.activeGamerId).toBeNull();
    expect(t.playing!.activeGamerId).toBeNull();
    expect(t.activation).toBeDefined();
  });
  it.each([{ noReturn: true }, { noPlaying: true }, { noActivation: true }])(
    "keeps partial milestones explicit: %j",
    (o) => {
      const e = recovery(report(o)),
        t = e.metadata.regenerationReturn!;
      expect(e.weightedDelta).toBe(3 / 4);
      if (o.noReturn) {
        expect(t).toEqual({ status: "not_observed" });
        expect(explainRegenerationReturn(e)).toContain(
          "does not prove permanent unavailability"
        );
      } else {
        expect(t.status).toBe("observed");
        if (t.status !== "observed") throw new Error("Missing setup");
        expect(Boolean(t.playing)).toBe(!o.noPlaying);
        expect(t.activation).toBeUndefined();
      }
    }
  );
  it.each(["gap", "playingGap", "activationGap"] as const)(
    "does not repair an identity gap at %s with a later convenient snapshot",
    (key) => {
      const e = recovery(report({ [key]: "<EventUnknownRosterChange/>" })),
        t = e.metadata.regenerationReturn!;
      if (key === "gap") expect(t.status).toBe("unverified");
      else {
        expect(t.status).toBe("observed");
        if (t.status !== "observed")
          throw new Error("Missing earlier observation");
        expect(Boolean(t.playing)).toBe(key === "activationGap");
        expect(t.activation).toBeUndefined();
      }
      expect("stop" in t && t.stop?.reason).toBe("identity_transition");
      expect(e.weightedDelta).toBe(3 / 4);
    }
  );
  it("retains a completed trace before a later unknown suffix and roster conflict", () => {
    const before = recovery(report()).metadata.regenerationReturn;
    const replay = parse({ future: "<EventUnknownFutureRosterChange/>" }),
      later = structuredClone(replay.boardCheckpoints!.at(-1)!);
    later.afterSourceIndex = replay.turns
      .flatMap((t) => t.events)
      .at(-1)!.sourceIndex!;
    later.childIndex! += 3;
    later.board!.teams[0]!.players = [];
    replay.boardCheckpoints!.push(later);
    expect(recovery(analyze(replay)).metadata.regenerationReturn).toEqual(
      before
    );
  });
  it.each(["gap", "activationGap"] as const)(
    "stops the recovery instance at new damage in %s",
    (key) => {
      const replay = parse({ [key]: "<EventDamageBoundary/>" });
      const boundary = replay.turns
        .flatMap((t) => t.events)
        .find((e) => e.sourceTag === "EventDamageBoundary")!;
      boundary.sourceTag = "DamageStep";
      boundary.playerId = "42";
      boundary.payload = { PlayerId: 42 };
      const trace = recovery(analyze(replay)).metadata.regenerationReturn!;
      expect(trace.status).toBe(key === "gap" ? "unverified" : "observed");
      expect("stop" in trace && trace.stop).toEqual({
        reason: "new_damage",
        sourceIndex: boundary.sourceIndex
      });
      expect("activation" in trace && trace.activation).toBeFalsy();
    }
  );
  it("treats same-ID catalogue reuse as a boundary while retaining unrelated catalogue operations", () => {
    const same = recovery(
      report({
        gap: "<EventRemoveMercenary><MercenaryId>42</MercenaryId></EventRemoveMercenary>"
      })
    ).metadata.regenerationReturn!;
    expect(same.status).toBe("unverified");
    const other = recovery(
      report({
        gap: "<EventRemoveMercenary><MercenaryId>999</MercenaryId></EventRemoveMercenary>"
      })
    ).metadata.regenerationReturn!;
    expect(other.status).toBe("observed");
    const unknown = recovery(
      report({
        gap: "<EventRemoveMercenary><MercenaryId>999</MercenaryId><UnknownGlobalPolicy>1</UnknownGlobalPolicy></EventRemoveMercenary>"
      })
    ).metadata.regenerationReturn!;
    expect(unknown.status).toBe("unverified");
  });
  it("stops at an unindexed earlier event without losing completed prefix milestones", () => {
    const replay = parse(),
      events = replay.turns[0]!.events,
      index = events.findIndex((e) => e.sourceTag === "EventNewGamePhase");
    events.splice(index, 0, {
      type: "unknown",
      sourceTag: "EventUnknownRosterChange",
      payload: {}
    });
    expect(recovery(analyze(replay)).metadata.regenerationReturn).toEqual({
      status: "unverified",
      stop: { reason: "invalid_source", sourceIndex: null }
    });
    const later = parse();
    later.turns.at(-1)!.events.push({
      type: "unknown",
      sourceTag: "EventUnknownRosterChange",
      payload: {}
    });
    expect(recovery(analyze(later)).metadata.regenerationReturn).toEqual(
      recovery(report()).metadata.regenerationReturn
    );
  });
  it.each([
    "missing",
    "duplicate",
    "team",
    "data_id",
    "data_team",
    "roster",
    "position",
    "phase",
    "stable",
    "situation",
    "status"
  ])("stops at a contradictory first setup %s", (field) => {
    const replay = parse(),
      cp = replay.boardCheckpoints!.find((c) => c.board?.phaseCode === 3)!,
      p = cp.board!.teams[0]!.players[0]!;
    if (field === "missing") cp.board!.teams[0]!.players = [];
    if (field === "duplicate")
      cp.board!.teams[1]!.players.push(structuredClone(p));
    if (field === "team") cp.board!.teams[0]!.explicitTeamId = 1;
    if (field === "data_id") p.traitsDataPlayerId = 99;
    if (field === "data_team") p.traitsDataTeamId = 1;
    if (field === "roster") {
      cp.board!.teams[0]!.players = [];
      cp.board!.teams[1]!.players.push(p);
    }
    if (field === "position") {
      p.pitchLocation = "unknown";
      p.cell = { x: null, y: null };
    }
    if (field === "phase") cp.board!.phaseCode = 5;
    if (field === "stable") cp.board!.stable = false;
    if (field === "situation") p.situationCode = 4;
    if (field === "status") p.statusCode = 4;
    const t = recovery(analyze(replay)).metadata.regenerationReturn!;
    expect(t.status).toBe("unverified");
  });
  it.each([
    "permission",
    "stunned",
    "action",
    "actor",
    "skill",
    "step",
    "target",
    "cell",
    "extra"
  ])(
    "keeps setup/play but withholds an unsupported first declaration %s",
    (field) => {
      const replay = parse(),
        events = replay.turns.flatMap((t) => t.events),
        use = events.find((e) => e.sourceTag === "ResultUseAction")!,
        step = events[events.indexOf(use) - 1]!;
      const cp = replay.boardCheckpoints!.at(-1)!,
        p = cp.board!.teams[0]!.players[0]!;
      if (field === "permission") p.canAct = false;
      if (field === "stunned") p.statusCode = 2;
      if (field === "action") use.payload!.Action = 99;
      if (field === "actor") step.playerId = "7";
      if (field === "skill") step.payload!.Skill = 99;
      if (field === "step") step.stepType = 1;
      if (field === "target") step.targetId = "7";
      if (field === "cell") (step.payload!.CellFrom as { X: number }).X = 3;
      if (field === "extra") use.payload!.UnknownChoice = 1;
      const t = recovery(analyze(replay)).metadata.regenerationReturn!;
      if (t.status !== "observed")
        throw new Error("Earlier milestones missing");
      expect(t.playing).toBeDefined();
      expect(t.activation).toBeUndefined();
      expect(t.stop?.reason).toBe(
        field === "extra" ? "identity_transition" : "unsupported_activation"
      );
    }
  );
  it.each([
    "setup_phase",
    "setup_roster",
    "playing_order",
    "activation_source",
    "activation_action",
    "activation_before",
    "activation_future_frame",
    "activation_past_frame",
    "actor",
    "reciprocal",
    "scored_marker",
    "stop_index"
  ])("rejects forged public return %s", (field) => {
    const r = report(),
      e = recovery(r),
      t = e.metadata.regenerationReturn!;
    if (t.status !== "observed") throw new Error("Missing return");
    const a = t.activation!,
      use = r.events.find((e) => e.metadata.sourceId === a.sourceId)!;
    if (field === "setup_phase") t.setup.phase = 5;
    if (field === "setup_roster") t.setup.rosterIndex = 1;
    if (field === "playing_order")
      t.playing!.checkpointAfter = t.setup.checkpointAfter;
    if (field === "activation_source") a.sourceId = e.metadata.sourceId!;
    if (field === "activation_action") a.actionCode = 2;
    if (field === "activation_before")
      a.before.checkpointAfter = a.stepSourceIndex;
    if (field === "activation_future_frame") {
      a.before.replayStep = use.metadata.locator!.replayStep! + 1;
      use.metadata.recoveryReturnActivation!.before.replayStep =
        a.before.replayStep;
    }
    if (field === "activation_past_frame") {
      a.before.replayStep = t.playing!.replayStep - 1;
      use.metadata.recoveryReturnActivation!.before.replayStep =
        a.before.replayStep;
    }
    if (field === "actor") use.playerId = "7";
    if (field === "reciprocal")
      use.metadata.recoveryReturnActivation!.regenerationSourceId =
        use.metadata.sourceId!;
    if (field === "scored_marker") use.weightedDelta = 1;
    if (field === "stop_index") {
      delete t.activation;
      t.stop = { reason: "unknown_position", sourceIndex: 0 };
    }
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    ["demo10.bbr", 444, 774, 906, 1256],
    ["demo9.bbr", 1573, 2161, 2192, 2245]
  ] as const)(
    "joins real %s recovered participant without trusting ResultUseAction.TeamId0",
    (file, id, setup, playing, use) => {
      const replay = parseReplayXml(
          decodeReplayInput(readFileSync(`demo-replays/${file}`, "utf8")).xml,
          { omitRawReplaySteps: true }
        ),
        r = analyze(replay),
        e = r.events.find((e) => e.metadata.sourceIndex === id)!,
        t = e.metadata.regenerationReturn!;
      expect(t.status).toBe("observed");
      if (t.status !== "observed") throw new Error("Missing return");
      expect(t.setup.checkpointAfter).toBe(setup);
      expect(t.playing!.checkpointAfter).toBe(playing);
      expect(t.activation!.sourceId).toBe(`source-${use}`);
      const raw = replay.turns
          .flatMap((t) => t.events)
          .find((e) => e.sourceIndex === use)!,
        marker = r.events.find((e) => e.metadata.sourceIndex === use)!;
      expect(raw.payload!.TeamId).toBe(0);
      expect(marker.playerId).toBe(e.playerId);
      expect(marker.teamId).toBe(e.teamId);
      if (file === "demo9.bbr") expect(marker.teamId).toBe("1");
    }
  );
  it("does not bridge demo4's unverified intervening policy or turn missing later returns into permanent losses", () => {
    const a = analyze(
      parseReplayXml(
        decodeReplayInput(readFileSync("demo-replays/demo4.bbr", "utf8")).xml,
        { omitRawReplaySteps: true }
      )
    );
    expect(
      a.events.find((e) => e.metadata.sourceId === "source-1425")!.metadata
        .regenerationReturn
    ).toEqual({
      status: "unverified",
      stop: { reason: "identity_transition", sourceIndex: 1696 }
    });
    const b = analyze(
      parseReplayXml(
        decodeReplayInput(readFileSync("demo-replays/demo9.bbr", "utf8")).xml,
        { omitRawReplaySteps: true }
      )
    );
    for (const id of ["source-3894", "source-4576"])
      expect(
        b.events.find((e) => e.metadata.sourceId === id)!.metadata
          .regenerationReturn
      ).toEqual({ status: "not_observed" });
  });
});
