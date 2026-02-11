import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/nufflizier/analyze/route";

function readFixture(name: string): string {
  return readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "replays", name), "utf-8");
}

describe("POST /api/nufflizier/analyze", () => {
  it("returns a valid nufflizier report payload", async () => {
    const formData = new FormData();
    formData.append("replay", new File([readFixture("sample-basic.xml")], "sample-basic.xml", { type: "application/xml" }));

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
    expect(payload).toHaveProperty("coverage.byType");
    expect(payload).toHaveProperty("coverage.fallbackByRollType");
    expect(payload).toHaveProperty("coverage.nondeterministicArgueRollTypes");
    expect(payload).toHaveProperty("weightTable");
    expect(payload).toHaveProperty("howScoredSummary");

    const keyMoments = payload.keyMoments as Array<{ explainability?: Record<string, unknown> }> | undefined;
    expect(Array.isArray(keyMoments)).toBe(true);
    if (keyMoments && keyMoments.length > 0) {
      expect(keyMoments[0]?.explainability).toHaveProperty("formulaSummary");
      expect(keyMoments[0]?.explainability).toHaveProperty("inputsSummary");
    }
  });
});
