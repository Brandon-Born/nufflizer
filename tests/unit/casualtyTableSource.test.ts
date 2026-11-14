import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { playbackFragment } from "../helpers/playback";

const facts = JSON.parse(
  readFileSync("tests/fixtures/evidence/bb3-casualty-tables.json", "utf8")
);
describe("independent conditional casualty distributions", () => {
  it("reproduces the primary-rule tables without runtime probability imports", () => {
    const p = spawnSync(
      "python3",
      ["scripts/extract-casualty-table-evidence.py", "--check"],
      { encoding: "utf8" }
    );
    expect(p.status, p.stderr).toBe(0);
    expect(facts.tables.map((t: { counts: number[] }) => t.counts)).toEqual([
      [6, 3, 3, 2, 2],
      [5, 3, 3, 2, 3],
      [4, 3, 3, 2, 4]
    ]);
  });
  it.each([
    ["014", "UI-075", 38, "decay"],
    ["015", "UI-078", 45, "niggling_injury"]
  ] as const)(
    "joins %s %s fixed modifier to its conditional table",
    (file, id, subject, kind) => {
      const r = analyzeReplayLuck(
        playbackFragment(file, id, [subject], [90000])
      );
      const e = r.events.find((e) => e.metadata.casualtyObservation)!;
      expect(e.metadata).toHaveProperty(
        "casualtyTable",
        expect.objectContaining({
          rules: "bb2020",
          policy: "fixed_recorded_casualty_modifiers",
          modifierTotal: 1,
          counts: [5, 3, 3, 2, 3],
          probabilities: [5 / 16, 3 / 16, 3 / 16, 2 / 16, 3 / 16],
          modifiers: [expect.objectContaining({ kind })]
        })
      );
      expect(e).toMatchObject({
        scoringStatus: "excluded",
        probabilitySuccess: null,
        actualSuccess: null,
        weightedDelta: 0
      });
    }
  );
  it("does not turn omitted lists in the old numeric UI projection into empty modifiers", () => {
    const r = analyzeReplayLuck(playbackFragment("002", "UI-060", [8], [47]));
    const es = r.events.filter((e) => e.metadata.casualtyObservation);
    expect(es).toHaveLength(2);
    for (const e of es) expect(e.metadata).not.toHaveProperty("casualtyTable");
    expect(es.map((e) => e.metadata.casualtyObservation!.outcome)).toEqual([
      "seriously_hurt",
      "no_injury"
    ]);
  });
  it("models actual original and replacement lists separately without adopting the changed copied original", () => {
    const r = analyzeNufflizerInput(
      readFileSync("demo-replays/demo3.bbr", "utf8")
    );
    const es = ["source-2033", "source-2039"].map((id) =>
      r.events.find((e) => e.metadata.sourceId === id)!
    );
    for (const e of es)
      expect(e.metadata).toHaveProperty(
        "casualtyTable",
        expect.objectContaining({ modifierTotal: 0, counts: [6, 3, 3, 2, 2] })
      );
    expect(es.map((e) => e.metadata.casualtyObservation!.outcome)).toEqual([
      "serious_injury",
      "no_injury"
    ]);
  });
  it("retains all59 public direct/original/replacement tables without score or identity promotion", () => {
    const receipt = JSON.parse(
      readFileSync(
        "tests/fixtures/evidence/bb3-casualty-observations.json",
        "utf8"
      )
    );
    const key = (l: {
      replayStep?: number;
      childIndex?: number;
      stepIndex?: number;
      messageIndex?: number;
    }) => [l.replayStep, l.childIndex, l.stepIndex, l.messageIndex].join(":");
    let count = 0;
    for (const file of Object.keys(receipt.sourceHashes)) {
      const r = analyzeNufflizerInput(
        readFileSync("demo-replays/" + file, "utf8")
      );
      for (const e of r.events.filter((e) => e.metadata.casualtyObservation)) {
        expect(e.metadata).toHaveProperty("casualtyTable");
        const raw = receipt.rawEmissions.find(
          (s: {
            sourceFile: string;
            recordKind: string;
            locator: Parameters<typeof key>[0];
          }) =>
            s.sourceFile === file &&
            s.recordKind === e.metadata.casualtyObservation!.recordKind &&
            key(s.locator) === key(e.metadata.locator ?? {})
        );
        expect(raw.modifiersPresent).toBe(true);
        const mods = raw.modifiersEmpty ? [] : raw.roll.Modifiers[0].Modifier;
        const shift = mods.reduce(
            (n: number, m: { Value: string[] }) => n + Number(m.Value[0]),
            0
          ),
          ref = facts.tables[shift],
          table = e.metadata.casualtyTable!;
        expect(table.modifierTotal).toBe(shift);
        expect(table.counts).toEqual(ref.counts);
        expect(table.probabilities).toEqual(
          ref.counts.map((n: number) => n / 16)
        );
        expect(table.modifiers).toEqual(
          mods.map((m: Record<string, string[]>) => ({
            kind:
              Number(m.ModifierType![0]) === 31 ? "niggling_injury" : "decay",
            playerId: Number(m.PlayerId![0]),
            skillId: Number(m.Skill![0]),
            effectId: Number(m.Effect![0]),
            value: Number(m.Value![0]),
            modifierType: Number(m.ModifierType![0])
          }))
        );
        expect(e.metadata.dice).toEqual(
          raw.roll.Dice[0].Die.map((d: { Value: string[] }) =>
            Number(d.Value[0])
          )
        );
        const label =
          e.metadata.casualtyObservation!.outcome === "no_injury"
            ? "badly_hurt"
            : e.metadata.casualtyObservation!.outcome;
        expect(table.observedResultChance).toBeCloseTo(
          ref.jointCounts[label] / 96,
          14
        );
        expect(e).toMatchObject({
          scoringStatus: "excluded",
          probabilitySuccess: null,
          actualSuccess: null,
          delta: 0,
          weightedDelta: 0
        });
        count++;
      }
    }
    expect(count).toBe(59);
  }, 60000);
});
