// Shared by HTTP, CLI and direct service callers. Limits are in bytes, not UTF-16 characters.
export const REPLAY_LIMITS = {
  inputBytes: 4_000_000,
  requestBytes: 4_100_000,
  decodedBytes: 15 * 1024 * 1024,
  messageBytes: 512 * 1024,
  embeddedTotalBytes: 24 * 1024 * 1024,
  xmlDepth: 64,
  xmlNodes: 750_000,
  events: 50_000,
  responseBytes: 4_000_000
} as const;
