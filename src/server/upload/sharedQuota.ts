import { randomUUID } from "node:crypto";

export const QUOTA_LIMIT = 10;
export const QUOTA_WINDOW_MS = 60_000;
export const SHARED_CONCURRENCY = 2;
export const LEASE_MS = 25_000;
const BACKEND_TIMEOUT_MS = 850;
const BACKEND_RESPONSE_LIMIT = 1024;

export type GateDecision =
  | { kind: "admitted"; release: () => Promise<void> }
  | { kind: "rate_limit" | "busy" | "unavailable"; retryAfter: number };
export type UploadGate = () => Promise<GateDecision>;

const ACQUIRE = [
  "local time = redis.call('TIME')",
  "local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)",
  "redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)",
  "local used = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "if used >= tonumber(ARGV[1]) then",
  "  return {0, redis.call('PTTL', KEYS[1])}",
  "end",
  "if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[2]) then",
  "  return {2, 1000}",
  "end",
  "if redis.call('INCR', KEYS[1]) == 1 then",
  "  redis.call('PEXPIRE', KEYS[1], ARGV[3])",
  "end",
  "redis.call('ZADD', KEYS[2], now + tonumber(ARGV[4]), ARGV[5])",
  "redis.call('PEXPIRE', KEYS[2], ARGV[4])",
  "return {1, 0}"
].join("\n");

const UNAVAILABLE = { kind: "unavailable", retryAfter: 5 } as const;

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Quota service unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > BACKEND_RESPONSE_LIMIT)
        throw new Error("Invalid quota response");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createRedisUploadGate(config: {
  url: string;
  token: string;
  namespace: string;
  request?: typeof fetch;
}): UploadGate {
  const endpoint = new URL(config.url);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !config.token ||
    config.token.length > 8192 ||
    /[\r\n]/.test(config.token) ||
    !/^[a-z0-9-]{1,48}$/.test(config.namespace)
  )
    throw new Error("Invalid quota configuration");
  const rateKey = "{" + config.namespace + "}:rate";
  const leasesKey = "{" + config.namespace + "}:leases";
  const request = config.request ?? fetch;

  async function command(args: (string | number)[]): Promise<unknown> {
    const response = await request(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(args),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS)
    });
    const body = await boundedJson(response);
    if (
      !body ||
      typeof body !== "object" ||
      !("result" in body) ||
      "error" in body
    )
      throw new Error("Invalid quota response");
    return body.result;
  }

  return async () => {
    const token = randomUUID();
    try {
      const reply = await command([
        "EVAL",
        ACQUIRE,
        2,
        rateKey,
        leasesKey,
        QUOTA_LIMIT,
        SHARED_CONCURRENCY,
        QUOTA_WINDOW_MS,
        LEASE_MS,
        token
      ]);
      if (
        !Array.isArray(reply) ||
        reply.length !== 2 ||
        !Number.isSafeInteger(reply[1])
      )
        return UNAVAILABLE;
      if (reply[0] === 0)
        return {
          kind: "rate_limit",
          retryAfter:
            reply[1] < 0
              ? QUOTA_WINDOW_MS / 1000
              : Math.max(
                  1,
                  Math.min(QUOTA_WINDOW_MS / 1000, Math.ceil(reply[1] / 1000))
                )
        };
      if (reply[0] === 2) return { kind: "busy", retryAfter: 1 };
      if (reply[0] !== 1 || reply[1] !== 0) return UNAVAILABLE;
      let released = false;
      return {
        kind: "admitted",
        release: async () => {
          if (released) return;
          released = true;
          // If the release request is lost, the lease expires on the backend.
          // Never retry indefinitely or switch to a local bucket.
          await command(["ZREM", leasesKey, token]).catch(() => {});
        }
      };
    } catch {
      return UNAVAILABLE;
    }
  };
}

export function createConfiguredUploadGate(
  env: Readonly<Record<string, string | undefined>>,
  local: UploadGate
): UploadGate {
  const url = env.NUFFLIZIER_QUOTA_REDIS_REST_URL;
  const token = env.NUFFLIZIER_QUOTA_REDIS_REST_TOKEN;
  const namespace =
    env.NUFFLIZIER_QUOTA_NAMESPACE ??
    "nufflizier-" + (env.VERCEL_ENV ?? "local");
  if (
    !url &&
    !token &&
    env.VERCEL_ENV !== "production" &&
    env.NUFFLIZIER_UPLOAD_LIMITER !== "shared"
  )
    return local;
  if (!url || !token) return async () => UNAVAILABLE;
  try {
    return createRedisUploadGate({ url, token, namespace });
  } catch {
    return async () => UNAVAILABLE;
  }
}
