import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  ACTION_CODE_MAP,
  END_TURN_REASON_MAP,
  ROLL_TYPE_MAP,
  STEP_TYPE_MAP
} from "@/domain/replay/mappings";
import {
  getRollTypeContract,
  isRollCandidateContract,
  listObservedRollTypeContracts
} from "@/domain/replay/rollTypeContracts";
import { preservesTraitContinuity } from "@/domain/replay/traitContinuity";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { playbackFragment } from "../helpers/playback";
import { envelope, sequence, model, rollEvent } from "../helpers/replay";
const audit = JSON.parse(
  readFileSync(
    "tests/fixtures/evidence/bb3-semantic-contract-audit.json",
    "utf8"
  )
) as {
  rollNames: Record<string, string>;
  stepNames: Record<string, string>;
  endReasonNames: Record<string, string>;
  declaredActions: Record<string, string>;
  actionWitnesses: {
    code: number;
    label: string;
    source: string;
    caseId: string;
  }[];
  contracts: {
    sourceTag: string;
    rollType: number;
    label: string;
    knowledgeStatus: string;
    identityEvidence: string;
    witnesses: { fixture: string; caseId: string; locators: unknown[] }[];
  }[];
  scoredPolicyScope: {
    sourceTag: string;
    rollType: number;
    definition: string;
    beneficiaryConvention: string;
    positiveAndNegativeTest: string;
    printedRulePage: number;
  }[];
  files: {
    file: string;
    sourceSha256: string;
    eventDiceFields: number;
    snapshotDiceFields: number;
    families: {
      sourceTag: string;
      fieldCount: number;
      identityStatus: string;
    }[];
  }[];
};
const probes = [
  ["001", "UI-008", [], [41], "ResultRoll", 1, "movement_risk", "1", 5 / 6],
  ["001", "UI-006", [], [46], "ResultRoll", 2, "dodge", "1", 5 / 6],
  ["002", "UI-022", [], [43], "ResultRoll", 4, "ball_handling", "1", 2 / 3],
  ["001", "UI-014", [2, 9], [], "ResultRoll", 7, "ball_handling", "0", 8 / 9],
  ["001", "UI-009", [], [38], "ResultRoll", 10, "armor_break", "1", 21 / 36],
  ["001", "UI-068", [6], [37], "ResultRoll", 46, "injury", "1", 1 / 2],
  ["007", "UI-040", [], [37, 40], "EventRoll", 13, "injury", "1", 1 / 2],
  ["005", "UI-059", [4], [41], "QuestionBlockDice", 3, "block", "0", 1 / 9]
] as const;
function fragment(
  p: readonly [
    string,
    string,
    readonly number[],
    readonly number[],
    string,
    number,
    string,
    string,
    number
  ]
) {
  return playbackFragment(
    p[0],
    p[1],
    [...p[2]],
    [...p[3]],
    p[4] === "EventRoll"
  );
}
describe("NUF-009 reproducible mapping and namespace acceptance", () => {
  it("reproduces the complete independent enum/UI/raw audit", () => {
    const c = spawnSync(
      "python3",
      ["scripts/audit-semantic-contracts.py", "--check"],
      { encoding: "utf8" }
    );
    expect(c.status, c.stderr).toBe(0);
  });
  it("matches every roll/step/turn name to the installed source, with explicit UI aliases", () => {
    expect(ROLL_TYPE_MAP).toEqual(audit.rollNames);
    expect(STEP_TYPE_MAP).toEqual(audit.stepNames);
    expect(END_TURN_REASON_MAP).toEqual(audit.endReasonNames);
    expect(ACTION_CODE_MAP).toEqual(audit.declaredActions);
  });
  it("pairs every declared contract with independently witnessed identity or an explicit provisional status", () => {
    const actual = listObservedRollTypeContracts();
    expect(actual).toHaveLength(audit.contracts.length);
    for (const expected of audit.contracts) {
      const contract = getRollTypeContract(
        expected.sourceTag,
        expected.rollType
      )!;
      expect(contract).toMatchObject({
        label: expected.label,
        status: expected.knowledgeStatus,
        confidence: expected.identityEvidence === "ui_paired" ? "high" : "low"
      });
      if (expected.identityEvidence === "ui_paired")
        expect(expected.witnesses.some((w) => w.locators.length > 0)).toBe(
          true
        );
    }
    // All generic numeric promotions must have a rule/version/role and both
    // positive and adversarial runtime evidence, not only a compiled label.
    expect(
      actual
        .filter((c) => c.kind === "scored_deterministic")
        .map((c) => `${c.sourceTag}|${c.rollType}`)
        .sort()
    ).toEqual(
      audit.scoredPolicyScope
        .filter((c) => c.sourceTag !== "QuestionBlockDice")
        .map((c) => `${c.sourceTag}|${c.rollType}`)
        .sort()
    );
  });

  it.each(
    audit.contracts.filter(
      (c) =>
        !(c.sourceTag === "ResultRoll" && [1, 2, 4, 7].includes(c.rollType))
    )
  )(
    "does not promote $sourceTag/$rollType from a favorable generic D6",
    (c) => {
      const e = rollEvent({
        sourceTag: c.sourceTag,
        rollType: c.rollType,
        payload: {
          Status: 1,
          NewRoll: 1,
          RollType: c.rollType,
          Requirement: 2,
          Difficulty: 2,
          Outcome: 1,
          Dice: { Die: { DieType: 0, Value: 6 } }
        }
      });
      const r = analyzeReplayLuck(model([e]));
      expect(
        r.events.every(
          (e) => e.scoringStatus === "excluded" && e.probabilitySuccess === null
        )
      ).toBe(true);
    }
  );
  it("keeps named randomizers eligible for the outcome census", () => {
    expect(isRollCandidateContract(getRollTypeContract("ResultRoll", 9))).toBe(
      true
    );
    expect(isRollCandidateContract(getRollTypeContract("ResultRoll", 70))).toBe(
      true
    );
    expect(
      isRollCandidateContract(getRollTypeContract("QuestionBlockDice", 3))
    ).toBe(false);
  });
  it("preserves a post-roll modifier as unsupported through the XML boundary", () => {
    const prefix =
      "<NotificationGameJoined><InitialBoardState><ListTeams><TeamState><Data><TeamId>0</TeamId></Data><ListPitchPlayers><PlayerState><Id>42</Id></PlayerState></ListPitchPlayers></TeamState><TeamState><Data><TeamId>1</TeamId></Data><ListPitchPlayers><PlayerState><Id>7</Id></PlayerState></ListPitchPlayers></TeamState></ListTeams></InitialBoardState></NotificationGameJoined>";
    const roll = (skill: number, value: number, difficulty: number) =>
      `<ResultRoll><Status>1</Status><NewRoll>1</NewRoll><RollType>2</RollType><Requirement>3</Requirement><Difficulty>${difficulty}</Difficulty><Outcome>1</Outcome><Modifiers><Modifier><PlayerId>7</PlayerId><Skill>${skill}</Skill><Effect>-1</Effect><ModifierType>27</ModifierType><Value>${value}</Value></Modifier></Modifiers><Dice><Die><DieType>0</DieType><Value>6</Value></Die></Dice></ResultRoll>`;
    const accepted = analyzeNufflizerInput(
      envelope(prefix + sequence([roll(83, 1, 2)]))
    );
    const rejected = analyzeNufflizerInput(
      envelope(prefix + sequence([roll(34, -2, 5)]))
    );
    expect(
      accepted.events.find((e) => e.metadata.rollType === 2)
    ).toMatchObject({ scoringStatus: "scored", probabilitySuccess: 5 / 6 });
    expect(
      rejected.events.find((e) => e.metadata.rollType === 2)
    ).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      actualSuccess: null
    });
  });
  it.each([
    "missing",
    "post-roll",
    "unknown-type",
    "value",
    "owner",
    "duplicate"
  ])("rejects a public %s modifier receipt forgery", (kind) => {
    const r = analyzeReplayLuck(playbackFragment("001", "UI-006", [], [46]));
    const e = r.events.find(
        (e) => e.metadata.rollType === 2 && e.scoringStatus === "scored"
      )!,
      receipt = e.metadata.fixedNumericModifiers!;
    expect(receipt[0]).toMatchObject({
      modifierType: 27,
      skillId: 83,
      effectId: -1,
      value: 1
    });
    if (kind === "missing") delete e.metadata.fixedNumericModifiers;
    if (kind === "post-roll") receipt[0]!.skillId = 34;
    if (kind === "unknown-type") receipt[0]!.modifierType = 999;
    if (kind === "value") receipt[0]!.value = -1;
    if (kind === "owner") receipt[0]!.playerId = -2;
    if (kind === "duplicate") receipt.push(structuredClone(receipt[0]!));
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("withholds duplicated opponent-zone modifiers instead of charging one marker twice", () => {
    const m = {
      PlayerId: 7,
      ModifierType: 3,
      Skill: -1,
      Effect: -1,
      Value: -1
    };
    const e = rollEvent({
      rollType: 2,
      payload: {
        Status: 1,
        NewRoll: 1,
        RollType: 2,
        Requirement: 2,
        Difficulty: 4,
        Outcome: 1,
        Modifiers: { Modifier: [m, { ...m }] },
        Dice: { Die: { DieType: 0, Value: 6 } }
      }
    });
    const r = analyzeReplayLuck(model([e]));
    expect(r.events[0]).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null
    });
    expect(r.events[0].statusReason).toContain("duplicate");
  });
  it.each(audit.actionWitnesses)(
    "reaches the independently witnessed declaration $code/$label",
    (c) => {
      const replay = playbackFragment(c.source, c.caseId, [], []);
      expect(
        replay.turns
          .flatMap((t) => t.events)
          .find(
            (e) => e.sourceTag === "ResultUseAction" && e.actionCode === c.code
          )
      ).toMatchObject({ actionLabel: c.label });
    }
  );
  it.each(probes)(
    "reaches %s %s with independently annotated category/beneficiary/odds",
    (...p) => {
      const r = analyzeReplayLuck(fragment(p)),
        e = r.events.find(
          (e) =>
            e.metadata.sourceTag === p[4] &&
            e.metadata.rollType === p[5] &&
            (e.scoringStatus === "scored" || !!e.metadata.block)
        )!;
      expect(e).toMatchObject({
        type: p[6],
        teamId: p[7],
        scoringStatus: e.metadata.block?"excluded":"scored"
      });
      if(e.metadata.block) {
        // This identity-only fragment has no current skill table. The mapping
        // and raw symbol sampler remain verified, without a fabricated point.
        expect(e.probabilitySuccess).toBeNull();
        expect(e.metadata.block.distribution[3]!+e.metadata.block.distribution[4]!).toBeCloseTo(p[8],12);
      } else expect(e.probabilitySuccess).toBeCloseTo(p[8], 12);
    }
  );
  it.each(probes)("withholds %s %s after changing the rule version", (...p) => {
    const r = fragment(p);
    r.replayVersion = "future";
    expect(
      analyzeReplayLuck(r).events.every((e) => e.scoringStatus === "excluded")
    ).toBe(true);
  });
  it.each(probes)("withholds %s %s after an ownership conflict", (...p) => {
    const r = fragment(p);
    for (const e of r.turns.flatMap((t) => t.events))
      e.attributionConflict = true;
    expect(
      analyzeReplayLuck(r).events.every((e) => e.scoringStatus === "excluded")
    ).toBe(true);
  });
  it.each(audit.files)(
    "reconciles every dice-bearing parent in $file before family support is selected",
    (f) => {
      const bytes = readFileSync(`demo-replays/${f.file}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        f.sourceSha256
      );
      const r = analyzeNufflizerInput(bytes.toString("utf8"));
      expect(
        r.diceRecords.filter((d) => d.parentKind === "event")
      ).toHaveLength(f.eventDiceFields);
      expect(
        r.diceRecords.filter((d) => d.parentKind === "snapshot")
      ).toHaveLength(f.snapshotDiceFields);
      const expected: Record<string, number> = {},
        actual: Record<string, number> = {};
      for (const row of f.families)
        expected[row.sourceTag] =
          (expected[row.sourceTag] ?? 0) + row.fieldCount;
      for (const d of r.diceRecords.filter((d) => d.parentKind === "event"))
        actual[d.parentSourceTag] = (actual[d.parentSourceTag] ?? 0) + 1;
      expect(actual).toEqual(expected);
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it("distinguishes declaration code4 from the observed ThrowTeamMate step and never imports SequenceType7", () => {
    const r = playbackFragment("004", "UI-034", [], [37, 50]);
    const events = r.turns.flatMap((t) => t.events);
    expect(events.find((e) => e.sourceTag === "ResultUseAction")).toMatchObject(
      { actionCode: 4, actionLabel: "pass" }
    );
    expect(
      events.some((e) => e.stepTag === "ThrowTeamMateStep" && e.stepType === 13)
    ).toBe(true);
    const unknown = parseReplayXml(
      envelope(
        sequence([
          "<ResultUseAction><Action>7</Action><TeamId>0</TeamId></ResultUseAction>"
        ])
      )
    );
    expect(unknown.unknownCodes).toContainEqual(
      expect.objectContaining({ category: "action", code: 7 })
    );
    expect(
      unknown.turns
        .flatMap((t) => t.events)
        .find((e) => e.sourceTag === "ResultUseAction")?.actionLabel
    ).toBe("action_unknown_7");
    expect(
      preservesTraitContinuity(
        rollEvent({
          sourceTag: "ResultUseAction",
          actionCode: 7,
          payload: { Action: 7 }
        })
      )
    ).toBe(false);
  });
  it.each([9, 70, 999])(
    "keeps unverified no-threshold family %s visible and unscored",
    (rollType) => {
      const raw = rollEvent({
        rollType,
        payload: {
          Status: 1,
          NewRoll: 1,
          RollType: rollType,
          Dice: { Die: { DieType: 0, Value: 4 } }
        }
      });
      const r = analyzeReplayLuck(model([raw]));
      expect(r.events[0]).toMatchObject({
        scoringStatus: "excluded",
        probabilitySuccess: null,
        actualSuccess: null,
        metadata: { isRollCandidate: true }
      });
      expect(r.coverage.rollCandidates).toMatchObject({
        scoredCount: 0,
        excludedCount: 1
      });
      expect(r.verdict.luckierTeam).toBe("unknown");
    }
  );
  it.each([
    "post-roll-Diving-Tackle",
    "unknown-skill",
    "unknown-modifier",
    "unknown-effect",
    "missing-owner",
    "extra-field"
  ])("excludes %s instead of fitting any recorded threshold", (kind) => {
    const m: Record<string, unknown> = {
      PlayerId: 7,
      Skill: 34,
      Effect: -1,
      Value: -2,
      ModifierType: 27
    };
    if (kind === "unknown-skill") m.Skill = 999;
    if (kind === "unknown-modifier") m.ModifierType = 999;
    if (kind === "unknown-effect") m.Effect = 44;
    if (kind === "missing-owner") delete m.PlayerId;
    if (kind === "extra-field") m.UnknownPolicy = 1;
    const e = rollEvent({
      rollType: 2,
      payload: {
        Status: 1,
        NewRoll: 1,
        RollType: 2,
        Requirement: 3,
        Difficulty: 5,
        Outcome: 1,
        Dice: { Die: { DieType: 0, Value: 6 } },
        Modifiers: { Modifier: m }
      }
    });
    const r = analyzeReplayLuck(model([e]));
    expect(r.events[0]).toMatchObject({
      scoringStatus: "excluded",
      probabilitySuccess: null,
      actualSuccess: null,
      metadata: { isRollCandidate: true }
    });
    expect(r.events[0].statusReason).toContain("modifier");
  });
});
