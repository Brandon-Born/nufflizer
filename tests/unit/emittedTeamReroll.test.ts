import { describe, expect, it } from "vitest";
import { parseReplayXml } from "@/domain/replay/parseXml";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { emittedTeamRerollXml } from "../helpers/emittedTeamReroll";
const parse = (o: Parameters<typeof emittedTeamRerollXml>[0] = {}) =>
  parseReplayXml(emittedTeamRerollXml(o));
const analyze = (r: ReturnType<typeof parse>) =>
  LuckReportSchema.parse(analyzeReplayLuck(r));
describe("emitted original and committed ordinary team reroll", () => {
  it.each([1, 3])(
    "groups original1 and replacement%s as one check",
    (replacement) => {
      const r = analyze(parse({ replacement })),
        final = r.events.find(
          (e) => e.metadata.rerollDraws && e.metadata.rerollOriginalId
        )!;
      expect(final).toBeDefined();
      expect(final.scoringStatus).toBe("scored");
      expect(final.probabilitySuccess).toBeCloseTo(35 / 36, 12);
      expect(final.actualSuccess).toBe(replacement >= 2);
      expect(final.delta).toBeCloseTo(Number(replacement >= 2) - 10 / 6, 12);
      expect(final.metadata.teamRerollsSpent).toBe(1);
      expect(final.metadata.rerollResource).toBe("team");
      const original = r.events.find(
        (e) => e.metadata.sourceId === final.metadata.rerollOriginalId
      )!;
      expect(original.scoringStatus).toBe("excluded");
      expect(original.metadata.isRollCandidate).toBe(false);
      expect(original.metadata.mergedRerollAnchorId).toBe(
        final.metadata.sourceId
      );
      expect(original.weightedDelta).toBe(0);
      expect(original.metadata.dice).toEqual([1]);
      expect(final.metadata.originalDice).toEqual({
        Die: { DieType: 0, Value: 1 }
      });
      const q = r.events.find(
          (e) => e.metadata.sourceId === final.metadata.rerollQuestionId
        )!,
        choice = r.events.find(
          (e) => e.metadata.sourceId === final.metadata.rerollDecisionId
        )!;
      expect(q.scoringStatus).toBe("excluded");
      expect(choice.metadata.teamRerollDecision).toEqual({
        gamerId: 1,
        used: true
      });
      const group = r.diceRecords.filter((d) =>
        [
          original.metadata.sourceId,
          q.metadata.sourceId,
          final.metadata.sourceId
        ].includes(d.parentSourceId)
      );
      expect(
        group.filter((d) => d.disposition === "covered_roll")
      ).toHaveLength(2);
      expect(group.filter((d) => d.disposition === "summary")).toHaveLength(1);
      const ordinary = analyze(parse({ includeOriginal: false, replacement }));
      expect(r.teams.map((t) => t.luckScore)).toEqual(
        ordinary.teams.map((t) => t.luckScore)
      );
      expect(r.coverage.rollCandidates).toEqual(
        ordinary.coverage.rollCandidates
      );
      expect(r.verdict).toEqual(ordinary.verdict);
    }
  );
});
