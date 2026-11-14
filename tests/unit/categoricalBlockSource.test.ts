import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import raw from "../fixtures/evidence/bb3-block-scoring.json";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";

function fraction(value: string) {
  const [n, d = 1] = value.split("/").map(Number);
  return n! / d;
}
const key = (value: unknown) => JSON.stringify(value);

describe("all-question independent block source inventory", () => {
  let pools = 0,
    scored = 0;
  it.each(raw.files)("joins $file before support filtering", (file) => {
    const bytes = readFileSync(`demo-replays/${file.file}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    const report = analyzeNufflizerInput(bytes.toString());
    expect(LuckReportSchema.safeParse(report).success).toBe(true);
    const questions = new Map(file.questions.map((q) => [key(q.locator), q]));
    const sourceEvents = report.events.filter(
      (e) => e.metadata.sourceTag === "QuestionBlockDice"
    );
    expect(sourceEvents).toHaveLength(file.questions.length);
    for (const q of file.questions) {
      const matches = sourceEvents.filter(
        (e) => key(e.metadata.locator) === key(q.locator)
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]!.metadata.dice).toEqual(q.question.faces);
      expect(matches[0]!.metadata.dieTypes).toEqual(q.question.dieTypes);
      expect(matches[0]!.metadata.rollType).toBe(q.question.rollType);
    }
    const seen = new Set<string>();
    for (const e of report.events.filter((e) => e.metadata.block)) {
      pools++;
      const b = e.metadata.block!,
        sourceKey = key(e.metadata.locator);
      expect(seen.has(sourceKey)).toBe(false);
      seen.add(sourceKey);
      const q = questions.get(sourceKey)!;
      expect(q, `${file.file}/${sourceKey}`).toBeDefined();
      expect(q.header).toMatchObject({
        tag: "PlayerStep",
        actor: Number(b.attackerId),
        target: Number(b.defenderId),
        stepType: 6
      });
      expect(b.pool.faces).toEqual(q.question.faces);
      expect(b.pool.outcomes).toEqual(q.question.outcomes);
      expect(b.pool.rolledIndexes).toEqual(q.question.freshIndexes);
      expect(b.pool.attackerChooses).toBe(q.question.attackerChoice === 1);
      // A raw controller can conflict with the owned choosing roster. The
      // adapter then withholds that role rather than replacing its identity.
      if (b.chooserGamerId !== undefined)
        expect(b.chooserGamerId).toBe(q.question.gamerId);
      if (!e.metadata.blockScoring) {
        expect(e.scoringStatus).toBe("excluded");
        expect(e.probabilitySuccess).toBeNull();
        expect(e.actualSuccess).toBeNull();
        expect(e.weightedDelta).toBe(0);
        continue;
      }
      scored++;
      // This raw last-complete-list hypothesis does NOT decide admission.
      // Independently join its current physical board and prior seed to the
      // runtime receipt before using its exact rational arithmetic reference.
      expect(q.header).toMatchObject({ skill: 0, evaluation: 0 });
      expect(q.current).toMatchObject({ phase: 5, effectsEmpty: true });
      expect(q.reference?.scope).toBe("last_complete_lists_hypothesis");
      const checkpoints = report.rerollResources.flow.clockSnapshots;
      const checkpointIndex = (locator: {
        kind: string;
        replayStep: number | null;
        childIndex: number | null;
      }) => {
        const cp = checkpoints.filter(
          (cp) =>
            cp.source.kind === locator.kind &&
            cp.source.replayStep === locator.replayStep &&
            cp.source.childIndex === locator.childIndex
        );
        expect(cp).toHaveLength(1);
        return cp[0]!.source.checkpointAfter;
      };
      for (const [role, proof] of [
        [q.actor, b.traitEvidence!.attacker],
        [q.defender, b.traitEvidence!.defender]
      ] as const) {
        expect(role).toBeTruthy();
        expect(role!.seed).toBeTruthy();
        expect(role).toMatchObject({
          playerId: Number(proof.playerId),
          rosterIndex: proof.rosterIndex,
          effectsEmpty: true,
          teamEffectsEmpty: true,
          transformationsEmpty: true,
          tackleZone: 1
        });
        expect(proof.currentCheckpointAfter).toBe(
          checkpointIndex(q.current!.locator)
        );
        expect(proof.observedCheckpointAfter).toBe(
          checkpointIndex(role!.seed!.locator)
        );
        expect(proof.observedCheckpointAfter).toBeLessThanOrEqual(
          proof.currentCheckpointAfter
        );
        expect(proof.currentCheckpointAfter).toBeLessThan(
          e.metadata.sourceIndex!
        );
        expect(proof.statusCode).toBe(role!.status);
        expect(role!.status === null || role!.status === 0).toBe(true);
        expect(role!.cell.every((v) => v !== null && v >= 0)).toBe(true);
        expect(proof.traits).toEqual({
          dataPlayerId: role!.seed!.data.playerId,
          playerTypeId: role!.seed!.data.playerType,
          innateSkills: role!.seed!.data.innate,
          acquiredSkills: role!.seed!.data.acquired
        });
        if (role!.explicitTeamId !== null)
          expect(proof.teamId).toBe(String(role!.explicitTeamId));
      }
      expect(e.metadata.blockScoring.observedValue).toBe(q.reference!.observed);
      expect(e.metadata.blockScoring.expectedValue).toBeCloseTo(
        fraction(q.reference!.mean),
        12
      );
      expect(e.delta).toBeCloseTo(fraction(q.reference!.delta), 12);
      expect(e.weightedDelta).toBeCloseTo(fraction(q.reference!.weighted), 12);
      expect(e.probabilitySuccess).toBeNull();
      expect(e.actualSuccess).toBeNull();
    }
    expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
    expect(report.verdict.luckierTeam).toBe("unknown");
  });
  it("retains every question before support and every qualified pool", () => {
    expect(raw.files.reduce((n, f) => n + f.questions.length, 0)).toBe(848);
    expect(pools).toBe(833);
    expect(scored).toBe(15);
  });
  it("regenerates the independent stdlib inventory without application imports", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-block-scoring-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stdout + p.stderr).toBe(0);
  });
});
