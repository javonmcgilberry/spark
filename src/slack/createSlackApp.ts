import {App, LogLevel} from '@slack/bolt';
import type {EnvConfig} from '../config/env.js';

export function createSlackApp(env: EnvConfig): App | null {
  if (!env.slackAppToken || !env.slackBotToken) {
    return null;
  }

  return new App({
    token: env.slackBotToken,
    appToken: env.slackAppToken,
    socketMode: true,
    logLevel: LogLevel.INFO,
    clientOptions: {
      retryConfig: {
        retries: 8,
      },
    },
  });
}
