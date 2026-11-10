import { describe, expect, it, vi } from "vitest";
import {
  createConfiguredUploadGate,
  createRedisUploadGate
} from "@/server/upload/sharedQuota";

describe("shared upload quota boundary (NUF-024)", () => {
  const url = "https://quota-test.invalid";
  const config = { url, token: "test-token", namespace: "test" };
  it("fails closed if Vercel production lacks a backend, even with a working local gate", async () => {
    const local = vi.fn(async () => ({ kind: "busy" as const, retryAfter: 1 }));
    await expect(
      createConfiguredUploadGate({ VERCEL_ENV: "production" }, local)()
    ).resolves.toMatchObject({ kind: "unavailable" });
    expect(local).not.toHaveBeenCalled();
    await expect(
      createConfiguredUploadGate({ VERCEL_ENV: "preview" }, local)()
    ).resolves.toMatchObject({ kind: "busy" });
  });
  it.each([
    { NUFFLIZIER_QUOTA_REDIS_REST_URL: url },
    { NUFFLIZIER_QUOTA_REDIS_REST_TOKEN: "token" },
    { NUFFLIZIER_UPLOAD_LIMITER: "shared" }
  ])("does not fall back with incomplete shared config (%j)", async (env) => {
    const local = vi.fn();
    await expect(
      createConfiguredUploadGate(env, local)()
    ).resolves.toMatchObject({ kind: "unavailable" });
    expect(local).not.toHaveBeenCalled();
  });
  it.each([
    () => Response.json({ result: [3, 0] }),
    () => Response.json({ result: [1, null] }),
    () => Response.json({ result: [1, 0], error: "backend error" }),
    () => new Response("x".repeat(1025)),
    () => new Response(null, { status: 503 }),
    () => {
      throw new Error("unreachable");
    }
  ])(
    "rejects unavailable, invalid and oversized backend responses",
    async (reply) => {
      const gate = createRedisUploadGate({
        ...config,
        request: async () => reply()
      });
      await expect(gate()).resolves.toMatchObject({ kind: "unavailable" });
    }
  );
  it("requires HTTPS without URL credentials and a bounded safe namespace", () => {
    expect(() =>
      createRedisUploadGate({ ...config, url: "http://quota-test.invalid" })
    ).toThrow();
    expect(() =>
      createRedisUploadGate({
        ...config,
        url: "https://owner:token@quota-test.invalid"
      })
    ).toThrow();
    expect(() =>
      createRedisUploadGate({ ...config, namespace: "{spoof}" })
    ).toThrow();
  });
});
