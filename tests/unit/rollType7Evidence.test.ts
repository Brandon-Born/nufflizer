import { describe, expect, it } from "vitest";
import { demoCorpus } from "../helpers/corpus";

// The old shape/adjacency promotion gates are historical artifacts, not independent rule proof.
// Retain their independently countable raw-dice invariants without claiming game semantics.
describe("rollType 7 raw evidence (independent raw numeric regression)", () => {
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
});
