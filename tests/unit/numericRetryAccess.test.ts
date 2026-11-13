import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { gatedDodgePolicy } from "../helpers/gatedDodgePolicy";
import {
  retryAccessFormula,
  validReportedNumericRetryAccess,
  validReportedNumericGatedReplacement
} from "@/domain/nufflizer/numericRetryAccess";
const analyze = (r: ReturnType<typeof gatedDodgePolicy>) =>
  LuckReportSchema.parse(analyzeReplayLuck(r));
const sourcesCache = new Map<string, ReturnType<typeof parseReplayXml>>();
function actual(file: string) {
  if (!sourcesCache.has(file))
    sourcesCache.set(
      file,
      parseReplayXml(
        decodeReplayInput(readFileSync(`demo-replays/${file}.bbr`, "utf8")).xml,
        { omitRawReplaySteps: true }
      )
    );
  return structuredClone(sourcesCache.get(file)!);
}
const sourceCases = [
  { file: "demo9", first: 3154, gate: 3159, kept: 3160, g: 1 / 2, target: 4 },
  { file: "demo11", first: 4546, gate: 4550, kept: 4551, g: 2 / 3, target: 3 }
];
function cut(file: string, limit: number) {
  const r = actual(file);
  r.turns = r.turns
    .map((t) => ({
      ...t,
      events: t.events.filter((e) => e.sourceIndex! <= limit)
    }))
    .filter((t) => t.events.length);
  r.boardCheckpoints = r.boardCheckpoints?.filter(
    (cp) => cp.afterSourceIndex <= limit
  );
  r.endDiceSnapshots = r.endDiceSnapshots?.filter(
    (cp) => cp.afterSourceIndex <= limit
  );
  return r;
}
describe("source-prefix numeric retry access", () => {
  it.each(sourceCases)(
    "does not hide a $file clock barrier by restoring its value before the gate",
    (c) => {
      const input = actual(c.file),
        cp = input.boardCheckpoints!.find(
          (cp) => cp.afterSourceIndex === c.first
        )!;
      const changed = structuredClone(cp),
        restored = structuredClone(cp);
      changed.afterSourceIndex = c.first + 1;
      restored.afterSourceIndex = c.gate - 1;
      changed.board!.periodCode = changed.board!.periodCode === 1 ? 2 : 1;
      input.boardCheckpoints!.push(changed, restored);
      input.boardCheckpoints!.sort(
        (a, b) => a.afterSourceIndex - b.afterSourceIndex
      );
      const r = analyze(input);
      expect(
        r.events.find((e) => e.metadata.sourceIndex === c.gate)!.metadata
          .numericRetryAccess
      ).toBeUndefined();
      expect(
        r.events.find((e) => e.metadata.sourceIndex === c.first)!.delta
      ).toBeCloseTo(-2 / 3, 12);
    }
  );
  it.each(sourceCases)(
    "qualifies all $file gate faces from the actual truncated source",
    (c) => {
      for (let face = 1; face <= 6; face++) {
        const input = cut(c.file, c.gate),
          gate = input.turns
            .flatMap((t) => t.events)
            .find((e) => e.sourceIndex === c.gate)!;
        gate.payload!.Dice = { Die: { DieType: 0, Value: face } };
        gate.payload!.Outcome = Number(face >= c.target);
        const r = analyze(input),
          row = r.events.find((e) => e.metadata.sourceIndex === c.gate)!;
        expect(row.metadata.numericRetryAccess!.originalSourceId).toBe(
          `source-${c.first}`
        );
        expect(row.delta).toBeCloseTo(
          (2 / 3) * (Number(face >= c.target) - c.g),
          12
        );
        expect(
          r.events.find((e) => e.metadata.sourceIndex === c.first)!.delta
        ).toBeCloseTo(-2 / 3, 12);
      }
    }
  );
  it.each(sourceCases)(
    "counts each $file fresh replacement face without future fallout or first ownership transfer",
    (c) => {
      for (let face = 1; face <= 6; face++) {
        const input = cut(c.file, c.kept),
          es = input.turns.flatMap((t) => t.events),
          gate = es.find((e) => e.sourceIndex === c.gate)!,
          replacement = es.find((e) => e.sourceIndex === c.kept)!;
        gate.payload!.Dice = { Die: { DieType: 0, Value: 6 } };
        gate.payload!.Outcome = 1;
        replacement.payload!.Dice = { Die: { DieType: 0, Value: face } };
        replacement.payload!.Outcome = Number(face >= 3);
        replacement.payload!.Status = 2;
        replacement.payload!.NewRoll = 1;
        const r = analyze(input),
          first = r.events.find((e) => e.metadata.sourceIndex === c.first)!,
          next = r.events.find((e) => e.metadata.sourceIndex === c.kept)!;
        expect(first.metadata.numericOriginal).toBeDefined();
        expect(first.delta).toBeCloseTo(-2 / 3, 12);
        expect(next.metadata.numericGatedReplacement).toEqual({
          gateSourceId: `source-${c.gate}`
        });
        expect(next.delta).toBeCloseTo(Number(face >= 3) - 2 / 3, 12);
        const records = r.diceRecords.filter((d) =>
          [
            `source-${c.first}`,
            `source-${c.gate}`,
            `source-${c.kept}`
          ].includes(d.parentSourceId ?? "")
        );
        expect(records).toHaveLength(3);
        expect(
          records.every((d) => d.disposition === "covered_roll" && !d.aliasOf)
        ).toBe(true);
        expect(
          records.find((d) => d.parentSourceId === `source-${c.first}`)!.eventId
        ).toBe(first.id);
      }
    }
  );
  it.each(sourceCases)(
    "rejects an observed pre-gate clock change in $file without backfilling the initial",
    (c) => {
      const input = actual(c.file),
        cp = input.boardCheckpoints!.find(
          (cp) => cp.afterSourceIndex === c.first
        )!;
      cp.board!.periodCode = cp.board!.periodCode === 1 ? 2 : 1;
      const r = analyze(input);
      expect(
        r.events.find((e) => e.metadata.sourceIndex === c.gate)!.metadata
          .numericRetryAccess
      ).toBeUndefined();
      expect(
        r.events.find((e) => e.metadata.sourceIndex === c.first)!.delta
      ).toBeCloseTo(-2 / 3, 12);
    }
  );
  it.each([
    "base_chance",
    "gate_chance",
    "whole_policy_chance",
    "first_link",
    "choice_link",
    "skill_link",
    "kind",
    "category",
    "raw_family",
    "source_order",
    "decision_namespace",
    "resource_spend",
    "original_dice_zero",
    "full_retry",
    "primary_whole_chance",
    "gate_freshness",
    "first_threshold",
    "formula",
    "missing_source"
  ])("rejects a coherent gate forgery: %s", (mutation) => {
    const r = analyze(gatedDodgePolicy()),
      e = r.events.find((e) => e.metadata.numericRetryAccess)!,
      m = e.metadata,
      a = m.numericRetryAccess!;
    const first = r.events.find(
        (e) => e.metadata.sourceId === a.originalSourceId
      )!,
      choice = r.events.find((e) => e.metadata.sourceId === a.choiceSourceId)!;
    if (mutation === "base_chance") a.baseSuccessChance = 1 / 2;
    if (mutation === "gate_chance") a.gateSuccessChance = 2 / 3;
    if (mutation === "whole_policy_chance")
      a.fixedPolicySuccessChance = 35 / 36;
    if (mutation === "first_link") a.originalSourceId = a.skillSourceId;
    if (mutation === "choice_link") a.choiceSourceId = a.skillSourceId;
    if (mutation === "skill_link") a.skillSourceId = a.choiceSourceId;
    if (mutation === "kind") a.kind = "pro";
    if (mutation === "category") e.type = "ball_handling";
    if (mutation === "raw_family") m.rollType = 2;
    if (mutation === "source_order")
      m.sourceIndex = choice.metadata.sourceIndex;
    if (mutation === "decision_namespace")
      choice.metadata.teamRerollDecision!.gamerId = 1;
    if (mutation === "resource_spend") m.teamRerollsSpent = 0;
    if (mutation === "original_dice_zero") m.originalDice = 0;
    if (mutation === "full_retry") m.rerollUsed = true;
    if (mutation === "primary_whole_chance")
      e.probabilitySuccess = a.fixedPolicySuccessChance;
    if (mutation === "missing_source") {
      r.diceRecords.find(
        (d) => d.parentSourceId === m.sourceId
      )!.parentSourceId = undefined;
      m.sourceId = undefined;
    }
    if (mutation === "gate_freshness")
      r.diceRecords.find((d) => d.parentSourceId === m.sourceId)!.newRoll = 0;
    if (mutation === "first_threshold") first.metadata.difficulty = 2;
    e.delta =
      a.baseSuccessChance * (Number(e.actualSuccess) - a.gateSuccessChance);
    e.weightedDelta = e.delta * e.explainability.weight;
    e.explainability.formulaSummary = retryAccessFormula(
      a.baseSuccessChance,
      a.gateSuccessChance,
      e.actualSuccess!,
      e.explainability.weight
    );
    if (mutation === "formula")
      e.explainability.formulaSummary = "unqualified policy";
    const sources = new Map(r.events.map((e) => [e.metadata.sourceId!, e])),
      roots = new Map(
        r.diceRecords
          .filter((d) => d.path.join(".") === "Dice")
          .map((d) => [d.parentSourceId, d])
      );
    expect(validReportedNumericRetryAccess(e, sources, roots)).toBe(false);
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    "gate_link",
    "failed_gate",
    "resource",
    "original_dice_zero",
    "policy_claim",
    "freshness",
    "category",
    "threshold",
    "outcome",
    "location",
    "missing_source"
  ])("rejects the replacement forgery %s", (mutation) => {
    const r = analyze(gatedDodgePolicy(3, 1, 6, 6)),
      e = r.events.find((e) => e.metadata.numericGatedReplacement)!,
      m = e.metadata,
      gate = r.events.find((e) => e.metadata.numericRetryAccess)!;
    if (mutation === "missing_source") {
      r.diceRecords.find(
        (d) => d.parentSourceId === m.sourceId
      )!.parentSourceId = undefined;
      m.sourceId = undefined;
    }
    if (mutation === "gate_link")
      m.numericGatedReplacement!.gateSourceId =
        gate.metadata.numericRetryAccess!.originalSourceId;
    if (mutation === "failed_gate") gate.actualSuccess = false;
    if (mutation === "resource") m.teamRerollsSpent = 1;
    if (mutation === "original_dice_zero") m.originalDice = 0;
    if (mutation === "policy_claim")
      m.rerollPolicy = "unconditional_full_retry";
    if (mutation === "freshness")
      r.diceRecords.find((d) => d.parentSourceId === m.sourceId)!.newRoll = 0;
    if (mutation === "category") e.type = "ball_handling";
    if (mutation === "threshold") m.difficulty = 2;
    if (mutation === "outcome") m.outcomeCode = 0;
    if (mutation === "location") m.locator!.messageIndex = 4;
    const sources = new Map(r.events.map((e) => [e.metadata.sourceId!, e])),
      roots = new Map(
        r.diceRecords
          .filter((d) => d.path.join(".") === "Dice")
          .map((d) => [d.parentSourceId, d])
      );
    expect(validReportedNumericGatedReplacement(e, sources, roots)).toBe(false);
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  for (const c of [
    { kind: "loner" as const, threshold: 4 as const },
    { kind: "loner" as const, threshold: 3 as const },
    { kind: "pro" as const, threshold: 3 as const }
  ])
    for (const policy of ["always", "odd", "never"])
      it(`enumerates every ${c.kind}${c.threshold} ${policy} application decision tree without outcome bias`, () => {
        for (let target = 2; target <= 6; target++) {
          let total = 0,
            successes = 0;
          for (let first = 1; first <= 6; first++)
            for (let gate = 1; gate <= 6; gate++)
              for (let replacement = 1; replacement <= 6; replacement++) {
                const use =
                    first < target &&
                    (policy === "always" ||
                      (policy === "odd" && first % 2 === 1)),
                  passed = gate >= c.threshold;
                const r = analyze(
                  gatedDodgePolicy(
                    target,
                    first,
                    gate,
                    replacement,
                    use,
                    c.kind,
                    c.threshold
                  )
                );
                const rows = r.events.filter(
                    (e) => e.scoringStatus === "scored"
                  ),
                  p = (7 - target) / 6,
                  g = (7 - c.threshold) / 6;
                const initial = Number(first >= target) - p,
                  access = use
                    ? ((7 - target) *
                        (6 * Number(passed) - (7 - c.threshold))) /
                      36
                    : 0;
                const retry =
                  use && passed ? Number(replacement >= target) - p : 0;
                expect(rows).toHaveLength(use ? (passed ? 3 : 2) : 1);
                const sum = rows.reduce((n, e) => n + e.delta, 0);
                expect(sum).toBeCloseTo(initial + access + retry, 12);
                expect(r.coverage.diceRecords.coveredCount).toBe(rows.length);
                const a = rows.find((e) => e.metadata.numericRetryAccess);
                if (use) {
                  expect(a!.probabilitySuccess).toBeCloseTo(g, 12);
                  expect(
                    a!.metadata.numericRetryAccess!.fixedPolicySuccessChance
                  ).toBeCloseTo(p + (1 - p) * g * p, 12);
                  expect(a!.metadata.teamRerollsSpent).toBe(
                    c.kind === "loner" ? 1 : 0
                  );
                }
                expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
                total += sum;
                successes += Number(
                  first >= target || (use && passed && replacement >= target)
                );
              }
          expect(total / 216).toBeCloseTo(0, 12);
          const chosen = Array.from(
            { length: target - 1 },
            (_, i) => i + 1
          ).filter(
            (f) => policy === "always" || (policy === "odd" && f % 2 === 1)
          ).length;
          expect(successes).toBe(
            36 * (7 - target) + chosen * (7 - c.threshold) * (7 - target)
          );
        }
      });
  it.each(["loner", "pro"] as const)(
    "scores every %s gate face before any future result",
    (kind) => {
      for (let face = 1; face <= 6; face++) {
        const r = gatedDodgePolicy(3, 1, face, 6, true, kind);
        r.turns[0]!.events.pop();
        const report = analyze(r),
          gate = report.events.find((e) => e.metadata.sourceId === "source-6")!;
        const g = kind === "loner" ? 1 / 2 : 2 / 3,
          p = 2 / 3;
        expect(gate.scoringStatus).toBe("scored");
        expect(gate.type).toBe("dodge");
        expect(gate.probabilitySuccess).toBeCloseTo(g, 12);
        expect(gate.delta).toBeCloseTo(
          p * (Number(face >= (kind === "loner" ? 4 : 3)) - g),
          12
        );
        expect(
          report.events.find((e) => e.metadata.sourceId === "source-2")!.delta
        ).toBeCloseTo(-p, 12);
        expect(report.coverage.diceRecords.coveredCount).toBe(2);
      }
    }
  );
  it.each([
    "skill_holder",
    "skill_declined",
    "skill_unknown",
    "gamer",
    "option_mix",
    "gate_new",
    "gate_status",
    "gate_modifier",
    "gate_extra",
    "gate_outcome",
    "resume_state",
    "resume_geometry",
    "resume_unknown",
    "resume_actor",
    "raw_version",
    "unknown_message",
    "star_missing",
    "header_probability",
    "action_missing",
    "sequence_missing"
  ])(
    "withholds the new policy at %s without losing its known initial",
    (mutation) => {
      for (const kind of ["loner", "pro"] as const) {
        const r = gatedDodgePolicy(3, 1, 2, 6, true, kind),
          es = r.turns[0]!.events,
          q = es[1]!,
          resume = es[2]!,
          choice = es[3]!,
          skill = es[4]!,
          gate = es[5]!;
        if (mutation === "star_missing") delete q.payload!.StarSpecialRule;
        if (mutation === "header_probability") {
          es[0]!.payload!.Probability = "unknown";
          resume.payload!.Probability = "unknown";
        }
        if (mutation === "action_missing")
          for (const e of [resume, choice, skill, gate]) e.actionId = undefined;
        if (mutation === "sequence_missing")
          for (const e of [resume, choice, skill, gate])
            e.sequenceId = undefined;
        if (mutation === "skill_holder") skill.payload!.PlayerId = 7;
        if (mutation === "skill_declined") skill.payload!.Used = 0;
        if (mutation === "skill_unknown") skill.payload!.Skill = 999;
        if (mutation === "gamer") choice.payload!.GamerId = 1;
        if (mutation === "option_mix")
          q.payload![
            kind === "loner" ? "CanUseProReroll" : "CanUseTeamReroll"
          ] = 1;
        if (mutation === "gate_new") gate.payload!.NewRoll = 0;
        if (mutation === "gate_status") gate.payload!.Status = 2;
        if (mutation === "gate_modifier")
          gate.payload!.Modifiers = { Modifier: { Value: 1 } };
        if (mutation === "gate_extra") gate.payload!.UnknownPolicy = 1;
        if (mutation === "gate_outcome") gate.payload!.Outcome = 1;
        if (mutation === "resume_state") resume.payload!.State = 3;
        if (mutation === "resume_geometry")
          resume.payload!.CellTo = { X: 8, Y: 2 };
        if (mutation === "resume_unknown") resume.payload!.UnknownPolicy = 1;
        if (mutation === "resume_actor")
          resume.playerId = resume.stepActorId = "7";
        if (mutation === "raw_version") r.replayVersion = "unknown";
        if (mutation === "unknown_message")
          resume.sourceTag = "EventUnknownGatePolicy";
        const report = analyze(r);
        expect(
          report.events.some(
            (e) =>
              e.metadata.numericRetryAccess ||
              e.metadata.numericGatedReplacement
          )
        ).toBe(false);
        if (mutation !== "raw_version")
          expect(
            report.events
              .filter((e) => e.scoringStatus === "scored")
              .reduce((n, e) => n + e.delta, 0)
          ).toBeCloseTo(-2 / 3, 12);
      }
    }
  );
  it.each([
    "missing",
    "new_flag",
    "status",
    "threshold",
    "modifier",
    "unknown_field",
    "outcome"
  ])("retains a passed gate when its later replacement is %s", (mutation) => {
    const r = gatedDodgePolicy(3, 1, 6, 6),
      es = r.turns[0]!.events,
      last = es[6]!;
    if (mutation === "missing") es.pop();
    if (mutation === "new_flag") last.payload!.NewRoll = 0;
    if (mutation === "status") last.payload!.Status = 1;
    if (mutation === "threshold")
      last.payload!.Requirement = last.payload!.Difficulty = 4;
    if (mutation === "modifier")
      last.payload!.Modifiers = { Modifier: { Value: 1 } };
    if (mutation === "unknown_field") last.payload!.UnknownPolicy = 1;
    if (mutation === "outcome") last.payload!.Outcome = 0;
    const report = analyze(r);
    expect(
      report.events.find((e) => e.metadata.sourceId === "source-6")!.delta
    ).toBeCloseTo(1 / 3, 12);
    expect(report.events.some((e) => e.metadata.numericGatedReplacement)).toBe(
      false
    );
    expect(
      report.events.find((e) => e.metadata.sourceId === "source-2")!.delta
    ).toBeCloseTo(-2 / 3, 12);
  });
  it.each(["loner", "pro"] as const)(
    "retains all actual stages of a successful %s gate",
    (kind) => {
      const report = analyze(gatedDodgePolicy(3, 1, 6, 6, true, kind));
      expect(
        report.events.filter((e) => e.scoringStatus === "scored")
      ).toHaveLength(3);
      const replacement = report.events.find(
        (e) => e.metadata.sourceId === "source-7"
      )!;
      expect(replacement.probabilitySuccess).toBeCloseTo(2 / 3, 12);
      expect(replacement.delta).toBeCloseTo(1 / 3, 12);
      expect(replacement.metadata.rerollDraws).toBeUndefined();
      expect(report.coverage.diceRecords.coveredCount).toBe(3);
    }
  );
  it.each([
    { file: "demo9", gate: 3159, delta: -1 / 3 },
    { file: "demo11", gate: 4550, delta: -4 / 9 }
  ])("scores $file's actual gate with its raw family", (c) => {
    const r = parseReplayXml(
      decodeReplayInput(readFileSync(`demo-replays/${c.file}.bbr`, "utf8")).xml,
      { omitRawReplaySteps: true }
    );
    const report = analyze(r),
      e = report.events.find((e) => e.metadata.sourceIndex === c.gate)!;
    expect(e.scoringStatus).toBe("scored");
    expect(e.metadata.rollType).toBe(c.file === "demo9" ? 71 : 15);
    expect(e.delta).toBeCloseTo(c.delta, 12);
  });
});

it.each(sourceCases)(
  "[cli-worker] exports $file's independently scored retry access and first",
  (c) => {
    const run = (format: string) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "src/cli/nufflizier.ts",
          "analyze",
          `demo-replays/${c.file}.bbr`,
          "--format",
          format
        ],
        { encoding: "utf8", timeout: 20000, maxBuffer: 4_000_000 }
      );
    const json = run("json");
    expect(json.status, json.stderr).toBe(0);
    const r = LuckReportSchema.parse(JSON.parse(json.stdout)),
      gate = r.events.find((e) => e.metadata.sourceIndex === c.gate)!;
    expect(gate.metadata.probabilityPolicy).toBe("gated_retry_access");
    expect(gate.delta).toBeCloseTo(-(2 / 3) * c.g, 12);
    expect(
      r.events.find((e) => e.metadata.sourceIndex === c.first)!.delta
    ).toBeCloseTo(-2 / 3, 12);
    const text = run("text");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain(
      `source source-${c.gate}: ${c.file === "demo9" ? "Loner" : "Pro"} did not grant access to one Dodge retry`
    );
    expect(text.stdout).toContain(
      "single-Dodge chance times (gate result minus gate chance)"
    );
    expect(text.stdout).toContain("original die");
  },
  30000
);
