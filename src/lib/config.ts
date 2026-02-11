type LegacyReplayApiMode = "enabled" | "disabled";

function parseLegacyReplayApiMode(value: string | undefined): LegacyReplayApiMode {
  return value === "disabled" ? "disabled" : "enabled";
}

export const appConfig = {
  maxReplayBytes: 5 * 1024 * 1024,
  maxDecodedReplayChars: 15 * 1024 * 1024,
  maxAnalyzeDurationMs: 4000,
  replayRateLimitWindowMs: 60_000,
  replayRateLimitMaxRequests: 10,
  legacyReplayApiMode: parseLegacyReplayApiMode(process.env.NUFFLIZIER_LEGACY_REPLAY_API_MODE),
  legacyReplayApiSunsetIso: process.env.NUFFLIZIER_LEGACY_REPLAY_API_SUNSET ?? "2026-04-30T00:00:00Z"
} as const;
