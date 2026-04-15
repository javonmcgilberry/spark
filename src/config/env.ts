import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultMonorepoPath = path.resolve(currentDir, '../../..');

const envSchema = z.object({
  port: z.coerce.number().int().positive().default(8787),

  slackAppToken: z.string().startsWith('xapp-').optional(),
  slackBotToken: z.string().startsWith('xoxb-').optional(),

  anthropicApiKey: z.string().optional(),
  anthropicModel: z.string().default('claude-3-5-haiku-latest'),
  githubToken: z.string().optional(),
  statsigConsoleSdkKey: z.string().optional(),
  dxWarehouseDsn: z.string().optional(),
  confluenceApiToken: z.string().optional(),
  confluenceBaseUrl: z.string().url().optional(),

  webflowMonorepoPath: z.string().default(defaultMonorepoPath),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(): EnvConfig {
  const raw = {
    port: process.env.PORT,
    slackAppToken: process.env.SLACK_APP_TOKEN || undefined,
    slackBotToken: process.env.SLACK_BOT_TOKEN || undefined,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
    anthropicModel: process.env.ANTHROPIC_MODEL || undefined,
    githubToken: process.env.GITHUB_TOKEN || undefined,
    statsigConsoleSdkKey: process.env.STATSIG_CONSOLE_SDK_KEY || undefined,
    dxWarehouseDsn: process.env.DX_WAREHOUSE_DSN || undefined,
    confluenceApiToken: process.env.CONFLUENCE_API_TOKEN || undefined,
    confluenceBaseUrl: process.env.CONFLUENCE_BASE_URL || undefined,
    webflowMonorepoPath: process.env.WEBFLOW_MONOREPO_PATH || undefined,
  };

  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  return result.data;
}
