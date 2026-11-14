import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainTreatmentReturn } from "@/domain/nufflizer/presentation";
import { treatmentReturnXml } from "../helpers/treatmentReturn";
const parse = (o: Parameters<typeof treatmentReturnXml>[0] = {}) =>
  parseReplayXml(treatmentReturnXml(o));
const analyze = (r: ReturnType<typeof parse>) =>
  LuckReportSchema.parse(analyzeReplayLuck(r));
const report = (o: Parameters<typeof treatmentReturnXml>[0] = {}) =>
  analyze(parse(o));
const recovery = (r: ReturnType<typeof report>) =>
  r.events.find((e) => e.metadata.treatmentReturn)!;
describe("observed treated-player return through setup and play", () => {
  it.each([1, 2])(
    "links a later action%s without making setup flags legal-activation proof",
    (action) => {
      const r = report({ action }),
        e = recovery(r),
        t = e.metadata.treatmentReturn!;
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
      expect(use.metadata.treatmentReturnActivation!.treatmentSourceId).toBe(
        e.metadata.sourceId
      );
      expect(use.scoringStatus).toBe("excluded");
      expect(use.metadata.isRollCandidate).toBe(false);
      expect(use.weightedDelta).toBe(0);
      expect(e.weightedDelta).toBe(0);
      expect(r.events.filter((e) => e.scoringStatus === "scored")).toHaveLength(
        0
      );
      expect(r.damageSteps.every((s) => s.scoredRolls === 0)).toBe(true);
      expect(explainTreatmentReturn(e)).toContain(
        "Setup CanAct flags are not legal-activation evidence"
      );
      expect(explainTreatmentReturn(use)).toContain("not another roll");
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it("does not fill playing flags or controllers from setup", () => {
    const t = recovery(report({ missingFlags: true, missingGamer: true }))
      .metadata.treatmentReturn!;
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
        t = e.metadata.treatmentReturn!;
      expect(e.weightedDelta).toBe(0);
      if (o.noReturn) {
        expect(t).toEqual({ status: "not_observed" });
        expect(explainTreatmentReturn(e)).toContain(
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
        t = e.metadata.treatmentReturn!;
      if (key === "gap") expect(t.status).toBe("unverified");
      else {
        expect(t.status).toBe("observed");
        if (t.status !== "observed")
          throw new Error("Missing earlier observation");
        expect(Boolean(t.playing)).toBe(key === "activationGap");
        expect(t.activation).toBeUndefined();
      }
      expect("stop" in t && t.stop?.reason).toBe("identity_transition");
      expect(e.weightedDelta).toBe(0);
    }
  );
  it("retains a completed trace before a later unknown suffix and roster conflict", () => {
    const before = recovery(report()).metadata.treatmentReturn;
    const replay = parse({ future: "<EventUnknownFutureRosterChange/>" }),
      later = structuredClone(replay.boardCheckpoints!.at(-1)!);
    later.afterSourceIndex = replay.turns
      .flatMap((t) => t.events)
      .at(-1)!.sourceIndex!;
    later.childIndex! += 3;
    later.board!.teams[0]!.players = [];
    replay.boardCheckpoints!.push(later);
    expect(recovery(analyze(replay)).metadata.treatmentReturn).toEqual(before);
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
      const trace = recovery(analyze(replay)).metadata.treatmentReturn!;
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
    ).metadata.treatmentReturn!;
    expect(same.status).toBe("unverified");
    const other = recovery(
      report({
        gap: "<EventRemoveMercenary><MercenaryId>999</MercenaryId></EventRemoveMercenary>"
      })
    ).metadata.treatmentReturn!;
    expect(other.status).toBe("observed");
    const unknown = recovery(
      report({
        gap: "<EventRemoveMercenary><MercenaryId>999</MercenaryId><UnknownGlobalPolicy>1</UnknownGlobalPolicy></EventRemoveMercenary>"
      })
    ).metadata.treatmentReturn!;
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
    expect(recovery(analyze(replay)).metadata.treatmentReturn).toEqual({
      status: "unverified",
      stop: { reason: "invalid_source", sourceIndex: null }
    });
    const later = parse();
    later.turns.at(-1)!.events.push({
      type: "unknown",
      sourceTag: "EventUnknownRosterChange",
      payload: {}
    });
    expect(recovery(analyze(later)).metadata.treatmentReturn).toEqual(
      recovery(report()).metadata.treatmentReturn
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
    const t = recovery(analyze(replay)).metadata.treatmentReturn!;
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
      const t = recovery(analyze(replay)).metadata.treatmentReturn!;
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
      t = e.metadata.treatmentReturn!;
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
      use.metadata.treatmentReturnActivation!.before.replayStep =
        a.before.replayStep;
    }
    if (field === "activation_past_frame") {
      a.before.replayStep = t.playing!.replayStep - 1;
      use.metadata.treatmentReturnActivation!.before.replayStep =
        a.before.replayStep;
    }
    if (field === "actor") use.playerId = "7";
    if (field === "reciprocal")
      use.metadata.treatmentReturnActivation!.treatmentSourceId =
        use.metadata.sourceId!;
    if (field === "scored_marker") use.weightedDelta = 1;
    if (field === "stop_index") {
      delete t.activation;
      t.stop = { reason: "unknown_position", sourceIndex: 0 };
    }
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});

describe("treatment return cause, clock and omission receipts", () => {
  it.each(["third_team", "duplicate_team", "three_rosters", "type_change"])(
    "withholds a first setup with incompatible %s",
    (field) => {
      const replay = parse(),
        cp = replay.boardCheckpoints!.find((c) => c.board?.phaseCode === 3)!,
        reserve = replay.boardCheckpoints!.find(
          (c) => c.board?.teams[0]?.players[0]?.pitchLocation === "off_pitch"
        )!;
      if (field === "third_team") cp.board!.teams[1]!.explicitTeamId = 9;
      if (field === "duplicate_team") cp.board!.teams[1]!.explicitTeamId = 0;
      if (field === "three_rosters")
        cp.board!.teams.push(structuredClone(cp.board!.teams[1]!));
      if (field === "type_change") {
        reserve.board!.teams[0]!.players[0]!.traitsPlayerTypeId = 4;
        cp.board!.teams[0]!.players[0]!.traitsPlayerTypeId = 5;
      }
      expect(recovery(analyze(replay)).metadata.treatmentReturn).toMatchObject({
        status: "unverified",
        stop: { reason: "roster_conflict" }
      });
    }
  );
  it("does not turn an injured-box observation into a reserves-return seed", () => {
    const replay = parse();
    const raw = replay.turns
      .flatMap((t) => t.events)
      .find((e) => e.sourceTag === "ResultApothecary")!;
    raw.payload!.PlayerStatus = 4;
    const cp = replay.boardCheckpoints!.find(
      (c) => c.board?.teams[0]?.players[0]?.pitchLocation === "off_pitch"
    )!;
    cp.board!.teams[0]!.players[0]!.situationCode = 4;
    const r = analyze(replay);
    expect(
      r.events.find((e) => e.metadata.sourceId === raw.id)!.metadata
        .treatmentReturn
    ).toBeUndefined();
  });
  it("preserves a completed source prefix independently of future clocks and final-score edits", () => {
    const before = recovery(report()).metadata.treatmentReturn;
    const replay = parse({ future: "<EventMatchEnd/>" });
    const later = structuredClone(replay.boardCheckpoints!.at(-1)!);
    later.afterSourceIndex = replay.turns
      .flatMap((t) => t.events)
      .at(-1)!.sourceIndex!;
    later.replayStep! += 1;
    later.childIndex = 0;
    later.board!.periodCode = 9;
    later.board!.teams[0]!.gameTurn = 99;
    later.board!.teams[0]!.players = [];
    replay.boardCheckpoints!.push(later);
    expect(recovery(analyze(replay)).metadata.treatmentReturn).toEqual(before);
  });
  it.each([
    "trace_missing",
    "marker_missing",
    "cause",
    "owner_missing",
    "owner_team",
    "owner_role",
    "new_roll",
    "binary_odds",
    "weight",
    "setup_source",
    "setup_child",
    "setup_controller",
    "setup_period",
    "setup_turn",
    "setup_status_default",
    "setup_situation_default",
    "playing_action_default",
    "playing_tz_default",
    "before_controller",
    "before_period",
    "before_turn",
    "before_status_default",
    "before_situation_default",
    "before_action_default",
    "before_tz_default"
  ])("rejects a coherent public %s forgery", (field) => {
    const r = report({ missingFlags: true, missingGamer: true }),
      e = recovery(r),
      t = e.metadata.treatmentReturn!;
    if (t.status !== "observed") throw new Error("Missing trace");
    const a = t.activation!,
      use = r.events.find((e) => e.metadata.sourceId === a.sourceId)!,
      marker = use.metadata.treatmentReturnActivation!;
    if (field === "trace_missing") delete e.metadata.treatmentReturn;
    if (field === "marker_missing")
      delete use.metadata.treatmentReturnActivation;
    if (field === "cause") marker.treatmentSourceId = use.metadata.sourceId!;
    if (field === "owner_missing") delete use.metadata.ownership;
    if (field === "owner_team") use.metadata.ownership!.teamId = "1";
    if (field === "owner_role") use.metadata.ownership!.role = "subject";
    if (field === "new_roll") use.metadata.isRollCandidate = true;
    if (field === "binary_odds") use.probabilitySuccess = 1;
    if (field === "weight") use.explainability.weight = 1;
    if (field === "setup_source") t.setup.checkpointAfter += 1;
    if (field === "setup_child") t.setup.childIndex += 1;
    if (field === "setup_controller") t.setup.activeGamerId = 0;
    if (field === "setup_period") t.setup.periodCode = 0;
    if (field === "setup_turn") t.setup.teamTurn = 2;
    if (field === "setup_status_default") t.setup.statusCode = 0;
    if (field === "setup_situation_default") t.setup.situationCode = 0;
    if (field === "playing_action_default") t.playing!.canAct = false;
    if (field === "playing_tz_default") t.playing!.tackleZone = false;
    if (field.startsWith("before_")) {
      for (const s of [a.before, marker.before]) {
        if (field === "before_controller") s.activeGamerId = 0;
        if (field === "before_period") s.periodCode = 0;
        if (field === "before_turn") s.teamTurn = 2;
        if (field === "before_status_default") s.statusCode = 0;
        if (field === "before_situation_default") s.situationCode = 0;
        if (field === "before_action_default") s.canAct = false;
        if (field === "before_tz_default") s.tackleZone = false;
      }
    }
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
