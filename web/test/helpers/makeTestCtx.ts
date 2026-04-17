import {
  createSilentLogger,
  makeMemoryDraftStore,
  makeRecordingSlackClient,
  makeStubConfluence,
  makeStubGitHub,
  makeStubJira,
  makeStubLlm,
  TEST_ENV,
  type HandlerCtx,
} from "../../lib/ctx";
import type {
  RecordingSlackOverrides,
  SlackClient,
} from "../../lib/services/slack";
import type { LlmClient, StubLlmOptions } from "../../lib/services/llm";
import type { JiraClient, JiraStubOverrides } from "../../lib/services/jira";
import type {
  GitHubClient,
  GitHubStubOverrides,
} from "../../lib/services/github";
import type {
  ConfluenceClient,
  ConfluenceStubOverrides,
} from "../../lib/services/confluence";
import type { DraftStore } from "../../lib/draftStore";
import type { Logger } from "../../lib/logger";

export interface MakeTestCtxOptions {
  slack?: SlackClient | RecordingSlackOverrides;
  llm?: LlmClient | StubLlmOptions;
  jira?: JiraClient | JiraStubOverrides;
  github?: GitHubClient | GitHubStubOverrides;
  confluence?: ConfluenceClient | ConfluenceStubOverrides;
  db?: DraftStore;
  logger?: Logger;
  env?: Partial<CloudflareEnv>;
  scratch?: Record<string, unknown>;
  waitUntilTasks?: Array<Promise<unknown>>;
}

/**
 * Build a HandlerCtx backed by recording/stub implementations. No
 * Miniflare, no real clients, no network. Every call is cheap and
 * deterministic — the target is sub-second feedback in watch mode.
 *
 * Tests can inspect `ctx.slack._calls` to assert on outbound API
 * traffic, or pass their own full client to completely replace a
 * service.
 */
export function makeTestCtx(options: MakeTestCtxOptions = {}): HandlerCtx {
  const slack = isSlackClient(options.slack)
    ? options.slack
    : makeRecordingSlackClient(options.slack);

  const llm = isLlmClient(options.llm) ? options.llm : makeStubLlm(options.llm);

  const jira = isJiraClient(options.jira)
    ? options.jira
    : makeStubJira(options.jira);

  const github = isGitHubClient(options.github)
    ? options.github
    : makeStubGitHub(options.github);

  const confluence = isConfluenceClient(options.confluence)
    ? options.confluence
    : makeStubConfluence(options.confluence);

  const db = options.db ?? makeMemoryDraftStore();
  const logger = options.logger ?? createSilentLogger();
  const waitUntilTasks = options.waitUntilTasks ?? [];

  return {
    slack,
    llm,
    db,
    jira,
    github,
    confluence,
    logger,
    env: { ...TEST_ENV, ...(options.env ?? {}) } as CloudflareEnv,
    scratch: options.scratch ?? {},
    waitUntil: (promise) => {
      waitUntilTasks.push(promise);
      // Ensure rejections don't become unhandled.
      promise.catch(() => {});
    },
  };
}

/**
 * Convenience: drain any pending waitUntil tasks registered via the
 * test ctx. Useful after invoking a handler that schedules async work
 * to assert on the result.
 */
export async function drainWaitUntil(
  tasks: Array<Promise<unknown>>,
): Promise<void> {
  await Promise.allSettled(tasks);
}

function isSlackClient(v: unknown): v is SlackClient {
  return (
    typeof v === "object" &&
    v !== null &&
    "chat" in (v as Record<string, unknown>)
  );
}
function isLlmClient(v: unknown): v is LlmClient {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { message?: unknown }).message === "function"
  );
}
function isJiraClient(v: unknown): v is JiraClient {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { findAssignedToEmail?: unknown }).findAssignedToEmail ===
      "function"
  );
}
function isGitHubClient(v: unknown): v is GitHubClient {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { findOpenPullRequestsForUser?: unknown })
      .findOpenPullRequestsForUser === "function"
  );
}
function isConfluenceClient(v: unknown): v is ConfluenceClient {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { searchFirst?: unknown }).searchFirst === "function"
  );
}
