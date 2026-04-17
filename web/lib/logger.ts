export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export function createConsoleLogger(prefix: string): Logger {
  const tag = `[${prefix}]`;
  return {
    info: (message, ...args) => console.info(tag, message, ...args),
    warn: (message, ...args) => console.warn(tag, message, ...args),
    error: (message, ...args) => console.error(tag, message, ...args),
    debug: (message, ...args) => console.debug(tag, message, ...args),
  };
}

export function createSilentLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}
