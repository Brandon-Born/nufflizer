import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { catchResumePolicy } from "../helpers/catchRerollResume";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
const evidence = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-catch-resume.json", "utf8")
);
let cachedSource: ReturnType<typeof parseReplayXml> | undefined;
const parseSource = () =>
  parseReplayXml(
    decodeReplayInput(readFileSync("demo-replays/demo4.bbr", "utf8")).xml,
    { omitRawReplaySteps: true }
  );
const source = () => structuredClone((cachedSource ??= parseSource()));
const analyze = (replay = source()) =>
  LuckReportSchema.parse(analyzeReplayLuck(replay));
describe("Catch reroll continuation across a witnessed ready/start wait", () => {
  it("reproduces the independent prefix inventory without choosing a replacement result", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-catch-resume-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stderr).toBe(0);
    expect(evidence.files).toHaveLength(12);
    expect(
      evidence.files.flatMap((f: { cases: unknown[] }) => f.cases)
    ).toHaveLength(1);
    const f = evidence.files.find(
      (f: { file: string }) => f.file === "demo4.bbr"
    );
    expect(
      createHash("sha256")
        .update(readFileSync("demo-replays/demo4.bbr"))
        .digest("hex")
    ).toBe(f.sha256);
    expect(f.cases[0].questionLocator).toEqual({
      replayStep: 237,
      childIndex: 4,
      stepIndex: 1,
      messageIndex: 0
    });
    expect(f.cases[0].controls.map((e: { tag: string }) => e.tag)).toEqual([
      "EventGamersAreReady",
      "EventStartActiveTimer"
    ]);
  });
  it("retains both actual Catch draws across the source-qualified wait", () => {
    const r = analyze(),
      e = r.events.find((e) => e.metadata.sourceId === "source-1722")!;
    expect(e.scoringStatus).toBe("scored");
    expect(e.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(e.delta).toBeCloseTo(-1 / 3, 12);
    expect(e.weightedDelta).toBeCloseTo(-11 / 30, 12);
    expect(e.metadata.rerollDraws).toMatchObject({
      initialSourceId: "source-1715",
      initialFace: 2,
      baseSuccessChance: 2 / 3,
      initialDelta: -2 / 3
    });
    expect(e.metadata.rerollDraws!.replacementDelta).toBeCloseTo(1 / 3, 12);
    const c = evidence.files.find(
      (f: { file: string }) => f.file === "demo4.bbr"
    ).cases[0];
    type Projection = { [key: string]: (string | Projection)[] };
    const n = (p: Projection, k: string) =>
      p[k] === undefined ? null : Number(p[k]![0]);
    for (const stage of ["menu", "resumed"] as const) {
      const raw = c[stage],
        b = raw.board as Projection,
        teams = (b.ListTeams![0] as Projection).TeamState as Projection[];
      const owner = teams.find(
        (t) => n((t.Data?.[0] ?? {}) as Projection, "TeamId") === 1
      )!;
      const actor = (
        (owner.ListPitchPlayers![0] as Projection).PlayerState as Projection[]
      ).find((p) => n(p, "Id") === 41)!;
      const position = actor.Cell![0] as Projection;
      expect(e.metadata.catchRerollResume![stage]).toEqual({
        checkpointAfter: stage === "menu" ? 1715 : 1718,
        replayStep: raw.locator.replayStep,
        childIndex: raw.locator.childIndex,
        phaseCode: n(b, "CurrentPhase"),
        periodCode: n(b, "Period"),
        turnsPerPeriod: n(b, "TurnsPerPeriod"),
        activeTeamIndex: n(b, "ActiveTeam"),
        activeGamerId: n(b, "ActiveGamer"),
        activePlayerId: n(b, "ActivePlayer"),
        teamTurns: teams.map((t) => n(t, "GameTurn")),
        teamIds: teams.map((t) =>
          n((t.Data?.[0] ?? {}) as Projection, "TeamId")
        ),
        teamRerolls: n(owner, "RerollNumber"),
        actorCell: { x: n(position, "X"), y: n(position, "Y") },
        actorCanAct:
          actor.CanAct === undefined ? null : n(actor, "CanAct") === 1,
        actorTackleZone:
          actor.TackleZone === undefined ? null : n(actor, "TackleZone") === 1,
        actorStatus: n(actor, "Status"),
        actorSituation: n(actor, "Situation")
      });
    }
    expect(e.metadata.catchRerollResume!.controller).toEqual({
      beforeCheckpointAfter: 1707,
      beforeGamerId: null,
      changeSourceIndex: 1709
    });
    const before = source().boardCheckpoints!.find(
      (cp) =>
        cp.replayStep === c.before.locator.replayStep &&
        cp.childIndex === c.before.locator.childIndex
    )!;
    expect(before.afterSourceIndex).toBe(
      e.metadata.catchRerollResume!.controller.beforeCheckpointAfter
    );
    expect(n(c.before.board, "ActiveGamer")).toBeNull();
    const rawChange = c.prefix.find(
      (x: { tag: string }) => x.tag === "EventActiveGamerChanged"
    );
    expect(n(rawChange.payload, "NewActiveGamer")).toBe(1);
    const changed = source()
      .turns.flatMap((t) => t.events)
      .find(
        (x) =>
          x.sourceTag === rawChange.tag &&
          x.locator?.replayStep === rawChange.locator.replayStep &&
          x.locator?.childIndex === rawChange.locator.childIndex
      )!;
    expect(changed.sourceIndex).toBe(
      e.metadata.catchRerollResume!.controller.changeSourceIndex
    );
    expect(e.playerId).toBe("41");
    expect(e.teamId).toBe("1");
    expect(e.metadata.catchRerollResume!.menu.activePlayerId).toBe(46);
    expect(e.metadata.teamRerollsSpent).toBe(1);
    expect(e.metadata.preRoll).toBeUndefined();
    expect(e.catchPossessionBounds).toBeUndefined();
    const q = r.events.find((e) => e.metadata.sourceId === "source-1715")!;
    expect(q.scoringStatus).toBe("excluded");
    expect(q.weightedDelta).toBe(0);
    expect(q.metadata.isRollCandidate).toBe(false);
    expect(q.metadata.rerollOffer).toEqual({
      gamerId: 1,
      canUseTeamReroll: true,
      decisionSourceId: "source-1721"
    });
    const actual = r.diceRecords.filter((d) =>
      ["source-1715", "source-1722"].includes(d.parentSourceId ?? "")
    );
    expect(actual).toHaveLength(2);
    expect(
      actual.every(
        (d) => d.eventId === e.id && d.disposition === "covered_roll"
      )
    ).toBe(true);
  });
});

describe("raw wait barriers preserve an independently known first die", () => {
  it.each([
    "ready_field",
    "timer_field",
    "ready_tag",
    "swap_controls",
    "controller",
    "missing_controller",
    "period",
    "turn",
    "missing_turn",
    "counter",
    "missing_counter",
    "actor_cell",
    "other_cell",
    "snapshot_dice",
    "extra_checkpoint",
    "header_state",
    "header_field",
    "header_cell",
    "choice_controller",
    "choice_field",
    "result_field",
    "result_dice",
    "timer_dice_flag",
    "carrier",
    "roll_status",
    "missing_before_controller",
    "wrong_before_controller",
    "wrong_timer_team",
    "before_turn",
    "invalid_roster_namespace"
  ])("withholds the compound for %s", (change) => {
    const replay = source(),
      es = replay.turns.flatMap((t) => t.events),
      byId = new Map(es.map((e) => [e.id, e]));
    const ready = byId.get("source-1717")!,
      timer = byId.get("source-1718")!,
      step = byId.get("source-1720")!,
      choice = byId.get("source-1721")!,
      result = byId.get("source-1722")!;
    const menu = replay.boardCheckpoints!.find(
        (c) => c.afterSourceIndex === 1715
      )!,
      resumed = replay.boardCheckpoints!.find(
        (c) => c.afterSourceIndex === 1718
      )!;
    if (change === "ready_field") ready.payload!.UnknownPolicy = 1;
    if (change === "timer_field") timer.payload!.UnknownPolicy = 1;
    if (change === "ready_tag") ready.sourceTag = "EventUnknownReady";
    if (change === "swap_controls") {
      ready.sourceTag = "EventStartActiveTimer";
      timer.sourceTag = "EventGamersAreReady";
    }
    if (change === "controller") resumed.board!.activeGamerId = 0;
    if (change === "missing_controller")
      for (const cp of [menu, resumed]) cp.board!.activeGamerId = null;
    if (change === "period") resumed.board!.periodCode = 1;
    if (change === "turn") resumed.board!.teams[1]!.gameTurn = 7;
    if (change === "missing_turn")
      for (const cp of [menu, resumed]) cp.board!.teams[1]!.gameTurn = null;
    if (change === "counter") resumed.board!.teams[1]!.rerolls = 0;
    if (change === "missing_counter")
      for (const cp of [menu, resumed]) cp.board!.teams[1]!.rerolls = null;
    if (change === "actor_cell")
      resumed.board!.teams[1]!.players.find((p) => p.id === 41)!.cell.x = 13;
    if (change === "other_cell")
      resumed.board!.teams[1]!.players.find((p) => p.id === 46)!.cell.x = 10;
    if (change === "snapshot_dice")
      menu.dicePayload!.Unknown = { Dice: { Die: { DieType: 0, Value: 6 } } };
    if (change === "extra_checkpoint") {
      const cp = structuredClone(menu);
      cp.afterSourceIndex = 1717;
      cp.replayStep = 238;
      cp.childIndex = 0;
      replay.boardCheckpoints!.push(cp);
      replay.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
    }
    if (change === "header_state") step.payload!.State = 2;
    if (change === "header_field") step.payload!.UnknownPolicy = 1;
    if (change === "header_cell") step.payload!.CellTo = { X: 13, Y: 9 };
    if (change === "choice_controller") choice.payload!.GamerId = 0;
    if (change === "choice_field") choice.payload!.UnknownPolicy = 1;
    if (change === "result_field") result.payload!.UnknownPolicy = 1;
    if (change === "result_dice")
      result.payload!.Dice = {
        Die: [
          { DieType: 0, Value: 6 },
          { DieType: 0, Value: 6 }
        ]
      };
    if (change === "timer_dice_flag") timer.unclassifiedDice = true;
    if (change === "carrier") byId.get("source-1719")!.payload!.Carrier = "41";
    if (change === "roll_status") result.payload!.Status = 3;
    if (
      change === "missing_before_controller" ||
      change === "wrong_before_controller"
    ) {
      const before = replay.boardCheckpoints!.find(
        (c) => c.afterSourceIndex === 1707
      )!;
      before.board!.activeGamerId =
        change === "missing_before_controller" ? null : 0;
      const changed = byId.get("source-1709")!;
      changed.sourceTag = "EventPauseActiveTimer";
      changed.payload = {};
    }
    if (change === "wrong_timer_team")
      (
        byId.get("source-1711")!.payload!.NewTimer as Record<string, unknown>
      ).Team = "0";
    if (change === "before_turn")
      replay.boardCheckpoints!.find(
        (c) => c.afterSourceIndex === 1707
      )!.board!.teams[1]!.gameTurn = 7;
    if (change === "invalid_roster_namespace")
      for (const cp of [menu, resumed])
        cp.board!.teams[0]!.explicitTeamId = 999;
    const report = analyze(replay),
      e = report.events.find((e) => e.metadata.sourceId === "source-1722")!,
      q = report.events.find((e) => e.metadata.sourceId === "source-1715")!;
    expect(e.scoringStatus).toBe("excluded");
    expect(e.metadata.catchRerollResume).toBeUndefined();
    expect(q.scoringStatus).toBe("scored");
    expect(q.metadata.numericOriginal).toBeDefined();
    expect(q.delta).toBeCloseTo(-2 / 3, 12);
    expect(report.verdict.luckierTeam).toBe("unknown");
  });
});

it.each(["always", "odd", "never"])(
  "has zero mean actual-draw luck under the independently enumerated %s policy",
  (policy) => {
    for (const target of [2, 3, 4, 5, 6]) {
      let delta = 0,
        success = 0;
      for (let first = 1; first <= 6; first++)
        for (let second = 1; second <= 6; second++) {
          const use =
            first < target &&
            (policy === "always" || (policy === "odd" && first % 2 === 1));
          const r = analyze(catchResumePolicy(target, first, second, use));
          const scored = r.events.filter((e) => e.scoringStatus === "scored");
          expect(scored).toHaveLength(1);
          const e = scored[0]!,
            p = (7 - target) / 6;
          const expected =
            first >= target
              ? 1 - p
              : use
                ? -p + Number(second >= target) - p
                : -p;
          expect(e.delta).toBeCloseTo(expected, 12);
          expect(e.weightedDelta).toBeCloseTo(expected * 1.1, 12);
          if (use) {
            expect(e.metadata.catchRerollResume).toBeDefined();
            expect(e.probabilitySuccess).toBeCloseTo(1 - (1 - p) ** 2, 12);
            expect(e.metadata.rerollDraws).toBeDefined();
            expect(r.coverage.diceRecords.coveredCount).toBe(2);
          } else expect(e.metadata.catchRerollResume).toBeUndefined();
          delta += e.delta;
          success += Number(first >= target || (use && second >= target));
        }
      expect(delta / 36).toBeCloseTo(0, 12);
      const failuresRerolled = Array.from(
        { length: target - 1 },
        (_, i) => i + 1
      ).filter(
        (face) => policy === "always" || (policy === "odd" && face % 2 === 1)
      ).length;
      expect(success).toBe(6 * (7 - target) + failuresRerolled * (7 - target));
    }
  }
);

it.each([1, 2, 3, 4, 5, 6])(
  "admits actual replacement%s from its prefix without any later fallout",
  (face) => {
    const replay = source(),
      limit = 1722;
    replay.turns = replay.turns
      .map((t) => ({
        ...t,
        events: t.events.filter((e) => e.sourceIndex! <= limit)
      }))
      .filter((t) => t.events.length);
    replay.boardCheckpoints = replay.boardCheckpoints!.filter(
      (c) => c.afterSourceIndex < limit
    );
    replay.endDiceSnapshots = replay.endDiceSnapshots?.filter(
      (c) => c.afterSourceIndex < limit
    );
    const result = replay.turns
      .flatMap((t) => t.events)
      .find((e) => e.sourceIndex === limit)!;
    result.payload!.Dice = { Die: { DieType: 0, Value: face } };
    result.payload!.Outcome = Number(face >= 3);
    const r = analyze(replay),
      e = r.events.find((e) => e.metadata.sourceId === "source-1722")!;
    expect(e.scoringStatus).toBe("scored");
    expect(e.delta).toBeCloseTo(Number(face >= 3) - 4 / 3, 12);
    expect(e.metadata.catchRerollResume).toBeDefined();
    expect(e.metadata.preRoll).toBeUndefined();
    expect(e.contextualImpact).toBeUndefined();
    expect(e.catchPossessionBounds).toBeUndefined();
  }
);

it.each([
  "missing",
  "ready",
  "timer",
  "question_header",
  "continuation",
  "checkpoint",
  "controller",
  "period",
  "turn",
  "counter",
  "cell",
  "before_controller",
  "controller_change",
  "category",
  "roster_namespace"
])("rejects a forged resume %s receipt", (change) => {
  const report = analyze(catchResumePolicy()),
    e = report.events.find((e) => e.metadata.catchRerollResume)!,
    proof = e.metadata.catchRerollResume!;
  if (change === "missing") delete e.metadata.catchRerollResume;
  if (change === "ready") proof.readySourceIndex++;
  if (change === "timer") proof.timerSourceIndex++;
  if (change === "question_header") proof.questionStepSourceIndex++;
  if (change === "continuation") proof.continuationStepSourceIndex++;
  if (change === "checkpoint") proof.menu.checkpointAfter--;
  if (change === "controller") proof.resumed.activeGamerId = 1;
  if (change === "period") proof.resumed.periodCode = 0;
  if (change === "turn") proof.resumed.teamTurns[0]++;
  if (change === "counter") proof.resumed.teamRerolls = 0;
  if (change === "cell") proof.resumed.actorCell.x++;
  if (change === "before_controller") proof.controller.beforeGamerId = null;
  if (change === "controller_change")
    proof.controller.changeSourceIndex = proof.questionStepSourceIndex;
  if (change === "roster_namespace") {
    proof.menu.activeTeamIndex = 1;
    proof.resumed.activeTeamIndex = 1;
  }
  if (change === "category") {
    e.type = "dodge";
    report.coverage.scoredByType.ball_handling--;
    report.coverage.scoredByType.dodge++;
    const team = report.teams.find((t) => t.teamId === e.teamId)!;
    team.categoryScores.ballHandling -= e.weightedDelta;
    team.categoryScores.dodge += e.weightedDelta;
  }
  report.keyMoments = report.events
    .filter((e) => e.scoringStatus === "scored")
    .sort((a, b) => Math.abs(b.weightedDelta) - Math.abs(a.weightedDelta));
  const parsed = LuckReportSchema.safeParse(report);
  expect(parsed.success).toBe(false);
  if (!parsed.success)
    expect(
      parsed.error.issues.some((i) =>
        i.message.includes("A resumed Catch reroll requires")
      )
    ).toBe(true);
});

it("[cli-worker] explains and exports the real resumed Catch without inventing resource price or period", () => {
  const run = (format: string) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        "demo-replays/demo4.bbr",
        "--format",
        format
      ],
      { encoding: "utf8", timeout: 20000, maxBuffer: 4_000_000 }
    );
  const json = run("json");
  expect(json.status, json.stderr).toBe(0);
  const r = LuckReportSchema.parse(JSON.parse(json.stdout));
  const e = r.events.find((e) => e.metadata.sourceId === "source-1722")!;
  expect(e.metadata.catchRerollResume).toMatchObject({
    readySourceIndex: 1717,
    timerSourceIndex: 1718,
    menu: {
      periodCode: null,
      teamTurns: [5, 6],
      teamRerolls: 1,
      activePlayerId: 46,
      actorCanAct: null
    }
  });
  expect(e.probabilitySuccess).toBeCloseTo(8 / 9, 12);
  expect(e.weightedDelta).toBeCloseTo(-11 / 30, 12);
  expect(r.verdict.luckierTeam).toBe("unknown");
  const text = run("text");
  expect(text.status, text.stderr).toBe(0);
  expect(text.stdout).toContain(
    "Player 41; source source-1722: This Catch resumes after the ready signal (source 1717) and timer restart (source 1718)"
  );
  expect(text.stdout).toContain(
    "The board's active player is 46; this Catch belongs to player 41"
  );
  expect(text.stdout).toContain(
    "Period remains unknown. Action availability remains unknown."
  );
  expect(text.stdout).toContain("recorded choice spends one team reroll");
}, 30000);

it("uses an explicit pre-question gamer change rather than backfilling a contradictory old controller", () => {
  const replay = source();
  replay.boardCheckpoints!.find(
    (c) => c.afterSourceIndex === 1707
  )!.board!.activeGamerId = 0;
  const e = analyze(replay).events.find(
    (e) => e.metadata.sourceId === "source-1722"
  )!;
  expect(e.scoringStatus).toBe("scored");
  expect(e.metadata.catchRerollResume!.controller).toEqual({
    beforeCheckpointAfter: 1707,
    beforeGamerId: 0,
    changeSourceIndex: 1709
  });
});

it("keeps a long Catch with no qualified resume as a valid partial report instead of producing an invalid compound", () => {
  const replay = catchResumePolicy();
  // Keep only the question/choice/result and their genuine relative order;
  // a later source frame alone does not certify the missing control bridge.
  const es = replay.turns[0]!.events.filter((e) =>
    ["QuestionTeamRerollUsage", "ResultTeamRerollUsage", "ResultRoll"].includes(
      e.sourceTag
    )
  );
  es.forEach((e, i) => {
    e.id = `source-${i + 1}`;
    e.sourceIndex = i + 1;
  });
  replay.turns[0]!.events = es;
  replay.turns[0]!.eventCount = es.length;
  replay.boardCheckpoints = [];
  const r = analyze(replay),
    q = r.events.find((e) => e.metadata.sourceId === "source-1")!;
  expect(q.scoringStatus).toBe("scored");
  expect(q.metadata.numericOriginal).toBeDefined();
  expect(q.delta).toBeCloseTo(-2 / 3, 12);
  expect(r.events.some((e) => e.metadata.rerollDraws)).toBe(false);
  expect(r.verdict.luckierTeam).toBe("unknown");
});
