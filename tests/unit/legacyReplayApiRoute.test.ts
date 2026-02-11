import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

function readFixture(name: string): string {
  return readFileSync(path.resolve(process.cwd(), "tests", "fixtures", "replays", name), "utf-8");
}

async function loadPostHandler() {
  const route = await import("@/app/api/replay/route");
  return route.POST;
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("POST /api/replay legacy gate", () => {
  it("returns legacy payload with deprecation headers when enabled", async () => {
    vi.stubEnv("NUFFLIZIER_LEGACY_REPLAY_API_MODE", "enabled");
    vi.stubEnv("NUFFLIZIER_LEGACY_REPLAY_API_SUNSET", "2026-04-30T00:00:00Z");
    const POST = await loadPostHandler();

    const formData = new FormData();
    formData.append("replay", new File([readFixture("sample-basic.xml")], "sample-basic.xml", { type: "application/xml" }));

    const request = new Request("http://localhost/api/replay", {
      method: "POST",
      body: formData
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toHaveProperty("report");
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(response.headers.get("Sunset")).toBe("2026-04-30T00:00:00Z");
    expect(response.headers.get("Link")).toContain("/api/nufflizier/analyze");
  });

  it("returns 410 with replacement metadata when disabled", async () => {
    vi.stubEnv("NUFFLIZIER_LEGACY_REPLAY_API_MODE", "disabled");
    vi.stubEnv("NUFFLIZIER_LEGACY_REPLAY_API_SUNSET", "2026-04-30T00:00:00Z");
    const POST = await loadPostHandler();

    const request = new Request("http://localhost/api/replay", {
      method: "POST"
    });

    const response = await POST(request);
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(410);
    expect(payload).toMatchObject({
      code: "LEGACY_ENDPOINT_DISABLED",
      replacement: "/api/nufflizier/analyze"
    });
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(response.headers.get("Sunset")).toBe("2026-04-30T00:00:00Z");
    expect(response.headers.get("Link")).toContain("/api/nufflizier/analyze");
  });
});
