export class ReplayValidationError extends Error {
  constructor(
    message: string,
    public readonly code:
      "INVALID_REPLAY" | "UNSUPPORTED_REPLAY_VERSION" = "INVALID_REPLAY"
  ) {
    super(message);
    this.name = "ReplayValidationError";
  }
}
