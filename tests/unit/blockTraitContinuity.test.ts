import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { findBlockTraitEvidence } from "@/domain/replay/traitContinuity";
import { observeBoardCheckpoint } from "@/domain/replay/boardState";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainBlockSkillModel } from "@/domain/nufflizer/presentation";
import { model, rollEvent } from "../helpers/replay";
const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-block-traits.json", "utf8")
).cases as {
  id: string;
  sourceFile: string;
  sha256: string;
  attackerId: string;
  defenderId: string;
  modelSupported: boolean;
  seeds: Record<string, { teamId: string; traits: unknown }>;
  pool: {
    replayStep: number;
    childIndex: number;
    stepIndex: number;
    messageIndex: number;
  };
}[];
function board(data = true) {
  return {
    Effects: "",
    IsStable: 1,
    CurrentPhase: 5,
    ActiveTeam: 0,
    ListTeams: {
      TeamState: [0, 1].map((i) => ({
        Data: { TeamId: i },
        TransformedPlayers: "",
        Effects: "",
        ActivePrayers: "",
        ListPitchPlayers: {
          PlayerState: {
            Id: i ? 7 : 42,
            Cell: { X: i ? 6 : 5, Y: 5 },
            Effects: "",
            TackleZone: 1,
            ...(data
              ? {
                  Data: {
                    Id: i ? 7 : 42,
                    TeamId: i,
                    IdPlayerTypes: 8,
                    InnateSkills: "",
                    AcquiredSkills: ""
                  }
                }
              : {})
          }
        }
      }))
    }
  };
}
function replay() {
  const r = model([
    rollEvent({
      id: "declare",
      sourceIndex: 2,
      sourceTag: "ResultUseAction",
      actionCode: 2,
      payload: { Action: 2 }
    }),
    rollEvent({
      id: "pool",
      sourceIndex: 5,
      sourceTag: "QuestionBlockDice",
      stepTag: "PlayerStep",
      stepType: 6,
      stepActorId: "42",
      stepTargetId: "7",
      targetId: "7"
    })
  ]);
  r.playerOwnershipKeys = ["0:42", "1:7"];
  r.boardCheckpoints = [
    observeBoardCheckpoint(board(), "1-4-0-0", {
      kind: "initial",
      afterSourceIndex: 0,
      replayStep: null,
      childIndex: null
    }),
    observeBoardCheckpoint(board(false), "1-4-0-0", {
      kind: "board",
      afterSourceIndex: 3,
      replayStep: 1,
      childIndex: 0
    })
  ];
  return r;
}
describe("continued intrinsic traits before an offered block pool", () => {
  it("preserves a complete seed across supported messages without mutating or filling raw snapshots", () => {
    const r = replay(),
      before = JSON.stringify(r),
      p = findBlockTraitEvidence(r).get("pool")!;
    expect(p.attacker).toMatchObject({
      playerId: "42",
      teamId: "0",
      observedCheckpointAfter: 0,
      currentCheckpointAfter: 3,
      traits: { dataPlayerId: 42, innateSkills: [], acquiredSkills: [] }
    });
    expect(
      r.boardCheckpoints![1]!.board!.teams[0]!.players[0]!.traits
    ).toBeNull();
    expect(JSON.stringify(r)).toBe(before);
  });
  it("retains the earlier full seed through a corroborating partial refresh, never making missing lists empty", () => {
    const r = replay(),
      p = r.boardCheckpoints![1]!.board!.teams[0]!.players[0]!;
    p.traitsDataPresent = true;
    p.traits = {
      dataPlayerId: 42,
      playerTypeId: 8,
      innateSkills: null,
      acquiredSkills: null
    };
    const result = findBlockTraitEvidence(r).get("pool")!;
    expect(result.attacker.observedCheckpointAfter).toBe(0);
    expect(p.traits.acquiredSkills).toBeNull();
    r.boardCheckpoints!.shift();
    expect(findBlockTraitEvidence(r).size).toBe(0);
  });
  it("continues a previously explicit empty prayer state without converting an omission into a fresh observation", () => {
    const r = replay();
    delete r.boardCheckpoints![1]!.board!.teams[0]!.prayersKnownEmpty;
    expect(
      findBlockTraitEvidence(r).get("pool")!.attacker.prayersCheckpointAfter
    ).toBe(0);
  });
  it("replaces the seed at an explicit complete current observation", () => {
    const r = replay(),
      p = r.boardCheckpoints![1]!.board!.teams[0]!.players[0]!;
    p.traitsDataPresent = true;
    p.traits = {
      dataPlayerId: 42,
      playerTypeId: 9,
      innateSkills: [30],
      acquiredSkills: []
    };
    expect(findBlockTraitEvidence(r).get("pool")!.attacker).toMatchObject({
      observedCheckpointAfter: 3,
      traits: { playerTypeId: 9, innateSkills: [30] }
    });
  });
  it("qualifies complete current owned identities without initial ownership keys or readable names", () => {
    const r = replay();
    r.playerOwnershipKeys = [];
    const proof = findBlockTraitEvidence(r).get("pool")!;
    expect(proof.attacker).toMatchObject({
      playerId: "42",
      teamId: "0",
      observedCheckpointAfter: 0,
      currentCheckpointAfter: 3,
      traits: {
        dataPlayerId: 42,
        playerTypeId: 8,
        innateSkills: [],
        acquiredSkills: []
      }
    });
    expect(proof.defender).toMatchObject({ playerId: "7", teamId: "1" });
  });
  it.each([
    "team-effects",
    "global-effects",
    "prayer",
    "missing-team-effects",
    "missing-global-effects",
    "prayer-missing-seed",
    "unknown-message",
    "unknown-action",
    "unknown-step",
    "unknown-skill",
    "conflict",
    "missing-effects",
    "effects",
    "transformation",
    "missing-transformations",
    "owner",
    "duplicate",
    "id-reuse",
    "type-change",
    "partial-skill-change",
    "missing-seed",
    "future-seed",
    "unknown-rosters",
    "inferred-owner",
    "unordered-checkpoints"
  ])("withholds %s", (kind) => {
    const r = replay(),
      cp = r.boardCheckpoints![1]!,
      p = cp.board!.teams[0]!.players[0]!,
      event = r.turns[0]!.events[0]!;
    if (kind === "team-effects") cp.board!.teams[0]!.effectsKnownEmpty = false;
    if (kind === "global-effects") cp.board!.effectsKnownEmpty = false;
    if (kind === "prayer") cp.board!.teams[0]!.prayersKnownEmpty = false;
    if (kind === "missing-team-effects")
      delete cp.board!.teams[0]!.effectsKnownEmpty;
    if (kind === "missing-global-effects") delete cp.board!.effectsKnownEmpty;
    if (kind === "prayer-missing-seed")
      r.boardCheckpoints!.forEach(
        (c) => delete c.board!.teams[0]!.prayersKnownEmpty
      );
    if (kind === "unknown-message") event.sourceTag = "ResultUnmodeledMutation";
    if (kind === "unknown-action") event.actionCode = 99;
    if (kind === "unknown-step") {
      event.sourceTag = "PlayerStep";
      event.stepType = 99;
      event.payload = { Skill: 0, IsEvaluation: 0 };
    }
    if (kind === "unknown-skill") {
      event.sourceTag = "ResultSkillUsage";
      event.payload = { Skill: 999, Used: 1 };
    }
    if (kind === "conflict") event.attributionConflict = true;
    if (kind === "missing-effects") delete p.effectsKnownEmpty;
    if (kind === "effects") p.effectsKnownEmpty = false;
    if (kind === "transformation")
      cp.board!.teams[0]!.transformationsKnownAbsent = false;
    if (kind === "missing-transformations")
      delete cp.board!.teams[0]!.transformationsKnownAbsent;
    if (kind === "owner") cp.board!.teams[0]!.explicitTeamId = 1;
    if (kind === "duplicate")
      cp.board!.teams[1]!.players.push(structuredClone(p));
    if (["id-reuse", "type-change", "partial-skill-change"].includes(kind)) {
      p.traitsDataPresent = true;
      p.traits = {
        dataPlayerId: kind === "id-reuse" ? 98 : 42,
        playerTypeId: kind === "type-change" ? 99 : 8,
        innateSkills: kind === "partial-skill-change" ? [30] : null,
        acquiredSkills: null
      };
    }
    if (kind === "missing-seed") r.boardCheckpoints!.shift();
    if (kind === "future-seed") {
      r.boardCheckpoints![0]!.afterSourceIndex = 10;
      r.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
    }
    if (kind === "unknown-rosters")
      cp.board!.teams.forEach((t) => (t.explicitTeamId = null));
    if (kind === "inferred-owner")
      r.turns[0]!.events[1]!.actorTeamSource = "turn_inferred";
    if (kind === "unordered-checkpoints") r.boardCheckpoints!.reverse();
    expect(findBlockTraitEvidence(r).size).toBe(0);
  });
  it("accepts physically ordered board refreshes before the same next event", () => {
    const r = replay();
    r.boardCheckpoints![1]!.afterSourceIndex = 0;
    const p = findBlockTraitEvidence(r).get("pool")!;
    expect(p.attacker.currentCheckpointAfter).toBe(0);
    expect(p.attacker.observedCheckpointAfter).toBe(0);
  });
  it.each(["duplicate", "backward", "missing", "invalid_initial"])(
    "rejects ambiguous equal-index checkpoint order: %s",
    (kind) => {
      const r = replay(),
        cp = r.boardCheckpoints![1]!;
      cp.afterSourceIndex = 0;
      if (kind === "missing") cp.childIndex = null;
      else if (kind === "invalid_initial")
        r.boardCheckpoints![0]!.replayStep = 1;
      else {
        const next = structuredClone(cp);
        cp.childIndex = 2;
        next.childIndex = kind === "duplicate" ? 2 : 1;
        r.boardCheckpoints!.push(next);
      }
      expect(findBlockTraitEvidence(r).size).toBe(0);
    }
  );
  it("keeps an established prefix when a later checkpoint has contradictory order", () => {
    const r = replay();
    const before = findBlockTraitEvidence(r).get("pool");
    const later = structuredClone(r.turns[0]!.events[1]!);
    later.id = "later-pool";
    later.sourceIndex = 10;
    r.turns[0]!.events.push(later);
    const first = structuredClone(r.boardCheckpoints![1]!);
    first.afterSourceIndex = 7;
    first.replayStep = 4;
    first.childIndex = 2;
    const invalid = structuredClone(first);
    invalid.childIndex = 1;
    r.boardCheckpoints!.push(first, invalid);
    const evidence = findBlockTraitEvidence(r);
    expect(evidence.get("pool")).toEqual(before);
    expect(evidence.has("later-pool")).toBe(false);
  });
  it.each([
    "EventBuyMercenary",
    "EventRemoveMercenary",
    "ResultPlayerRemoval",
    "ResultPlayerSentOff"
  ])(
    "invalidates the affected %s instance without poisoning an unrelated player",
    (tag) => {
      const r = replay(),
        e = r.turns[0]!.events[0]!;
      e.sourceTag = tag;
      e.playerId = "42";
      expect(findBlockTraitEvidence(r).size).toBe(0);
      e.playerId = "99";
      expect(findBlockTraitEvidence(r).size).toBe(1);
      e.playerId = undefined;
      expect(findBlockTraitEvidence(r).size).toBe(0);
    }
  );
  it("does not recover an invalidated instance from a later omission or future skill observation", () => {
    const r = replay();
    r.turns[0]!.events.splice(
      1,
      0,
      rollEvent({ sourceIndex: 4, sourceTag: "Unmodeled" })
    );
    const future = structuredClone(r.boardCheckpoints![0]!);
    future.afterSourceIndex = 10;
    r.boardCheckpoints!.push(future);
    expect(findBlockTraitEvidence(r).size).toBe(0);
  });
  it.each(facts)(
    "joins independent $id source/initial-data/current-roster facts",
    (f) => {
      const data = readFileSync(`demo-replays/${f.sourceFile}`);
      expect(createHash("sha256").update(data).digest("hex")).toBe(f.sha256);
      const r = analyzeNufflizerInput(data.toString()),
        e = r.events.find(
          (e) =>
            e.metadata.locator?.replayStep === f.pool.replayStep &&
            e.metadata.locator.childIndex === f.pool.childIndex &&
            e.metadata.locator.stepIndex === f.pool.stepIndex &&
            e.metadata.locator.messageIndex === f.pool.messageIndex
        )!;
      expect(e).toBeDefined();
      const b = e.metadata.block!;
      expect(b.traitEvidence!.attacker.traits).toEqual(
        f.seeds[f.attackerId]!.traits
      );
      expect(b.traitEvidence!.defender.traits).toEqual(
        f.seeds[f.defenderId]!.traits
      );
      // The fixture's modelSupported flag records its original policy. The
      // new primary-rule classification changes these two current cases;
      // source facts and the original annotation are not rewritten.
      const classified = ["demo6_10_45", "demo8_2_47"].includes(f.id);
      expect(Boolean(b.skillModel)).toBe(f.modelSupported || classified);
      expect(e.metadata.preRoll?.actorTraits).toBeUndefined();
      expect(e.metadata.preRoll?.targetTraits).toBeUndefined();
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
      if (b.skillModel) {
        const tackleBlock = f.id === "demo6_10_45";
        expect(b.skillModel.expectedValue).toBeCloseTo(
          tackleBlock ? 13 / 18 : 19 / 36,
          12
        );
        expect(b.skillModel.positiveChance).toBeCloseTo(
          tackleBlock ? 3 / 4 : 5 / 9,
          12
        );
        expect(b.skillModel.outcomeDistribution).toEqual(
          tackleBlock
            ? [1 / 36, 0, 0, 0, 8 / 36, 11 / 36, 16 / 36]
            : [1 / 36, 7 / 36, 0, 0, 8 / 36, 0, 20 / 36]
        );
        expect(explainBlockSkillModel(e)).toContain(
          "included once in dice totals"
        );
      } else
        expect(explainBlockSkillModel(e)).toContain(
          "no accepted block outcome model"
        );
    }
  );
  it("regenerates the independent source witnesses", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-block-trait-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stdout + p.stderr).toBe(0);
  });
  it.each([
    "player",
    "team",
    "roster",
    "identity",
    "missing-list",
    "duplicate-list",
    "future",
    "model-policy",
    "model-endpoint",
    "model-outcome",
    "model-distribution",
    "missing-proof"
  ])("rejects a public %s forgery", (kind) => {
    const r = analyzeNufflizerInput(
        readFileSync("demo-replays/demo5.bbr", "utf8")
      ),
      b = r.events.find((e) => e.metadata.block?.skillModel)!.metadata.block!,
      m = b.skillModel!,
      p = b.traitEvidence!.attacker;
    if (kind === "player") p.playerId = "99";
    if (kind === "team") p.teamId = "1";
    if (kind === "roster") p.rosterIndex = 1;
    if (kind === "identity") p.traits.dataPlayerId = 99;
    if (kind === "missing-list") p.traits.acquiredSkills = null;
    if (kind === "duplicate-list") p.traits.innateSkills = [30, 30];
    if (kind === "future") p.observedCheckpointAfter = 100000;
    if (kind === "model-policy") m.wrestlePolicy = "decline";
    // Change a skill where the two explicit Wrestle policies differ; the
    // unchanged outcome table may never survive a contradictory policy.
    if (kind === "model-policy") {
      p.traits.innateSkills = [68];
      b.traitEvidence!.defender.traits.innateSkills = [30];
      m.traitEvidence = structuredClone(b.traitEvidence!);
    }
    if (kind === "model-endpoint") m.expectedValue = 0.99;
    if (kind === "model-outcome") m.poolOutcome = 2;
    if (kind === "model-distribution") m.outcomeDistribution[0] = 0.5;
    if (kind === "missing-proof") b.traitEvidence = undefined;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
});
