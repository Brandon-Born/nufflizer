import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { enumerateCasualtyTable } from "@/domain/nufflizer/casualtyTable";
import {
  explainCasualtyObservation,
  formatExpectedOutcome
} from "@/domain/nufflizer/presentation";
import {
  casualtyTableXml,
  decayModifier,
  nigglingModifier
} from "../helpers/casualtyTable";
const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-casualty-tables.json", "utf8")
);
const kinds = [
  "direct",
  "apothecary_original",
  "apothecary_replacement"
] as const;
function event(input = casualtyTableXml()) {
  return analyzeNufflizerInput(input).events.find(
    (e) => e.metadata.rollType === 12 && e.metadata.isRollCandidate
  )!;
}
const profiles = [
  "",
  decayModifier,
  nigglingModifier,
  decayModifier + nigglingModifier
];
describe("conditional casualty tables stay separate from value and treatment policy", () => {
  it.each(kinds)(
    "enumerates every primary/secondary face for %s under each known fixed modifier vector",
    (kind) => {
      for (const modifiers of profiles) {
        const shift = (modifiers.match(/<Modifier>/g) ?? []).length,
          ref = facts.tables[shift];
        expect(enumerateCasualtyTable(shift)!.counts).toEqual(ref.counts);
        for (let face = 1; face <= 16; face++)
          for (let second = 1; second <= 6; second++) {
            const category = ref.faces[face - 1];
            const label =
              category === "lasting_injury"
                ? facts.secondaryFaces[second - 1]
                : category;
            const code = (
              {
                badly_hurt: kind === "apothecary_replacement" ? 0 : 1,
                seriously_hurt: 2,
                serious_injury: 3,
                head_injury: 6,
                smashed_knee: 5,
                broken_arm: 7,
                neck_injury: 8,
                dislocated_shoulder: 9,
                dead: 10
              } as Record<string, number>
            )[label]!;
            const e = event(
              casualtyTableXml({
                kind,
                modifiers,
                face,
                secondary: category === "lasting_injury" ? second : undefined,
                outcome: code
              })
            );
            expect(e.metadata.casualtyTable?.counts).toEqual(ref.counts);
            expect(e.metadata.casualtyTable!.observedResultChance).toBeCloseTo(
              ref.jointCounts[label] / 96,
              14
            );
            expect(e.metadata.casualtyTable!.lastingInjuryCounts).toEqual([
              2, 1, 1, 1, 1
            ]);
            expect(e).toMatchObject({
              scoringStatus: "excluded",
              probabilitySuccess: null,
              actualSuccess: null,
              delta: 0,
              weightedDelta: 0
            });
            expect(e.contextualImpact).toBeUndefined();
          }
      }
    },
    60000
  );
  it.each([
    null,
    decayModifier + decayModifier,
    nigglingModifier + nigglingModifier,
    decayModifier.replace("<PlayerId>42", "<PlayerId>7"),
    decayModifier.replace("<Skill>81", "<Skill>13"),
    nigglingModifier.replace("<Value>1", "<Value>2"),
    nigglingModifier.replace("<Effect>-1", "<Effect>44"),
    nigglingModifier.replace("<ModifierType>31", "<ModifierType>32"),
    nigglingModifier.replace("</Modifier>", "<Unknown>0</Unknown></Modifier>")
  ])(
    "withholds omitted or unsupported fixed modifier shape %s",
    (modifiers) => {
      const e = event(casualtyTableXml({ modifiers }));
      expect(e.metadata.casualtyTable).toBeUndefined();
      expect(e.scoringStatus).toBe("excluded");
    }
  );
  it.each([
    { face: 8, outcome: 1 },
    { face: 13, outcome: 6 },
    { face: 13, secondary: 3, outcome: 6 },
    { face: 8, secondary: 1, outcome: 2 },
    { face: 16, secondary: 1, outcome: 10 },
    { face: 6, modifiers: decayModifier, outcome: 1 }
  ])(
    "keeps a recorded contradictory result observable without an accepted table %j",
    (o) => {
      const e = event(casualtyTableXml(o));
      expect(e.metadata.casualtyTable).toBeUndefined();
      expect(e.metadata.isRollCandidate).toBe(true);
    }
  );
  it("keeps a generic Lasting Injury distinct from an unobserved secondary die", () => {
    const e = event(casualtyTableXml({ face: 13, outcome: 4 }));
    expect(e.metadata.casualtyTable!.observedResultChance).toBe(2 / 16);
    expect(e.metadata.dice).toEqual([13]);
    expect(e.metadata.casualtyObservation!.outcome).toBe("lasting_injury");
  });
  it("does not use later outcome edits or team labels to select a table or value", () => {
    const a = event(),
      b = event(
        casualtyTableXml({
          swap: true,
          suffix: "<EventMatchEnd><WinningTeam>1</WinningTeam></EventMatchEnd>"
        })
      );
    expect(a.metadata.casualtyTable).toEqual(b.metadata.casualtyTable);
    expect(a.teamId).toBe("0");
    expect(b.teamId).toBe("1");
    expect(formatExpectedOutcome(a)).toBe("Conditional table");
    expect(explainCasualtyObservation(a)).toContain("6/16 Badly Hurt");
    expect(explainCasualtyObservation(a)).toContain(
      "not a complete pre-roll treatment policy"
    );
  });
  it.each([
    "counts",
    "probabilities",
    "lastingInjuryCounts",
    "lastingInjuryProbabilities",
    "observedResultChance",
    "modifierTotal",
    "kind",
    "holder",
    "score",
    "missingObservation",
    "modifiersSum"
  ])("rejects exported table forgery %s", (field) => {
    const r = analyzeNufflizerInput(
        casualtyTableXml({ modifiers: decayModifier, face: 8, outcome: 2 })
      ),
      e = r.events.find((e) => e.metadata.casualtyTable)!,
      t = e.metadata.casualtyTable!;
    if (
      field === "counts" ||
      field === "probabilities" ||
      field === "lastingInjuryCounts" ||
      field === "lastingInjuryProbabilities"
    )
      t[field][0]++;
    if (field === "observedResultChance") t.observedResultChance += 0.01;
    if (field === "modifierTotal") t.modifierTotal = 0;
    if (field === "kind") t.modifiers[0]!.kind = "niggling_injury";
    if (field === "holder") t.modifiers[0]!.playerId = 7;
    if (field === "score") e.weightedDelta = 1;
    if (field === "missingObservation") delete e.metadata.casualtyObservation;
    if (field === "modifiersSum") e.metadata.modifiersSum = 0;
    expect(LuckReportSchema.safeParse(r).success).toBe(false);
  });
  it("leaves the parsed input immutable and unknown eligibility/physical state unknown", () => {
    const p = parseReplayXml(casualtyTableXml()),
      copy = structuredClone(p),
      r = analyzeReplayLuck(p);
    expect(p).toEqual(copy);
    expect(r.verdict.luckierTeam).toBe("unknown");
    const e = r.events.find((e) => e.metadata.casualtyTable)!;
    expect(
      p.boardCheckpoints![0]!.board!.teams[0]!.players[0]!.canAct
    ).toBeNull();
    expect(
      p.boardCheckpoints![0]!.board!.teams[0]!.players[0]!.traits
    ).toBeNull();
    expect(e.metadata.preRoll?.actorMovementRemaining).toBeUndefined();
    expect(e.metadata.casualtyTable).toBeDefined();
  });
});
