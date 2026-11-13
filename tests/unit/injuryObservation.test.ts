import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import {
  formatActualOutcome,
  explainInjuryObservation
} from "@/domain/nufflizer/presentation";
import { encodedMessage, envelope } from "../helpers/replay";
import { projectionXml, playbackFragment } from "../helpers/playback";
const fixture = "tests/fixtures/evidence/bb3-injury-observations.json";
const evidence = JSON.parse(readFileSync(fixture, "utf8"));
type Sample = {
  id: string;
  subjectId: number;
  recordedName: string;
  acceptedScope: boolean;
  messageIndex: number;
  row: {
    step: Parameters<typeof projectionXml>[0];
    messages: Parameters<typeof projectionXml>[0][];
  };
};
const samples = evidence.cases as Sample[];
function xml(c: Sample = samples[0]!, owner = "1") {
  const roster = (id: string, player: number) =>
    `<TeamState><Data><TeamId>${id}</TeamId></Data><ListPitchPlayers><PlayerState><Id>${player}</Id></PlayerState></ListPitchPlayers></TeamState>`;
  const initial = `<NotificationGameJoined><InitialBoardState><ListTeams>${roster(owner, c.subjectId)}${roster(owner === "0" ? "1" : "0", 90000)}</ListTeams></InitialBoardState></NotificationGameJoined>`;
  return envelope(
    initial +
      `<EventExecuteSequence><Sequence><StepResult><Step><MessageData>${encodedMessage(projectionXml(c.row.step))}</MessageData></Step><Results>${c.row.messages.map((m) => `<StringMessage><MessageData>${encodedMessage(projectionXml(m))}</MessageData></StringMessage>`).join("")}</Results></StepResult></Sequence></EventExecuteSequence>`
  );
}
const report = (c: Sample = samples[0]!, owner = "1") =>
  analyzeNufflizerInput(xml(c, owner));
const check = (r: ReturnType<typeof report>) =>
  r.events.find((e) => e.metadata.injuryObservation)!;
function raw() {
  const r = parseReplayXml(xml()),
    p = check(analyzeReplayLuck(r)),
    events = r.turns.flatMap((t) => t.events);
  return {
    r,
    p,
    events,
    step: events.find((e) => e.sourceTag === "DamageStep")!,
    roll: events.find((e) => e.id === p.metadata.sourceId)!
  };
}
describe("observed injury result is distinct from odds and final availability", () => {
  it.each(samples.filter((c) => c.acceptedScope))(
    "pairs $id with the independent UI result $recordedName without inventing odds",
    (c) => {
      const r = report(c),
        e = check(r);
      expect(e).toBeDefined();
      expect(LuckReportSchema.safeParse(r).success).toBe(true);
      expect(formatActualOutcome(e)).toBe(`${c.recordedName} (recorded)`);
      expect(e).toMatchObject({
        playerId: String(c.subjectId),
        teamId: "1",
        type: "injury",
        scoringStatus: "excluded",
        probabilitySuccess: null,
        actualSuccess: null,
        delta: 0,
        weightedDelta: 0
      });
      expect(e.metadata.isRollCandidate).toBe(true);
      expect(e.metadata.injuryObservation!.subjectTeamId).toBe("1");
      expect(e.metadata.normalizationFlags).not.toContain(
        "missing_target_threshold"
      );
      expect(e.contextualImpact).toBeUndefined();
      expect(explainInjuryObservation(e)).toContain(
        "does not establish final posture"
      );
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
    }
  );
  it("keeps the pending Apothecary code1/Badly Hurt counterexample outside the direct result namespace", () => {
    const c = samples.find((c) => !c.acceptedScope)!;
    expect(c.recordedName).toBe("Badly Hurt");
    const r = report(c),
      e = r.events.find((e) => e.metadata.rollType === 11)!;
    expect(e.metadata.outcomeCode).toBe(1);
    expect(e.metadata.sourceTag).toBe("QuestionApothecaryCasualtyUsage");
    expect(e.metadata.injuryObservation).toBeUndefined();
    expect(formatActualOutcome(e)).toBe("Unknown");
    expect(e.metadata.apothecary).toBeUndefined();
    expect(e.probabilitySuccess).toBeNull();
  });
  it("distinguishes Thick Skull's observed total8 Stunned from the observed total8 KO instead of calculating a table", () => {
    // Compare explicit paired rows rather than a runtime threshold formula.
    const stunned = samples.find(
      (c) => c.id.startsWith("UI-035") && c.subjectId === 9
    )!;
    const ko = samples.find(
      (c) => c.id.startsWith("UI-044") && c.subjectId === 8
    )!;
    const a = check(report(stunned)),
      b = check(report(ko));
    expect(a.metadata.dice!.reduce((x, y) => x + y, 0)).toBe(8);
    expect(b.metadata.dice!.reduce((x, y) => x + y, 0)).toBe(8);
    expect(a.metadata.injuryObservation!.outcome).toBe("stunned");
    expect(b.metadata.injuryObservation!.outcome).toBe("ko");
    expect(a.probabilitySuccess).toBeNull();
    expect(b.probabilitySuccess).toBeNull();
  });
  it.each([
    "version",
    "turn-inferred",
    "outcome1",
    "outcome3",
    "status",
    "die",
    "modifier",
    "source",
    "owner",
    "target",
    "evaluation",
    "applied",
    "duplicate-step",
    "unknown-field"
  ])("withholds unverified %s evidence", (kind) => {
    const x = raw();
    if (kind === "version") x.r.replayVersion = "2-0-0-0";
    if (kind === "turn-inferred") x.roll.actorTeamSource = "turn_inferred";
    if (kind === "outcome1") x.roll.payload!.Outcome = 1;
    if (kind === "outcome3") x.roll.payload!.Outcome = 3;
    if (kind === "status") x.roll.payload!.Status = 2;
    if (kind === "die")
      (x.roll.payload!.Dice as { Die: { DieType: number }[] }).Die[0]!.DieType =
        4;
    if (kind === "modifier")
      x.roll.payload!.Modifiers = { Modifier: { Value: "unknown" } };
    if (kind === "source") x.roll.payload!.Source = 3;
    if (kind === "owner") x.roll.actorTeamId = "0";
    if (kind === "target") x.roll.stepTargetId = "90000";
    if (kind === "evaluation") x.step.payload!.IsEvaluation = 1;
    if (kind === "applied") x.step.payload!.Applied = 0;
    if (kind === "duplicate-step")
      x.r.turns[0]!.events.unshift({
        ...structuredClone(x.step),
        id: "duplicate-step"
      });
    if (kind === "unknown-field") x.roll.payload!.UnknownPolicy = 1;
    expect(
      analyzeReplayLuck(x.r).events.some((e) => e.metadata.injuryObservation)
    ).toBe(false);
  });
  it("preserves parsed input, ownership perspectives and original dice while labeling observations", () => {
    const x = raw(),
      before = JSON.stringify(x.r);
    analyzeReplayLuck(x.r);
    expect(JSON.stringify(x.r)).toBe(before);
    const a = check(report(samples[0], "0")),
      b = check(report(samples[0], "1"));
    expect(a.metadata.injuryObservation!.outcome).toBe(
      b.metadata.injuryObservation!.outcome
    );
    expect(a.teamId).toBe("0");
    expect(b.teamId).toBe("1");
    expect(a.metadata.dice).toEqual(b.metadata.dice);
  });
  it.each([
    "name",
    "record",
    "subject",
    "source",
    "step",
    "score",
    "point",
    "dice"
  ])("rejects forged public %s observation", (kind) => {
    const r = report(),
      e = check(r),
      o = e.metadata.injuryObservation!;
    if (kind === "name") o.outcome = "ko";
    if (kind === "record") o.recordKind = "embedded_ko";
    if (kind === "subject") o.subjectId = "90000";
    if (kind === "source") o.sourceCode++;
    if (kind === "step") o.damageStepSourceIndex = e.metadata.sourceIndex!;
    if (kind === "score") e.probabilitySuccess = 0.5;
    if (kind === "point") e.contextualImpact = { contribution: 1 } as never;
    if (kind === "dice") e.metadata.dice = [1];
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("links a single embedded KO original while keeping a repeated question non-random and unlabeled", () => {
    const c = samples.find((c) => c.id.startsWith("UI-025"))!,
      x = parseReplayXml(xml(c)),
      events = x.turns[0]!.events,
      q = events.find((e) => e.sourceTag === "QuestionKORecovery")!;
    const direct = {
      ...structuredClone(q),
      sourceTag: "ResultInjuryRoll",
      id: "prior-injury",
      payload: structuredClone(q.payload!.RollInfos) as Record<string, unknown>,
      sourceIndex: q.sourceIndex!
    };
    events.splice(events.indexOf(q), 0, direct);
    q.sourceIndex!++;
    const r = analyzeReplayLuck(x),
      original = r.events.find((e) => e.metadata.sourceId === "prior-injury")!,
      question = r.events.find((e) => e.metadata.sourceId === q.id)!;
    expect(original.metadata.injuryObservation!.outcome).toBe("ko");
    expect(question.metadata.embeddedDamageOriginalId).toBe("prior-injury");
    expect(question.metadata.injuryObservation).toBeUndefined();
    expect(question.metadata.isRollCandidate).toBe(false);
  });
  it("does not turn an observed crowd injury label into final off-pitch or posture state without its own chain", () => {
    const c = samples.find((c) => c.id.startsWith("UI-095"))!,
      r = report(c),
      e = check(r);
    expect(e.metadata.injuryObservation!.outcome).toBe("stunned");
    expect(e.metadata.damage?.crowd).toBeUndefined();
    expect(r.damageSteps).toEqual([]);
    expect(e.contextualImpact).toBeUndefined();
    expect(e.metadata.preRoll).toBeUndefined();
  });
  it("retains a recorded Casualty when a separately scored Regeneration succeeds later", () => {
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(playbackFragment("001", "UI-068", [6], [37]))
    );
    const injury = check(r),
      recovery = r.events.find((e) => e.metadata.damage?.regeneration)!;
    expect(injury.metadata.injuryObservation!.outcome).toBe("casualty");
    expect(injury.actualSuccess).toBeNull();
    expect(injury.probabilitySuccess).toBeNull();
    expect(recovery.actualSuccess).toBe(true);
    expect(recovery.probabilitySuccess).toBe(0.5);
    expect(explainInjuryObservation(injury)).toContain(
      "Later mitigation and state observations remain separate"
    );
  });
  it("reconciles full-demo observations against independently decoded source locators and preserves all unverified code3 records", () => {
    const files = [
      ...new Set(
        evidence.rawEmissions.map((x: { sourceFile: string }) => x.sourceFile)
      )
    ] as string[];
    const counts: Record<string, number> = {};
    let unknown3 = 0;
    for (const f of files) {
      const r = analyzeNufflizerInput(
        readFileSync("demo-replays/" + f, "utf8")
      );
      for (const e of r.events) {
        const o = e.metadata.injuryObservation;
        if (o) {
          const l = e.metadata.locator!;
          const raw = evidence.rawEmissions.find(
            (x: {
              sourceFile: string;
              replayStep: number;
              childIndex: number;
              stepIndex: number;
              messageIndex: number;
            }) =>
              x.sourceFile === f &&
              x.replayStep === l.replayStep &&
              x.childIndex === l.childIndex &&
              x.stepIndex === l.stepIndex &&
              x.messageIndex === l.messageIndex
          );
          expect(raw).toBeDefined();
          expect(raw.roll.Outcome).toEqual([String(e.metadata.outcomeCode)]);
          expect(raw.step.DamageStep.PlayerId).toEqual([e.playerId]);
          counts[o.outcome] = (counts[o.outcome] ?? 0) + 1;
        }
        if (
          e.metadata.sourceTag === "ResultInjuryRoll" &&
          e.metadata.outcomeCode === 3
        ) {
          unknown3++;
          expect(o).toBeUndefined();
        }
      }
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
    expect(unknown3).toBe(8);
    expect(counts).toEqual({ stunned: 119, ko: 64, casualty: 55 });
  }, 60000);
  it("[cli-worker] reproduces source facts independently and prints known outcomes with Not scored in the CLI", () => {
    const dir = mkdtempSync(join(tmpdir(), "nuff-injury-")),
      out = join(dir, "facts.json"),
      source = join(dir, "source.xml");
    try {
      const run = spawnSync(
        "python3",
        ["scripts/extract-injury-observations.py", "--output", out],
        { encoding: "utf8", timeout: 30000 }
      );
      expect(run.status, run.stderr).toBe(0);
      expect(readFileSync(out, "utf8")).toBe(readFileSync(fixture, "utf8"));
      writeFileSync(source, xml());
      const cli = spawnSync(
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
      expect(cli.status, cli.stderr).toBe(0);
      expect(cli.stdout).toContain("Stunned (recorded); Not scored");
      expect(cli.stdout).toContain("unverified odds");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
