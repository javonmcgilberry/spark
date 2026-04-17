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

import {resolveAtlassianOAuth} from './auth/atlassianSession';
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
   * Atlassian Basic auth email for this request. Populated after the
   * manager session resolves (from the Cloudflare Access JWT) so Jira
   * and Confluence can authenticate as the viewing user. Undefined
   * outside of session-bearing routes; isConfigured() on jira and
   * confluence returns false without it, so calls no-op safely.
   */
  viewerEmail?: string;
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

  const github = makeGitHubClient(env as Record<string, string>, logger);
  const db = resolveDraftStore(env, logger);

  const waitUntil =
    options.waitUntil ??
    ((p: Promise<unknown>) => {
      p.catch((error) =>
        logger.warn('waitUntil: fire-and-forget task failed', error)
      );
    });

  // Build ctx first, then register Atlassian clients with a callback
  // that reads ctx.viewerEmail at call time. routeCtx populates
  // viewerEmail from the resolved session after this function returns,
  // so the services pick it up without rebuilding.
  const ctx: HandlerCtx = {
    slack,
    llm,
    db,
    // Temporary placeholders — overwritten in the same tick below.
    jira: undefined as unknown as JiraClient,
    confluence: undefined as unknown as ConfluenceClient,
    github,
    logger,
    env,
    scratch: {},
    waitUntil,
  };

  // Email precedence for Atlassian Basic auth:
  //   1. env.JIRA_API_EMAIL — explicit override (testing / service
  //      accounts / envs without CF Access).
  //   2. ctx.viewerEmail — populated from the Cloudflare Access JWT
  //      after session resolution.
  // Only consulted when OAuth isn't connected; otherwise the Bearer
  // token carries identity on its own.
  const jiraAuthEmail = () => env.JIRA_API_EMAIL ?? ctx.viewerEmail;
  const confluenceAuthEmail = () => ctx.viewerEmail;
  const oauthResolver = () =>
    resolveAtlassianOAuth(ctx).then((handle) =>
      handle ? {accessToken: handle.accessToken, cloudId: handle.cloudId} : null
    );

  ctx.jira = makeJiraClient({
    env: env as Record<string, string>,
    logger,
    getAuthEmail: jiraAuthEmail,
    getOAuthToken: oauthResolver,
  });
  ctx.confluence = makeConfluenceClient({
    env: env as Record<string, string>,
    logger,
    getAuthEmail: confluenceAuthEmail,
    getOAuthToken: oauthResolver,
  });

  return ctx;
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
