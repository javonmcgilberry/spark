import {vi, type Mock} from 'vitest';
import type {Logger} from '../../src/app/logger.js';

type LoggerMethod = Logger['info'];
type LoggerMock = Mock<LoggerMethod> & LoggerMethod;

export interface TestLogger extends Logger {
  info: LoggerMock;
  warn: LoggerMock;
  error: LoggerMock;
  debug: LoggerMock;
}

export function createTestLogger(): TestLogger {
  return {
    info: vi.fn<LoggerMethod>(),
    warn: vi.fn<LoggerMethod>(),
    error: vi.fn<LoggerMethod>(),
    debug: vi.fn<LoggerMethod>(),
  };
}
