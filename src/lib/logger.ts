export const logger = {
  info(message: string, details?: Record<string, unknown>) {
    console.info(message, details ?? {});
  },
  error(message: string, details?: Record<string, unknown>) {
    console.error(message, details ?? {});
  }
};
