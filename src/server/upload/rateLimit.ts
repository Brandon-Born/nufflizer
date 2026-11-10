// A bounded local safeguard only. Deployment-wide quotas require NUF-024 platform configuration.
// One aggregate bucket avoids spoofable forwarding headers and unbounded per-IP storage.
let bucket = { count: 0, resetAt: 0 };
export function consumeLocalUploadQuota(): boolean {
  const now = Date.now();
  if (now >= bucket.resetAt) bucket = { count: 0, resetAt: now + 60_000 };
  if (bucket.count >= 10) return false;
  bucket.count++;
  return true;
}
