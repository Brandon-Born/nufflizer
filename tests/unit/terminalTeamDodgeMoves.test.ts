import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainContextBounds, explainContextImpact } from "@/domain/nufflizer/presentation";
import { lonerDriveXml } from "../helpers/lonerDrive";
import { withExactOrdinaryMoves } from "../helpers/exactOrdinaryMoves";

const fragment = (id: string) =>
  lonerDriveXml(id, "tests/fixtures/evidence/bb3-terminal-team-dodge.json");
const report = (id = "direct_team_dodge_failure") =>
  analyzeNufflizerInput(fragment(id));
const terminal = (r: ReturnType<typeof report>) =>
  r.events.find(
    (e) => e.contextualBounds?.policy === "team_reroll_terminal_moves"
  )!;

describe("conditional teammate-move cost of a committed team Dodge", () => {
  it("adds a single point contribution for complete pre-roll eligibility", () => {
    const xml = withExactOrdinaryMoves(
      fragment("direct_team_dodge_failure"),
      ["38", "42", "46", "47"],
      ["38", "42"]
    );
    const report = analyzeNufflizerInput(xml);
    const event = report.events.find(
      (row) => row.metadata.rollType === 2 && row.metadata.rerollResource === "team"
    )!;
    expect(event.metadata.preRoll?.ordinaryMoveAvailability).toMatchObject({
      knownAvailablePlayerIds: ["38", "42"],
      unknownPlayerIds: []
    });
    expect(event.contextualBounds).toBeUndefined();
    expect(event.contextualImpact).toMatchObject({
      successChance: 2 / 3,
      difference: 2,
      deviation: -2 / 3,
      contribution: -4 / 3
    });
    expect(event.delta).toBeCloseTo(-4 / 3, 12);
    const team = report.teams.find((t) => t.teamId === event.teamId)!;
    expect(team.impactCount).toBe(1);
    expect(team.impactScore).toBeCloseTo(-4 / 3, 12);
    expect(explainContextImpact(event)).toContain("replacement Dodge die had 66.7%");
    expect(report.verdict.luckierTeam).toBe("unknown");
    const missing = parseReplayXml(xml);
    for (const checkpoint of missing.boardCheckpoints ?? []) {
      if (checkpoint.kind === "initial") continue;
      for (const roster of checkpoint.board?.teams ?? [])
        roster.players = roster.players.filter((player) => player.id !== 46);
    }
    expect(analyzeReplayLuck(missing).events.every(
      (row) => row.contextualImpact?.policy !== "team_reroll_terminal_moves"
    )).toBe(true);
    const contradicted = parseReplayXml(xml);
    const finish = contradicted.turns.flatMap((turn) => turn.events)
      .find((row) => row.sourceTag === "EventEndTurn")!;
    finish.reasonCode = 1;
    expect(analyzeReplayLuck(contradicted).events.every(
      (row) => row.contextualImpact?.policy !== "team_reroll_terminal_moves"
    )).toBe(true);
    if (event.contextualImpact) event.contextualImpact.contribution *= 2;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });

  it.each(["direct_team_dodge_failure", "late_team_dodge_failure"])(
    "bounds the source-linked terminal failure %s without scoring its damage again",
    (id) => {
      const r = report(id),
        e = terminal(r);
      // Independent stdlib source extraction: both are unmodified3+ checks.
      // ReplayStep249 rolls2->1;430 rolls1->2. Four other positions remain
      // possible ordinary-move candidates; absent status/Data is not eligibility.
      expect(e.actualSuccess).toBe(false);
      expect(e.metadata.originalDice).toEqual({
        Die: { DieType: 0, Value: id === "direct_team_dodge_failure" ? 2 : 1 }
      });
      expect(e.metadata.dice).toEqual([
        id === "direct_team_dodge_failure" ? 1 : 2
      ]);
      expect(
        e.metadata.preRoll?.ordinaryMoveAvailability?.unknownPlayerIds
      ).toEqual(["38", "42", "46", "47"]);
      expect(e.contextualBounds).toMatchObject({
        policy: "team_reroll_terminal_moves",
        minimumMoves: 0,
        maximumMoves: 4,
        successChance: 2 / 3,
        lower: -8 / 3,
        upper: 0
      });
      expect(e.contextualBounds).not.toHaveProperty("activeContinuation");
      expect(e.probabilitySuccess).toBeCloseTo(8 / 9, 12);
      expect(e.delta).toBeCloseTo(-4 / 3, 12);
      expect(e.metadata.movementFall).toBeDefined();
      expect(
        r.teams.every((t) => t.impactCount === 0 && t.impactScore === 0)
      ).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
      expect(explainContextBounds(e)).toContain("earlier failed die");
      expect(explainContextBounds(e)).toContain("later damage dice");
    }
  );
  it("retains an independently extracted successful successor and its conditional odds", () => {
    const r = analyzeNufflizerInput(
        lonerDriveXml(
          "team_dodge_move",
          "tests/fixtures/evidence/bb3-team-reroll-movement.json"
        )
      ),
      e = terminal(r);
    expect(e.actualSuccess).toBe(true);
    expect(e.contextualBounds).toMatchObject({
      minimumMoves: 0,
      maximumMoves: 4,
      successChance: 2 / 3,
      lower: 0
    });
    expect(e.contextualBounds?.upper).toBeCloseTo(4 / 3, 12);
    expect(e.metadata.teamRerollMovement?.to).toEqual({ x: 11, y: 6 });
    expect(e.probabilitySuccess).toBeCloseTo(8 / 9, 12);
  });
  it("keeps source provenance independently tied to the complete demo", () => {
    expect(
      createHash("sha256")
        .update(readFileSync("demo-replays/demo11.bbr"))
        .digest("hex")
    ).toBe("8d50653050cf2d25608e6c06ed4fed7b4aa5ebefb1bf1f0b5524d9d63c6525f9");
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo11.bbr", "utf8")
    );
    expect(
      r.events
        .filter(
          (e) => e.contextualBounds?.policy === "team_reroll_terminal_moves"
        )
        .map((e) => e.metadata.locator?.replayStep)
    ).toEqual([194, 249, 430]);
  });
  it.each(["outcome", "turnover", "used", "gamer", "interruption"])(
    "withholds the component after a source %s contradiction",
    (change) => {
      const replay = parseReplayXml(fragment("direct_team_dodge_failure"));
      const events = replay.turns.flatMap((t) => t.events);
      const final = events.find(
        (e) =>
          e.sourceTag === "ResultRoll" &&
          e.rollType === 2 &&
          e.payload?.Status === 2
      )!;
      const choice = events.find(
        (e) => e.sourceTag === "ResultTeamRerollUsage"
      )!;
      if (change === "outcome") final.payload!.Outcome = 1;
      if (change === "turnover")
        events.find((e) => e.sourceTag === "EventEndTurn")!.reasonCode = 1;
      if (change === "used") choice.payload!.Used = 0;
      if (change === "gamer") choice.payload!.GamerId = 0;
      if (change === "interruption")
        events.find(
          (e) =>
            e.sourceTag === "ResultDoMove" &&
            e.sourceIndex! > final.sourceIndex!
        )!.sourceTag = "UnknownTransition";
      const r = analyzeReplayLuck(replay);
      expect(
        r.events.some(
          (e) => e.contextualBounds?.policy === "team_reroll_terminal_moves"
        )
      ).toBe(false);
    }
  );
  it.each([
    "chance",
    "endpoint",
    "continuation",
    "original",
    "eligibility",
    "proof"
  ])("rejects a forged public %s", (change) => {
    const r = report(),
      e = terminal(r),
      b = e.contextualBounds!;
    if (change === "chance") b.successChance = 8 / 9;
    if (change === "endpoint") b.lower = -32 / 9;
    if (change === "continuation") {
      if (b.policy !== "team_reroll_terminal_moves") throw new Error("Expected a team Dodge range");
      b.activeContinuation = { minimum: 1, maximum: 1 };
    }
    if (change === "original")
      e.metadata.originalDice = { Die: { DieType: 0, Value: 6 } };
    if (change === "eligibility")
      e.metadata.preRoll!.ordinaryMoveAvailability!.unknownPlayerIds = [];
    if (change === "proof") delete e.metadata.movementFall;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    "position",
    "actor_position",
    "excluded_policy",
    "ball",
    "clock",
    "phase"
  ])("withholds a contradictory waiting-snapshot %s", (change) => {
    const replay = parseReplayXml(fragment("direct_team_dodge_failure"));
    const final = replay.turns
      .flatMap((t) => t.events)
      .find(
        (e) =>
          e.sourceTag === "ResultRoll" &&
          e.rollType === 2 &&
          e.payload?.Status === 2
      )!;
    const waiting = replay
      .boardCheckpoints!.filter((c) => c.afterSourceIndex < final.sourceIndex!)
      .at(-1)!.board!;
    const owner = waiting.teams.find((t) =>
      t.players.some((p) => p.id === 39)
    )!;
    if (change === "position")
      owner.players.find((p) => p.id === 38)!.cell.x = 13;
    if (change === "actor_position")
      owner.players.find((p) => p.id === 39)!.cell.x = 21;
    if (change === "excluded_policy")
      owner.players.find((p) => p.id === 43)!.statusCode = null;
    if (change === "ball") waiting.ball.cell.x = 0;
    if (change === "clock") owner.gameTurn = 7;
    if (change === "phase") waiting.phaseCode = 3;
    expect(
      analyzeReplayLuck(replay).events.some(
        (e) => e.contextualBounds?.policy === "team_reroll_terminal_moves"
      )
    ).toBe(false);
  });
  it("uses only the qualified prefix for possible teammate eligibility", () => {
    const replay = parseReplayXml(fragment("direct_team_dodge_failure"));
    const original = analyzeReplayLuck(replay),
      e = terminal(original);
    for (const c of replay.boardCheckpoints ?? [])
      if (c.afterSourceIndex > e.metadata.sourceIndex! && c.board)
        for (const team of c.board.teams)
          for (const p of team.players) {
            p.canAct = false;
            p.movementRemaining = 0;
          }
    expect(terminal(analyzeReplayLuck(replay)).contextualBounds).toEqual(
      e.contextualBounds
    );
  });
});
