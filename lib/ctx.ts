/**
 * HandlerCtx — the single dependency container threaded through every
 * route handler, Slack handler, agent tool, and service in Spark.
 *
 * Every service takes HandlerCtx as its first argument; none import
 * Slack, Anthropic, D1, or any client directly. That makes:
 *
 *   - `makeProdCtx(env)` the only place real clients are constructed
 *   - `makeTestCtx(overrides)` sub-second vitest helper (in test/helpers)
 *   - Mock modes (ANTHROPIC_MOCK_MODE=1, SLACK_MOCK_MODE=1) a flip of an
 *     env flag at the factory boundary
 *
 * The sandbox page at /dev/slack-sandbox shares the same ctx plumbing
 * so a fixture POSTed there exercises the same code path as a real
 * Slack event.
 */

import type {ConfluenceClient} from './services/confluence';
import {makeConfluenceClient, makeStubConfluence} from './services/confluence';
import type {GitHubClient} from './services/github';
import {makeGitHubClient, makeStubGitHub} from './services/github';
import type {JiraClient} from './services/jira';
import {makeJiraClient, makeStubJira} from './services/jira';
import type {LlmClient} from './services/llm';
import {makeAnthropicClient, makeStubLlm} from './services/llm';
import type {SlackClient} from './services/slack';
import {makeRecordingSlackClient, makeSlackWebClient} from './services/slack';
import type {DraftStore} from './draftStore';
import {makeD1DraftStore, makeMemoryDraftStore} from './draftStore';
import type {Logger} from './logger';
import {createConsoleLogger, createSilentLogger} from './logger';

export interface HandlerCtx {
  slack: SlackClient;
  llm: LlmClient;
  db: DraftStore;
  jira: JiraClient;
  github: GitHubClient;
  confluence: ConfluenceClient;
  logger: Logger;
  env: CloudflareEnv;
  /**
   * Scratch space carried across tool calls in a single agent turn —
   * e.g. the resolved hire profile, cached roster. Keeps the LLM loop
   * from re-resolving identity on every tool call.
   */
  scratch: Record<string, unknown>;
  /**
   * Non-blocking work scheduler. In prod this calls the Cloudflare
   * Workers `ExecutionContext.waitUntil` so fire-and-forget work
   * (follow-up Slack posts, insight refreshes) still runs after the
   * HTTP 200. In tests and the sandbox it awaits inline so assertions
   * see the side effects.
   */
  waitUntil: (promise: Promise<unknown>) => void;
}

export function slackMockModeEnabled(env: CloudflareEnv): boolean {
  const flag = (env as Record<string, unknown>).SLACK_MOCK_MODE;
  return flag === '1' || flag === 'true';
}

export function anthropicMockModeEnabled(env: CloudflareEnv): boolean {
  const flag = (env as Record<string, unknown>).ANTHROPIC_MOCK_MODE;
  return flag === '1' || flag === 'true';
}

export interface MakeProdCtxOptions {
  waitUntil?: (promise: Promise<unknown>) => void;
  /**
   * Override logger (defaults to a console logger tagged `[spark]`).
   */
  logger?: Logger;
}

export function makeProdCtx(
  env: CloudflareEnv,
  options: MakeProdCtxOptions = {}
): HandlerCtx {
  const logger = options.logger ?? createConsoleLogger('spark');

  const slack = slackMockModeEnabled(env)
    ? makeRecordingSlackClient()
    : makeSlackWebClient(
        (env as Record<string, string>).SLACK_BOT_TOKEN ?? '',
        logger
      );

  const llm = anthropicMockModeEnabled(env)
    ? makeStubLlm({
        defaultText: 'mocked anthropic response (ANTHROPIC_MOCK_MODE=1)',
      })
    : makeAnthropicClient(
        env.ANTHROPIC_API_KEY,
        logger,
        env.ANTHROPIC_MODEL ?? 'claude-3-5-haiku-latest'
      );

  const jira = makeJiraClient(env as Record<string, string>, logger);
  const github = makeGitHubClient(env as Record<string, string>, logger);
  const confluence = makeConfluenceClient(
    env as Record<string, string>,
    logger
  );

  const db = resolveDraftStore(env, logger);

  const waitUntil =
    options.waitUntil ??
    ((p: Promise<unknown>) => {
      p.catch((error) =>
        logger.warn('waitUntil: fire-and-forget task failed', error)
      );
    });

  return {
    slack,
    llm,
    db,
    jira,
    github,
    confluence,
    logger,
    env,
    scratch: {},
    waitUntil,
  };
}

function resolveDraftStore(env: CloudflareEnv, logger: Logger): DraftStore {
  const candidate = (env as unknown as {DRAFTS_DB?: unknown}).DRAFTS_DB;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as {prepare?: unknown}).prepare === 'function'
  ) {
    return makeD1DraftStore(
      candidate as Parameters<typeof makeD1DraftStore>[0]
    );
  }
  logger.warn(
    'DRAFTS_DB binding missing; falling back to in-memory draft store. ' +
      'Drafts will not persist across Worker invocations. Configure the D1 binding in wrangler.jsonc for production.'
  );
  return makeMemoryDraftStore();
}

/**
 * Build a minimal test CloudflareEnv. Tests extend this with overrides
 * via `{...TEST_ENV, FOO: 'bar'}`.
 */
export const TEST_ENV: CloudflareEnv = {
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  SLACK_BOT_TOKEN: 'xoxb-test',
  SLACK_SIGNING_SECRET: 'test-signing-secret',
  SLACK_MOCK_MODE: '1',
  ANTHROPIC_MOCK_MODE: '1',
  DEMO_MANAGER_SLACK_ID: 'UMANAGER1',
} as unknown as CloudflareEnv;

/**
 * Re-exports so test helpers can build lightweight ctxs without
 * rebuilding factory plumbing.
 */
export {
  createSilentLogger,
  createConsoleLogger,
  makeStubConfluence,
  makeStubGitHub,
  makeStubJira,
  makeStubLlm,
  makeRecordingSlackClient,
  makeMemoryDraftStore,
};
