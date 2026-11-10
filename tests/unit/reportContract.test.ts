import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { analyzeReplayLuck } from "@/domain/nufflizer/analyzeLuck";
import { analyzeNufflizerInput } from "@/server/services/analyzeNufflizer";
import { model, rollEvent, envelope } from "../helpers/replay";

function report() {
  return analyzeReplayLuck(
    model([
      rollEvent(),
      rollEvent({ actorTeamId: "1" }),
      rollEvent({ rollType: 999 })
    ])
  );
}
describe("NUF-021 versioned report contract", () => {
  it("accepts truthful partial and insufficient reports without changing values", () => {
    const partial = report();
    expect(LuckReportSchema.parse(partial)).toEqual(partial);
    const empty = analyzeNufflizerInput(envelope());
    expect(LuckReportSchema.parse(empty)).toEqual(empty);
  });
  it.each([
    (r: ReturnType<typeof report>) => {
      r.verdict.summary = "Home was decisively luckier.";
    },
    (r: ReturnType<typeof report>) => {
      r.weightTable.ball_handling = 100;
    },
    (r: ReturnType<typeof report>) => {
      r.schemaVersion = "1.0" as "2.0";
    },
    (r: ReturnType<typeof report>) => {
      r.modelVersion = "future" as "dice-only-2";
    },
    (r: ReturnType<typeof report>) => {
      r.teams[0].luckScore = NaN;
    },
    (r: ReturnType<typeof report>) => {
      r.events[0]!.probabilitySuccess = 1.1;
    },
    (r: ReturnType<typeof report>) => {
      r.events[0]!.actualSuccess = null;
    },
    (r: ReturnType<typeof report>) => {
      r.events[0]!.delta = 0.9;
    },
    (r: ReturnType<typeof report>) => {
      r.events[0]!.weightedDelta = 0.9;
    },
    (r: ReturnType<typeof report>) => {
      r.events[2]!.probabilitySuccess = 0;
    },
    (r: ReturnType<typeof report>) => {
      r.events[2]!.weightedDelta = 1;
    },
    (r: ReturnType<typeof report>) => {
      r.events[0]!.teamId = "missing-team";
    },
    (r: ReturnType<typeof report>) => {
      r.events[0]!.metadata.isRollCandidate = false;
    },
    (r: ReturnType<typeof report>) => {
      r.events[1]!.id = r.events[0]!.id;
    },
    (r: ReturnType<typeof report>) => {
      r.teams[1].teamId = r.teams[0].teamId;
    },
    (r: ReturnType<typeof report>) => {
      r.teams[0].luckScore = 0;
    },
    (r: ReturnType<typeof report>) => {
      r.teams[0].categoryScores.ballHandling = 99;
    },
    (r: ReturnType<typeof report>) => {
      r.teams[0].eventCount = 0;
    },
    (r: ReturnType<typeof report>) => {
      r.coverage.allEvents.scoredCount = 99;
    },
    (r: ReturnType<typeof report>) => {
      r.coverage.rollCandidates.scoredRate = 1;
    },
    (r: ReturnType<typeof report>) => {
      r.coverage.sourceRecordCount = 0;
    },
    (r: ReturnType<typeof report>) => {
      r.coverage.scoredByType.ball_handling = 99;
    },
    (r: ReturnType<typeof report>) => {
      r.coverage.excludedByType.unknown = 0;
    },
    (r: ReturnType<typeof report>) => {
      r.coverage.excludedByReason = {};
    },
    (r: ReturnType<typeof report>) => {
      r.keyMoments.push(r.events[2]!);
    },
    (r: ReturnType<typeof report>) => {
      r.keyMoments.push(r.keyMoments[0]!);
    },
    (r: ReturnType<typeof report>) => {
      r.keyMoments[0] = { ...r.keyMoments[0]!, label: "Different evidence" };
    },
    (r: ReturnType<typeof report>) => {
      r.match.homeTeam = "Different team";
    },
    (r: ReturnType<typeof report>) => {
      r.verdict.scoreGap = 99;
    },
    (r: ReturnType<typeof report>) => {
      r.verdict.status = "insufficient_evidence";
    },
    (r: ReturnType<typeof report>) => {
      r.verdict.luckierTeam = "even" as "unknown";
    },
    (r: ReturnType<typeof report>) => {
      r.verdict.status = "supported_analysis" as "partial_analysis";
    }
  ])("rejects contradictory or fabricated report data (case %#)", (tamper) => {
    const value = structuredClone(report());
    tamper(value);
    expect(LuckReportSchema.safeParse(value).success).toBe(false);
  });
  it("validates a real report and preserves exported evidence", () => {
    const value = analyzeNufflizerInput(
      readFileSync("demo-replays/demo1.bbr", "utf8")
    );
    const roundTrip = LuckReportSchema.parse(JSON.parse(JSON.stringify(value)));
    expect(roundTrip).toEqual(JSON.parse(JSON.stringify(value)));
    expect(roundTrip.coverage.scoredByType.ball_handling).toBe(4);
  }, 10000);
});
