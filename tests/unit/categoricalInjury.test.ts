import { assertIntrinsicInjury } from "../helpers/intrinsicInjuryFacts";
import { assertTransactionInjury } from "../helpers/injuryTransactionFacts";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { decodeReplayInput } from "@/domain/replay/decodeReplay";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { injuryOrderDeviation } from "@/domain/nufflizer/categoricalInjury";
import { findBlockConsequences } from "@/domain/nufflizer/blockConsequences";
import { linkBlockPools } from "@/domain/nufflizer/blockPools";
import { createOwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import {
  explainInjuryObservation,
  formatActualOutcome,
  formatExpectedOutcome
} from "@/domain/nufflizer/presentation";
import { categoricalInjuryXml } from "../helpers/categoricalInjury";
const report = (o: Parameters<typeof categoricalInjuryXml>[0] = {}) =>
  LuckReportSchema.parse(
    analyzeReplayLuck(parseReplayXml(categoricalInjuryXml(o)))
  );
const injuries = (r: ReturnType<typeof report>) =>
  r.events.filter((e) => e.metadata.injuryScoring);
const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-injury-tables.json", "utf8")
) as {
  tables: {
    stunty: boolean;
    thickSkull: boolean;
    counts: number[];
    totalOutcomes: number[];
  }[];
};
describe("source-qualified categorical injury scoring", () => {
  it.each(facts.tables)(
    "enumerates every face with a zero-mean ordinal deviation for $stunty/$thickSkull",
    (t: {
      stunty: boolean;
      thickSkull: boolean;
      counts: number[];
      totalOutcomes: number[];
    }) => {
      let sum = 0,
        actualSum = 0,
        scoredFaces = 0;
      for (let a = 1; a <= 6; a++)
        for (let b = 1; b <= 6; b++) {
          const outcome = t.totalOutcomes[a + b - 2]!,
            name = ["stunned", "ko", "badly_hurt", "casualty"][outcome]!;
          const rank = injuryOrderDeviation(t.counts, name)!;
          const tiers = [
              t.counts[0]!,
              t.counts[1]!,
              t.counts[2]! + t.counts[3]!
            ],
            tier = Math.min(outcome, 2);
          const reference =
            (tiers.filter((_, i) => i > tier).reduce((x, y) => x + y, 0) -
              tiers.filter((_, i) => i < tier).reduce((x, y) => x + y, 0)) /
            36;
          expect(rank.delta).toBe(reference);
          sum += rank.delta;
          const r = report({
            skills: [...(t.stunty ? [59] : []), ...(t.thickSkull ? [63] : [])],
            dice: [a, b],
            outcome: [0, 2, 3, 4][outcome]
          });
          const e = injuries(r)[0]!;
          expect(e).toBeDefined();
          scoredFaces++;
          actualSum += e.delta;
          expect(e.delta).toBe(reference);
          expect(e.weightedDelta).toBe(reference * 1.5);
          expect(e.actualSuccess).toBeNull();
          expect(e.probabilitySuccess).toBeNull();
        }
      expect(sum).toBeCloseTo(0, 12);
      expect(actualSum).toBeCloseTo(0, 12);
      expect(scoredFaces).toBe(36);
    }
  );
  it("reduces to ordinary binary dice deviation when only two tiers have mass", () => {
    expect(injuryOrderDeviation([24, 0, 0, 12], "stunned")!.delta).toBe(1 / 3);
    expect(injuryOrderDeviation([24, 0, 0, 12], "casualty")!.delta).toBe(
      -2 / 3
    );
  });
  it("swaps the subject's reported team without changing categorical meaning", () => {
    const a = injuries(report())[0]!;
    const b = injuries(report({ swapTeams: true }))[0]!;
    expect(a.teamId).toBe("0");
    expect(b.teamId).toBe("1");
    expect(a.weightedDelta).toBe(b.weightedDelta);
    expect(b.metadata.ownership!.teamId).toBe("1");
  });
  it.each([{}, { self: true }, { fall: true }])(
    "keeps armor and injury conditional contributions separate: %j",
    (o) => {
      const r = report(o),
        e = injuries(r)[0]!;
      expect(e.weightedDelta).toBe(-0.625);
      expect(e.teamId).toBe("0");
      expect(formatExpectedOutcome(e)).toBe("Categorical");
      expect(formatActualOutcome(e)).toBe("KO (recorded)");
      expect(explainInjuryObservation(e)).toContain(
        "Positive favors the injured player's team"
      );
      const step = r.damageSteps.find(
        (s) => s.actionId === e.metadata.actionId
      )!;
      expect(step.scoredRolls).toBe(2);
      expect(step.diceContribution).toBeCloseTo(-21 / 36 - 0.625, 12);
      expect(r.teams.find((t) => t.teamId === "0")!.categoryScores.injury).toBe(
        -0.625
      );
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it("does not turn an off-pitch observation into a playable ordinary damage policy", () => {
    const xml = categoricalInjuryXml().replace(
      "<Id>42</Id><Cell><X>5</X><Y>5</Y></Cell>",
      "<Id>42</Id><Cell><X>-1</X><Y>-1</Y></Cell>"
    );
    expect(
      injuries(LuckReportSchema.parse(analyzeReplayLuck(parseReplayXml(xml))))
    ).toHaveLength(0);
  });
  it.each([13, 1009, 999])(
    "withholds an unresolved attacking modifier policy %s",
    (skill) => {
      expect(injuries(report({ attackerSkills: [skill] }))).toHaveLength(0);
    }
  );
  it("retains Pro as an intrinsic skill without inventing an injury reroll", () => {
    expect(injuries(report({ attackerSkills: [50] }))).toHaveLength(1);
  });
  it("does not apply an actor's Mighty Blow to its own knockdown injury", () => {
    expect(injuries(report({ self: true, skills: [13] }))).toHaveLength(1);
  });
  it.each([
    "<UnknownInjuryReaction/>",
    "<ResultSkillUsage><PlayerId>7</PlayerId><Skill>999</Skill><Used>1</Used></ResultSkillUsage>"
  ])(
    "retains an initial injury's witnessed cause before later treatment %s",
    (aftermath) => {
      const before = injuries(report())[0]!;
      const r = report({ aftermath });
      const after = injuries(r)[0];
      expect(after).toBeDefined();
      expect(after!.weightedDelta).toBe(before.weightedDelta);
      expect(after!.metadata.injuryScoring).toEqual(
        before.metadata.injuryScoring
      );
      const cause = after!.metadata.injuryScoring!.cause;
      expect(cause.kind).toBe("block");
      if (cause.kind !== "block") throw new Error("Missing block prefix");
      const pool = r.events.find(
        (e) => e.metadata.sourceId === cause.poolSourceId
      )!;
      // The earlier prefix is not a certificate for the unknown full aftermath.
      expect(pool.metadata.blockResolution!.damageActionIds).toEqual([]);
      expect(pool.metadata.activationEnd).toBeUndefined();
      expect(pool.metadata.blockBallRelease).toBeUndefined();
      const replay = parseReplayXml(categoricalInjuryXml({ aftermath }));
      const rawEvents = replay.turns[0]!.events;
      const fact = findBlockConsequences(
        rawEvents,
        linkBlockPools(rawEvents, replay.replayVersion),
        createOwnershipTimeline(replay)
      )[0]!;
      const headerIndex = rawEvents.findIndex(
        (e) => e.sourceTag === "DamageStep"
      );
      expect(fact.damagePrefixes).toEqual([
        {
          actionId: after!.metadata.actionId,
          damageStepSourceIndex: rawEvents[headerIndex]!.sourceIndex
        }
      ]);
      expect(fact.nextEventIndex).toBe(headerIndex);
      expect(fact.nextStepIndex).toBe(
        rawEvents[headerIndex]!.locator!.stepIndex
      );
      expect(
        r.damageSteps.find((s) => s.actionId === after!.metadata.actionId)!
          .scoredRolls
      ).toBe(2);
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it.each(["source", "subject", "applied", "step", "sequence"])(
    "does not retain a mismatched %s damage prefix before unknown treatment",
    (field) => {
      const replay = parseReplayXml(
        categoricalInjuryXml({ aftermath: "<UnknownInjuryReaction/>" })
      );
      const damage = replay.turns
        .flatMap((t) => t.events)
        .find((e) => e.sourceTag === "DamageStep")!;
      if (field === "source") damage.damageSource = 9;
      if (field === "subject") damage.targetId = "7";
      if (field === "applied") damage.payload!.Applied = 0;
      if (field === "step") damage.locator!.stepIndex! += 1;
      if (field === "sequence") damage.sequenceId = "other-sequence";
      expect(
        injuries(LuckReportSchema.parse(analyzeReplayLuck(replay)))
      ).toHaveLength(0);
    }
  );
  it.each([
    "<UnknownInjuryReaction/>",
    "<ResultSkillUsage><PlayerId>7</PlayerId><Skill>13</Skill><Used>1</Used></ResultSkillUsage>"
  ])("does not cross an intervening damage policy %s", (interruption) =>
    expect(injuries(report({ interruption }))).toHaveLength(0)
  );
  it.each([
    "probability",
    "delta",
    "binary",
    "cause",
    "armor",
    "applied_source",
    "damage_prefix",
    "trait",
    "ownership"
  ])("rejects a forged categorical %s contract", (kind) => {
    const r = report(),
      e = injuries(r)[0]!,
      s = e.metadata.injuryScoring!;
    if (kind === "probability") s.moreSevereChance = 1;
    if (kind === "delta") e.delta = 0;
    if (kind === "binary") e.actualSuccess = true;
    if (kind === "cause" && s.cause.kind === "block")
      s.cause.poolSourceId = s.armorSourceId;
    if (kind === "armor") s.armorSourceId = e.metadata.sourceId!;
    if (kind === "applied_source" && s.cause.kind === "block")
      s.cause.appliedOutcomeSourceId = s.armorSourceId;
    if (kind === "damage_prefix" && s.cause.kind === "block")
      s.cause.damageStepSourceIndex += 1;
    if (kind === "trait" && s.cause.kind === "block")
      s.cause.attackerTraitEvidence!.traits.innateSkills = [13];
    if (kind === "ownership") e.metadata.ownership!.teamId = "1";
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    [
      "demo10.bbr",
      ["source-113", "source-128", "source-162", "source-439", "source-556", "source-1007", "source-1121", "source-1200"],
      [-0.625, 0.625, -0.625, -1.25, 0.875, -5/4, -13/12, -5/24]
    ],
    ["demo5.bbr", ["source-110", "source-402", "source-454", "source-595"], [-0.625, -0.625, 0.625, 0.625]],
    ["demo8.bbr", ["source-249", "source-427", "source-686", "source-1361", "source-1431", "source-1585", "source-1610"], [0.875, 0.625, 0.625, 0.625, 0.625, 0.625, 0.625]]
  ] as const)(
    "scores only qualified actual %s injuries with exact subject-perspective arithmetic",
    (file, ids, values) => {
      const r = LuckReportSchema.parse(
        analyzeReplayLuck(
          parseReplayXml(
            decodeReplayInput(readFileSync(`demo-replays/${file}`, "utf8")).xml,
            { omitRawReplaySteps: true }
          )
        )
      );
      expect(injuries(r).map((e) => e.metadata.sourceId)).toEqual(ids);
      expect(injuries(r).map((e) => e.weightedDelta)).toEqual(values);
      expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
});

type Projection = { [key: string]: (string | Projection)[] };
type RawWitness = {
  file: string;
  sha256: string;
  locator: {
    replayStep: number;
    childIndex: number;
    stepIndex: number;
    messageIndex: number;
  };
  subjectId: string;
  prefixes: {
    replayStep: number;
    childIndex: number;
    stepIndex: number;
    tag: string;
    payload: Projection;
    messages: { messageIndex: number; tag: string; payload: Projection }[];
  }[];
  observations: {
    replayStep: number | null;
    childIndex: number | null;
    playerId: number;
    rosterIndex: number;
    teamId: number | null;
    data: {
      playerId: number;
      playerTypeId: number;
      innateSkills: number[] | null;
      acquiredSkills: number[] | null;
    } | null;
  }[];
};
const independent = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-categorical-injuries.json", "utf8")
) as {
  cases: RawWitness[];
  math: {
    stunty: boolean;
    thickSkull: boolean;
    rows: { total: number; delta: string; weighted: string }[];
  }[];
};
const n = (p: Projection, k: string) => Number(p[k]?.[0]);
const rational = (v: string) => {
  const [a, b = "1"] = v.split("/");
  return Number(a) / Number(b);
};
describe("independent categorical injury evidence", () => {
  it("reproduces the raw prefixes and independent rational comparison tables", async () => {
    const { spawnSync } = await import("node:child_process");
    const p = spawnSync(
      "python3",
      ["scripts/extract-categorical-injury-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stdout + p.stderr).toBe(0);
  });
  it.each(["demo1.bbr", "demo5.bbr", "demo8.bbr", "demo10.bbr"])(
    "joins each scored %s injury to the original damage prefix, blocker trait seed and rational result",
    async (file) => {
      const { createHash } = await import("node:crypto");
      const input = readFileSync(`demo-replays/${file}`),
        replay = parseReplayXml(decodeReplayInput(input.toString()).xml, {
          omitRawReplaySteps: true
        });
      const r = LuckReportSchema.parse(analyzeReplayLuck(replay));
      for (const e of injuries(r)) {
        const witness = independent.cases.find(
          (c) =>
            c.file === file &&
            JSON.stringify(c.locator) === JSON.stringify(e.metadata.locator)
        )!;
        if(!witness){expect((assertTransactionInjury(file,e,r)||assertIntrinsicInjury(file,e,r))).toBe(true);continue;}
        expect(witness).toBeDefined();
        expect(witness.sha256).toBe(
          createHash("sha256").update(input).digest("hex")
        );
        expect(witness.subjectId).toBe(e.playerId);
        const damage = witness.prefixes.at(-1)!;
        expect(damage.tag).toBe("DamageStep");
        expect(n(damage.payload, "PlayerId")).toBe(Number(e.playerId));
        expect(n(damage.payload, "TargetId")).toBe(Number(e.playerId));
        expect(n(damage.payload, "Source")).toBe(
          e.metadata.injuryObservation!.sourceCode
        );
        const cause = e.metadata.injuryScoring!.cause;
        const committed = cause.kind === "block" && !!cause.armorModifierBudget;
        const [armor, injury] = damage.messages.slice(committed ? 1 : 0);
        expect(armor!.tag).toBe("ResultRoll");
        expect(injury!.tag).toBe("ResultInjuryRoll");
        expect(n(armor!.payload, "RollType")).toBe(10);
        expect(n(injury!.payload, "RollType")).toBe(11);
        expect(n(injury!.payload, "Outcome")).toBe(e.metadata.outcomeCode);
        const ds = (injury!.payload.Dice![0] as Projection)
          .Die! as Projection[];
        expect(ds.map((d) => n(d, "DieType"))).toEqual([0, 0]);
        expect(ds.map((d) => n(d, "Value"))).toEqual(e.metadata.dice);
        const table = e.metadata.injuryTable!,
          ref = independent.math
            .find(
              (t) =>
                t.stunty === table.stunty && t.thickSkull === table.thickSkull
            )!
            .rows.find(
              (t) => t.total === e.metadata.dice!.reduce((a, b) => a + b, 0)
            )!;
        expect(e.delta).toBe(rational(ref.delta));
        expect(e.weightedDelta).toBe(rational(ref.weighted));
        if (cause.kind === "block") {
          const pool = r.events.find(
            (p) => p.metadata.sourceId === cause.poolSourceId
          )!;
          const prefix = witness.prefixes.find(
            (p) =>
              p.replayStep === pool.metadata.locator!.replayStep &&
              p.childIndex === pool.metadata.locator!.childIndex &&
              p.stepIndex === pool.metadata.locator!.stepIndex
          )!;
          expect(prefix.tag).toBe("PlayerStep");
          expect(n(prefix.payload, "StepType")).toBe(6);
          expect(n(prefix.payload, "PlayerId")).toBe(Number(pool.playerId));
          const final = r.events.find(
            (e) => e.metadata.sourceId === pool.metadata.block!.finalSourceId
          )!;
          expect(cause.appliedOutcomeSourceId).toBe(final.metadata.sourceId);
          const rawHeader = replay.turns
            .flatMap((t) => t.events)
            .find(
              (raw) =>
                raw.sourceTag === "DamageStep" &&
                raw.locator?.replayStep === damage.replayStep &&
                raw.locator?.childIndex === damage.childIndex &&
                raw.locator?.stepIndex === damage.stepIndex
            )!;
          expect(rawHeader).toBeDefined();
          expect(cause.damageStepSourceIndex).toBe(rawHeader.sourceIndex);
          const finalPrefix = witness.prefixes.find(
            (p) =>
              p.replayStep === final.metadata.locator!.replayStep &&
              p.childIndex === final.metadata.locator!.childIndex &&
              p.stepIndex === final.metadata.locator!.stepIndex
          )!;
          const applied = finalPrefix.messages.find(
            (m) =>
              m.messageIndex === final.metadata.locator!.messageIndex &&
              m.tag === "ResultBlockOutcome"
          )!;
          expect(n(applied.payload, "AttackerId")).toBe(Number(pool.playerId));
          expect(n(applied.payload, "Outcome")).toBe(
            pool.metadata.outcomeCode ?? pool.metadata.block!.finalOutcome
          );
          const proof = cause.attackerTraitEvidence;
          if (proof) {
            const cp = replay.boardCheckpoints!.find(
              (c) => c.afterSourceIndex === proof.observedCheckpointAfter
            )!;
            const seed = witness.observations.find(
              (o) =>
                o.replayStep === cp.replayStep &&
                o.childIndex === cp.childIndex &&
                o.playerId === Number(proof.playerId)
            )!;
            expect(seed).toBeDefined();
            expect(seed.rosterIndex).toBe(proof.rosterIndex);
            expect(seed.data).toEqual({
              playerId: proof.traits.dataPlayerId,
              playerTypeId: proof.traits.playerTypeId,
              innateSkills: proof.traits.innateSkills,
              acquiredSkills: proof.traits.acquiredSkills
            });
            expect([
              ...(seed.data!.innateSkills ?? []),
              ...(seed.data!.acquiredSkills ?? [])
            ].includes(13)).toBe(committed);
          }
        } else {
          const prefix = witness.prefixes.at(-2)!;
          expect(prefix.tag).toBe("PlayerStep");
          expect(n(prefix.payload, "StepType")).toBe(1);
          const failure = prefix.messages.at(-3)!;
          expect(failure.tag).toBe("ResultRoll");
          expect(n(failure.payload, "Outcome")).toBe(0);
          expect(prefix.messages.at(-2)!.tag).toBe("ResultDoMove");
          expect(prefix.messages.at(-1)!.tag).toBe("ResultMoveOutcome");
        }
      }
      if (file === "demo1.bbr") {
        const injury = r.events.find(
          (e) => e.metadata.sourceId === "source-219"
        )!;
        expect(injury.metadata.injuryTable).toBeDefined();
        expect(injury.scoringStatus).toBe("excluded");
        expect(injury.metadata.injuryScoring).toBeUndefined();
        expect(
          r.events.find((e) => e.metadata.sourceId === "source-203")!.metadata
            .block!.traitEvidence!.attacker.traits.innateSkills
        ).toContain(13);
      }
    }
  );
  it.each([1, 2, 3])(
    "does not select a scoring policy from the serialized applied State%s",
    (state) => {
      const e = injuries(report({ state }))[0]!;
      expect(e.weightedDelta).toBe(-0.625);
    }
  );
  it("keeps names, later match results and duplicate injury summaries out of the initial score", () => {
    const xml = categoricalInjuryXml(),
      a = report();
    const b = LuckReportSchema.parse(
      analyzeReplayLuck(
        parseReplayXml(
          xml
            .replace(
              "</Replay>",
              "<EventMatchResult><Winner>1</Winner></EventMatchResult></Replay>"
            )
            .replaceAll("Home", "Renamed")
        )
      )
    );
    expect(injuries(b).map((e) => e.weightedDelta)).toEqual(
      injuries(a).map((e) => e.weightedDelta)
    );
    const duplicate = xml.replace(
      /(<StringMessage><MessageData>[^<]+<\/MessageData><\/StringMessage>)(<\/Results><\/StepResult><\/Sequence>)/,
      "$1$1$2"
    );
    expect(duplicate).not.toBe(xml);
    const repeated = LuckReportSchema.parse(
      analyzeReplayLuck(parseReplayXml(duplicate))
    );
    expect(injuries(repeated).map((e) => e.weightedDelta)).toEqual(
      injuries(a).map((e) => e.weightedDelta)
    );
  });
});
