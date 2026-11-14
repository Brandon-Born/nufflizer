import { validReportedBlockCrowd } from "@/domain/nufflizer/blockCrowd";
import { describe, expect, it } from "vitest";
import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { explainBlockResolution } from "@/domain/nufflizer/presentation";
import { lonerDriveXml } from "../helpers/lonerDrive";
const fixture = "tests/fixtures/evidence/bb3-block-crowd.json";
const xml = (id = "crowd_UI095") => lonerDriveXml(id, fixture);
const report = (id = "crowd_UI095") => analyzeNufflizerInput(xml(id));
const pool = (r: ReturnType<typeof report>) =>
  r.events.find((e) => e.metadata.blockCrowd)!;
function raw() {
  const r = parseReplayXml(xml()),
    events = r.turns.flatMap((t) => t.events),
    p = pool(analyzeReplayLuck(r)),
    c = p.metadata.blockCrowd!;
  const source = (id: string) => events.find((e) => e.id === id)!;
  return {
    r,
    events,
    p,
    c,
    push: source(c.pushSourceId),
    initial: source(c.initialRemovalSourceId),
    last: source(c.finalRemovalSourceId),
    wound: source(c.injurySourceId),
    final: source(p.metadata.block!.finalSourceId!),
    step: events.find(
      (e) => e.sourceTag === "DamageStep" && e.actionId === c.damageActionId
    )!,
    before: r.boardCheckpoints!.find(
      (b) => b.afterSourceIndex === c.beforeCheckpointAfter
    )!,
    after: r.boardCheckpoints!.find(
      (b) => b.afterSourceIndex === c.after.checkpointAfter
    )!
  };
}
describe("source-qualified direct defender crowd damage", () => {
  it("matches independent UI-095 without interpreting Stunned or persisted flags as an on-pitch player", () => {
    const r = report(),
      p = pool(r),
      c = p.metadata.blockCrowd!,
      source = (id: string) =>
        r.events.find((e) => e.metadata.sourceId === id)!;
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
    expect(c).toMatchObject({
      subjectId: "40",
      subjectTeamId: "1",
      from: { x: 17, y: 14 },
      to: { x: 17, y: 15 },
      after: {
        cell: { x: -1, y: -1 },
        situationCode: 1,
        statusCode: null,
        canAct: true,
        tackleZone: true
      }
    });
    const wound = source(c.injurySourceId);
    expect(wound).toMatchObject({
      type: "injury",
      playerId: "40",
      teamId: "1",
      scoringStatus: "excluded",
      probabilitySuccess: null,
      actualSuccess: null,
      weightedDelta: 0,
      metadata: {
        sourceTag: "ResultInjuryRoll",
        rollType: 11,
        dice: [1, 4],
        dieTypes: [0, 0],
        damage: { sourceCode: 2, crowd: { poolSourceId: p.metadata.sourceId } }
      }
    });
    const step = r.damageSteps.find((s) => s.actionId === c.damageActionId)!;
    expect(step).toMatchObject({
      playerId: "40",
      teamId: "1",
      scoredRolls: 0,
      unscoredRolls: 1,
      contextRecords: 1,
      diceContribution: 0
    });
    expect(step.eventIds).toEqual([
      source(c.finalRemovalSourceId).id,
      wound.id
    ]);
    expect(
      step.eventIds.some(
        (id) => r.events.find((e) => e.id === id)?.metadata.rollType === 10
      )
    ).toBe(false);
    expect(p.metadata.blockResolution).toMatchObject({
      damageActionIds: [c.damageActionId],
      unscoredDamageRolls: 1,
      unscoredPool:true,
      diceByTeam: {}
    });
    expect(source(c.initialRemovalSourceId).metadata.crowdRemoval).toEqual({
      reason: 1,
      situation: 1,
      status: 0
    });
    expect(source(c.finalRemovalSourceId).metadata.crowdRemoval).toEqual({
      reason: 0,
      situation: 1,
      status: 0
    });
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    const text = explainBlockResolution(
      p,
      r.teams,
      new Map(
        r.events.flatMap((e) =>
          e.metadata.sourceId ? [[e.metadata.sourceId, e] as const] : []
        )
      )
    )!;
    expect(text).toContain(
      "Two removal records are stages for that one player, not two injuries"
    );
    expect(text).toContain("contains no armor roll");
    expect(text).toContain("Omitted posture remains unknown");
  });
  it.each(["crowd_demo10", "crowd_demo11", "crowd_demo5", "crowd_demo8"])(
    "reconciles the independent %s fragment with one unscored injury and opponent perspective",
    (id) => {
      const r = report(id),
        p = pool(r),
        c = p.metadata.blockCrowd!,
        step = r.damageSteps.find((s) => s.actionId === c.damageActionId)!;
      expect(c.subjectTeamId).not.toBe(p.teamId);
      expect(step.unscoredRolls).toBe(1);
      expect(step.scoredRolls).toBe(0);
      expect(
        p.metadata.blockResolution!.diceByTeam[c.subjectTeamId]
      ).toBeUndefined();
      expect(p.metadata.blockResolution!.unscoredPool).toBe(true);
      expect(p.metadata.blockResolution!.diceByTeam[p.teamId]).toBeUndefined();
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it.each([
    "push-chain",
    "push-player",
    "push-cell",
    "initial-reason",
    "initial-team",
    "damage-source",
    "damage-skill",
    "armor",
    "injury-modifier",
    "injury-die",
    "removal-status",
    "unknown-step"
  ])(
    "withholds unsupported %s instead of inventing a crowd or injury contract",
    (kind) => {
      const x = raw();
      if (kind === "push-chain")
        (x.final.payload!.Pushbacks as Record<string, unknown>).ResultPushBack =
          [x.push.payload, x.push.payload];
      if (kind === "push-player") x.push.payload!.PushedPlayerId = 3;
      if (kind === "push-cell")
        (x.push.payload!.CellTo as { Y: number }).Y = 13;
      if (kind === "initial-reason") x.initial.payload!.Reason = 0;
      if (kind === "initial-team") x.initial.actorTeamId = "0";
      if (kind === "damage-source") x.step.damageSource = 1;
      if (kind === "damage-skill") x.step.payload!.Skill = 95;
      if (kind === "armor") {
        x.last.sourceTag = "ResultRoll";
        x.last.rollType = 10;
      }
      if (kind === "injury-modifier")
        x.wound.payload!.Modifiers = { Modifier: { Value: 1 } };
      if (kind === "injury-die")
        (
          x.wound.payload!.Dice as { Die: { DieType: number }[] }
        ).Die[0]!.DieType = 1;
      if (kind === "removal-status") x.last.payload!.Status = 2;
      if (kind === "unknown-step") x.step.payload!.UnknownPolicy = 1;
      expect(
        analyzeReplayLuck(x.r).events.some((e) => e.metadata.blockCrowd)
      ).toBe(false);
    }
  );
  it.each([
    "before-cell",
    "before-missing",
    "after-cell",
    "after-status",
    "after-situation",
    "clock",
    "phase",
    "controller",
    "owner",
    "duplicate-owner",
    "extra-state"
  ])("rejects contradictory %s observations", (kind) => {
    const x = raw(),
      before = x.before.board!,
      after = x.after.board!,
      p = after.teams[1]!.players.find((p) => p.id === 40)!;
    if (kind === "before-cell")
      before.teams[1]!.players.find((p) => p.id === 40)!.cell.y = 13;
    if (kind === "before-missing") {
      const p = before.teams[1]!.players.find((p) => p.id === 40)!;
      p.cell.y = null;
      p.pitchLocation = "unknown";
    }
    if (kind === "after-cell") {
      p.cell = { x: 17, y: 14 };
      p.pitchLocation = "on_pitch";
    }
    if (kind === "after-status") p.statusCode = 3;
    if (kind === "after-situation") p.situationCode = 2;
    if (kind === "clock") after.teams[0]!.gameTurn!++;
    if (kind === "phase") after.phaseCode = 3;
    if (kind === "controller") after.activeTeamIndex = 1;
    if (kind === "owner") after.teams[1]!.explicitTeamId = 0;
    if (kind === "duplicate-owner")
      after.teams[0]!.players.push(structuredClone(p));
    if (kind === "extra-state") {
      const copy = structuredClone(x.after);
      copy.afterSourceIndex = x.wound.sourceIndex! - 1;
      copy.board!.phaseCode = 4;
      x.r.boardCheckpoints!.splice(
        x.r.boardCheckpoints!.indexOf(x.after),
        0,
        copy
      );
    }
    expect(
      analyzeReplayLuck(x.r).events.some((e) => e.metadata.blockCrowd)
    ).toBe(false);
  });
  it("does not mutate parsed observations or move the missing state into a pre-roll estimate", () => {
    const r = parseReplayXml(xml()),
      before = JSON.stringify(r);
    const result = analyzeReplayLuck(r);
    expect(JSON.stringify(r)).toBe(before);
    const p = pool(result);
    expect(p.contextualImpact).toBeUndefined();
    expect(p.contextualBounds).toBeUndefined();
    expect(result.teams.every((t) => t.impactCount === 0)).toBe(true);
  });
  it("keeps explicit and missing final flags as observations without granting an on-pitch activation", () => {
    const x = raw(),
      p = x.after.board!.teams[1]!.players.find((p) => p.id === 40)!;
    p.canAct = null;
    p.tackleZone = false;
    const r = analyzeReplayLuck(x.r),
      c = pool(r).metadata.blockCrowd!;
    expect(c.after).toMatchObject({
      cell: { x: -1, y: -1 },
      canAct: null,
      tackleZone: false,
      statusCode: null
    });
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
  });
  it("does not turn a duplicated removal summary into another random outcome or dice contribution", () => {
    const x = raw(),
      before = analyzeReplayLuck(x.r);
    const turn = x.r.turns.find((t) => t.events.includes(x.last))!;
    turn.events.splice(turn.events.indexOf(x.last) + 1, 0, {
      ...structuredClone(x.last),
      id: "duplicate-removal"
    });
    const after = analyzeReplayLuck(x.r);
    const dice = (r: typeof before) =>
      r.events
        .filter((e) => e.scoringStatus === "scored")
        .map((e) => [
          e.id,
          e.teamId,
          e.probabilitySuccess,
          e.actualSuccess,
          e.weightedDelta
        ]);
    expect(dice(after)).toEqual(dice(before));
    expect(after.coverage.rollCandidates.scoredCount).toBe(
      before.coverage.rollCandidates.scoredCount
    );
    expect(after.events.filter((e) => e.metadata.isRollCandidate)).toHaveLength(
      before.events.filter((e) => e.metadata.isRollCandidate).length
    );
  });
  it.each([
    "subject",
    "push",
    "removal",
    "injury",
    "checkpoint",
    "snapshot",
    "anchor",
    "step",
    "odds",
    "orphan"
  ])("rejects forged public %s reconciliation", (kind) => {
    const r = report(),
      p = pool(r),
      c = p.metadata.blockCrowd!,
      w = r.events.find((e) => e.metadata.sourceId === c.injurySourceId)!;
    if (kind === "subject") c.subjectTeamId = p.teamId;
    if (kind === "push") c.to.y = 13;
    if (kind === "removal") c.finalRemovalSourceId = c.initialRemovalSourceId;
    if (kind === "injury") c.injurySourceId = c.pushSourceId;
    if (kind === "checkpoint")
      c.beforeCheckpointAfter = c.after.checkpointAfter;
    if (kind === "snapshot") c.after.statusCode = 3;
    if (kind === "anchor")
      w.metadata.damage!.crowd!.poolSourceId = c.pushSourceId;
    if (kind === "step") p.metadata.blockResolution!.damageActionIds = [];
    if (kind === "odds") w.probabilitySuccess = 0.5;
    if (kind === "orphan") delete p.metadata.blockCrowd;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("rejects an unwitnessed extra armor roll or second injury in the public crowd stage", () => {
    const r = report(),
      p = pool(r),
      c = p.metadata.blockCrowd!,
      w = r.events.find((e) => e.metadata.sourceId === c.injurySourceId)!;
    for (const type of ["armor_break", "injury"] as const) {
      const extra = {
        ...structuredClone(w),
        id: "forged-stage",
        type,
        metadata: { ...structuredClone(w.metadata), sourceId: "forged-stage" }
      };
      const sources = new Map(
        [...r.events, extra].flatMap((e) =>
          e.metadata.sourceId ? [[e.metadata.sourceId, e] as const] : []
        )
      );
      expect(
        validReportedBlockCrowd(p, sources, r.coverage.sourceRecordCount)
      ).toBe(false);
    }
  });
  it("matches all four full-demo chains against eleven independently extracted off-pitch push candidates", () => {
    const evidence = JSON.parse(readFileSync(fixture, "utf8")),
      admitted: string[] = [];
    expect(evidence.rawOffPitchPushes).toHaveLength(11);
    for (const file of readdirSync("demo-replays").filter((f) =>
      f.endsWith(".bbr")
    )) {
      const r = analyzeNufflizerInput(
        readFileSync(`demo-replays/${file}`, "utf8")
      );
      for (const p of r.events.filter((e) => e.metadata.blockCrowd)) {
        const c = p.metadata.blockCrowd!,
          push = r.events.find((e) => e.metadata.sourceId === c.pushSourceId)!;
        const raw = evidence.rawOffPitchPushes.find(
          (x: { sourceFile: string; replayStep: number }) =>
            x.sourceFile === file &&
            x.replayStep === push.metadata.locator!.replayStep
        );
        expect(raw.push.PushedPlayerId).toEqual([c.subjectId]);
        expect(Number(raw.push.CellFrom[0].X[0])).toBe(c.from.x);
        expect(Number(raw.push.CellTo[0].Y[0])).toBe(c.to.y);
        admitted.push(`${file}:${p.metadata.sourceId}`);
      }
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    }
    expect(admitted.sort()).toEqual([
      "demo10.bbr:source-2551",
      "demo11.bbr:source-3716",
      "demo5.bbr:source-638",
      "demo8.bbr:source-2747"
    ]);
  }, 60000);
  it("reproduces independent raw facts and the existing UI-095 ordered projection", () => {
    const dir = mkdtempSync(join(tmpdir(), "nuff-crowd-")),
      out = join(dir, "evidence.json");
    try {
      const run = spawnSync(
        "python3",
        ["scripts/extract-block-crowd-evidence.py", "--output", out],
        { encoding: "utf8", timeout: 30000 }
      );
      expect(run.status, run.stderr).toBe(0);
      expect(readFileSync(out, "utf8")).toBe(readFileSync(fixture, "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("[cli-worker] prints crowd removal and the unscored injury through the shared CLI", () => {
    const dir = mkdtempSync(join(tmpdir(), "nuff-crowd-cli-")),
      source = join(dir, "source.xml");
    try {
      writeFileSync(source, xml());
      const run = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          source,
          "--format",
          "text"
        ],
        { encoding: "utf8", timeout: 20000 }
      );
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain(
        "Two removal records are stages for that one player"
      );
      expect(run.stdout).toContain("1 damage roll has unknown odds");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
