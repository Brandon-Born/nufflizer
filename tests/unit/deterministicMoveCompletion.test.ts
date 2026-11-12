import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { reconstructReplayContext } from "@/domain/replay/reconstructContext";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

type Fact = {
  sourceFile: string;
  startStep: number;
  confirmationStep: number;
  actorId: string;
  followingPlayerId: string;
  before: { teamId: string; teamTurn: string; Period: string | null };
  after: { actorCell: { x: number; y: number } };
};
const reference = JSON.parse(
  readFileSync(
    "tests/fixtures/evidence/bb3-deterministic-move-completion.json",
    "utf8"
  )
) as { sources: Record<string, { sha256: string }>; cases: Fact[] };
const source = () =>
  parseReplayXml(
    decodeReplayInput(readFileSync("demo-replays/demo7.bbr", "utf8")).xml,
    { omitRawReplaySteps: true }
  );
const original = source();
function atStep(r: typeof original, step: number, tag: string) {
  return r.turns
    .flatMap((t) => t.events)
    .find((e) => e.locator?.replayStep === step && e.sourceTag === tag)!;
}

describe("deterministic ordinary Move completion across verified waits", () => {
  it("corroborates all admitted initial-member receipts against independent raw facts", () => {
    let admitted = 0;
    for (const [file, provenance] of Object.entries(reference.sources)) {
      const input = readFileSync("demo-replays/" + file);
      expect(createHash("sha256").update(input).digest("hex")).toBe(
        provenance.sha256
      );
      const r = parseReplayXml(decodeReplayInput(input.toString()).xml, {
        omitRawReplaySteps: true
      });
      const events = new Map(
        r.turns.flatMap((t) => t.events).map((e) => [e.id, e])
      );
      for (const end of reconstructReplayContext(r).activationEnds.values()) {
        if (
          end.completionCheckpointAfter === undefined ||
          end.rosterCheckpointAfter !== undefined
        )
          continue;
        admitted++;
        const decl = events.get(end.declarationSourceId)!,
          confirmation = events.get(end.sourceId)!;
        const fact = reference.cases.find(
          (f) =>
            f.sourceFile === file &&
            f.startStep === decl.locator?.replayStep &&
            f.confirmationStep === confirmation.locator?.replayStep &&
            f.actorId === end.actorId
        )!;
        expect(fact).toBeDefined();
        expect(end).toMatchObject({
          actorCell: fact.after.actorCell,
          followingPlayerId: fact.followingPlayerId,
          teamId: fact.before.teamId,
          teamTurn: Number(fact.before.teamTurn),
          periodCode:
            fact.before.Period === null ? null : Number(fact.before.Period)
        });
        expect(end.completionCheckpointAfter).toBeLessThan(end.sourceIndex);
      }
    }
    expect(reference.cases).toHaveLength(389);
    expect(admitted).toBe(360);
  }, 20000);
  it("removes only the independently completed actors from the two later demo7 bounds", () => {
    const r = LuckReportSchema.parse(analyzeReplayLuck(original));
    const at = (step: number) =>
      r.events.find(
        (e) => e.contextualBounds && e.metadata.locator?.replayStep === step
      )!;
    const first = at(284),
      second = at(405);
    expect(
      first.metadata.preRoll?.ordinaryMoveAvailability?.unknownPlayerIds
    ).toEqual(["39", "40", "41", "42", "43", "47", "48"]);
    expect(first.contextualBounds?.maximumMoves).toBe(7);
    expect(first.contextualBounds?.lower).toBeCloseTo(1 / 6, 12);
    expect(first.contextualBounds?.upper).toBeCloseTo(4 / 3, 12);
    expect(
      second.metadata.preRoll?.ordinaryMoveAvailability?.unknownPlayerIds
    ).toEqual(["41", "42", "44"]);
    expect(second.contextualBounds).toMatchObject({
      minimumMoves: 0,
      maximumMoves: 3,
      lower: 0
    });
    expect(second.contextualBounds?.upper).toBeCloseTo(1 / 2, 12);
    expect(second.metadata.preRoll?.endedActivationSourceIds).toEqual([
      "source-3065",
      "source-3090"
    ]);
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    expect(first.probabilitySuccess).toBeCloseTo(35 / 36, 12);
    expect(second.probabilitySuccess).toBeCloseTo(35 / 36, 12);
  });
  it.each([
    "phase",
    "controller",
    "field",
    "after_clock",
    "after_cell",
    "extra_checkpoint",
    "die",
    "skill",
    "push",
    "step_skill"
  ])("withholds the new completion on %s", (change) => {
    const r = structuredClone(original),
      events = r.turns.flatMap((t) => t.events);
    const wait = atStep(r, 283, "EventRulesEngineStandBy");
    const checkpoint = r.boardCheckpoints!.find(
      (c) => c.afterSourceIndex === wait.sourceIndex
    )!;
    const movement = events.find((e) => e.id === "source-2229")!;
    if (change === "phase") wait.payload!.Phase = "4";
    if (change === "controller") wait.payload!.ActiveGamer = "0";
    if (change === "field") wait.payload!.Extra = 1;
    if (change === "after_clock") checkpoint.board!.teams[1]!.gameTurn = 8;
    if (change === "after_cell")
      checkpoint.board!.teams[1]!.players.find((p) => p.id === 44)!.cell.x = 17;
    if (change === "extra_checkpoint") {
      const c = structuredClone(checkpoint);
      c.afterSourceIndex = movement.sourceIndex! - 1;
      r.boardCheckpoints!.push(c);
      r.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
    }
    if (change === "die")
      movement.payload!.Rolls = { RollSummary: { RollType: 2, Outcome: 1 } };
    if (change === "skill")
      events.find((e) => e.id === "source-2228")!.sourceTag =
        "ResultSkillUsage";
    if (change === "push")
      movement.payload!.Pushbacks = { ResultPushBack: { PushedPlayerId: 44 } };
    if (change === "step_skill")
      events.find(
        (e) => e.sourceTag === "PlayerStep" && e.actionId === movement.actionId
      )!.payload!.Skill = 7;
    expect(
      reconstructReplayContext(r).activationEnds.get("source-2233")
    ).toBeUndefined();
  });
  it("does not use a later declaration or reset to rewrite an earlier pre-roll", () => {
    const r = structuredClone(original),
      full = reconstructReplayContext(r);
    r.turns = r.turns.map((t) => ({
      ...t,
      events: t.events.filter((e) => e.sourceIndex! < 3090)
    }));
    const prefix = reconstructReplayContext(r);
    expect(prefix.activationEnds.has("source-3090")).toBe(false);
    for (const [id, c] of prefix.preRollEvidence)
      expect(c).toEqual(full.preRollEvidence.get(id));
  });
  it("preserves every parsed event and checkpoint", () => {
    const r = structuredClone(original),
      before = JSON.stringify(r);
    reconstructReplayContext(r);
    expect(JSON.stringify(r)).toBe(before);
  });
  it("rejects a forged completed-position checkpoint", () => {
    const r = analyzeReplayLuck(original),
      end = r.events.find((e) => e.metadata.sourceId === "source-3090")!
        .metadata.activationEnd!;
    end.completionCheckpointAfter = end.sourceIndex;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
