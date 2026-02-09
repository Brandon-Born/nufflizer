export const logger = {
  info(message: string, details?: Record<string, unknown>) {
    console.info(message, details ?? {});
  },
  warn(message: string, details?: Record<string, unknown>) {
    console.warn(message, details ?? {});
  },
  error(message: string, details?: Record<string, unknown>) {
    console.error(message, details ?? {});
  }
};
