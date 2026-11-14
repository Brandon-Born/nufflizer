import { assertIntrinsicInjury } from "../helpers/intrinsicInjuryFacts";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { categoricalInjuryXml } from "../helpers/categoricalInjury";
import { explainInjuryObservation } from "@/domain/nufflizer/presentation";

const parse = (o: Parameters<typeof categoricalInjuryXml>[0] = {}) =>
  parseReplayXml(
    categoricalInjuryXml({ attackerSkills: [13], armorMightyBlow: true, ...o })
  );
const report = (o: Parameters<typeof categoricalInjuryXml>[0] = {}) =>
  LuckReportSchema.parse(analyzeReplayLuck(parse(o)));
const scored = (r: ReturnType<typeof report>) =>
  r.events.filter((e) => e.metadata.injuryScoring);
describe("Mighty Blow committed to armor before initial injury", () => {
  it("uses the remaining zero modifier without assigning post-choice armor odds", () => {
    const r = report(),
      e = scored(r)[0]!;
    expect(e.weightedDelta).toBe(-5 / 8);
    expect(e.probabilitySuccess).toBeNull();
    expect(e.actualSuccess).toBeNull();
    const s = e.metadata.injuryScoring!,
      cause = s.cause;
    if (cause.kind !== "block") throw new Error("Expected Block cause");
    expect(cause.armorModifierBudget).toMatchObject({
      available: 1,
      spent: 1,
      remaining: 0
    });
    const use = r.events.find(
      (e) => e.metadata.sourceId === cause.armorModifierBudget!.useSourceId
    )!;
    expect(use.playerId).toBe("7");
    expect(use.teamId).toBe("1");
    expect(use.metadata.armorModifierUse).toMatchObject({
      subjectId: "42",
      subjectTeamId: "0",
      armorSourceId: s.armorSourceId
    });
    expect(use.scoringStatus).toBe("excluded");
    expect(use.metadata.isRollCandidate).toBe(false);
    expect(use.weightedDelta).toBe(0);
    const armor = r.events.find(
      (e) => e.metadata.sourceId === s.armorSourceId
    )!;
    expect(armor.scoringStatus).toBe("excluded");
    expect(armor.probabilitySuccess).toBeNull();
    expect(armor.actualSuccess).toBeNull();
    expect(armor.weightedDelta).toBe(0);
    const damage = r.damageSteps.find(
      (d) => d.actionId === e.metadata.actionId
    )!;
    expect(damage).toMatchObject({
      scoredRolls: 1,
      unscoredRolls: 1,
      diceContribution: -5 / 8
    });
    expect(damage.eventIds).toHaveLength(2);
    expect(r.teams.find((t) => t.teamId === "0")!.categoryScores.injury).toBe(
      -5 / 8
    );
    expect(r.verdict.luckierTeam).toBe("unknown");
    expect(explainInjuryObservation(e)).toContain("Mighty Blow");
  });
  it.each([1, 2, 3])(
    "does not choose the budget from serialized outcome State%s",
    (state) => {
      expect(scored(report({ state }))).toHaveLength(1);
    }
  );
  it.each([
    [[], false],
    [[13], true],
    [[13, 1009], false],
    [[1009], false],
    [[13, 999], false]
  ] as const)(
    "requires the exact current holder policy %j",
    (skills, admit) => {
      expect(scored(report({ attackerSkills: [...skills] }))).toHaveLength(
        admit ? 1 : 0
      );
    }
  );
  it("does not mistake an unused adaptive modifier for a spent budget", () => {
    expect(scored(report({ armorMightyBlow: false }))).toHaveLength(0);
  });
  it("does not use an attacker's bonus on its own injury or a self-fall", () => {
    expect(scored(report({ self: true, skills: [13] }))).toHaveLength(0);
    expect(scored(report({ fall: true }))).toHaveLength(0);
  });
  it("keeps the policy through later unsupported treatment, but not an intervening reaction", () => {
    const before = scored(report())[0]!,
      after = scored(report({ aftermath: "<UnknownInjuryReaction/>" }))[0]!;
    expect(after.metadata.injuryScoring).toEqual(before.metadata.injuryScoring);
    expect(after.weightedDelta).toBe(before.weightedDelta);
    expect(
      scored(report({ interruption: "<UnknownInjuryReaction/>" }))
    ).toHaveLength(0);
  });
  it("scopes consumption to each damage action rather than the actor's whole turn", () => {
    const xml = categoricalInjuryXml({
      attackerSkills: [13],
      armorMightyBlow: true
    });
    const frame = xml.match(/<ReplayStep>[\s\S]*<\/ReplayStep>/)![0];
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(
        parseReplayXml(xml.replace("</Replay>", frame + "</Replay>"))
      )
    );
    const events = scored(r);
    expect(events).toHaveLength(2);
    expect(new Set(events.map((e) => e.metadata.actionId)).size).toBe(2);
    expect(events.map((e) => e.weightedDelta)).toEqual([-5 / 8, -5 / 8]);
    const receipts = events.map((e) => e.metadata.injuryScoring!.cause);
    expect(
      new Set(
        receipts.map((c) =>
          c.kind === "block" ? c.armorModifierBudget!.useSourceId : ""
        )
      ).size
    ).toBe(2);
  });
  it("does not carry an earlier spent budget into an uncommitted later injury", () => {
    const first = categoricalInjuryXml({
      attackerSkills: [13],
      armorMightyBlow: true
    });
    const next = categoricalInjuryXml({ attackerSkills: [13] }).match(
      /<ReplayStep>[\s\S]*<\/ReplayStep>/
    )![0];
    const r = LuckReportSchema.parse(
      analyzeReplayLuck(
        parseReplayXml(first.replace("</Replay>", next + "</Replay>"))
      )
    );
    const injuries = r.events.filter((e) => e.metadata.injuryObservation);
    expect(injuries).toHaveLength(2);
    expect(scored(r)).toHaveLength(1);
    expect(injuries[1]!.metadata.injuryTable).toBeDefined();
    expect(injuries[1]!.scoringStatus).toBe("excluded");
  });
  it("withholds an off-pitch modifier holder and duplicate acquired Mighty Blow", () => {
    const xml = categoricalInjuryXml({
      attackerSkills: [13],
      armorMightyBlow: true
    });
    const offPitch = xml.replace(
      "<Id>7</Id><Cell><X>6</X><Y>5</Y></Cell>",
      "<Id>7</Id><Cell><X>-1</X><Y>-1</Y></Cell>"
    );
    expect(
      scored(
        LuckReportSchema.parse(analyzeReplayLuck(parseReplayXml(offPitch)))
      )
    ).toHaveLength(0);
    const duplicated = xml.replace(
      "<InnateSkillsItem>13</InnateSkillsItem></InnateSkills><AcquiredSkills/>",
      "<InnateSkillsItem>13</InnateSkillsItem></InnateSkills><AcquiredSkills><AcquiredSkillsItem>13</AcquiredSkillsItem></AcquiredSkills>"
    );
    expect(
      scored(
        LuckReportSchema.parse(analyzeReplayLuck(parseReplayXml(duplicated)))
      )
    ).toHaveLength(0);
  });
  it.each([
    "used",
    "holder",
    "skill",
    "value",
    "effect",
    "namespace",
    "difficulty",
    "freshness",
    "die",
    "sequence",
    "action",
    "unknown_field"
  ])("withholds an invalid %s commitment", (field) => {
    const replay = parse(),
      events = replay.turns.flatMap((t) => t.events),
      use = events.find((e) => e.sourceTag === "ResultSkillUsage")!,
      armor = events.find((e) => e.rollType === 10)!;
    const m = (
      armor.payload!.Modifiers as { Modifier: Record<string, unknown> }
    ).Modifier;
    if (field === "used") use.payload!.Used = 0;
    if (field === "holder") use.payload!.PlayerId = 42;
    if (field === "skill") m.Skill = 1009;
    if (field === "value") m.Value = 2;
    if (field === "effect") m.Effect = 27;
    if (field === "namespace") m.ModifierType = 13;
    if (field === "difficulty") armor.payload!.Difficulty = 8;
    if (field === "freshness") armor.payload!.NewRoll = 0;
    if (field === "die")
      (
        armor.payload!.Dice as { Die: Record<string, unknown>[] }
      ).Die[0]!.Value = 0;
    if (field === "sequence") use.sequenceId = "unrelated";
    if (field === "action") use.actionId = "unrelated";
    if (field === "unknown_field") use.payload!.UnknownBudget = 1;
    expect(
      scored(LuckReportSchema.parse(analyzeReplayLuck(replay)))
    ).toHaveLength(0);
  });
  it.each([
    "budget",
    "use_source",
    "actor",
    "subject",
    "armor",
    "modifier",
    "traits",
    "prefix"
  ])("rejects forged public %s evidence", (field) => {
    const r = report(),
      e = scored(r)[0]!,
      cause = e.metadata.injuryScoring!.cause;
    if (cause.kind !== "block") throw new Error("Expected Block cause");
    const budget = cause.armorModifierBudget!,
      use = r.events.find((e) => e.metadata.sourceId === budget.useSourceId)!;
    if (field === "budget") (budget as { remaining: number }).remaining = 1;
    if (field === "use_source") budget.useSourceId = e.metadata.sourceId!;
    if (field === "actor") use.playerId = "42";
    if (field === "subject") use.metadata.armorModifierUse!.subjectId = "7";
    if (field === "armor")
      use.metadata.armorModifierUse!.armorSourceId = e.metadata.sourceId!;
    if (field === "modifier")
      r.events.find(
        (e) =>
          e.metadata.sourceId === use.metadata.armorModifierUse!.armorSourceId
      )!.metadata.modifiers = [0];
    if (field === "traits")
      cause.attackerTraitEvidence!.traits.innateSkills = [];
    if (field === "prefix")
      use.metadata.armorModifierUse!.damageStepSourceIndex++;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("scores the real demo10 source113 after the recorded armor use111", () => {
    const replay = parseReplayXml(
      decodeReplayInput(readFileSync("demo-replays/demo10.bbr", "utf8")).xml,
      { omitRawReplaySteps: true }
    );
    const r = LuckReportSchema.parse(analyzeReplayLuck(replay)),
      e = r.events.find((e) => e.metadata.sourceId === "source-113")!;
    expect(e.weightedDelta).toBe(-5 / 8);
    expect(e.metadata.injuryScoring!.cause).toMatchObject({
      kind: "block",
      poolSourceId: "source-99",
      damageStepSourceIndex: 110,
      appliedOutcomeSourceId: "source-108",
      armorModifierBudget: {
        useSourceId: "source-111",
        available: 1,
        spent: 1,
        remaining: 0
      }
    });
    expect(
      r.events.find((e) => e.metadata.sourceId === "source-112")!.scoringStatus
    ).toBe("excluded");
  });
});

type Projection = { [key: string]: (string | Projection)[] };
type RawCase = {
  file: string;
  sha256: string;
  locator: { replayStep: number; childIndex: number; stepIndex: number };
  damage: Projection;
  messages: { messageIndex: number; tag: string; payload: Projection }[];
};
const independent = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-mighty-blow-armor.json", "utf8")
) as { cases: RawCase[]; math: { outcome: string; weighted: string }[] };
const project = (v: Record<string, unknown>): Projection =>
  Object.fromEntries(
    Object.entries(v)
      .map(([k, v]) => [
        k,
        (Array.isArray(v) ? v : [v]).flatMap<string | Projection>((x) =>
          x !== null && typeof x === "object"
            ? [project(x as Record<string, unknown>)]
            : /^-?\d+(?:\.\d+)?$/.test(String(x))
              ? [String(Number(x))]
              : []
        )
      ])
      .filter(([, values]) => (values as unknown[]).length > 0)
  );
const numericLexemes = (p: Projection): Projection =>
  Object.fromEntries(
    Object.entries(p).map(([k, values]) => [
      k,
      values.map((v) =>
        typeof v === "string" ? String(Number(v)) : numericLexemes(v)
      )
    ])
  );
const rational = (s: string) => {
  const [a, b = "1"] = s.split("/");
  return Number(a) / Number(b);
};
describe("independent Mighty Blow armor source evidence", () => {
  it("reproduces all ten raw commitments and rational injury references", async () => {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync(
      "python3",
      ["scripts/extract-mighty-blow-armor-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(independent.cases).toHaveLength(10);
  });
  it.each([...new Set(independent.cases.map((c) => c.file))])(
    "joins every %s raw role and stage, retaining unknown current traits",
    async (file) => {
      const { createHash } = await import("node:crypto");
      const bytes = readFileSync(`demo-replays/${file}`);
      const replay = parseReplayXml(decodeReplayInput(bytes.toString()).xml, {
        omitRawReplaySteps: true
      });
      const raw = replay.turns.flatMap((t) => t.events),
        r = LuckReportSchema.parse(analyzeReplayLuck(replay));
      for (const c of independent.cases.filter((c) => c.file === file)) {
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(c.sha256);
        const header = raw.find(
          (e) =>
            e.sourceTag === "DamageStep" &&
            e.locator?.replayStep === c.locator.replayStep &&
            e.locator?.childIndex === c.locator.childIndex &&
            e.locator?.stepIndex === c.locator.stepIndex
        )!;
        expect(header).toBeDefined();
        expect(project(header.payload!)).toEqual(numericLexemes(c.damage));
        for (const message of c.messages) {
          const e = raw.find(
            (e) =>
              e.actionId === header.actionId &&
              e.locator?.messageIndex === message.messageIndex
          )!;
          expect(e.sourceTag).toBe(message.tag);
          expect(project(e.payload!)).toEqual(numericLexemes(message.payload));
        }
        const use = r.events.find(
            (e) => e.metadata.sourceIndex === header.sourceIndex! + 1
          )!,
          injury = r.events.find(
            (e) => e.metadata.sourceIndex === header.sourceIndex! + 3
          )!;
        expect(use.metadata.armorModifierUse!.subjectId).toBe(header.playerId);
        expect(use.playerId).not.toBe(header.playerId);
        expect(use.metadata.skillUsage).toEqual({ skillId: 13, used: true });
        expect(use.scoringStatus).toBe("excluded");
        expect(Boolean(injury.metadata.injuryScoring)).toBe(
          file === "demo10.bbr"
        );
        if (file === "demo10.bbr") {
          const ref = independent.math.find(
            (m) => m.outcome === injury.metadata.injuryObservation!.outcome
          )!;
          expect(injury.weightedDelta).toBe(rational(ref.weighted));
        } else {
          if (
            file === "demo9.bbr" &&
            injury.metadata.sourceId === "source-4222"
          )
            expect(assertIntrinsicInjury(file, injury, r)).toBe(true);
          else expect(injury.metadata.injuryTable).toBeUndefined();
          expect(injury.metadata.injuryScoring).toBeUndefined();
          expect(injury.weightedDelta).toBe(0);
          expect(injury.probabilitySuccess).toBeNull();
        }
      }
    }
  );
  it("enumerates every supported current table face after the armor spend", () => {
    const tables = JSON.parse(
      readFileSync("tests/fixtures/evidence/bb3-injury-tables.json", "utf8")
    ) as {
      tables: {
        stunty: boolean;
        thickSkull: boolean;
        totalOutcomes: number[];
      }[];
    };
    const references = JSON.parse(
      readFileSync(
        "tests/fixtures/evidence/bb3-categorical-injuries.json",
        "utf8"
      )
    ) as {
      math: {
        stunty: boolean;
        thickSkull: boolean;
        rows: { total: number; weighted: string }[];
      }[];
    };
    for (const t of tables.tables)
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++) {
          const result = t.totalOutcomes[a + b - 2]!,
            r = report({
              skills: [
                ...(t.stunty ? [59] : []),
                ...(t.thickSkull ? [63] : [])
              ],
              dice: [a, b],
              outcome: [0, 2, 3, 4][result]
            });
          expect(scored(r)).toHaveLength(1);
          expect(scored(r)[0]!.weightedDelta).toBeCloseTo(
            rational(
              references.math
                .find(
                  (m) => m.stunty === t.stunty && m.thickSkull === t.thickSkull
                )!
                .rows.find((m) => m.total === a + b)!.weighted
            ),
            12
          );
        }
  });
});
