import {
  activationAftermathFragment,
  activationContextXml
} from "../helpers/activationReplay";
import { applyActivationEnds } from "@/domain/replay/activationEnds";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { findMentalActivationEnds } from "@/domain/replay/activationEnds";
import { reconstructReplayContext } from "@/domain/replay/reconstructContext";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

describe("terminal mental traits and ordinary Move completion", () => {
  it.each(["bone_head_fresh", "really_stupid_kept"])(
    "retains the exact terminal policy from %s",
    (id) => {
      const replay = parseReplayXml(activationAftermathFragment(id));
      const ends = findMentalActivationEnds(replay);
      expect(ends).toHaveLength(1);
      expect(ends[0]!.policy).toBe(
        id === "bone_head_fresh"
          ? "fresh_final"
          : id === "really_stupid_kept"
            ? "kept_original"
            : "team_loner_replacement"
      );
      const report = LuckReportSchema.parse(analyzeReplayLuck(replay));
      expect(
        report.events.find((e) => e.metadata.activationEnd)?.metadata
          .activationEnd
      ).toMatchObject({ actorId: ends[0]!.actorId });
    }
  );
  it("ends an ordinary Move when the next teammate acts despite retained CanAct1", () => {
    const replay = parseReplayXml(activationAftermathFragment("ordinary_move"));
    const { preRollEvidence: contexts, activationEnds: ends } =
      reconstructReplayContext(replay, []);
    const completed = [...ends.values()].filter(
      (e) => e.kind === "ordinary_move_completed"
    );
    expect(completed).toHaveLength(1);
    expect(completed[0]!.actorId).toBe("46");
    expect(completed[0]!.followingPlayerId).toBe("37");
    expect(
      contexts.get(completed[0]!.sourceId)?.endedActivationSourceIds
    ).toContain(completed[0]!.sourceId);
    LuckReportSchema.parse(analyzeReplayLuck(replay));
  });

  it.each(["move", "mental", "replacement"] as const)(
    "changes later useful activation counts for %s, retaining separate dice odds",
    (kind) => {
      const r = LuckReportSchema.parse(
        analyzeReplayLuck(parseReplayXml(activationContextXml(kind)))
      );
      const ended = r.events.find((e) => e.metadata.activationEnd)!;
      expect(r.coverage.contextEvidence.consequenceCount).toBe(
        kind === "move" ? 0 : 1
      );
      expect(ended).toBeDefined();
      const dodge = r.events.find(
        (e) => e.scoringStatus === "scored" && e.type === "dodge"
      )!;
      expect(dodge.metadata.preRoll?.otherUsefulActivations).toBe(1);
      expect(dodge.metadata.preRoll?.endedActivationSourceIds).toEqual([
        ended.metadata.sourceId
      ]);
      expect(dodge.contextualImpact?.contribution).toBeCloseTo(-5 / 6, 12);
      expect(dodge.probabilitySuccess).toBeCloseTo(5 / 6, 12);
      if (kind === "replacement")
        expect(ended.metadata.activationEnd?.policy).toBe(
          "team_loner_replacement"
        );
    }
  );
  it.each(["move", "mental"] as const)(
    "preserves source snapshots and distinct tackle-zone consequences for %s",
    (kind) => {
      const replay = parseReplayXml(activationContextXml(kind));
      const { activationEnds: ends } = reconstructReplayContext(replay, []);
      const end = [...ends.values()][0]!;
      const board = replay.boardCheckpoints!.find(
        (c) => c.afterSourceIndex === end.checkpointAfter
      )!.board!;
      const copy = structuredClone(board);
      const input = new Map([[end.actorId, end]]);
      const reduced = applyActivationEnds(board, input);
      const actor = reduced.board.teams[0]!.players.find((p) => p.id === 42)!;
      expect(actor.canAct).toBe(false);
      expect(actor.tackleZone).toBe(kind === "move");
      expect(board).toEqual(copy);
      expect(input.size).toBe(1);
      const changed = structuredClone(board);
      changed.teams[0]!.gameTurn = 2;
      expect(applyActivationEnds(changed, input).ends.size).toBe(0);
    }
  );
  it.each(["move", "mental", "replacement"] as const)(
    "does not change earlier pre-roll evidence using later %s confirmation",
    (kind) => {
      const replay = parseReplayXml(activationContextXml(kind));
      const full = analyzeReplayLuck(replay);
      const confirmation = full.events.find((e) => e.metadata.activationEnd)!;
      const prefix = structuredClone(replay);
      prefix.turns = prefix.turns.map((t) => ({
        ...t,
        events: t.events.filter(
          (e) => e.sourceIndex! < confirmation.metadata.sourceIndex!
        )
      }));
      const partial = analyzeReplayLuck(prefix);
      for (const event of partial.events)
        expect(event.metadata.preRoll).toEqual(
          full.events.find(
            (e) => e.metadata.sourceId === event.metadata.sourceId
          )?.metadata.preRoll
        );
      expect(partial.events.some((e) => e.metadata.activationEnd)).toBe(false);
    }
  );
  it("keeps the sampled Loner3+ failure outside the 4+ replacement policy", () => {
    expect(
      findMentalActivationEnds(
        parseReplayXml(activationAftermathFragment("failed_loner_unsupported"))
      )
    ).toHaveLength(0);
  });

  it.each([
    "unknown",
    "turn",
    "intermediate_clock",
    "period",
    "side",
    "same_actor",
    "owner",
    "die",
    "target",
    "effect",
    "decision",
    "loner"
  ] as const)(
    "withholds mental consequences for contradictory %s evidence",
    (change) => {
      const replay = parseReplayXml(activationContextXml("replacement"));
      const events = replay.turns.flatMap((t) => t.events);
      const effect = events.find(
        (e) => e.sourceTag === "ResultAddPlayerEffect"
      )!;
      const following = events.find(
        (e) =>
          e.sourceTag === "ResultUseAction" &&
          e.sourceIndex! > effect.sourceIndex!
      )!;
      const after = replay.boardCheckpoints!.find(
        (c) => c.afterSourceIndex >= effect.sourceIndex!
      )!.board!;
      if (change === "unknown") {
        const turn = replay.turns.find((t) => t.events.includes(effect))!;
        turn.events.splice(turn.events.indexOf(effect) + 1, 0, {
          sourceTag: "EventUnknownMutation",
          type: "unknown",
          sourceIndex: effect.sourceIndex
        });
      }
      if (change === "intermediate_clock") {
        const middle = structuredClone(
          replay.boardCheckpoints!.find(
            (c) => c.afterSourceIndex >= effect.sourceIndex!
          )!
        );
        middle.afterSourceIndex = events.find(
          (e) => e.sourceTag === "QuestionTeamRerollUsage"
        )!.sourceIndex!;
        middle.board!.periodCode = 1;
        replay.boardCheckpoints!.push(middle);
        replay.boardCheckpoints!.sort(
          (a, b) => a.afterSourceIndex - b.afterSourceIndex
        );
      }
      if (change === "turn") after.teams[0]!.gameTurn = 2;
      if (change === "period") after.periodCode = 1;
      if (change === "side") after.activeTeamIndex = 1;
      if (change === "same_actor") following.playerId = "42";
      if (change === "owner") following.actorTeamId = "1";
      if (change === "die")
        events.find((e) => e.rollType === 34)!.payload!.Outcome = 1;
      if (change === "target") {
        const terminal = events.find((e) => e.rollType === 34)!;
        terminal.payload!.Difficulty = 4;
        delete terminal.payload!.Modifiers;
      }
      if (change === "effect")
        (effect.payload!.Effect as Record<string, unknown>).ProviderId = 33;
      if (change === "decision")
        events.find(
          (e) => e.sourceTag === "ResultTeamRerollUsage"
        )!.payload!.Used = 0;
      if (change === "loner")
        events.find((e) => e.rollType === 71)!.payload!.Outcome = 0;
      expect(findMentalActivationEnds(replay)).toHaveLength(0);
      expect(
        analyzeReplayLuck(replay).events.some((e) => e.metadata.activationEnd)
      ).toBe(false);
    }
  );
  it.each([
    "unknown",
    "turn",
    "period",
    "side",
    "cell",
    "missing_movement",
    "owner"
  ] as const)("withholds ordinary Move completion after %s", (change) => {
    const replay = parseReplayXml(activationContextXml());
    const events = replay.turns.flatMap((t) => t.events);
    const move = events.find((e) => e.sourceTag === "ResultMoveOutcome")!;
    const following = events.find(
      (e) =>
        e.sourceTag === "ResultUseAction" && e.sourceIndex! > move.sourceIndex!
    )!;
    const after = replay.boardCheckpoints!.find(
      (c) => c.afterSourceIndex >= move.sourceIndex!
    )!.board!;
    if (change === "unknown") {
      const turn = replay.turns.find((t) => t.events.includes(move))!;
      turn.events.splice(turn.events.indexOf(move) + 1, 0, {
        sourceTag: "EventUnknownMutation",
        type: "unknown",
        sourceIndex: move.sourceIndex
      });
    }
    if (change === "turn") after.teams[0]!.gameTurn = 2;
    if (change === "period") after.periodCode = 1;
    if (change === "side") after.activeTeamIndex = 1;
    if (change === "owner") following.actorTeamId = "1";
    if (change === "cell")
      after.teams[0]!.players.find((p) => p.id === 42)!.cell.x = 12;
    if (change === "missing_movement") move.payload!.Moved = 0;
    const { activationEnds: ends } = reconstructReplayContext(replay, []);
    expect(ends.size).toBe(0);
    const report = analyzeReplayLuck(replay);
    expect(
      report.events.find((e) => e.metadata.sourceId === following.id)?.metadata
        .activationEnd
    ).toBeUndefined();
  });
  it("rejects broken source links and fabricated terminal policies at the shared boundary", () => {
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(parseReplayXml(activationContextXml("replacement")))
    );
    const end = r.events.find((e) => e.metadata.activationEnd)!.metadata
      .activationEnd!;
    end.lonerSkillSourceId = "missing-skill";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
    end.policy = "fresh_final";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
