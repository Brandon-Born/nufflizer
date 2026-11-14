import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { directInjuryOutcome } from "@/domain/nufflizer/injuryObservation";
import {
  formatActualOutcome,
  explainInjuryObservation
} from "@/domain/nufflizer/presentation";
import {
  staffInjuryXml,
  koInjuryXml,
  mapEncodedInjuryMessages
} from "../helpers/staffInjuryOriginal";

const original = () =>
  staffInjuryXml({ skills: [59], dice: [3, 6], outcome: 3 });
const facts = JSON.parse(
  readFileSync(
    "tests/fixtures/evidence/bb3-initial-injury-originals.json",
    "utf8"
  )
);

describe("initial injury source proof and conservative boundaries", () => {
  it("reproduces all raw witnesses, namespaces and independent rational references", () => {
    const run = spawnSync(
      "python3",
      ["scripts/extract-initial-injury-original-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(run.status, run.stderr).toBe(0);
    expect(facts.originals).toHaveLength(17);
    expect(
      facts.originals.filter(
        (r: { tag: string }) => r.tag === "QuestionKORecovery"
      )
    ).toHaveLength(14);
    expect(facts.paired.map((r: { caseId: string }) => r.caseId)).toEqual([
      "UI-009",
      "UI-025"
    ]);
    expect(facts.enumSource.members).toEqual({
      Stunned: 0,
      Reserve: 1,
      Ko: 2,
      BadlyHurt: 3,
      Casualty: 4
    });
    expect(directInjuryOutcome(1)).toBeUndefined();
    expect(
      facts.rule.profiles.map((p: { weightedMean: string }) => p.weightedMean)
    ).toEqual(["0", "0", "0", "0"]);
    expect(facts.rule.profiles[2].weightedByOutcome["3"]).toBe("-13/12");
  });
  it("joins every public original to its exact raw locator without inventing current traits", () => {
    const reports = new Map<string, ReturnType<typeof analyzeNufflizerInput>>();
    for (const raw of facts.originals) {
      if (!reports.has(raw.sourceFile))
        reports.set(
          raw.sourceFile,
          analyzeNufflizerInput(
            readFileSync(`demo-replays/${raw.sourceFile}`, "utf8")
          )
        );
      const r = reports.get(raw.sourceFile)!;
      const e = r.events.find((e) => {
        const l = e.metadata.locator;
        return (
          l &&
          [l.replayStep, l.childIndex, l.stepIndex, l.messageIndex].join() ===
            [
              raw.locator.replayStep,
              raw.locator.childIndex,
              raw.locator.stepIndex,
              raw.locator.messageIndex
            ].join() &&
          e.metadata.sourceTag === raw.tag
        );
      })!;
      expect(e, JSON.stringify(raw.locator)).toBeDefined();
      expect(e.metadata.rollType).toBe(11);
      expect(e.metadata.dice).toEqual(
        raw.roll.Dice[0].Die.map((d: { Value: string[] }) => Number(d.Value[0]))
      );
      expect(e.metadata.outcomeCode).toBe(Number(raw.roll.Outcome[0]));
      expect(e.scoringStatus).toBe("excluded");
      expect(e.probabilitySuccess).toBeNull();
      expect(e.actualSuccess).toBeNull();
      expect(e.weightedDelta).toBe(0);
      expect(e.metadata.injuryScoring).toBeUndefined();
      expect(e.metadata.injuryTable).toBeUndefined();
      expect(e.metadata.initialInjuryOriginal).toBeUndefined();
    }
  });
  it.each([
    "version",
    "status",
    "source",
    "code",
    "roll-type",
    "missing-modifiers",
    "numeric-modifier",
    "extra-roll-field",
    "gamer",
    "extra-question-field",
    "die-type",
    "die-value",
    "third-die",
    "not-applied",
    "evaluation",
    "header-skill",
    "header-field",
    "header-state",
    "subject",
    "target",
    "duplicate-header"
  ])("withholds qualified staff interpretation for %s", (kind) => {
    const model = parseReplayXml(original());
    const events = model.turns.flatMap((t) => t.events),
      q = events.find(
        (e) => e.sourceTag === "QuestionApothecaryCasualtyUsage"
      )!,
      step = events.find((e) => e.sourceTag === "DamageStep")!;
    const p = q.payload!,
      roll = p.RollInfos as Record<string, unknown>,
      dice = roll.Dice as { Die: { DieType: number; Value: number }[] };
    if (kind === "version") model.replayVersion = "2-0-0-0";
    if (kind === "status") roll.Status = 2;
    if (kind === "source") roll.Source = 7;
    if (kind === "code") roll.Outcome = 3;
    if (kind === "roll-type") roll.RollType = 12;
    if (kind === "missing-modifiers") delete roll.Modifiers;
    if (kind === "numeric-modifier")
      roll.Modifiers = {
        Modifier: {
          PlayerId: 42,
          Skill: 59,
          Effect: -1,
          Value: 1,
          ModifierType: 0
        }
      };
    if (kind === "extra-roll-field") roll.Extra = 0;
    if (kind === "gamer") p.GamerId = 2;
    if (kind === "extra-question-field") p.Extra = 0;
    if (kind === "die-type") dice.Die[0]!.DieType = 1;
    if (kind === "die-value") dice.Die[0]!.Value = 2;
    if (kind === "third-die") dice.Die.push({ DieType: 0, Value: 1 });
    if (kind === "not-applied") step.payload!.Applied = 0;
    if (kind === "evaluation") step.payload!.IsEvaluation = 1;
    if (kind === "header-skill") step.payload!.Skill = 13;
    if (kind === "header-field") step.payload!.Extra = 0;
    if (kind === "header-state") step.payload!.State = 4;
    if (kind === "subject") q.actorTeamSource = "turn_inferred";
    if (kind === "target") q.targetId = "7";
    if (kind === "duplicate-header")
      model.turns
        .find((t) => t.events.includes(step))!
        .events.push({ ...step, id: "duplicate" });
    const r = analyzeReplayLuck(model),
      e = r.events.find((e) => e.metadata.sourceId === q.id)!;
    expect(e.metadata.initialInjuryOriginal).toBeUndefined();
    expect(e.metadata.injuryTable).toBeUndefined();
    expect(e.metadata.injuryScoring).toBeUndefined();
    expect(e.weightedDelta).toBe(0);
  });
  it.each(["traits", "acquired", "effects", "prayers", "stunty"])(
    "does not reconstruct Badly Hurt with missing/unsupported current %s",
    (kind) => {
      let xml = original();
      if (kind === "traits")
        xml = xml.replace(
          /<InnateSkills>[\s\S]*?<\/InnateSkills>/,
          "<InnateSkills/>"
        );
      if (kind === "acquired") xml = xml.replace("<AcquiredSkills/>", "");
      if (kind === "effects") xml = xml.replace(/<Effects\/>/g, "");
      if (kind === "prayers") xml = xml.replace(/<ActivePrayers\/>/g, "");
      if (kind === "stunty")
        xml = xml.replace(
          "<InnateSkillsItem>59</InnateSkillsItem>",
          "<InnateSkillsItem>9999</InnateSkillsItem>"
        );
      const r = analyzeNufflizerInput(xml),
        e = r.events.find(
          (e) => e.metadata.sourceTag === "QuestionApothecaryCasualtyUsage"
        )!;
      expect(e.metadata.injuryScoring).toBeUndefined();
      expect(e.metadata.initialInjuryOriginal).toBeUndefined();
      expect(e.weightedDelta).toBe(0);
    }
  );
  it.each([false, true])(
    "deduplicates the physical original independently of complete traits (KO=%s)",
    (ko) => {
      let xml = (
        ko
          ? koInjuryXml({ dice: [4, 4], outcome: 2 }, true)
          : staffInjuryXml({ skills: [59], dice: [3, 6], outcome: 3 }, true)
      ).replace(/<AcquiredSkills\/>/g, "");
      // Treatment copies may use a different outcome namespace; they cannot rename the direct draw.
      if (!ko)
        xml = mapEncodedInjuryMessages(xml, (raw) =>
          raw.startsWith("<Question") && raw.includes("<RollInfos>")
            ? raw.replace(/<Outcome>\d+<\/Outcome>/, "<Outcome>4</Outcome>")
            : raw
        );
      const r = analyzeNufflizerInput(xml),
        direct = r.events.find(
          (e) => e.metadata.sourceTag === "ResultInjuryRoll"
        )!,
        q = r.events.find(
          (e) =>
            e.metadata.sourceTag ===
            (ko ? "QuestionKORecovery" : "QuestionApothecaryCasualtyUsage")
        )!;
      expect(direct.metadata.outcomeCode).toBe(ko ? 2 : 3);
      expect(direct.metadata.injuryScoring).toBeUndefined();
      expect(q.metadata.isRollCandidate).toBe(false);
      expect(
        r.events.filter(
          (e) => e.metadata.rollType === 11 && e.metadata.isRollCandidate
        )
      ).toHaveLength(1);
      const physical = r.diceRecords.find(
        (d) =>
          d.parentSourceId === q.metadata.sourceId &&
          d.path.join() === "RollInfos,Dice"
      )!;
      expect(physical).toMatchObject({
        disposition: "summary",
        aliasOf: expect.any(String)
      });
      expect(
        r.diceRecords.find((d) => d.id === physical.aliasOf)?.parentSourceId
      ).toBe(direct.metadata.sourceId);
    }
  );
  it.each([false, true])(
    "does not guess between two matching earlier physical originals (KO=%s)",
    (ko) => {
      const xml = ko
        ? koInjuryXml({ dice: [4, 4], outcome: 2 }, true)
        : staffInjuryXml({ skills: [59], dice: [3, 6], outcome: 3 }, true);
      // A second real StringMessage, not a repeated MessageData child.
      const direct = xml
        .match(
          /<StringMessage><MessageData>([^<]+)<\/MessageData><\/StringMessage>/g
        )!
        .find((m) =>
          Buffer.from(
            Buffer.from(
              m.match(/<MessageData>([^<]+)/)![1]!,
              "base64"
            ).toString(),
            "base64"
          )
            .toString()
            .startsWith("<ResultInjuryRoll>")
        )!;
      const r = analyzeNufflizerInput(xml.replace(direct, direct + direct)),
        q = r.events.find(
          (e) =>
            e.metadata.sourceTag ===
            (ko ? "QuestionKORecovery" : "QuestionApothecaryCasualtyUsage")
        )!;
      expect(q.metadata.isRollCandidate).toBe(true);
      expect(
        r.diceRecords.find(
          (d) =>
            d.parentSourceId === q.metadata.sourceId &&
            d.path.join() === "RollInfos,Dice"
        )?.aliasOf
      ).toBeUndefined();
      expect(q.metadata.injuryScoring).toBeUndefined();
    }
  );
  it("cannot repair the original from a later complete roster", () => {
    const complete = original(),
      board = complete.match(
        /<InitialBoardState>([\s\S]*?)<\/InitialBoardState>/
      )![1]!;
    const input = complete
      .replace(/<AcquiredSkills\/>/g, "")
      .replace(
        "</Replay>",
        `<ReplayStep><BoardState>${board}</BoardState></ReplayStep></Replay>`
      );
    const r = analyzeNufflizerInput(input),
      e = r.events.find(
        (e) => e.metadata.sourceTag === "QuestionApothecaryCasualtyUsage"
      )!;
    expect(e.metadata.initialInjuryOriginal).toBeUndefined();
    expect(e.metadata.injuryScoring).toBeUndefined();
    expect(e.weightedDelta).toBe(0);
  });
  it("does not alias an embedded staff record with conflicting ownership", () => {
    // Both raw roster slots claim the subject. Attribution cannot repair it
    // from a caller's manually supplied actor annotation.
    const input = staffInjuryXml(
      { skills: [59], dice: [3, 6], outcome: 3 },
      true
    ).replace(/<Id>7<\/Id>/g, "<Id>42</Id>");
    const r = analyzeNufflizerInput(input),
      e = r.events.find(
        (e) => e.metadata.sourceTag === "QuestionApothecaryCasualtyUsage"
      )!;
    expect(e.metadata.isRollCandidate).toBe(true);
    expect(
      r.diceRecords.find(
        (d) =>
          d.parentSourceId === e.metadata.sourceId &&
          d.path.join() === "RollInfos,Dice"
      )?.aliasOf
    ).toBeUndefined();
  });
  it.each(["path", "type", "status", "code"])(
    "rejects forged KO original %s",
    (kind) => {
      const r = analyzeNufflizerInput(
          koInjuryXml({ dice: [4, 4], outcome: 2 })
        ),
        e = r.events.find((e) => e.metadata.injuryScoring)!,
        d = r.diceRecords.find(
          (d) =>
            d.parentSourceId === e.metadata.sourceId &&
            d.path.join() === "RollInfos,Dice"
        )!;
      if (kind === "path") d.path = ["Dice"];
      if (kind === "type") d.dice[0]!.dieType = 1;
      if (kind === "status") d.status = 2;
      if (kind === "code") e.metadata.outcomeCode = 1;
      expect(LuckReportSchema.safeParse(r).success).toBe(false);
    }
  );
  it.each([
    "receipt",
    "code",
    "namespace",
    "path",
    "parent",
    "physical-type",
    "physical-status",
    "alias",
    "trait"
  ])("rejects a forged initial original %s", (kind) => {
    const r = analyzeNufflizerInput(original()),
      e = r.events.find((e) => e.metadata.initialInjuryOriginal)!,
      d = r.diceRecords.find(
        (d) =>
          d.parentSourceId === e.metadata.sourceId &&
          d.path.join() === "RollInfos,Dice"
      )!;
    if (kind === "receipt") delete e.metadata.initialInjuryOriginal;
    if (kind === "code") e.metadata.outcomeCode = 3;
    if (kind === "namespace") e.metadata.sourceTag = "ResultInjuryRoll";
    if (kind === "path") d.path = ["Dice"];
    if (kind === "parent") d.parentSourceId = "source-unknown";
    if (kind === "physical-type") d.dice[0]!.dieType = 1;
    if (kind === "physical-status") d.status = 2;
    if (kind === "alias") d.aliasOf = r.diceRecords[0]!.id;
    if (kind === "trait") e.metadata.injuryTable!.stunty = false;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("explains the derived initial label and keeps binary odds unknown", () => {
    const r = analyzeNufflizerInput(original()),
      e = r.events.find((e) => e.metadata.initialInjuryOriginal)!;
    expect(formatActualOutcome(e)).toBe("Badly Hurt (initial)");
    expect(explainInjuryObservation(e)).toContain(
      "verified current Stunty profile"
    );
    expect(e).toMatchObject({
      probabilitySuccess: null,
      actualSuccess: null,
      weightedDelta: -13 / 12
    });
  });
});
