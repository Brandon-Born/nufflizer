import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { gatedRetryChance } from "@/domain/nufflizer/failedNumericRetry";
import {
  explainFailedNumericRetry,
  explainObservedDice
} from "@/domain/nufflizer/presentation";
import { findFailedNumericRetries } from "@/domain/nufflizer/failedNumericRetry";
import { findTeamDiceIdentities } from "@/domain/nufflizer/diceIdentityLinks";
import { findNumericQuestionOriginals } from "@/domain/nufflizer/numericQuestionOriginal";
import { inventoryDiceRecords } from "@/domain/nufflizer/diceEvidence";
import {
  applyCurrentOwnership,
  createOwnershipTimeline
} from "@/domain/replay/ownershipTimeline";

const cases = [
  {
    file: "demo9",
    first: 3154,
    choice: 3157,
    skill: 3158,
    gate: 3159,
    kept: 3160,
    kind: "loner",
    chance: 7 / 9,
    gateChance: 1 / 2,
    spent: 1
  },
  {
    file: "demo11",
    first: 4546,
    choice: 4548,
    skill: 4549,
    gate: 4550,
    kept: 4551,
    kind: "pro",
    chance: 22 / 27,
    gateChance: 2 / 3,
    spent: 0
  }
] as const;
const cache = new Map<string, ReturnType<typeof parseReplayXml>>();
function source(file: string) {
  if (!cache.has(file))
    cache.set(
      file,
      parseReplayXml(
        decodeReplayInput(readFileSync(`demo-replays/${file}.bbr`, "utf8")).xml,
        { omitRawReplaySteps: true }
      )
    );
  return structuredClone(cache.get(file)!);
}
const analyze = (replay: ReturnType<typeof source>) =>
  LuckReportSchema.parse(analyzeReplayLuck(replay));
describe("failed gated numeric retry policies", () => {
  it("rejects both candidates when any physical policy prefix is offered twice", () => {
    for (const c of cases) {
      const input = source(c.file),
        ownership = createOwnershipTimeline(input),
        replay = applyCurrentOwnership(input, ownership);
      const ordered = inventoryDiceRecords(replay).orderedSources;
      const scan = findNumericQuestionOriginals(
        ordered,
        replay.replayVersion,
        ownership
      );
      const originals = new Map(
        [...scan.originals].map(([i, p]) => [ordered[i]!, p] as const)
      );
      const identities = findTeamDiceIdentities(replay).filter(
        (p) => p.final.sourceIndex === c.kept
      );
      expect(
        findFailedNumericRetries(replay, identities, originals, ownership)
      ).toHaveLength(1);
      expect(
        findFailedNumericRetries(
          replay,
          [...identities, ...identities],
          originals,
          ownership
        )
      ).toHaveLength(0);
    }
  });
  it("handles the separately verified Loner3+ rule without treating it as 4+", () => {
    const replay = source("demo9"),
      all = replay.turns.flatMap((t) => t.events);
    all.find((e) => e.sourceIndex === 3158)!.payload!.Skill = 1008;
    const gate = all.find((e) => e.sourceIndex === 3159)!;
    gate.payload!.Requirement = 3;
    gate.payload!.Difficulty = 3;
    const r = analyze(replay),
      kept = r.events.find((e) => e.metadata.sourceIndex === 3160)!;
    expect(kept.metadata.failedNumericRetry!.gateSuccessChance).toBeCloseTo(
      2 / 3,
      12
    );
    expect(
      kept.metadata.failedNumericRetry!.fixedPolicySuccessChance
    ).toBeCloseTo(22 / 27, 12);
    expect(kept.metadata.teamRerollsSpent).toBeUndefined();
    expect(
      r.events.find((e) => e.metadata.sourceIndex === 3159)!.metadata
        .teamRerollsSpent
    ).toBe(1);
  });
  it("joins both independently extracted prefixes and all twelve source hashes", () => {
    const check = spawnSync(
      "python3",
      ["scripts/extract-numeric-gate-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(check.status, check.stderr).toBe(0);
    const evidence = JSON.parse(
      readFileSync("tests/fixtures/evidence/bb3-numeric-gates.json", "utf8")
    );
    expect(evidence.files).toHaveLength(12);
    expect(
      evidence.files.flatMap((f: { cases: unknown[] }) => f.cases)
    ).toHaveLength(2);
    function unpack(v: unknown): unknown {
      if (Array.isArray(v))
        return v.length === 1 ? unpack(v[0]) : v.map(unpack);
      if (v && typeof v === "object")
        return Object.fromEntries(
          Object.entries(v).map(([k, x]) => [k, unpack(x)])
        );
      return typeof v === "string" && v !== "" && Number.isFinite(Number(v))
        ? Number(v)
        : v;
    }
    for (const f of evidence.files) {
      expect(
        createHash("sha256")
          .update(readFileSync(`demo-replays/${f.file}`))
          .digest("hex")
      ).toBe(f.sha256);
      if (!f.cases.length) continue;
      const raw = source(f.file.replace(".bbr", ""));
      const events = raw.turns.flatMap((t) => t.events);
      for (const c of f.cases)
        for (const row of c.prefix) {
          if (!row.payload) continue;
          const parsed = events.find(
            (e) =>
              JSON.stringify(e.locator) === JSON.stringify(row.locator) &&
              e.sourceTag === row.tag
          );
          expect(parsed, JSON.stringify(row.locator)).toBeDefined();
          expect(parsed!.payload).toEqual(unpack(row.payload));
        }
    }
  });
  it.each([3, 4])(
    "enumerates all complete fixed-policy trees with a %s+ gate",
    (gateTarget) => {
      for (let target = 2; target <= 6; target++) {
        let successes = 0;
        for (let first = 1; first <= 6; first++)
          for (let gate = 1; gate <= 6; gate++)
            for (let retry = 1; retry <= 6; retry++)
              successes += Number(
                first >= target || (gate >= gateTarget && retry >= target)
              );
        expect(
          gatedRetryChance(target, gateTarget)!.fixedPolicySuccessChance
        ).toBeCloseTo(successes / 216, 12);
      }
      expect(gatedRetryChance(2, 4)!.fixedPolicySuccessChance).toBeCloseTo(
        65 / 72,
        12
      );
      expect(gatedRetryChance(2, 3)!.fixedPolicySuccessChance).toBeCloseTo(
        25 / 27,
        12
      );
    }
  );
  it.each([0, 1, 7, 2.5, NaN, Infinity])(
    "rejects an invalid arithmetic threshold %s",
    (target) => {
      expect(gatedRetryChance(target, 3)).toBeUndefined();
      expect(gatedRetryChance(3, target)).toBeUndefined();
    }
  );
  it.each(cases)(
    "binds $file's original, choice, gate and kept result without extra draws",
    (c) => {
      const r = analyze(source(c.file));
      const row = (i: number) =>
        r.events.find((e) => e.metadata.sourceIndex === i)!;
      expect(row(c.kept).metadata).toMatchObject({
        failedNumericRetry: {
          kind: c.kind,
          originalSourceId: `source-${c.first}`,
          choiceSourceId: `source-${c.choice}`,
          skillSourceId: `source-${c.skill}`,
          gateSourceId: `source-${c.gate}`,
          baseSuccessChance: 2 / 3,
          gateSuccessChance: c.gateChance
        }
      });
      expect(
        row(c.kept).metadata.failedNumericRetry!.fixedPolicySuccessChance
      ).toBeCloseTo(c.chance, 12);
      expect(row(c.first).scoringStatus).toBe("scored");
      expect(row(c.first).delta).toBeCloseTo(-2 / 3, 12);
      expect(row(c.gate).scoringStatus).toBe("excluded");
      expect(row(c.gate).metadata.teamRerollsSpent).toBe(c.spent);
      expect(row(c.kept).metadata.teamRerollsSpent).toBeUndefined();
      expect(row(c.kept).metadata.rerollResource).toBeUndefined();
      expect(row(c.kept).metadata.rerollUsed).toBeUndefined();
      expect(row(c.kept).scoringStatus).toBe("excluded");
      expect(row(c.kept).probabilitySuccess).toBeNull();
      expect(row(c.kept).weightedDelta).toBe(0);
      expect(row(c.skill).metadata.skillUsage?.used).toBe(true);
      expect(row(c.choice).metadata.teamDiceChoice?.used).toBe(c.spent === 1);
      const text = explainFailedNumericRetry(row(c.kept))!;
      expect(text).toContain(c.kind === "loner" ? "77.8%" : "81.5%");
      expect(text).toContain("No fresh Dodge die was rolled");
      if (c.kind === "pro") {
        expect(explainObservedDice(row(c.kept))).toContain(
          "Recorded team reroll not used"
        );
        expect(explainObservedDice(row(c.kept))).not.toContain("declined");
      }
      expect(text).toContain("conditional policy odds add no score");
      expect(text).toContain(
        c.kind === "loner"
          ? "One team reroll was spent"
          : "no team reroll was spent"
      );
    }
  );
  it.each(cases)("requires $file's kept prefix but no later fallout", (c) => {
    for (const cut of [c.first, c.choice, c.skill, c.gate, c.kept]) {
      const replay = source(c.file);
      replay.turns = replay.turns
        .map((t) => ({
          ...t,
          events: t.events.filter((e) => e.sourceIndex! <= cut)
        }))
        .filter((t) => t.events.length);
      replay.boardCheckpoints = replay.boardCheckpoints?.filter(
        (cp) => cp.afterSourceIndex <= cut
      );
      replay.endDiceSnapshots = replay.endDiceSnapshots?.filter(
        (cp) => cp.afterSourceIndex <= cut
      );
      const r = analyze(replay);
      expect(
        r.events.find((e) => e.metadata.sourceIndex === c.first)!.delta
      ).toBeCloseTo(-2 / 3, 12);
      expect(
        r.events.filter((e) => e.metadata.failedNumericRetry)
      ).toHaveLength(cut === c.kept ? 1 : 0);
    }
  });
  it.each([
    "choice_gamer",
    "choice_used",
    "skill_holder",
    "skill_declined",
    "skill_unknown",
    "gate_new",
    "gate_status",
    "gate_modifier",
    "gate_extra",
    "gate_passed",
    "kept_fresh",
    "kept_face",
    "kept_requirement",
    "resume_state",
    "resume_cell",
    "resume_unknown",
    "question_offer"
  ])(
    "withholds policy for %s while preserving a valid original",
    (mutation) => {
      for (const c of cases) {
        const replay = source(c.file),
          all = replay.turns.flatMap((t) => t.events),
          get = (i: number) => all.find((e) => e.sourceIndex === i)!;
        const choice = get(c.choice),
          skill = get(c.skill),
          gate = get(c.gate),
          kept = get(c.kept),
          q = get(c.first),
          resume = get(c.choice - 1);
        if (mutation === "choice_gamer")
          choice.payload!.GamerId = 1 - Number(choice.payload!.GamerId);
        if (mutation === "choice_used")
          choice.payload!.Used = 1 - Number(choice.payload!.Used);
        if (mutation === "skill_holder") skill.payload!.PlayerId = 99;
        if (mutation === "skill_declined") skill.payload!.Used = 0;
        if (mutation === "skill_unknown") skill.payload!.Skill = 999;
        if (mutation === "gate_new") gate.payload!.NewRoll = 0;
        if (mutation === "gate_status") gate.payload!.Status = 2;
        if (mutation === "gate_modifier")
          gate.payload!.Modifiers = { Modifier: { Value: 1 } };
        if (mutation === "gate_extra") gate.payload!.UnknownPolicy = 1;
        if (mutation === "gate_passed") {
          (gate.payload!.Dice as { Die: { Value: number } }).Die.Value = 6;
          gate.payload!.Outcome = 1;
        }
        if (mutation === "kept_fresh") kept.payload!.NewRoll = 1;
        if (mutation === "kept_face")
          (kept.payload!.Dice as { Die: { Value: number } }).Die.Value =
            2 + (c.file === "demo9" ? 1 : 0);
        if (mutation === "kept_requirement") kept.payload!.Requirement = 6;
        if (mutation === "resume_state") resume.payload!.State = 3;
        if (mutation === "resume_cell") resume.payload!.CellTo = { X: 1, Y: 1 };
        if (mutation === "resume_unknown") resume.payload!.UnknownPolicy = 1;
        if (mutation === "question_offer")
          q.payload![
            c.kind === "loner" ? "CanUseProReroll" : "CanUseTeamReroll"
          ] = 1;
        const r = analyze(replay);
        expect(
          r.events.filter((e) => e.metadata.failedNumericRetry)
        ).toHaveLength(0);
        expect(
          r.events.find((e) => e.metadata.sourceIndex === c.first)!.delta
        ).toBeCloseTo(-2 / 3, 12);
      }
    }
  );
  it.each([
    "original",
    "choice",
    "skill",
    "gate",
    "base_odds",
    "gate_odds",
    "policy_odds",
    "kind",
    "spend",
    "resource",
    "new_draw",
    "alias",
    "category",
    "gate_face",
    "order",
    "namespace",
    "invented_policy",
    "extra_decision",
    "extra_original"
  ])("rejects the public receipt forgery %s", (mutation) => {
    for (const c of cases) {
      const r = analyze(source(c.file)),
        e = r.events.find((e) => e.metadata.failedNumericRetry)!,
        m = e.metadata,
        p = m.failedNumericRetry!;
      const gate = r.events.find((e) => e.metadata.sourceIndex === c.gate)!;
      if (mutation === "original") p.originalSourceId = p.gateSourceId;
      if (mutation === "choice") p.choiceSourceId = p.skillSourceId;
      if (mutation === "skill") p.skillSourceId = p.choiceSourceId;
      if (mutation === "gate") p.gateSourceId = p.originalSourceId;
      if (mutation === "base_odds") p.baseSuccessChance = 1;
      if (mutation === "gate_odds") p.gateSuccessChance = 1;
      if (mutation === "policy_odds") p.fixedPolicySuccessChance = 35 / 36;
      if (mutation === "kind") p.kind = p.kind === "pro" ? "loner" : "pro";
      if (mutation === "spend")
        m.teamRerollsSpent = m.teamRerollsSpent === 1 ? 0 : 1;
      if (mutation === "resource")
        m.rerollResource = m.rerollResource === "team" ? "skill" : "team";
      if (mutation === "new_draw") m.teamDiceIdentity!.replacementRolled = true;
      if (mutation === "alias")
        r.diceRecords.find((d) => d.parentSourceId === m.sourceId)!.aliasOf =
          "unknown";
      if (mutation === "category") e.type = "ball_handling";
      if (mutation === "gate_face") gate.metadata.dice![0] = 6;
      if (mutation === "order") gate.metadata.sourceIndex = m.sourceIndex;
      if (mutation === "namespace") e.teamId = e.teamId === "0" ? "1" : "0";
      if (mutation === "invented_policy")
        m.rerollPolicy = "unconditional_full_retry";
      if (mutation === "extra_decision") m.rerollDecisionId = p.choiceSourceId;
      if (mutation === "extra_original")
        m.originalDice = { Die: { DieType: 0, Value: 1 } };
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  });
});

it.each(cases)(
  "[cli-worker] exports and explains $file's failed gated retry",
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
    const r = LuckReportSchema.parse(JSON.parse(json.stdout));
    expect(
      r.events.find((e) => e.metadata.sourceIndex === c.kept)!.metadata
        .failedNumericRetry!.fixedPolicySuccessChance
    ).toBeCloseTo(c.chance, 12);
    const text = run("text");
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain(
      `source source-${c.kept}: ${c.kind === "loner" ? "Loner" : "Pro"} failed`
    );
    expect(text.stdout).toContain("conditional policy odds add no score");
    if (c.kind === "pro")
      expect(text.stdout).toContain(
        `Source source-${c.kept}: Recorded team reroll not used`
      );
    expect(text.stdout).toContain(
      c.spent ? "One team reroll was spent" : "no team reroll was spent"
    );
  },
  30000
);
