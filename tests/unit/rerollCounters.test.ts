import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { findRerollCounterEvidence } from "@/domain/nufflizer/rerollCounters";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainRerollCounter } from "@/domain/nufflizer/presentation";

const xml = (id = "numeric_rush_spent") =>
  lonerDriveXml(id, "tests/fixtures/evidence/bb3-reroll-counters.json");
const report = (id?: string) => analyzeNufflizerInput(xml(id));
const counter = (r: ReturnType<typeof report>) =>
  r.events.find((e) => e.metadata.teamRerollCounter)!;
function raw(id = "numeric_rush_spent") {
  const replay = parseReplayXml(xml(id)),
    proof = [...findRerollCounterEvidence(replay).values()][0]!;
  const events = replay.turns.flatMap((t) => t.events),
    question = events.find((e) => e.id === proof.questionSourceId)!;
  const choice = events.find((e) => e.sourceTag === "ResultTeamRerollUsage")!;
  const before = replay.boardCheckpoints!.find(
    (c) => c.afterSourceIndex === proof.before.checkpointAfter
  )!;
  const after = replay.boardCheckpoints!.find(
    (c) => c.afterSourceIndex === proof.after?.checkpointAfter
  )!;
  const waiting = replay.boardCheckpoints!.find(
    (c) =>
      c.afterSourceIndex >= question.sourceIndex! &&
      c.afterSourceIndex < choice.sourceIndex!
  )!;
  return { replay, question, choice, before, waiting, after };
}
describe("observed team reroll counters, not inferred eligibility or reset rules", () => {
  it.each([
    ["numeric_rush_spent", 3, 2, 1],
    ["numeric_dodge_declined", 5, 5, 0],
    ["loner3_spent_pass", 2, 1, 1],
    ["loner4_spent_fail", 3, 2, 1]
  ] as const)(
    "reconciles independent %s source checkpoints",
    (id, before, after, spent) => {
      const r = report(id),
        e = counter(r),
        p = e.metadata.teamRerollCounter!;
      expect(p).toMatchObject({
        before: { count: before, periodCode: 1 },
        after: { count: after, periodCode: 1 },
        spent,
        reconciliation: "matched"
      });
      expect(e).toMatchObject({
        scoringStatus: "excluded",
        delta: 0,
        weightedDelta: 0,
        probabilitySuccess: null,
        metadata: {
          isRollCandidate: false,
          teamRerollDecision: { gamerId: 1, used: spent === 1 }
        }
      });
      expect(
        r.events.find((e) => e.metadata.sourceId === p.questionSourceId)
          ?.metadata.rerollOffer
      ).toEqual({
        gamerId: 1,
        canUseTeamReroll: true,
        decisionSourceId: e.metadata.sourceId
      });
      expect(explainRerollCounter(e)).toContain(
        `from ${before} to ${after} matches this decision`
      );
      if (id === "loner4_spent_fail")
        expect(r.events.find((e) => e.metadata.lonerGate)?.actualSuccess).toBe(
          false
        );
      if (id === "loner3_spent_pass")
        expect(r.events.find((e) => e.metadata.lonerGate)?.actualSuccess).toBe(
          true
        );
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it("retains independent raw counter facts and omission instead of editing source flags", () => {
    const x = JSON.parse(
      readFileSync("tests/fixtures/evidence/bb3-reroll-counters.json", "utf8")
    );
    for (const [id, step, before, after] of [
      ["numeric_rush_spent", 321, "3", "2"],
      ["loner3_spent_pass", 343, "2", "1"],
      ["loner4_spent_fail", 414, "3", "2"]
    ] as const) {
      const c = x.cases.find((c: { id: string }) => c.id === id);
      const boards = c.records.filter(
        (r: { projection?: { BoardState?: unknown } }) =>
          r.projection?.BoardState
      );
      expect(boards[0].replayStep).toBe(step);
      expect(
        boards[0].projection.BoardState.ListTeams[0].TeamState[1].RerollNumber
      ).toEqual([before]);
      expect(
        boards[2].projection.BoardState.ListTeams[0].TeamState[1].RerollNumber
      ).toEqual([after]);
      expect(boards[1].projection.BoardState.IsStable).toBeUndefined();
    }
    const p = counter(report("missing_zero_and_period")).metadata
      .teamRerollCounter!;
    expect(p.before.count).toBe(1);
    expect(p.before.periodCode).toBeNull();
    expect(p.after).toBeUndefined();
    expect(p.reconciliation).toBe("after_unavailable");
  });
  it.each([
    "gamer",
    "choice_gamer",
    "owner",
    "inferred_owner",
    "target",
    "used",
    "unavailable",
    "payload",
    "offer_payload",
    "missing_offer",
    "before_missing",
    "negative_counter",
    "question_evaluation",
    "choice_evaluation",
    "before_roster",
    "waiting_missing",
    "waiting_changed",
    "waiting_turn",
    "waiting_period",
    "phase",
    "unknown_interruption",
    "unmarked_carrier"
  ] as const)("withholds a counter trace after %s", (change) => {
    const r = raw(
      change === "unmarked_carrier" ? "loner3_spent_pass" : undefined
    );
    if (change === "gamer") r.question.payload!.GamerId = 0;
    if (change === "choice_gamer") r.choice.payload!.GamerId = 0;
    if (change === "owner") r.choice.actorTeamId = "0";
    if (change === "inferred_owner") r.choice.actorTeamSource = "turn_inferred";
    if (change === "target") r.choice.targetId = "999";
    if (change === "used") r.choice.payload!.Used = 2;
    if (change === "unavailable") r.question.payload!.CanUseTeamReroll = 0;
    if (change === "payload") r.choice.payload!.Unexpected = 1;
    if (change === "offer_payload") r.question.payload!.Unexpected = 1;
    if (change === "missing_offer") delete r.question.payload!.CanUseTeamReroll;
    if (change === "before_missing") r.before.board!.teams[1]!.rerolls = null;
    if (change === "negative_counter") r.before.board!.teams[1]!.rerolls = -1;
    if (change === "question_evaluation")
      r.replay.turns
        .flatMap((t) => t.events)
        .find(
          (e) =>
            e.sourceTag === "PlayerStep" && e.actionId === r.question.actionId
        )!.payload!.IsEvaluation = 1;
    if (change === "choice_evaluation")
      r.replay.turns
        .flatMap((t) => t.events)
        .find(
          (e) =>
            e.sourceTag === "PlayerStep" && e.actionId === r.choice.actionId
        )!.payload!.IsEvaluation = 1;
    if (change === "before_roster")
      r.before.board!.teams[0]!.explicitTeamId = 1;
    if (change === "waiting_missing") r.waiting.board!.teams[1]!.rerolls = null;
    if (change === "waiting_changed") r.waiting.board!.teams[1]!.rerolls = 4;
    if (change === "waiting_turn") r.waiting.board!.teams[1]!.gameTurn = 10;
    if (change === "waiting_period") r.waiting.board!.periodCode = 2;
    if (change === "phase") r.waiting.board!.phaseCode = 3;
    if (change === "unknown_interruption") {
      const t = r.replay.turns.find((t) => t.events.includes(r.choice))!;
      t.events.splice(t.events.indexOf(r.choice), 0, {
        ...r.choice,
        id: "unknown",
        sourceTag: "UnknownMutation"
      });
    }
    if (change === "unmarked_carrier")
      r.replay.turns
        .flatMap((t) => t.events)
        .find(
          (e) =>
            e.checkpointCarrier &&
            e.sourceIndex! > r.question.sourceIndex! &&
            e.sourceIndex! < r.choice.sourceIndex!
        )!.checkpointCarrier = false;
    expect(
      analyzeReplayLuck(r.replay).events.some(
        (e) => e.metadata.teamRerollCounter
      )
    ).toBe(false);
  });
  it.each([
    "period",
    "turn",
    "phase",
    "side",
    "gamer",
    "missing_counter",
    "unknown_checkpoint",
    "later_replay_step"
  ] as const)(
    "does not replace an unavailable first following %s observation with a later reset",
    (change) => {
      const r = raw();
      if (change === "period") r.after.board!.periodCode = 2;
      if (change === "turn") r.after.board!.teams[1]!.gameTurn = 10;
      if (change === "phase") r.after.board!.phaseCode = 3;
      if (change === "side") r.after.board!.activeTeamIndex = 0;
      if (change === "gamer") r.after.board!.activeGamerId = 0;
      if (change === "missing_counter") r.after.board!.teams[1]!.rerolls = null;
      if (change === "unknown_checkpoint") r.after.board = null;
      if (change === "later_replay_step") r.after.replayStep = 999;
      const p = counter(LuckReportSchema.parse(analyzeReplayLuck(r.replay)))
        .metadata.teamRerollCounter!;
      expect(p.before.count).toBe(3);
      expect(p.after).toBeUndefined();
      expect(p.reconciliation).toBe("after_unavailable");
    }
  );
  it("exposes a counter mismatch rather than manufacturing the missing decrement", () => {
    const r = raw();
    r.after.board!.teams[1]!.rerolls = 3;
    const e = counter(LuckReportSchema.parse(analyzeReplayLuck(r.replay)));
    expect(e.metadata.teamRerollCounter!.reconciliation).toBe("mismatch");
    expect(explainRerollCounter(e)).toContain(
      "resource consumption remains unreconciled"
    );
  });
  it("cannot fill the earlier observation from a known future counter", () => {
    const r = raw(),
      before = counter(analyzeReplayLuck(r.replay)).metadata.teamRerollCounter!
        .before;
    r.after.board!.teams[1]!.rerolls = 16;
    expect(
      counter(analyzeReplayLuck(r.replay)).metadata.teamRerollCounter!.before
    ).toEqual(before);
    r.before.board!.teams[1]!.rerolls = null;
    expect(
      analyzeReplayLuck(r.replay).events.some(
        (e) => e.metadata.teamRerollCounter
      )
    ).toBe(false);
  });
  it("keeps dice, random-outcome coverage and component values unchanged when counters are omitted", () => {
    const r = raw(),
      observed = analyzeReplayLuck(r.replay);
    for (const c of r.replay.boardCheckpoints!)
      for (const t of c.board?.teams ?? []) t.rerolls = null;
    const unknown = LuckReportSchema.parse(analyzeReplayLuck(r.replay));
    const scores = (r: typeof observed) =>
      r.teams.map(
        ({
          luckScore,
          categoryScores,
          impactScore,
          impactCount,
          impactByType
        }) => ({
          luckScore,
          categoryScores,
          impactScore,
          impactCount,
          impactByType
        })
      );
    expect(scores(observed)).toEqual(scores(unknown));
    expect(observed.teams[1].eventCount).toBe(unknown.teams[1].eventCount + 2);
    expect(observed.coverage.rollCandidates).toEqual(
      unknown.coverage.rollCandidates
    );
    expect(observed.coverage.contextEvidence).toEqual(
      unknown.coverage.contextEvidence
    );
    expect(
      observed.events
        .filter((e) => e.scoringStatus === "scored")
        .map((e) => e.probabilitySuccess)
    ).toEqual(
      unknown.events
        .filter((e) => e.scoringStatus === "scored")
        .map((e) => e.probabilitySuccess)
    );
  });
  it.each([
    "question",
    "before",
    "spent",
    "after",
    "status",
    "phase",
    "ownership",
    "duplicate_offer"
  ] as const)("shared reports reject forged counter %s", (change) => {
    const r = report(),
      e = counter(r),
      p = e.metadata.teamRerollCounter!;
    if (change === "question") p.questionSourceId = e.metadata.sourceId!;
    if (change === "before") p.before.checkpointAfter = e.metadata.sourceIndex!;
    if (change === "spent") p.spent = 0;
    if (change === "after") p.after!.count = 16;
    if (change === "status") p.reconciliation = "mismatch";
    if (change === "phase") p.after!.periodCode = 2;
    if (change === "ownership") p.before.teamId = "0";
    if (change === "duplicate_offer")
      r.events.find(
        (x) => x.metadata.sourceId === p.questionSourceId
      )!.metadata.teamRerollCounter = structuredClone(p);
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("prints the counter trace independently of the top-swing selection", () => {
    const dir = mkdtempSync(join(tmpdir(), "nuff-counter-"));
    try {
      const p = join(dir, "source.xml");
      writeFileSync(p, xml("loner4_spent_fail"));
      const run = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          p,
          "--format",
          "text"
        ],
        { encoding: "utf8", timeout: 20000 }
      );
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("from 3 to 2 matches this decision");
      expect(run.stdout).toContain("Loner failed");
      expect(run.stdout).toContain("not included in luck points");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("keeps full-source offer rows as provenance while the real roll retains its own movement evidence", () => {
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo2.bbr", "utf8")
    );
    const offers = r.events.filter((e) => e.metadata.rerollOffer);
    expect(offers.length).toBeGreaterThan(0);
    expect(
      offers.every((e) => !e.metadata.preRoll && !e.metadata.isRollCandidate)
    ).toBe(true);
    const decision = r.events.find(
      (e) =>
        e.metadata.locator?.replayStep === 323 && e.metadata.teamRerollCounter
    )!;
    expect(decision.metadata.teamRerollCounter).toMatchObject({
      before: { count: 3 },
      after: { count: 2 },
      reconciliation: "matched"
    });
    const dodge = r.events.find(
      (e) =>
        e.metadata.locator?.replayStep === 136 &&
        e.metadata.rollType === 2 &&
        e.scoringStatus === "scored"
    )!;
    expect(dodge.metadata.preRoll?.movementCheckLinked).toBe(true);
    expect(dodge.metadata.preRoll?.ordinaryMoveAvailability).toBeDefined();
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
  });
});

describe("attacker-selected Block counter offers preserve pool randomness and controller roles", () => {
  it.each([
    ["block_loner3_spent_pass", 2, 1, true, 2],
    ["block_loner3_spent_fail", 1, undefined, false, 1],
    ["block_loner3_boundary_pass", 1, undefined, true, 2]
  ] as const)(
    "matches %s without pricing the resource or re-rolling a kept pool",
    (id, before, after, passed, pools) => {
      const r = report(id),
        decision = counter(r),
        p = decision.metadata.teamRerollCounter!;
      expect(p.before.count).toBe(before);
      expect(p.after?.count).toBe(after);
      expect(p.spent).toBe(1);
      expect(p.reconciliation).toBe(
        after === undefined ? "after_unavailable" : "matched"
      );
      const original = r.events.find(
        (e) => e.metadata.sourceId === p.questionSourceId
      )!;
      expect(original).toMatchObject({
        scoringStatus: "scored",
        metadata: {
          sourceTag: "QuestionBlockDice",
          isRollCandidate: true,
          block: {
            reroll: "initial",
            pool: { attackerChooses: true },
            chooserTeamId: decision.teamId
          },
          rerollOffer: {
            gamerId: 1,
            decisionSourceId: decision.metadata.sourceId
          }
        }
      });
      const fresh = r.events.filter(
        (e) => e.metadata.block && e.scoringStatus === "scored"
      );
      expect(fresh).toHaveLength(pools);
      for (const e of fresh)
        expect(e.probabilitySuccess).toBeCloseTo(5 / 9, 12);
      expect(
        r.events.find((e) => e.metadata.lonerGate)?.metadata.lonerGate?.passed
      ).toBe(passed);
      expect(decision.metadata.isRollCandidate).toBe(false);
      const sources = new Map(r.events.map((e) => [e.metadata.sourceId!, e]));
      expect(explainRerollCounter(original, sources)).toContain(
        `before the offer: ${before}`
      );
      if (passed)
        expect(explainRerollCounter(fresh[1]!, sources)).toContain(
          `before the offer: ${before}`
        );
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    }
  );
  it("independently retains counter2→1 and the omitted-zero failure source", () => {
    const x = JSON.parse(
      readFileSync("tests/fixtures/evidence/bb3-reroll-counters.json", "utf8")
    );
    const c = x.cases.find(
      (c: { id: string }) => c.id === "block_loner3_spent_pass"
    );
    const boards = c.records.filter(
      (r: { projection?: { BoardState?: unknown } }) => r.projection?.BoardState
    );
    expect(boards[0].replayStep).toBe(363);
    expect(
      boards[0].projection.BoardState.ListTeams[0].TeamState[1].RerollNumber
    ).toEqual(["2"]);
    expect(boards[2].replayStep).toBe(365);
    expect(
      boards[2].projection.BoardState.ListTeams[0].TeamState[1].RerollNumber
    ).toEqual(["1"]);
    const offer = c.records
      .flatMap(
        (r: { steps?: { messages: Record<string, unknown>[] }[] }) =>
          r.steps ?? []
      )
      .flatMap((s: { messages: Record<string, unknown>[] }) => s.messages)
      .find(
        (m: Record<string, unknown>) => m.QuestionBlockDice
      ).QuestionBlockDice;
    for (const field of [
      "BrawlerDiceIndexes",
      "ProDiceIndexes",
      "StarSpecialRuleDiceIndexes"
    ])
      expect(offer[field]).toEqual([""]);
    const f = x.cases.find(
      (c: { id: string }) => c.id === "block_loner3_spent_fail"
    );
    const b = f.records.find(
      (r: { replayStep: number; projection?: { BoardState?: unknown } }) =>
        r.replayStep === 389 && r.projection?.BoardState
    ).projection.BoardState;
    expect(b.ListTeams[0].TeamState[1].RerollNumber).toBeUndefined();
  });
  it.each([
    "defender_selector",
    "controller",
    "freshness",
    "family",
    "disabled_choice",
    "unknown_field",
    "brawler",
    "pro",
    "star_rule"
  ] as const)("withholds a Block counter trace after %s", (change) => {
    const r = raw("block_loner3_spent_pass"),
      p = r.question.payload!;
    if (change === "defender_selector") p.AttackerChoice = 0;
    if (change === "controller") p.GamerId = 0;
    if (change === "freshness") p.RollStatus = 2;
    if (change === "family") p.RollType = 99;
    if (change === "disabled_choice") p.CanChoseDie = 0;
    if (change === "unknown_field") p.Unexpected = 1;
    if (change === "brawler")
      p.BrawlerDiceIndexes = { BrawlerDiceIndexesItem: 0 };
    if (change === "pro") p.ProDiceIndexes = { ProDiceIndexesItem: 0 };
    if (change === "star_rule")
      p.StarSpecialRuleDiceIndexes = { StarSpecialRuleDiceIndexesItem: 0 };
    expect(
      analyzeReplayLuck(r.replay).events.some(
        (e) => e.metadata.teamRerollCounter
      )
    ).toBe(false);
  });
  it("only accepts zero when the actual first following counter explicitly records it", () => {
    const r = raw("block_loner3_spent_fail");
    expect(
      counter(analyzeReplayLuck(r.replay)).metadata.teamRerollCounter!.after
    ).toBeUndefined();
    // Synthetic explicit-zero probe; the real source omits this field.
    const first = r.replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex >= r.choice.sourceIndex!
    )!;
    first.board!.teams[1]!.rerolls = 0;
    expect(
      counter(LuckReportSchema.parse(analyzeReplayLuck(r.replay))).metadata
        .teamRerollCounter
    ).toMatchObject({ after: { count: 0 }, reconciliation: "matched" });
  });
  it.each(["block_loner3_spent_pass", "block_loner3_spent_fail"])(
    "%s does not add another pool, gate or dice contribution when counters are available",
    (id) => {
      const r = raw(id),
        observed = LuckReportSchema.parse(analyzeReplayLuck(r.replay));
      for (const c of r.replay.boardCheckpoints!)
        for (const t of c.board?.teams ?? []) t.rerolls = null;
      const unknown = LuckReportSchema.parse(analyzeReplayLuck(r.replay));
      const dice = (r: typeof observed) =>
        r.events
          .filter((e) => e.scoringStatus === "scored")
          .map((e) => ({
            source: e.metadata.sourceId,
            chance: e.probabilitySuccess,
            delta: e.weightedDelta,
            block: e.metadata.block
          }));
      expect(dice(observed)).toEqual(dice(unknown));
      expect(observed.coverage.rollCandidates).toEqual(
        unknown.coverage.rollCandidates
      );
      expect(observed.teams.map((t) => t.luckScore)).toEqual(
        unknown.teams.map((t) => t.luckScore)
      );
    }
  );
  it.each([
    "reverse_link",
    "chooser",
    "future_before",
    "unlinked_decline"
  ] as const)("shared reports reject forged %s counter evidence", (change) => {
    const r =
      change === "unlinked_decline"
        ? report("numeric_dodge_declined")
        : report("block_loner3_spent_pass");
    const decision = counter(r),
      p = decision.metadata.teamRerollCounter!,
      q = r.events.find((e) => e.metadata.sourceId === p.questionSourceId)!;
    if (change === "reverse_link")
      q.metadata.rerollOffer!.decisionSourceId = q.metadata.sourceId!;
    if (change === "chooser") q.metadata.rerollOffer!.gamerId = 0;
    if (change === "future_before") p.before.replayStep = 999;
    if (change === "unlinked_decline") {
      delete decision.metadata.teamRerollCounter;
      delete q.metadata.rerollOffer;
    }
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
