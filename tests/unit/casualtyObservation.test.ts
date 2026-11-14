import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import {
  formatActualOutcome,
  explainCasualtyObservation,
  explainApothecaryDecision
} from "@/domain/nufflizer/presentation";
import { playbackFragment, playbackFragmentXml } from "../helpers/playback";
import { encodedMessage } from "../helpers/replay";
import {
  ownershipReplayXml,
  type OwnershipReplayOptions
} from "../helpers/ownershipReplay";

const directModel = () => playbackFragment("014", "UI-075", [38], [90000]);
function directRaw() {
  const model = directModel(),
    events = model.turns.flatMap((t) => t.events),
    roll = events.find((e) => e.sourceTag === "ResultCasualtyRoll")!;
  return {
    model,
    events,
    roll,
    step: events.find(
      (e) => e.sourceTag === "DamageStep" && e.actionId === roll.actionId
    )!
  };
}

describe("recorded casualty roles remain separate from luck and treatment", () => {
  it.each([
    ["004", "UI-033", "Neck Injury", "apothecary_original"],
    ["014", "UI-075", "Dead", "direct"],
    ["015", "UI-078", "Seriously Hurt", "direct"]
  ])(
    "names %s %s from its observed namespace, not binary odds",
    (source, id, name, kind) => {
      const fixture = JSON.parse(
        readFileSync(
          `tests/fixtures/evidence/bb3-ui-playback-${source}.json`,
          "utf8"
        )
      );
      const cut = fixture.cases.find((c: { id: string }) => c.id === id);
      const players = [
        ...new Set<number>(
          cut.rawRecords.flatMap(
            (r: { step: { DamageStep?: { PlayerId: string[] } } }) =>
              r.step.DamageStep ? [Number(r.step.DamageStep.PlayerId[0])] : []
          )
        )
      ];
      const report = analyzeReplayLuck(
        playbackFragment(source!, id!, players, [90000])
      );
      const e = report.events.find((e) => e.metadata.rollType === 12)!;
      expect(e.metadata).toHaveProperty(
        "casualtyObservation",
        expect.objectContaining({ recordKind: kind })
      );
      expect(formatActualOutcome(e)).toBe(`${name} (recorded)`);
      expect(e).toMatchObject({
        scoringStatus: "excluded",
        probabilitySuccess: null,
        actualSuccess: null,
        delta: 0,
        weightedDelta: 0
      });
      expect(e.contextualImpact).toBeUndefined();
    }
  );

  it("keeps the original Seriously Hurt and replacement No injury distinct from the corrupted copy", () => {
    const r = analyzeNufflizerInput(
      playbackFragmentXml("002", "UI-060", [8], [47])
    );
    const original = r.events.find(
      (e) => e.metadata.sourceTag === "QuestionApothecaryCasualtyUsage"
    )!;
    const replacement = r.events.find(
      (e) => e.metadata.sourceTag === "QuestionApothecaryCasualtyChoice"
    )!;
    expect(original.metadata).toHaveProperty(
      "casualtyObservation",
      expect.objectContaining({
        recordKind: "apothecary_original",
        outcome: "seriously_hurt"
      })
    );
    expect(replacement.metadata).toHaveProperty(
      "casualtyObservation",
      expect.objectContaining({
        recordKind: "apothecary_replacement",
        outcome: "no_injury"
      })
    );
    expect(formatActualOutcome(original)).toBe("Seriously Hurt (recorded)");
    expect(formatActualOutcome(replacement)).toBe("No injury (recorded)");
    const dice = r.diceRecords.filter(
      (d) => d.parentSourceId === replacement.metadata.sourceId
    );
    expect(dice.find((d) => d.path[0] === "OriginalRoll")).toMatchObject({
      disposition: "summary",
      aliasOf: expect.any(String)
    });
    expect(dice.find((d) => d.path[0] === "NewRoll")).toMatchObject({
      disposition: "unscored_roll"
    });
    expect(
      r.events.filter(
        (e) => e.metadata.rollType === 12 && e.metadata.isRollCandidate
      )
    ).toHaveLength(2);
    const applied = r.events.find((e) => e.metadata.apothecary)!;
    expect(formatActualOutcome(applied)).toBe("No injury (applied)");
    expect(explainApothecaryDecision(applied)).toContain(
      "applied the replacement casualty: No injury"
    );
    expect(explainCasualtyObservation(replacement)).toContain(
      "copied outcome cannot rename the original"
    );
  });

  it.each([
    "version",
    "unknown-code",
    "direct-zero",
    "code-string",
    "status",
    "die-type",
    "die-zero",
    "die-17",
    "extra-die",
    "secondary-type",
    "secondary-seven",
    "malformed-modifier",
    "roll-field",
    "header-field",
    "not-applied",
    "evaluation",
    "header-skill",
    "header-state-string",
    "source",
    "owner",
    "turn-inferred",
    "target",
    "duplicate-step"
  ])("withholds a casualty label on unverified %s", (kind) => {
    const x = directRaw(),
      p = x.roll.payload!,
      dice = p.Dice as {
        Die:
          | { DieType: number; Value: number }
          | { DieType: number; Value: number }[];
      },
      faces = Array.isArray(dice.Die) ? dice.Die : [dice.Die];
    if (kind === "version") x.model.replayVersion = "2-0-0-0";
    if (kind === "unknown-code") p.Outcome = 11;
    if (kind === "direct-zero") p.Outcome = 0;
    if (kind === "code-string") p.Outcome = "10";
    if (kind === "status") p.Status = 2;
    if (kind === "die-type") faces[0]!.DieType = 0;
    if (kind === "die-zero") faces[0]!.Value = 0;
    if (kind === "die-17") faces[0]!.Value = 17;
    if (kind === "extra-die")
      dice.Die = [...faces, { DieType: 0, Value: 2 }, { DieType: 0, Value: 3 }];
    if (kind === "secondary-type")
      dice.Die = [...faces, { DieType: 4, Value: 2 }];
    if (kind === "secondary-seven")
      dice.Die = [...faces, { DieType: 0, Value: 7 }];
    if (kind === "malformed-modifier") p.Modifiers = { Modifier: { Value: 1 } };
    if (kind === "roll-field") p.Unknown = 0;
    if (kind === "header-field") x.step.payload!.Unknown = 0;
    if (kind === "not-applied") x.step.payload!.Applied = 0;
    if (kind === "evaluation") x.step.payload!.IsEvaluation = 1;
    if (kind === "header-skill") x.step.payload!.Skill = 13;
    if (kind === "header-state-string") x.step.payload!.State = "3";
    if (kind === "source") p.Source = 63;
    if (kind === "owner") x.roll.actorTeamId = "1";
    if (kind === "turn-inferred") x.roll.actorTeamSource = "turn_inferred";
    if (kind === "target") x.roll.stepTargetId = "90000";
    if (kind === "duplicate-step")
      x.model.turns[0]!.events.unshift({
        ...structuredClone(x.step),
        id: "duplicate-damage"
      });
    const r = analyzeReplayLuck(x.model),
      e = r.events.find((e) => e.metadata.sourceId === x.roll.id)!;
    expect(e).toBeDefined();
    expect(e.metadata.casualtyObservation).toBeUndefined();
    expect(e.probabilitySuccess).toBeNull();
    expect(e.weightedDelta).toBe(0);
  });

  it("keeps a recorded name with an unknown numeric modifier without promoting odds or impact", () => {
    const x = directRaw();
    x.roll.payload!.Modifiers = {
      Modifier: {
        PlayerId: -1,
        Skill: -1,
        Effect: -1,
        Value: 7,
        ModifierType: 999
      }
    };
    const r = analyzeReplayLuck(x.model),
      e = r.events.find((e) => e.metadata.sourceId === x.roll.id)!;
    expect(e.metadata.casualtyObservation?.outcome).toBe("dead");
    expect(e.metadata.modifiersSum).toBe(7);
    expect(e.probabilitySuccess).toBeNull();
    expect(e.weightedDelta).toBe(0);
    expect(e.contextualImpact).toBeUndefined();
    expect(explainCasualtyObservation(e)).toContain(
      "full modifier and treatment policy and its odds are unverified"
    );
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
  });

  it.each([
    "outcome",
    "role",
    "subject",
    "team",
    "source",
    "step",
    "probability",
    "actual",
    "score",
    "context",
    "physical-path",
    "physical-face",
    "physical-type",
    "missing-owner",
    "owner-role",
    "owner-player",
    "owner-future",
    "direct-zero"
  ])("rejects forged exported casualty %s", (kind) => {
    const r = analyzeReplayLuck(directModel());
    expect(LuckReportSchema.safeParse(r).success).toBe(true);
    const e = r.events.find((e) => e.metadata.casualtyObservation)!,
      o = e.metadata.casualtyObservation!,
      d = r.diceRecords.find(
        (d) => d.parentEventId === e.id && d.path.join() === "Dice"
      )!;
    if (kind === "outcome") o.outcome = "head_injury";
    if (kind === "role") o.recordKind = "apothecary_original";
    if (kind === "subject") o.subjectId = "90000";
    if (kind === "team") o.subjectTeamId = "1";
    if (kind === "source") o.sourceCode++;
    if (kind === "step") o.damageStepSourceIndex = e.metadata.sourceIndex!;
    if (kind === "probability") e.probabilitySuccess = 0.5;
    if (kind === "actual") e.actualSuccess = false;
    if (kind === "score") e.weightedDelta = -1;
    if (kind === "context") e.contextualImpact = { contribution: 1 } as never;
    if (kind === "physical-path") d.path = ["OriginalRoll", "Dice"];
    if (kind === "physical-face") d.dice[0]!.value = 1;
    if (kind === "physical-type") d.dice[0]!.dieType = 0;
    if (kind === "missing-owner") delete e.metadata.ownership;
    if (kind === "owner-role") e.metadata.ownership!.role = "actor";
    if (kind === "owner-player") e.metadata.ownership!.playerId = "90000";
    if (kind === "owner-future")
      e.metadata.ownership!.checkpointAfter = e.metadata.sourceIndex;
    if (kind === "direct-zero") {
      o.outcome = "no_injury";
      e.metadata.outcomeCode = 0;
    }
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });

  it.each([
    [
      "fresh unnamed current subject",
      { initialActor: "missing" },
      true,
      "current_roster"
    ],
    [
      "fresh subject without learned-trait data",
      { initialActor: "missing", currentData: false },
      true,
      "current_roster"
    ],
    ["conflicting current roster", { actorTeam: 1 }, false, null],
    ["mismatched current identity", { wrongDataId: true }, false, null],
    ["unknown identity transition", { unknownAfter: true }, false, null],
    [
      "future conflicting roster",
      { actorTeam: 1, futureOnly: true },
      true,
      "initial_roster"
    ]
  ] as const)(
    "uses only time-local ownership for %s",
    (_name, options, accepted, basis) => {
      const casualty =
        "<ResultCasualtyRoll><Status>1</Status><Modifiers/><Dice><Die><DieType>4</DieType><Value>3</Value></Die></Dice><Source>0</Source><RollType>12</RollType><Outcome>1</Outcome></ResultCasualtyRoll>";
      const input = ownershipReplayXml({
        kind: "armor",
        ...options
      } as OwnershipReplayOptions).replace(
        "</Results>",
        `<StringMessage><MessageData>${encodedMessage(casualty)}</MessageData></StringMessage></Results>`
      );
      const r = analyzeNufflizerInput(input),
        e = r.events.find(
          (e) => e.metadata.sourceTag === "ResultCasualtyRoll"
        )!;
      expect(Boolean(e.metadata.casualtyObservation)).toBe(accepted);
      expect(e.weightedDelta).toBe(0);
      expect(e.probabilitySuccess).toBeNull();
      if (accepted) {
        expect(e.metadata.ownership).toMatchObject({
          role: "subject",
          playerId: "42",
          teamId: "0",
          basis
        });
        expect(formatActualOutcome(e)).toBe("Badly Hurt (recorded)");
      } else expect(e.teamId).toBe("unresolved");
    }
  );

  it("does not read a later copied outcome back into either draw", () => {
    const model = playbackFragment("002", "UI-060", [8], [47]),
      before = analyzeReplayLuck(model);
    const copy = model.turns
      .flatMap((t) => t.events)
      .find((e) => e.sourceTag === "QuestionApothecaryCasualtyChoice")!.payload!
      .OriginalRoll as { Outcome: number };
    for (const code of [0, 1, 10, 999]) {
      copy.Outcome = code;
      const after = analyzeReplayLuck(model);
      expect(
        after.events
          .filter((e) => e.metadata.casualtyObservation)
          .map((e) => [
            e.metadata.sourceId,
            e.metadata.casualtyObservation,
            formatActualOutcome(e)
          ])
      ).toEqual(
        before.events
          .filter((e) => e.metadata.casualtyObservation)
          .map((e) => [
            e.metadata.sourceId,
            e.metadata.casualtyObservation,
            formatActualOutcome(e)
          ])
      );
    }
  });

  it("keeps the first casualty label before a later treatment choice exists", () => {
    const x = playbackFragment("002", "UI-060", [8], [47]),
      before = analyzeReplayLuck(x),
      turn = x.turns[0]!;
    const first = turn.events.findIndex(
      (e) => e.sourceTag === "QuestionApothecaryCasualtyUsage"
    );
    turn.events = turn.events.slice(0, first + 1);
    const after = analyzeReplayLuck(x),
      a = after.events.find((e) => e.metadata.casualtyObservation)!,
      b = before.events.find((e) => e.metadata.casualtyObservation)!;
    expect(a.metadata.casualtyObservation).toEqual(
      b.metadata.casualtyObservation
    );
    expect(formatActualOutcome(a)).toBe("Seriously Hurt (recorded)");
    expect(a.probabilitySuccess).toBeNull();
  });
});
