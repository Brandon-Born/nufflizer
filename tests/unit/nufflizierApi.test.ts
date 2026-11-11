import { LuckReportSchema } from "@/domain/nufflizer/reportSchema";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/nufflizier/analyze/route";

function readFixture(name: string): string {
  return readFileSync(
    path.resolve(process.cwd(), "tests", "fixtures", "replays", name),
    "utf-8"
  );
}

describe("POST /api/nufflizier/analyze", () => {
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
    expect(report.events.filter((e) => e.contextualBounds)).toHaveLength(3);
    expect(report.teams.every((team) => team.impactCount === 0)).toBe(true);
    expect(
      report.events.some(
        (e) => e.metadata.blockResolution?.damageActionIds.length
      )
    ).toBe(true);
  }, 20000);
});
