// pnpm test runs this real-worker acceptance file after the parallel corpus
// suite, preserving the production4s deadline without unrelated CPU contention.
import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/nufflizier/analyze/route";

function readFixture(name: string): string {
  return readFileSync(
    path.resolve(process.cwd(), "tests", "fixtures", "replays", name),
    "utf-8"
  );
}

describe("POST /api/nufflizier/analyze", () => {
  it("keeps opt-in worker stage diagnostics separate from report data", async () => {
    vi.stubEnv("NUFFLIZIER_ANALYZER_TIMING", "1");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const data = new FormData();
      data.set("replay", new File([readFixture("sample-basic.xml")], "private-input.xml"));
      const response = await POST(new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST", body: data
      }));
      expect(response.status).toBe(200);
      const report = LuckReportSchema.parse(await response.json());
      const records = log.mock.calls.map(([s]) => JSON.parse(s));
      expect(records.map(r => r.stage)).toEqual([
        "worker_start", "worker_ready", "decode", "parse", "analyze", "validate", "serialize"
      ]);
      expect(records.every(r => Object.keys(r).sort().join() === "atMs,event,stage" &&
        r.event === "nufflizier_analysis_stage" && Number.isSafeInteger(r.atMs))).toBe(true);
      expect(JSON.stringify(records)).not.toContain("private-input");
      expect(JSON.stringify(report)).not.toContain("analysis_stage");
    } finally { log.mockRestore(); vi.unstubAllEnvs(); }
  });
  it("exports both combined failure subtotals from the original demo2 worker", async () => {
    const data = new FormData();
    data.append(
      "replay",
      new File([readFileSync("demo-replays/demo2.bbr")], "source.bbr")
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: data
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const report = LuckReportSchema.parse(payload),
      falls = report.events.filter(
        (e) => e.metadata.movementFall?.combinedRushSourceId
      );
    expect(falls.map((e) => e.metadata.locator?.replayStep)).toEqual([
      229, 259
    ]);
    expect(falls[0]!.metadata.movementFall!.diceContribution).toBeCloseTo(
      -2 / 5,
      12
    );
    expect(falls[1]!.metadata.movementFall!.diceContribution).toBeCloseTo(
      3 / 20,
      12
    );
    expect(
      falls.every(
        (e) => e.actualSuccess === false && e.contextualImpact === undefined
      )
    ).toBe(true);
    expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
  }, 20000);
  it("retains the full-source Dodge budget without filling its missing period", async () => {
    const data = new FormData();
    data.append(
      "replay",
      new File([readFileSync("demo-replays/demo11.bbr")], "source.bbr")
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: data
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const report = LuckReportSchema.parse(payload),
      e = report.events.find(
        (e) =>
          e.metadata.locator?.replayStep === 194 &&
          e.metadata.teamRerollMovement
      )!;
    expect(e.metadata.teamRerollMovement).toMatchObject({
      rollType: 2,
      movementBefore: 4,
      movementAfter: 3
    });
    expect(e.metadata.preRoll?.activeTeamId).toBe("1");
    expect(e.metadata.preRoll?.period).toBeNull();
    const terminalMoves=report.events.filter(e=>e.contextualBounds?.policy === "team_reroll_terminal_moves");
    expect(terminalMoves.map(e=>e.metadata.locator?.replayStep)).toEqual([194,249,430]);
    expect(terminalMoves.map(e=>e.contextualBounds?.maximumMoves)).toEqual([6,3,4]);
    expect(terminalMoves.every(e=>e.contextualBounds?.successChance===2/3 && e.contextualImpact===undefined)).toBe(true);
    expect(terminalMoves[1]!.contextualBounds!.lower).toBeCloseTo(-2,12);
    expect(report.events.find(e=>e.metadata.sourceId==="source-1954")?.metadata.activationEnd).toMatchObject({actorId:"46",followingPlayerId:"39",rosterCheckpointAfter:1939,teamTurn:6});
    expect(e.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(
      report.events.filter((e) => e.metadata.teamRerollMovement)
    ).toHaveLength(2);
  }, 20000);
  it("exports full-source carrier Rush transitions and touchdown through the worker", async () => {
    const data = new FormData();
    data.append(
      "replay",
      new File([readFileSync("demo-replays/demo5.bbr")], "source.bbr")
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: data
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const report = LuckReportSchema.parse(payload),
      moves = report.events.filter((e) => e.metadata.teamRerollMovement);
    expect(moves.map((e) => e.metadata.locator?.replayStep)).toEqual([44, 118]);
    for (const e of moves) {
      expect(e.metadata.teamRerollMovement).toMatchObject({
        carriesBall: true,
        movementBefore: null,
        movementAfter: null
      });
      expect(e.probabilitySuccess).toBeCloseTo(35 / 36, 12);
    }
    expect(moves[1]!.metadata.movementTouchdown?.destination).toEqual({
      x: 25,
      y: 12
    });
    expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
  }, 20000);
  it("returns a valid nufflizier report payload", async () => {
    const formData = new FormData();
    formData.append(
      "replay",
      new File([readFixture("sample-basic.xml")], "sample-basic.xml", {
        type: "application/xml"
      })
    );

    const request = new Request("http://localhost/api/nufflizier/analyze", {
      method: "POST",
      body: formData
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toHaveProperty("match");
    expect(payload).toHaveProperty("verdict");
    expect(payload).toHaveProperty("teams");
    expect(payload).toHaveProperty("keyMoments");
    expect(payload).toHaveProperty("events");
    expect(payload).toHaveProperty("coverage");
    expect(payload).toHaveProperty("coverage.allEvents");
    expect(payload).toHaveProperty("coverage.rollCandidates");
    expect(payload).toHaveProperty("coverage.scoredByType");
    expect(payload).toHaveProperty("coverage.excludedByType");
    expect(payload).toHaveProperty("coverage.excludedByReason");
    expect(payload).toHaveProperty("weightTable");
    expect(payload).toHaveProperty("howScoredSummary");

    const keyMoments = payload.keyMoments as
      Array<{ explainability?: Record<string, unknown> }> | undefined;
    expect(Array.isArray(keyMoments)).toBe(true);
    if (keyMoments && keyMoments.length > 0) {
      expect(keyMoments[0]?.explainability).toHaveProperty("formulaSummary");
      expect(keyMoments[0]?.explainability).toHaveProperty("inputsSummary");
    }
  });

  it("exports actual3+ gate, conditional fresh pools and drive expiries through the upload worker", async () => {
    const formData = new FormData();
    formData.append(
      "replay",
      new File([readFileSync("demo-replays/demo-goblins1.bbr")], "source.bbr", {
        type: "application/octet-stream"
      })
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: formData
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const report = LuckReportSchema.parse(payload);
    expect(
      report.events.filter((e) => e.metadata.lonerGate?.threshold === 3)
    ).toHaveLength(3);
    expect(
      report.events.some((e) => e.metadata.block?.reroll === "loner")
    ).toBe(true);
    expect(report.events.some((e) => e.metadata.driveEffectExpiry)).toBe(true);
    const decision = report.events.find(
      (e) =>
        e.metadata.locator?.replayStep === 365 && e.metadata.teamRerollCounter
    )!;
    expect(decision.metadata.teamRerollCounter).toMatchObject({
      before: { count: 2, periodCode: 1, teamTurn: 9 },
      after: { count: 1, periodCode: 1, teamTurn: 9 },
      spent: 1,
      reconciliation: "matched"
    });
    const offer = report.events.find(
      (e) =>
        e.metadata.sourceId ===
        decision.metadata.teamRerollCounter!.questionSourceId
    )!;
    expect(offer.metadata.block?.pool.attackerChooses).toBe(true);
    expect(offer.metadata.rerollOffer!.decisionSourceId).toBe(
      decision.metadata.sourceId
    );
    expect(report.events.filter((e) => e.contextualBounds)).toHaveLength(3);
    expect(
      report.events.find(
        (e) => e.metadata.locator?.replayStep === 94 && e.contextualBounds
      )?.contextualBounds?.activeContinuation
    ).toEqual({ minimum: 1, maximum: 1 });
    expect(
      report.events.find(
        (e) => e.metadata.locator?.replayStep === 94 && e.metadata.dodgeMovement
      )?.metadata.dodgeMovement
    ).toMatchObject({
      movementBefore: 6,
      movementAfter: 5,
      from: { x: 12, y: 2 },
      to: { x: 13, y: 3 }
    });
    expect(report.teams.every((team) => team.impactCount === 0)).toBe(true);
    expect(
      report.events.some(
        (e) => e.metadata.blockResolution?.damageActionIds.length
      )
    ).toBe(true);
  }, 20000);
  it("exports both source-backed Sure Hands possession ranges without invented clocks or point totals", async () => {
    const data = new FormData();
    data.append(
      "replay",
      new File([readFileSync("demo-replays/demo6.bbr")], "source.bbr")
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: data
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const report = LuckReportSchema.parse(payload),
      ranges = report.events.filter((e) => e.possessionBounds);
    expect(ranges.map((e) => e.metadata.locator?.replayStep)).toEqual([
      99, 306
    ]);
    expect(ranges[0]!.possessionBounds!.upper).toBeCloseTo(7 / 8, 12);
    expect(ranges[0]!.metadata.pickupResolution).toMatchObject({
      cell: { x: 11, y: 10 },
      movementRemaining: 4
    });
    expect(ranges[1]!.metadata.pickupResolution).toBeUndefined();
    expect(ranges[1]!.possessionBounds!.lower).toBeCloseTo(-4 / 3, 12);
    expect(
      ranges.every(
        (e) =>
          e.metadata.preRoll?.activeTeamId === null &&
          e.metadata.preRoll.actorCarriesBall === null
      )
    ).toBe(true);
    expect(report.coverage.contextEvidence.boundedCount).toBe(3);
    const decision = report.events.find(
      (e) =>
        e.metadata.locator?.replayStep === 345 && e.metadata.teamRerollCounter
    )!;
    expect(decision.metadata.teamRerollCounter).toMatchObject({
      before: { count: 2, teamTurn: 9, periodCode: 1 },
      after: { count: 1, teamTurn: 9, periodCode: 1 },
      spent: 1,
      reconciliation: "matched"
    });
    expect(report.teams.every((t) => t.impactCount === 0)).toBe(true);
  }, 20000);
  it("exports a source-backed fresh catch envelope through the production worker", async () => {
    const data = new FormData();
    data.append(
      "replay",
      new File([readFileSync("demo-replays/demo3.bbr")], "source.bbr")
    );
    const response = await POST(
      new Request("http://localhost/api/nufflizier/analyze", {
        method: "POST",
        body: data
      })
    );
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload).slice(0, 200)).toBe(200);
    const r = LuckReportSchema.parse(payload),
      caught = r.events.find((e) => e.catchPossessionBounds)!;
    expect(caught.metadata.locator?.replayStep).toBe(531);
    expect(caught.playerId).toBe("45");
    expect(caught.catchPossessionBounds!.upper).toBeCloseTo(5 / 3, 12);
    expect(caught.metadata.preRoll).toBeUndefined();
    const reached = r.events.find((e) => e.metadata.pickupAfterMovement)!;
    const combined = r.events.find((e) => e.metadata.combinedMovement)!;
    expect(combined.metadata.locator?.replayStep).toBe(402);
    expect(combined.metadata.combinedMovement).toMatchObject({
      from: { x: 17, y: 6 },
      to: { x: 18, y: 7 },
      carriedBallBefore: true,
      movementAfter: null
    });
    expect(combined.probabilitySuccess).toBeCloseTo(5 / 6, 12);
    expect(reached.metadata.locator?.replayStep).toBe(401);
    expect(reached.metadata.pickupAfterMovement).toMatchObject({
      cell: { x: 17, y: 6 },
      movementRemaining: 0,
      check: { threshold: 3, baseTarget: 2, markerPlayerIds: ["42"] }
    });
    expect(reached.metadata.preRoll).toMatchObject({
      actorCarriesBall: null,
      activeTeamId: null,
      actorMovementRemaining: 0
    });
    expect(reached.probabilitySuccess).toBeCloseTo(8 / 9, 12);
    expect(reached.possessionBounds).toBeUndefined();
    expect(
      r.events
        .filter((e) => e.metadata.teamRerollMovement?.zonePenalty)
        .map((e) => e.metadata.locator?.replayStep)
    ).toEqual([273, 401]);
    const pickup = r.events.find((e) => e.metadata.pickupTurnEnd)!;
    expect(pickup.metadata.pickupTurnEnd!.ordinaryMoves).toEqual({
      knownAvailablePlayerIds: [],
      unknownPlayerIds: [
        "37",
        "38",
        "39",
        "40",
        "41",
        "43",
        "44",
        "45",
        "47",
        "48"
      ]
    });
    expect(
      r.events.find(
        (e) =>
          e.metadata.sourceId === pickup.metadata.pickupTurnEnd!.endSourceId
      )?.metadata.turnEndReason
    ).toBe(2);
    expect(r.teams.every((t) => t.impactCount === 0)).toBe(true);
  }, 20000);
});
