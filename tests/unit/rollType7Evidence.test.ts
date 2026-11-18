import { describe, expect, it } from "vitest";
import { demoCorpus } from "../helpers/corpus";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { createOwnershipTimeline } from "@/domain/replay/ownershipTimeline";
import { bombTraitTransitions } from "@/domain/replay/bombTraitContinuity";
import { visitCurrentTraits } from "@/domain/replay/traitContinuity";

// The old shape/adjacency promotion gates are historical artifacts, not independent rule proof.
// Retain their independently countable raw-dice invariants without claiming game semantics.
describe("rollType 7 raw evidence (independent raw numeric regression)", () => {
  it("continues six observed bomb launches and keeps known profiles after the demo6 ejection", () => {
    const expected = new Map([
      ["demo2.bbr", [2722, 3571, 3878]],
      ["demo6.bbr", [341, 637, 963]]
    ]);
    for (const { file, replay } of demoCorpus()) {
      const owners = createOwnershipTimeline(replay);
      const admitted = replay.turns.flatMap((turn) => {
        const sources = bombTraitTransitions(turn.events, owners);
        return turn.events
          .filter((e) => e.actionCode === 16 && sources.has(e.id!))
          .map((e) => e.sourceIndex);
      });
      expect(admitted).toEqual(expected.get(file) ?? []);
    }
    const replay = structuredClone(
      demoCorpus().find(({ file }) => file === "demo6.bbr")!.replay
    );
    const profileCounts = () => {
      const counts = new Map<number, number>();
      visitCurrentTraits(replay, (event, _, traits) => {
        const i = event.sourceIndex!;
        if ([363, 620, 963, 1887, 2151].includes(i)) counts.set(i, traits.size);
        if (i === 2151 && traits.size) {
          expect(traits.has("51")).toBe(false);
          expect(traits.get("46")).toMatchObject({
            teamId: "1",
            onPitch: true
          });
        }
      });
      return [...counts.values()];
    };
    expect(profileCounts()).toEqual([24, 23, 22, 22, 23]);

    const events = replay.turns.flatMap((turn) => turn.events);
    const interception = events.find((e) => e.sourceIndex === 344)!;
    interception.payload!.GamerId = 1;
    expect(profileCounts()).toEqual([0, 0, 0, 0, 0]);
    interception.payload!.GamerId = 0;

    const blastCheck = events.find((e) => e.sourceIndex === 361)!;
    blastCheck.payload!.Outcome = 0;
    expect(profileCounts()).toEqual([0, 0, 0, 0, 0]);
    blastCheck.payload!.Outcome = 1;

    const originalThrow = (
      events.find((e) => e.sourceIndex === 965)!.payload!.RollInfos as {
        Dice: { Die: { Value: number } };
      }
    ).Dice.Die;
    const originalFace = originalThrow.Value;
    originalThrow.Value = 6;
    expect(profileCounts()).toEqual([24, 23, 22, 0, 0]);
    originalThrow.Value = originalFace;

    const ejection = events.find((e) => e.sourceIndex === 1886)!;
    ejection.payload!.PlayerId = "50";
    expect(profileCounts()).toEqual([24, 23, 22, 0, 0]);
  }, 60000);

  it("preserves every observed result and its exact numeric threshold", () => {
    let total = 0;
    for (const { replay, report } of demoCorpus()) {
      const raw = replay.turns
        .flatMap((turn) => turn.events)
        .filter(
          (event) => event.sourceTag === "ResultRoll" && event.rollType === 7
        );
      total += raw.length;
      const reported = report.events.filter(
        (event) =>
          event.metadata.sourceTag === "ResultRoll" &&
          event.metadata.rollType === 7
      );
      expect(reported).toHaveLength(raw.length);
      for (const event of raw) {
        const p = event.payload!;
        const die = (p.Dice as { Die: { DieType: number; Value: number } }).Die;
        expect(die.DieType).toBe(0);
        expect(die.Value).toBeGreaterThanOrEqual(1);
        expect(die.Value).toBeLessThanOrEqual(6);
        expect(p.Outcome).toBe(Number(die.Value >= Number(p.Difficulty)));
        const normalized = reported.find(
          (result) => result.metadata.sourceId === event.id
        )!;
        expect(normalized).toBeDefined();
        if (normalized.scoringStatus === "scored") {
          const base = (7 - Number(p.Difficulty)) / 6;
          expect(normalized.explainability.baseOdds).toBeCloseTo(base, 12);
          expect(normalized.type).toBe("ball_handling");
        }
      }
      expect(report.verdict.luckierTeam).toBe("unknown");
    }
    expect(total).toBe(58);
  }, 60000);

  it("keeps bomb catches separate from ordinary Catch odds and coverage", () => {
    const expected = new Map<
      string,
      readonly (readonly [number, number, boolean])[]
    >([
      [
        "demo2.bbr",
        [
          [3583, 3588, true],
          [3882, 3883, false]
        ]
      ],
      [
        "demo6.bbr",
        [
          [353, 358, true],
          [648, 649, false],
          [983, 984, false]
        ]
      ]
    ]);
    for (const { file, report } of demoCorpus()) {
      const rows = report.events.filter((event) => event.metadata.bombCatch);
      const witnesses = expected.get(file) ?? [];
      expect(rows.map((event) => event.metadata.sourceIndex)).toEqual(
        witnesses.map(([source]) => source)
      );
      for (const [source, explosion, caught] of witnesses) {
        const event = rows.find((row) => row.metadata.sourceIndex === source)!;
        expect(event).toMatchObject({
          scoringStatus: "excluded",
          probabilitySuccess: null,
          actualSuccess: null,
          weightedDelta: 0,
          metadata: {
            isRollCandidate: true,
            bombCatch: { explosionSourceId: `source-${explosion}`, caught }
          }
        });
        expect(
          report.diceRecords.find((die) => die.eventId === event.id)
            ?.disposition
        ).toBe("unscored_roll");
      }
      // The regular ball bounces after explosion damage in demo6. Demo4's
      // PassType4 appears under a ball launch and its Catch remains eligible.
      const control =
        file === "demo6.bbr" ? 674 : file === "demo4.bbr" ? 1722 : undefined;
      if (control !== undefined)
        expect(
          report.events.find((e) => e.metadata.sourceIndex === control)
            ?.scoringStatus
        ).toBe("scored");
      if (rows.length) {
        const wrong = structuredClone(report);
        wrong.events.find(
          (e) => e.id === rows[0]!.id
        )!.metadata.bombCatch!.explosionSourceId = "source-1";
        expect(LuckReportSchema.safeParse(wrong).success).toBe(false);
      }
    }
  }, 60000);
});
