import {
  createConfiguredUploadGate,
  QUOTA_LIMIT,
  QUOTA_WINDOW_MS,
  SHARED_CONCURRENCY,
  type UploadGate
} from "./sharedQuota";

// Bounded single-process fallback for local use and explicit preview testing.
// No forwarded headers or per-client identifiers are accepted in either mode.
let bucket = { count: 0, resetAt: 0 };
let active = 0;
const localGate: UploadGate = async () => {
  const now = Date.now();
  if (now >= bucket.resetAt)
    bucket = { count: 0, resetAt: now + QUOTA_WINDOW_MS };
  if (bucket.count >= QUOTA_LIMIT)
    return {
      kind: "rate_limit",
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
  if (active >= SHARED_CONCURRENCY) return { kind: "busy", retryAfter: 1 };
  bucket.count++;
  active++;
  let released = false;
  return {
    kind: "admitted",
    release: async () => {
      if (released) return;
      released = true;
      active--;
    }
  };
};

export const acquireUpload = createConfiguredUploadGate(process.env, localGate);
