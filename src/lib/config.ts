export const appConfig = {
  maxReplayBytes: 5 * 1024 * 1024,
  maxDecodedReplayChars: 15 * 1024 * 1024,
  maxAnalyzeDurationMs: 4000,
  replayRateLimitWindowMs: 60_000,
  replayRateLimitMaxRequests: 10
} as const;
