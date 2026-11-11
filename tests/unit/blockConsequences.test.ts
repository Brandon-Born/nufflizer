import { formatActualOutcome } from "@/domain/nufflizer/presentation";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { playbackFragment } from "../helpers/playback";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { consistentBlockResolution } from "@/domain/nufflizer/blockConsequences";

const cases = [
  ["002", "UI-061", [4], [38], "push", 7, "4"],
  ["012", "UI-073", [11], [42], "wrestled_prone", 68, "42"],
  ["012", "UI-074", [11], [42], "wrestled_prone", 68, "42"],
  ["014", "UI-076", [3], [39], "defender_down", 30, "3"],
  ["015", "UI-078", [5], [45], "both_down", undefined, undefined]
] as const;
const report = (
  source: string,
  id: string,
  home: readonly number[],
  away: readonly number[]
) =>
  LuckReportSchema.parse(
    analyzeReplayLuck(playbackFragment(source, id, [...home], [...away]))
  );
describe("observed skill-resolved blocks and subject damage", () => {
  it.each(cases)(
    "%s %s retains applied %s consequences without new scored dice",
    (source, id, home, away, outcome, skillId, holder) => {
      const r = report(source, id, home, away);
      const pool = r.events.find((e) => e.metadata.blockResolution)!;
      expect(pool, id).toBeDefined();
      expect(pool.metadata.blockResolution!.outcome).toBe(outcome);
      expect(formatActualOutcome(pool)).toBe(
        pool.actualSuccess ? "Raw target met" : "Raw target missed"
      );
      const uses = pool.metadata.blockResolution!.skillSourceIds.map((id) =>
        r.events.find((e) => e.metadata.sourceId === id)!
      );
      expect(
        uses.map((e) => [e.playerId, e.metadata.skillUsage?.skillId])
      ).toEqual(skillId ? [[holder, skillId]] : []);
      expect(
        uses.every(
          (e) =>
            e.scoringStatus === "excluded" &&
            e.weightedDelta === 0 &&
            !e.metadata.isRollCandidate
        )
      ).toBe(true);
      if (outcome === "wrestled_prone" || outcome === "push")
        expect(pool.metadata.blockResolution!.damageActionIds).toEqual([]);
      const observedRandomCounts: Record<string, number> = {
        "UI-061": 2,
        "UI-073": 1,
        "UI-074": 1,
        "UI-076": 4,
        "UI-078": 5
      };
      expect(r.events.filter((e) => e.metadata.isRollCandidate)).toHaveLength(
        observedRandomCounts[id]!
      );
    }
  );
  it("keeps both-down armor on separate victim teams and counts each existing contribution once", () => {
    const r = report("015", "UI-078", [5], [45]);
    const pool = r.events.find((e) => e.metadata.blockResolution)!;
    const resolution = pool.metadata.blockResolution!;
    expect(resolution.damageActionIds).toHaveLength(2);
    const damage = r.damageSteps.filter((step) =>
      resolution.damageActionIds.includes(step.actionId)
    );
    expect(damage.map((step) => step.playerId)).toEqual(["5", "45"]);
    for (const team of r.teams) {
      const expected =
        (team.teamId === pool.teamId ? pool.weightedDelta : 0) +
        damage
          .filter((step) => step.teamId === team.teamId)
          .reduce((sum, step) => sum + step.diceContribution, 0);
      expect(resolution.diceByTeam[team.teamId]).toBeCloseTo(expected, 12);
    }
    expect(resolution.unscoredDamageRolls).toBe(
      damage.reduce((n, step) => n + step.unscoredRolls, 0)
    );
    expect(
      damage.find((step) => step.playerId === "45")!.unscoredRolls
    ).toBeGreaterThan(0);
  });
  it("links source-backed attacker Tackle to a Stumble knockdown, not a Dodge push", () => {
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo1.bbr", "utf8")
    );
    const pool = r.events.find(
      (e) =>
        e.metadata.locator?.replayStep === 232 && e.metadata.blockResolution
    )!;
    expect(pool.metadata.block).toMatchObject({
      attackerId: "3",
      defenderId: "38",
      selectedFace: 3,
      finalOutcome: 6
    });
    const resolution = pool.metadata.blockResolution!;
    expect(resolution.outcome).toBe("defender_pushed_down");
    expect(
      resolution.skillSourceIds.map((id) =>
        r.events.find((e) => e.metadata.sourceId === id)
      )
    ).toEqual([
      expect.objectContaining({
        playerId: "3",
        metadata: expect.objectContaining({
          skillUsage: { skillId: 57, used: true },
          locator: expect.objectContaining({ replayStep: 233 })
        })
      })
    ]);
    expect(
      r.events.find(
        (e) => e.metadata.sourceId === pool.metadata.block!.finalSourceId
      )?.metadata.locator?.replayStep
    ).toBe(235);
    expect(
      r.damageSteps
        .filter((step) => resolution.damageActionIds.includes(step.actionId))
        .map((step) => step.playerId)
    ).toEqual(["38"]);
  });
  it.each([
    "owner",
    "role",
    "used",
    "unmodeled_skill",
    "extra_selection",
    "unknown",
    "different_actor",
    "applied_outcome",
    "roll_status",
    "skill_fields",
    "final_fields"
  ] as const)("withholds an observed skill consequence after %s", (change) => {
    const replay = playbackFragment("012", "UI-073", [11], [42]);
    const t = replay.turns.find((t) =>
      t.events.some((e) => e.sourceTag === "ResultBlockOutcome")
    )!;
    const skill = t.events.find((e) => e.sourceTag === "ResultSkillUsage")!;
    const selected = t.events.find((e) => e.sourceTag === "ResultBlockRoll")!;
    if (change === "owner") skill.actorTeamId = "0";
    if (change === "roll_status") selected.payload!.RollStatus = 99;
    if (change === "skill_fields") skill.payload!.UnknownEffect = 1;
    if (change === "final_fields")
      t.events.find(
        (e) => e.sourceTag === "ResultBlockOutcome"
      )!.payload!.UnknownEffect = 1;
    if (change === "role") skill.payload!.PlayerId = 99;
    if (change === "used") skill.payload!.Used = 0;
    if (change === "unmodeled_skill") skill.payload!.Skill = 999;
    if (change === "applied_outcome")
      t.events.find(
        (e) => e.sourceTag === "ResultBlockOutcome"
      )!.payload!.Outcome = 1;
    if (change === "extra_selection")
      t.events.splice(t.events.indexOf(selected) + 1, 0, {
        ...selected,
        id: "duplicate-selection"
      });
    if (change === "unknown" || change === "different_actor")
      t.events.splice(
        t.events.indexOf(selected),
        0,
        change === "unknown"
          ? { type: "unknown", sourceTag: "EventUnmodeled" }
          : {
              type: "step",
              sourceTag: "PlayerStep",
              stepType: 6,
              stepActorId: "99"
            }
      );
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
    expect(r.events.some((e) => e.metadata.blockResolution)).toBe(false);
  });
  it.each([
    "skill_link",
    "skill_owner",
    "damage_link",
    "double_damage",
    "subtotal",
    "outcome"
  ] as const)("rejects a forged %s in the shared report", (change) => {
    const r = report("014", "UI-076", [3], [39]);
    const pool = r.events.find((e) => e.metadata.blockResolution)!;
    const resolution = pool.metadata.blockResolution!;
    expect(resolution.damageActionIds).toHaveLength(1);
    if (change === "skill_link")
      resolution.skillSourceIds = [pool.metadata.block!.finalSourceId!];
    if (change === "skill_owner")
      r.events.find(
        (e) => e.metadata.sourceId === resolution.skillSourceIds[0]
      )!.playerId = "39";
    if (change === "damage_link")
      resolution.damageActionIds = [pool.metadata.actionId!];
    if (change === "double_damage")
      resolution.damageActionIds.push(resolution.damageActionIds[0]!);
    if (change === "subtotal") resolution.diceByTeam[pool.teamId] = 100;
    if (change === "outcome") resolution.outcome = "both_down";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    "subject",
    "source",
    "evaluation",
    "sequence",
    "interruption"
  ] as const)(
    "keeps the observed resolution but withholds unproven damage after %s",
    (change) => {
      const replay = playbackFragment("014", "UI-076", [3], [39]);
      const turn = replay.turns.find((t) =>
        t.events.some((e) => e.sourceTag === "DamageStep")
      )!;
      const step = turn.events.find((e) => e.sourceTag === "DamageStep")!;
      if (change === "subject") step.playerId = "3";
      if (change === "source") step.damageSource = 9;
      if (change === "evaluation") step.payload!.IsEvaluation = 1;
      if (change === "sequence") step.sequenceId = "other-sequence";
      if (change === "interruption")
        turn.events.splice(turn.events.indexOf(step), 0, {
          type: "unknown",
          sourceTag: "EventUnmodeled"
        });
      const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
      expect(
        r.events.find((e) => e.metadata.blockResolution)?.metadata
          .blockResolution
      ).toMatchObject({ outcome: "defender_down", damageActionIds: [] });
      expect(r.damageSteps).toHaveLength(1);
    }
  );
  it("source-held-out public Tackle chains retain their own roles and resolution", () => {
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo6.bbr", "utf8")
    );
    const uses = r.events.filter((e) =>
      e.metadata.blockResolution?.skillSourceIds.some(
        (id) =>
          r.events.find((use) => use.metadata.sourceId === id)?.metadata
            .skillUsage?.skillId === 57
      )
    );
    expect(uses.map((e) => e.metadata.block!.attackerId)).toEqual([
      "8",
      "7",
      "8"
    ]);
    expect(
      uses.every(
        (e) =>
          e.metadata.block!.selectedFace === 3 &&
          e.metadata.blockResolution!.outcome === "defender_pushed_down"
      )
    ).toBe(true);
  });
  it("does not change earlier dice or pre-roll state when the future resolution is truncated", () => {
    const replay = playbackFragment("012", "UI-074", [11], [42]);
    const full = analyzeReplayLuck(replay);
    for (const t of replay.turns) {
      const final = t.events.findIndex(
        (e) => e.sourceTag === "ResultBlockOutcome"
      );
      if (final >= 0) t.events = t.events.slice(0, final);
    }
    const prefix = LuckReportSchema.parse(analyzeReplayLuck(replay));
    const pool = prefix.events.find((e) => e.metadata.block)!;
    const original = full.events.find(
      (e) => e.metadata.sourceId === pool.metadata.sourceId
    )!;
    expect(pool.metadata.blockResolution).toBeUndefined();
    expect([
      pool.probabilitySuccess,
      pool.weightedDelta,
      pool.metadata.preRoll
    ]).toEqual([
      original.probabilitySuccess,
      original.weightedDelta,
      original.metadata.preRoll
    ]);
    const scores = (r: typeof full) =>
      r.teams.map((team) => ({
        dice: team.luckScore,
        categories: team.categoryScores,
        context: team.impactScore,
        components: team.impactByType
      }));
    expect(scores(prefix)).toEqual(scores(full));
  });
  it("attaches a rerolled block's aftermath only to the terminal pool and rejects a second attribution", () => {
    const r = report("025", "UI-096", [5], [48]);
    const pools = r.events.filter((e) => e.metadata.block);
    expect(pools.map((e) => e.metadata.block!.pool.faces)).toEqual([[2], [1]]);
    expect(pools[0]!.metadata.blockResolution).toBeUndefined();
    const resolution = pools[1]!.metadata.blockResolution!;
    expect(resolution).toMatchObject({
      outcome: "both_down",
      unscoredDamageRolls: 0
    });
    expect(
      r.damageSteps
        .filter((step) => resolution.damageActionIds.includes(step.actionId))
        .map((step) => step.playerId)
    ).toEqual(["48", "5"]);
    pools[0]!.metadata.blockResolution = structuredClone(resolution);
    const result = LuckReportSchema.safeParse(r);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("Block consequences require their own ordered")
        )
      ).toBe(true);
  });
  it("reconciles all eight independent Tackle source chains, withholding the two unmodeled Sidestep resolutions", () => {
    const evidence = JSON.parse(
      readFileSync("tests/fixtures/evidence/bb3-block-resolutions.json", "utf8")
    ) as {
      cases: {
        sourceFile: string;
        attackerId: string;
        defenderId: string;
        records: {
          replayStep: number;
          messages: Record<string, Record<string, unknown>>[];
        }[];
      }[];
    };
    expect(evidence.cases).toHaveLength(8);
    const reports = new Map(
      ["demo1.bbr", "demo6.bbr"].map((file) => [
        file,
        analyzeNufflizerInput(readFileSync(`demo-replays/${file}`, "utf8"))
      ])
    );
    let admitted = 0,
      unsupported = 0;
    for (const c of evidence.cases) {
      const finalStep = c.records.at(-1)!.replayStep;
      const r = reports.get(c.sourceFile)!;
      const pool = r.events.find(
        (e) =>
          e.metadata.block &&
          e.metadata.block.attackerId === c.attackerId &&
          e.metadata.block.defenderId === c.defenderId &&
          e.metadata.locator?.replayStep === c.records[0]!.replayStep
      )!;
      expect(pool).toBeDefined();
      const sidestep = c.records.some((record) =>
        record.messages.some(
          (message) => message.ResultSkillUsage?.Skill?.toString() === "56"
        )
      );
      if (sidestep) {
        expect(pool.metadata.blockResolution).toBeUndefined();
        unsupported++;
      } else {
        expect(pool.metadata.blockResolution?.outcome).toBe(
          "defender_pushed_down"
        );
        expect(
          r.events.find(
            (f) => f.metadata.sourceId === pool.metadata.block!.finalSourceId
          )?.metadata.locator?.replayStep
        ).toBe(finalStep);
        admitted++;
      }
    }
    expect([admitted, unsupported]).toEqual([6, 2]);
  });
  it("does not equate optional Wrestle with knockdown armor or invent an unnamed skill policy", () => {
    expect(
      consistentBlockResolution(1, 2, "a", "d", [
        { playerId: "d", skillId: 68 }
      ])
    ).toBe(true);
    expect(consistentBlockResolution(1, 5, "a", "d", [])).toBe(false);
    expect(
      consistentBlockResolution(1, 2, "a", "d", [
        { playerId: "a", skillId: 68 },
        { playerId: "d", skillId: 999 }
      ])
    ).toBe(false);
    expect(
      consistentBlockResolution(3, 4, "a", "d", [{ playerId: "a", skillId: 7 }])
    ).toBe(false);
  });
});
