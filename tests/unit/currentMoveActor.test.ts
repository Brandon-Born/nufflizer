import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { buildPlayerOwnershipIndex } from "@/domain/replay/attribution";
import { currentMoveActor } from "@/domain/replay/currentMoveActor";
import { reconstructReplayContext } from "@/domain/replay/reconstructContext";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import type { ReplayModel } from "@/domain/replay/types";

const facts = JSON.parse(
  readFileSync(
    "tests/fixtures/evidence/bb3-current-move-completion.json",
    "utf8"
  )
).cases as {
  sourceFile: string;
  sha256: string;
  startStep: number;
  confirmationStep: number;
  actorId: string;
  followingPlayerId: string;
  initialIds: string[];
  after: { actorCell: { x: number; y: number } };
}[];
const sources = new Map(
  ["demo11.bbr", "demo6.bbr"].map((file) => [
    file,
    parseReplayXml(
      decodeReplayInput(readFileSync("demo-replays/" + file, "utf8")).xml,
      { omitRawReplaySteps: true }
    )
  ])
);
const ends = new Map(
  [...sources].map(([file, r]) => [file, reconstructReplayContext(r)])
);
function subject(r: ReplayModel) {
  const events = r.turns.flatMap((t) => t.events);
  return {
    events,
    decl: events.find((e) => e.id === "source-1942")!,
    wait: events.find((e) => e.id === "source-1951")!,
    before: r.boardCheckpoints!.find((c) => c.afterSourceIndex === 1939)!,
    after: r.boardCheckpoints!.find((c) => c.afterSourceIndex === 1951)!
  };
}

describe("fresh current-roster ordinary Move completion", () => {
  it.each(facts)(
    "corroborates $sourceFile/$startStep to $confirmationStep independently",
    (f) => {
      expect(
        createHash("sha256")
          .update(readFileSync("demo-replays/" + f.sourceFile))
          .digest("hex")
      ).toBe(f.sha256);
      expect(f.initialIds).not.toContain(f.actorId);
      const r = sources.get(f.sourceFile)!;
      expect(buildPlayerOwnershipIndex(r).playerToTeam.has(f.actorId)).toBe(
        false
      );
      const event = r.turns
        .flatMap((t) => t.events)
        .find(
          (e) =>
            e.sourceTag === "ResultUseAction" &&
            e.locator?.replayStep === f.confirmationStep
        )!;
      const proof = ends.get(f.sourceFile)!.activationEnds.get(event.id!)!;
      expect(proof).toMatchObject({
        actorId: f.actorId,
        followingPlayerId: f.followingPlayerId,
        actorCell: f.after.actorCell,
        kind: "ordinary_move_completed"
      });
      expect(proof.rosterCheckpointAfter).toBeTypeOf("number");
      expect(
        r.turns
          .flatMap((t) => t.events)
          .find((e) => e.id === proof.declarationSourceId)?.locator?.replayStep
      ).toBe(f.startStep);
    }
  );
  it("excludes the independently completed actor46 from the later terminal failure component", () => {
    const report = LuckReportSchema.parse(
      analyzeReplayLuck(sources.get("demo11.bbr")!)
    );
    const e = report.events.find((e) => e.metadata.sourceId === "source-1960")!;
    expect(
      e.metadata.preRoll?.ordinaryMoveAvailability?.unknownPlayerIds
    ).toEqual(["38", "42", "47"]);
    expect(e.metadata.preRoll?.endedActivationSourceIds).toContain(
      "source-1954"
    );
    expect(e.contextualBounds).toMatchObject({
      minimumMoves: 0,
      maximumMoves: 3,
      lower: -2,
      upper: 0
    });
    expect(e.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
    const end = report.events.find(
      (e) => e.metadata.sourceId === "source-1954"
    )!.metadata.activationEnd!;
    expect(end.rosterCheckpointAfter).toBe(1939);
    expect(end.teamTurn).toBe(6);
    expect(end.periodCode).toBeNull();
  });
  it("leaves parsed attribution and all source snapshots immutable", () => {
    const r = structuredClone(sources.get("demo11.bbr")!),
      before = JSON.stringify(r);
    const s = subject(r),
      owned = currentMoveActor(
        s.decl,
        s.before.board!,
        buildPlayerOwnershipIndex(r),
        r.teams.map((t) => t.id),
        false
      );
    expect(owned).not.toBe(s.decl);
    expect(owned.actorTeamSource).toBe("player_map");
    expect(s.decl.actorTeamSource).toBe("turn_inferred");
    reconstructReplayContext(r);
    expect(JSON.stringify(r)).toBe(before);
  });
  it.each([
    "initial_conflict",
    "initial_ambiguity",
    "explicit_conflict",
    "duplicate_member",
    "missing_id",
    "side",
    "phase",
    "unstable",
    "marker_phase",
    "marker_controller",
    "marker_field",
    "after_clock",
    "after_cell",
    "roll_summary",
    "skill",
    "checkpoint"
  ])("withholds completion after %s", (change) => {
    const r = structuredClone(sources.get("demo11.bbr")!),
      s = subject(r);
    const owner = s.before.board!.teams[1]!;
    if (change === "initial_conflict") r.playerOwnershipKeys!.push("0:46");
    if (change === "initial_ambiguity")
      r.playerOwnershipKeys!.push("0:46", "1:46");
    if (change === "explicit_conflict") s.decl.teamId = "0";
    if (change === "duplicate_member")
      s.before.board!.teams[0]!.players.push(
        structuredClone(owner.players.find((p) => p.id === 46)!)
      );
    if (change === "missing_id") owner.explicitTeamId = null;
    if (change === "side") s.before.board!.activeTeamIndex = 0;
    if (change === "phase") s.before.board!.phaseCode = 3;
    if (change === "unstable") s.before.board!.stable = false;
    if (change === "marker_phase") s.wait.payload!.Phase = "4";
    if (change === "marker_controller") s.wait.payload!.ActiveGamer = "0";
    if (change === "marker_field") s.wait.payload!.Unexpected = 1;
    if (change === "after_clock") s.after.board!.teams[1]!.gameTurn = 7;
    if (change === "after_cell")
      s.after.board!.teams[1]!.players.find((p) => p.id === 46)!.cell.x = 20;
    if (change === "roll_summary")
      s.events.find((e) => e.id === "source-1950")!.payload!.Rolls = {
        RollSummary: { RollType: 2, Outcome: 1 }
      };
    if (change === "skill")
      s.events.find((e) => e.id === "source-1949")!.sourceTag =
        "ResultSkillUsage";
    if (change === "checkpoint") {
      const extra = structuredClone(s.before);
      extra.afterSourceIndex = 1946;
      r.boardCheckpoints!.push(extra);
      r.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
    }
    expect(
      reconstructReplayContext(r).activationEnds.get("source-1954")
    ).toBeUndefined();
  });
  it.each(["ResultRoll", "ResultSkillUsage", "QuestionTeamRerollUsage"])(
    "never promotes the %s actor through the deterministic prefix helper",
    (tag) => {
      const r = sources.get("demo11.bbr")!,
        s = subject(r),
        e = { ...s.decl, sourceTag: tag };
      expect(
        currentMoveActor(
          e,
          s.before.board!,
          buildPlayerOwnershipIndex(r),
          r.teams.map((t) => t.id),
          true
        )
      ).toBe(e);
    }
  );
  it("does not backfill earlier context from the later teammate declaration", () => {
    const r = structuredClone(sources.get("demo11.bbr")!);
    r.turns = r.turns.map((t) => ({
      ...t,
      events: t.events.filter((e) => e.sourceIndex! < 1954)
    }));
    const prefix = reconstructReplayContext(r);
    expect(prefix.activationEnds.has("source-1954")).toBe(false);
    for (const [id, c] of prefix.preRollEvidence)
      expect(c).toEqual(ends.get("demo11.bbr")!.preRollEvidence.get(id));
  });
  it("rejects a forged current-roster ownership checkpoint", () => {
    const report = analyzeReplayLuck(sources.get("demo11.bbr")!);
    const e = report.events.find((e) => e.metadata.sourceId === "source-1954")!;
    e.metadata.activationEnd!.rosterCheckpointAfter = 1951;
    expect(LuckReportSchema.safeParse(report).success).toBe(false);
  });
});
