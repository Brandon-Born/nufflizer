// Runs the production Lua against real Redis; the adapter only translates the
// REST JSON command to redis-cli. A private Unix socket avoids an open TCP port.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as wait } from "node:timers/promises";
import { analyzeUpload } from "../src/server/upload/analyzeUpload";
import { createRedisUploadGate } from "../src/server/upload/sharedQuota";

const exec = promisify(execFile);
async function main() {
  const dir = await mkdtemp("/tmp/nuff-quota-");
  const socket = join(dir, "redis.sock");
  const server = spawn(
    "redis-server",
    [
      "--port",
      "0",
      "--unixsocket",
      socket,
      "--unixsocketperm",
      "700",
      "--save",
      "",
      "--appendonly",
      "no",
      "--dir",
      dir
    ],
    { stdio: "ignore" }
  );
  const exited = once(server, "exit");
  // Prevent a missing local binary from producing an unhandled rejection.
  void exited.catch(() => {});
  const redis = async (...args: (string | number)[]) => {
    const result = await exec(
      "redis-cli",
      ["-s", socket, "--json", ...args.map(String)],
      { timeout: 500 }
    );
    return JSON.parse(result.stdout) as unknown;
  };
  try {
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      ready = await redis("PING").then(
        (v) => v === "PONG",
        () => false
      );
      if (!ready) await wait(30);
    }
    assert(
      ready,
      "A Redis server and CLI are required for the quota integration test."
    );
    const rest: typeof fetch = async (_url, init) => {
      try {
        const result = await redis(
          ...(JSON.parse(String(init?.body)) as (string | number)[])
        );
        return Response.json({ result });
      } catch {
        return Response.json(
          { error: "Redis command failed" },
          { status: 400 }
        );
      }
    };
    const config = {
      url: "https://quota-test.invalid",
      token: "local-test-only",
      namespace: "nuff-quota-test",
      request: rest
    };
    const first = createRedisUploadGate(config);
    const second = createRedisUploadGate(config);
    const concurrent = await Promise.all([first(), second()]);
    assert(
      concurrent[0]?.kind === "admitted" && concurrent[1]?.kind === "admitted"
    );
    let pulls = 0;
    const rejected = async (
      i: number,
      gate: typeof first,
      expected: number
    ) => {
      const req = new Request(
        "https://nuff-test.invalid/api/nufflizier/analyze",
        {
          method: "POST",
          headers: {
            "Content-Type": "multipart/form-data; boundary=test",
            "X-Forwarded-For": "192.0.2." + i
          },
          body: new ReadableStream(
            {
              pull(controller) {
                pulls++;
                controller.close();
              }
            },
            { highWaterMark: 0 }
          ),
          duplex: "half"
        } as RequestInit & { duplex: "half" }
      );
      const response = await analyzeUpload(req, false, gate);
      assert.equal(response.status, expected);
      const retry = Number(response.headers.get("Retry-After"));
      assert(retry >= 1 && retry <= 60);
      return response;
    };
    await rejected(1, first, 503);
    await rejected(2, second, 503);
    assert.equal(pulls, 0);
    await Promise.all(
      concurrent.map((lease) => lease.kind === "admitted" && lease.release())
    );
    for (let i = 0; i < 8; i++) {
      const lease = await (i % 2 === 0 ? first : second)();
      assert(lease.kind === "admitted");
      await lease.release();
    }
    assert.equal(
      (await (await rejected(3, first, 429)).json()).code,
      "RATE_LIMIT"
    );
    await rejected(4, second, 429);
    assert.equal(pulls, 0);
    const rateKey = "{nuff-quota-test}:rate",
      leasesKey = "{nuff-quota-test}:leases";
    assert.equal(await redis("GET", rateKey), "10");
    assert.equal(await redis("ZCARD", leasesKey), 0);
    assert.equal(await redis("DBSIZE"), 1);
    const ttl = Number(await redis("PTTL", rateKey));
    assert(ttl > 0 && ttl <= 60_000);
    await redis("PEXPIRE", rateKey, 1);
    await wait(20);
    // Simulate leases from crashed handlers; expiration is checked atomically
    // against Redis time before the concurrency count is used.
    await redis("ZADD", leasesKey, 1, "expired-one", 2, "expired-two");
    const renewed = await second();
    assert(renewed.kind === "admitted");
    assert.equal(await redis("GET", rateKey), "1");
    assert.equal(await redis("ZCARD", leasesKey), 1);
    const leaseTtl = Number(await redis("PTTL", leasesKey));
    assert(leaseTtl > 0 && leaseTtl <= 25_000);
    await renewed.release();
    await redis("SET", leasesKey, "invalid-key-type");
    assert.equal(
      (await (await rejected(5, second, 503)).json()).code,
      "QUOTA_UNAVAILABLE"
    );
    assert.equal(pulls, 0);
    console.log(
      "Shared quota: real Redis, 2 independent handlers, atomic slots/quota/expiry/failure and spoofed headers verified."
    );
  } finally {
    if (server.pid) server.kill("SIGTERM");
    if (server.pid) await exited.catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
