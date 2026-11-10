import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { demoCorpus } from "../helpers/corpus";

// The old shape/adjacency promotion gates are historical artifacts, not independent rule proof.
// Retain their independently countable raw-dice invariants without claiming game semantics.
describe("rollType 1 raw evidence (NUF-009 semantic mapping remains open)", () => {
  it("preserves every observed result and its exact numeric threshold", () => {
    let total = 0;
    for (const { replay, report } of demoCorpus()) {
      const raw = replay.turns
        .flatMap((turn) => turn.events)
        .filter(
          (event) => event.sourceTag === "ResultRoll" && event.rollType === 1
        );
      total += raw.length;
      const reported = report.events.filter(
        (event) =>
          event.metadata.sourceTag === "ResultRoll" &&
          event.metadata.rollType === 1
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
          expect(normalized.type).toBe("movement_risk");
        }
      }
      expect(report.verdict.luckierTeam).toBe("unknown");
    }
    expect(total).toBe(216);
  }, 60000);
});

it("preserves the independently inventoried direct results in all 12 demo reports", () => {
  const baseline = JSON.parse(
    readFileSync(
      "tests/fixtures/evidence/bb3-demo-raw-roll-inventory.json",
      "utf8"
    )
  ) as {
    files: {
      sha256: string;
      counts: Record<string, number>;
      directResultCounts: Record<string, number>;
    }[];
  };
  const expected = new Map(baseline.files.map((file) => [file.sha256, file]));
  const corpus = demoCorpus();
  expect(corpus).toHaveLength(expected.size);
  for (const { file, report } of corpus) {
    const hash = createHash("sha256")
      .update(readFileSync(`demo-replays/${file}`))
      .digest("hex");
    const reference = expected.get(hash);
    expect(reference, file).toBeDefined();
    const direct: Record<string, number> = {};
    for (const { metadata } of report.events) {
      const locator = metadata.locator;
      const tag = metadata.sourceTag;
      if (
        !locator?.replayStep ||
        locator.stepIndex !== undefined ||
        !(tag.startsWith("Question") || tag.startsWith("Result"))
      )
        continue;
      const key = `${tag}|${metadata.rollType ?? "?"}`;
      direct[key] = (direct[key] ?? 0) + 1;
    }
    expect(direct, file).toEqual(reference!.directResultCounts);
    const recovery = report.events.filter(
      (e) => e.metadata.sourceTag === "EventRoll" && e.metadata.rollType === 13
    );
    expect(recovery, file).toHaveLength(reference!.counts["EventRoll|13"] ?? 0);
    expect(LuckReportSchema.safeParse(report).success, file).toBe(true);
  }
}, 60_000);
