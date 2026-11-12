import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { reconstructReplayContext } from "@/domain/replay/reconstructContext";
import { estimateTeamRushMoveBounds } from "@/domain/nufflizer/contextImpact";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainContextBounds } from "@/domain/nufflizer/presentation";
import { lonerDriveXml } from "../helpers/lonerDrive";
const evidence = "tests/fixtures/evidence/bb3-team-reroll-movement.json";
const raw = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-terminal-rush-moves.json", "utf8")
) as {
  cases: {
    id: string;
    sourceFile: string;
    sha256: string;
    actorId: string;
    teamTurn: string;
    finalStep: number;
    replacementDie: number;
    possiblePlayerIds: string[];
    maximumMoves: number;
    upper: string;
    completed: { actorId: string } | null;
  }[];
  retainedFailure: { scope: string; replayStep: number; messages: unknown[] };
};
const xml = (id = "team_rush_second_move") => lonerDriveXml(id, evidence);
const report = (id?: string) => analyzeNufflizerInput(xml(id));
const terminal = (r: ReturnType<typeof report>) =>
  r.events.find(
    (e) => e.contextualBounds?.policy === "team_reroll_rush_moves"
  )!;
const fraction = (value: string) => {
  const [a, b = "1"] = value.split("/");
  return Number(a) / Number(b);
};
function source() {
  const replay = parseReplayXml(xml()),
    context = reconstructReplayContext(replay);
  const events = replay.turns.flatMap((t) => t.events);
  const proof = [...context.teamRerollMovements.values()][0]!;
  const final = events.find(
    (e) =>
      e.sourceIndex ===
      events.find((e) => e.id === proof.decisionSourceId)!.sourceIndex! + 1
  )!;
  return {
    replay,
    events,
    proof,
    final,
    question: events.find((e) => e.id === proof.questionSourceId)!,
    choice: events.find((e) => e.id === proof.decisionSourceId)!,
    declaration: events.find((e) => e.id === proof.declarationSourceId)!,
    waiting: replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === proof.checkpointAfter
    )!
  };
}
describe("conditional teammate moves at a committed ordinary Rush replacement", () => {
  it.each(raw.cases)(
    "admits source-backed $id without pricing earlier dice, active continuation or the ball",
    (c) => {
      const r = report(c.id),
        e = terminal(r),
        b = e.contextualBounds!;
      // This compact fragment starts after the previous mover's original
      // checkpoint. It cannot confirm that completion, unlike the full file.
      const possible = [
        ...c.possiblePlayerIds,
        ...(c.completed ? [c.completed.actorId] : [])
      ].sort((a, b) => Number(a) - Number(b));
      expect(e).toBeDefined();
      expect(e.playerId).toBe(c.actorId);
      expect(e.teamId).toBe("1");
      expect(e.type).toBe("movement_risk");
      expect(e.actualSuccess).toBe(true);
      expect(e.metadata.dice).toEqual([c.replacementDie]);
      expect(e.metadata.originalDice).toEqual({
        Die: { DieType: 0, Value: 1 }
      });
      expect(e.metadata.preRoll!.ordinaryMoveAvailability).toMatchObject({
        knownAvailablePlayerIds: [],
        unknownPlayerIds: possible
      });
      expect(b).toMatchObject({
        minimumMoves: 0,
        maximumMoves: possible.length,
        successChance: 5 / 6,
        lower: 0
      });
      expect(b.upper).toBeCloseTo(possible.length / 6, 12);
      expect(b.activeContinuation).toBeUndefined();
      expect(e.probabilitySuccess).toBeCloseTo(35 / 36, 12);
      expect(e.delta).toBeCloseTo(1 / 36, 12);
      expect(e.contextualImpact).toBeUndefined();
      expect(e.possessionBounds).toBeUndefined();
      expect(e.metadata.teamRerollMovement).toMatchObject({
        rollType: 1,
        movementBefore: null,
        movementAfter: null,
        carriesBall: false
      });
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
      expect(explainContextBounds(e)).toContain(
        "replacement Rush die had 83.3% success"
      );
      expect(explainContextBounds(e)).toContain(
        "later damage dice are outside"
      );
      if (c.completed)
        expect(
          e.metadata.preRoll!.ordinaryMoveAvailability!.unknownPlayerIds
        ).toContain(c.completed.actorId);
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
    }
  );
  it.each(raw.cases)(
    "joins the independent $id fact set to its complete hashed public replay",
    (c) => {
      const data = readFileSync(`demo-replays/${c.sourceFile}`);
      expect(createHash("sha256").update(data).digest("hex")).toBe(c.sha256);
      const r = analyzeNufflizerInput(data.toString()),
        e = r.events.find(
          (e) =>
            e.metadata.locator?.replayStep === c.finalStep &&
            e.contextualBounds?.policy === "team_reroll_rush_moves"
        )!;
      expect(e.playerId).toBe(c.actorId);
      expect(e.metadata.preRoll?.teamTurn).toBe(Number(c.teamTurn));
      expect(
        e.metadata.preRoll?.ordinaryMoveAvailability?.unknownPlayerIds
      ).toEqual(c.possiblePlayerIds);
      expect(e.contextualBounds!.upper).toBeCloseTo(fraction(c.upper), 12);
      expect(
        r.contextComponents
          .find((t) => t.teamId === e.teamId)!
          .byCategory.find((t) => t.type === "movement_risk")!.eventIds
      ).toContain(e.id);
    }
  );
  it("regenerates raw and exact arithmetic facts without the application scorer", () => {
    const result = spawnSync(
      "python3",
      ["scripts/extract-terminal-rush-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("5/6");
    expect(raw.retainedFailure.scope).toContain(
      "not a failed committed replacement"
    );
    // A genuine terminal retained-original failure is separately verified; its
    // decline must not be relabeled as a spent replacement to fill a gap.
    expect(raw.retainedFailure.replayStep).toBe(337);
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo2.bbr", "utf8")
    );
    const failed = r.events.find((e) => e.metadata.sourceId === "source-2704")!;
    expect(failed.actualSuccess).toBe(false);
    expect(failed.metadata.movementFall).toBeDefined();
    expect(failed.contextualBounds?.policy).toBe("kept_rush_terminal_moves");
    expect(failed.metadata.teamRerollsSpent).toBe(0);
  });
  it("has zero expected terminal contribution for every fixed eligible count", () => {
    const context = terminal(report()).metadata.preRoll!;
    for (const count of [0, 1, 3, 5]) {
      const fixed = {
        ...context,
        ordinaryMoveAvailability: {
          ...context.ordinaryMoveAvailability!,
          knownAvailablePlayerIds: [],
          unknownPlayerIds: Array.from({ length: 5 }, (_, i) => String(i))
        }
      };
      let mean = 0;
      for (let face = 1; face <= 6; face++) {
        const contribution = (Number(face >= 2) - 5 / 6) * count;
        mean += contribution / 6;
        const b = estimateTeamRushMoveBounds(fixed, face >= 2, 5 / 6, 123)!;
        expect(contribution).toBeGreaterThanOrEqual(b.lower - 1e-12);
        expect(contribution).toBeLessThanOrEqual(b.upper + 1e-12);
      }
      expect(mean).toBeCloseTo(0, 12);
    }
  });
  it.each([
    "offer",
    "used",
    "gamer",
    "original",
    "status",
    "new-roll",
    "target",
    "modifier",
    "declaration",
    "combined",
    "do-move",
    "owner",
    "phase",
    "clock",
    "position",
    "carrier",
    "unknown-ball"
  ])("withholds source %s contradictions", (kind) => {
    const s = source();
    const info = s.question.payload!.RollInfos as Record<string, unknown>;
    if (kind === "offer") s.question.payload!.CanUseTeamReroll = 0;
    if (kind === "used") s.choice.payload!.Used = 0;
    if (kind === "gamer") s.choice.payload!.GamerId = 0;
    if (kind === "original")
      (info.Dice as { Die: { Value: number } }).Die.Value = 6;
    if (kind === "status") s.final.payload!.Status = 1;
    if (kind === "new-roll") s.final.payload!.NewRoll = 0;
    if (kind === "target") {
      info.Difficulty = info.Requirement = 3;
      s.final.payload!.Difficulty = s.final.payload!.Requirement = 3;
    }
    if (kind === "modifier")
      s.final.payload!.Modifiers = { Modifier: { Code: 3, Value: -1 } };
    if (kind === "declaration") {
      s.declaration.payload!.Action = 3;
      s.declaration.actionCode = 3;
    }
    if (kind === "combined")
      s.events.find((e) => e.id === s.proof.outcomeSourceId)!.payload!.Rolls = {
        RollSummary: [
          { RollType: 1, Outcome: 1 },
          { RollType: 2, Outcome: 1 }
        ]
      };
    if (kind === "do-move")
      s.events.find((e) => e.id === s.proof.doMoveSourceId)!.sourceTag =
        "UnknownTransition";
    if (kind === "owner") s.final.attributionConflict = true;
    if (kind === "phase") s.waiting.board!.phaseCode = 3;
    if (kind === "clock") s.waiting.board!.teams[1]!.gameTurn = 9;
    if (kind === "position")
      s.waiting.board!.teams[1]!.players.find(
        (p) => String(p.id) === s.final.playerId
      )!.cell.x = 22;
    if (kind === "carrier" || kind === "unknown-ball")
      for (const cp of s.replay.boardCheckpoints!) {
        cp.board!.ball.possession = kind === "carrier" ? "held" : "unknown";
        cp.board!.ball.carrierId =
          kind === "carrier" ? Number(s.final.playerId) : null;
      }
    const r = analyzeReplayLuck(s.replay);
    expect(
      r.events.some(
        (e) => e.contextualBounds?.policy === "team_reroll_rush_moves"
      )
    ).toBe(false);
  });
  it.each([
    "policy",
    "family",
    "chance",
    "endpoint",
    "checkpoint",
    "continuation",
    "proof",
    "point"
  ])("rejects public %s forgeries", (kind) => {
    const r = report(),
      e = terminal(r),
      b = e.contextualBounds!;
    if (kind === "policy") b.policy = "team_reroll_terminal_moves";
    if (kind === "family") e.metadata.rollType = 2;
    if (kind === "chance") b.successChance = 35 / 36;
    if (kind === "endpoint") b.upper = 5 / 36;
    if (kind === "checkpoint") b.terminalCheckpointAfter = 0;
    if (kind === "continuation")
      b.activeContinuation = { minimum: 1, maximum: 1 };
    if (kind === "proof") delete e.metadata.teamRerollMovement;
    if (kind === "point")
      e.contextualImpact = { contribution: b.upper } as NonNullable<
        typeof e.contextualImpact
      >;
    expect(() => LuckReportSchema.safeParse(r)).not.toThrow();
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("preserves the prefix result without future observations or input mutation", () => {
    const s = source(),
      saved = structuredClone(s.replay),
      before = analyzeReplayLuck(s.replay);
    expect(s.replay).toEqual(saved);
    const end = s.events.find(
      (e) => e.id === s.proof.outcomeSourceId
    )!.sourceIndex!;
    s.replay.boardCheckpoints = s.replay.boardCheckpoints!.filter(
      (c) => c.afterSourceIndex < end
    );
    s.replay.turns = s.replay.turns
      .map((t) => ({
        ...t,
        events: t.events.filter((e) => e.sourceIndex! <= end)
      }))
      .filter((t) => t.events.length);
    expect(terminal(analyzeReplayLuck(s.replay))!.contextualBounds).toEqual(
      terminal(before)!.contextualBounds
    );
  });
  it("does not turn an inserted duplicate kept summary into another opportunity", () => {
    const s = source(),
      turn = s.replay.turns.find((t) => t.events.includes(s.final))!;
    const copy = {
      ...s.final,
      id: "duplicate-kept-summary",
      payload: { ...s.final.payload, NewRoll: 0 }
    };
    turn.events.splice(turn.events.indexOf(s.final) + 1, 0, copy);
    expect(terminal(analyzeReplayLuck(s.replay))).toBeUndefined();
  });
  it("leaves carriers, unknown holders and other source policies unpriced", () => {
    for (const id of [
      "team_rush_carrier",
      "team_rush_touchdown",
      "team_rush_carrier_unknown_side",
      "team_rush_move",
      "team_rush_unknown_ball_after_dodge"
    ])
      expect(terminal(report(id))).toBeUndefined();
  });
  it("prints the source-linked conditional Rush range through CLI", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/nufflizier.ts",
        "analyze",
        "demo-replays/demo2.bbr",
        "--format",
        "text"
      ],
      { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("replacement Rush die had 83.3% success");
    expect(result.stdout).toContain("0 to 5 other players");
    expect(result.stdout).toContain(
      "-7.50 to 1.83 provisional context units across 3 reported components"
    );
  });
});
