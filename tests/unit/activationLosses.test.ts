import { describe, expect, it } from "vitest";
import {
  foulAppearancePlaybackXml,
  foulAppearanceContextXml
} from "../helpers/foulAppearanceReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import {
  findConfirmedActivationLosses,
  applyKnownActivationLosses
} from "@/domain/replay/activationLosses";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const gate = (r: ReturnType<typeof analyzeReplayLuck>) =>
  r.events.find((e) => e.metadata.rollType === 37)!;
const dodge = (r: ReturnType<typeof analyzeReplayLuck>) =>
  r.events.find((e) => e.type === "dodge" && e.scoringStatus === "scored")!;

describe("confirmed player activation losses (NUF-016/017/018/022)", () => {
  it("preserves the spent player's position and tackle zone without changing the snapshot", () => {
    const replay = parseReplayXml(foulAppearancePlaybackXml());
    const loss = findConfirmedActivationLosses(replay)[0]!;
    const board = replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === loss.afterCheckpointAfter
    )!.board!;
    const original = board.teams[1]!.players.find((p) => p.id === 42)!;
    const updated = applyKnownActivationLosses(
      board,
      new Map([[loss.actorId, loss]])
    );
    const actor = updated.board.teams[1]!.players.find((p) => p.id === 42)!;
    expect(actor.canAct).toBe(false);
    expect(actor.cell).toEqual({ x: 13, y: 9 });
    expect(actor.tackleZone).toBe(true);
    expect(original.canAct).toBeNull();
  });
  it("expires the derived status on a changed turn without mutating its inputs", () => {
    const replay = parseReplayXml(foulAppearancePlaybackXml());
    const loss = findConfirmedActivationLosses(replay)[0]!;
    const board = structuredClone(
      replay.boardCheckpoints!.find(
        (c) => c.afterSourceIndex === loss.afterCheckpointAfter
      )!.board!
    );
    board.teams[1]!.gameTurn = 9;
    const input = new Map([[loss.actorId, loss]]);
    const result = applyKnownActivationLosses(board, input);
    expect(result.losses.size).toBe(0);
    expect(input.size).toBe(1);
    expect(
      result.board.teams[1]!.players.find((p) => p.id === 42)!.canAct
    ).toBeNull();
  });
  it("prints observed activation losses in CLI text despite having no scored swings", () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "nufflizier-activation-")
    );
    try {
      const filename = path.join(directory, "source-fragment.xml");
      writeFileSync(filename, foulAppearancePlaybackXml());
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          filename,
          "--format",
          "text"
        ],
        { encoding: "utf8", timeout: 10000 }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("Observed player activation endings: 2");
      expect(result.stdout).toContain(
        "Player 44 then acted in the same recorded team turn 8"
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("keeps UI-099's two actor losses separate from the continued team turn", () => {
    const replay = parseReplayXml(foulAppearancePlaybackXml());
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const losses = r.events.filter((e) => e.metadata.activationLoss);
    expect(losses.map((e) => e.playerId)).toEqual(["42", "44"]);
    expect(
      losses.map((e) => e.metadata.activationLoss!.followingPlayerId)
    ).toEqual(["44", "43"]);
    expect(
      losses.every(
        (e) =>
          e.teamId === "1" &&
          e.actualSuccess === false &&
          e.probabilitySuccess === null &&
          e.scoringStatus === "excluded" &&
          e.metadata.activationLoss!.teamTurn === 8
      )
    ).toBe(true);
    expect(
      losses[0]!.metadata.preRoll?.endedActivationSourceIds
    ).toBeUndefined();
    expect(losses[1]!.metadata.preRoll?.endedActivationSourceIds).toEqual([
      losses[0]!.metadata.sourceId
    ]);
    expect(
      replay.boardCheckpoints!.some((c) =>
        c.board?.teams[1]?.players.some((p) => p.id === 42 && p.canAct === null)
      )
    ).toBe(true);
    const subjectSkill = r.events.find(
      (e) =>
        e.metadata.sourceId ===
        losses[0]!.metadata.activationLoss!.skillSourceId
    )!;
    expect(subjectSkill.playerId).toBe("10");
    expect(subjectSkill.teamId).toBe("0");
    losses[1]!.metadata.activationLoss!.followingActivationSourceId =
      "missing-following";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("removes only the confirmed spent actor from a later useful-move estimate", () => {
    const r = analyzeNufflizerInput(foulAppearanceContextXml());
    const later = dodge(r),
      first = gate(r);
    expect(first.metadata.activationLoss).toBeDefined();
    expect(later.metadata.preRoll).toMatchObject({
      otherUsefulActivations: 1,
      endedActivationSourceIds: [first.metadata.sourceId]
    });
    expect(later.contextualImpact!.contribution).toBeCloseTo(-5 / 6, 12);
    const available = dodge(
      analyzeNufflizerInput(
        foulAppearanceContextXml({ explicitAvailable: true })
      )
    );
    expect(available.metadata.preRoll?.otherUsefulActivations).toBe(2);
    expect(available.contextualImpact!.contribution).toBeCloseTo(-5 / 3, 12);
    expect(later.probabilitySuccess).toBe(available.probabilitySuccess);
  });
  it("does not use later confirmation to change the failed gate's pre-roll state", () => {
    const replay = parseReplayXml(foulAppearanceContextXml());
    const full = analyzeReplayLuck(replay);
    const rollIndex = gate(full).metadata.sourceIndex!;
    const prefix = structuredClone(replay);
    prefix.turns = prefix.turns.map((t) => ({
      ...t,
      events: t.events.filter((e) => (e.sourceIndex ?? Infinity) <= rollIndex)
    }));
    const partial = LuckReportSchema.parse(analyzeReplayLuck(prefix));
    expect(gate(partial).metadata.activationLoss).toBeUndefined();
    expect(gate(partial).metadata.preRoll).toEqual(gate(full).metadata.preRoll);
  });
  it.each([{ interrupt: true }, { nextTurn: true }])(
    "withholds cross-boundary effects for %j",
    (options) => {
      const r = analyzeNufflizerInput(foulAppearanceContextXml(options));
      expect(gate(r).metadata.activationLoss).toBeUndefined();
      expect(dodge(r).contextualImpact).toBeUndefined();
    }
  );
  it.each([
    "skill_owner",
    "contradictory_die",
    "same_actor",
    "turnover"
  ] as const)("rejects unsupported loss evidence after %s", (change) => {
    const replay = parseReplayXml(foulAppearanceContextXml());
    const raw = replay.turns.flatMap((t) => t.events);
    const failed = raw.find((e) => e.rollType === 37)!;
    if (change === "skill_owner")
      raw.find((e) => e.sourceTag === "ResultSkillUsage")!.playerId = "42";
    if (change === "contradictory_die")
      failed.payload!.Dice = { Die: { DieType: 0, Value: 2 } };
    if (change === "same_actor") {
      const next = raw.find(
        (e) =>
          e.sourceTag === "ResultUseAction" &&
          e.sourceIndex! > failed.sourceIndex!
      )!;
      next.playerId = "42";
      next.stepActorId = "42";
    }
    if (change === "turnover") {
      const turn = replay.turns.find((t) => t.events.includes(failed))!;
      turn.events.splice(turn.events.indexOf(failed) + 1, 0, {
        type: "turnover",
        sourceTag: "EventEndTurn",
        sourceIndex: failed.sourceIndex,
        reasonCode: 2
      });
    }
    expect(findConfirmedActivationLosses(replay)).toHaveLength(0);
  });
  it("keeps a future checkpoint out of the earlier reduction", () => {
    const replay = parseReplayXml(foulAppearanceContextXml());
    const before = dodge(analyzeReplayLuck(replay)).metadata.preRoll;
    const future = structuredClone(replay.boardCheckpoints![0]!);
    future.afterSourceIndex = 100000;
    replay.boardCheckpoints!.push(future);
    expect(dodge(analyzeReplayLuck(replay)).metadata.preRoll).toEqual(before);
  });

  it("rejects an intermediate clock change even when the final clock matches again", () => {
    const replay = parseReplayXml(foulAppearanceContextXml());
    const failed = replay.turns
      .flatMap((t) => t.events)
      .find((e) => e.rollType === 37)!;
    const before = structuredClone(
      replay.boardCheckpoints!.find(
        (c) => c.afterSourceIndex < failed.sourceIndex!
      )!
    );
    const restored = structuredClone(before);
    before.afterSourceIndex = failed.sourceIndex! - 2;
    before.board!.periodCode = 1;
    restored.afterSourceIndex = failed.sourceIndex! - 1;
    replay.boardCheckpoints!.push(before, restored);
    replay.boardCheckpoints!.sort(
      (a, b) => a.afterSourceIndex - b.afterSourceIndex
    );
    expect(findConfirmedActivationLosses(replay)).toHaveLength(0);
  });
});
