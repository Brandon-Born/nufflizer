export class ReplayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayValidationError";
  }
}
