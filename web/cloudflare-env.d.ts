// Environment bindings injected by Webflow Cloud / Cloudflare Workers.
// Populate these in the Webflow Cloud environment settings for your site,
// and register any bindings (D1 databases, KV namespaces, etc.) in
// wrangler.jsonc. The types here mirror what both cfg sources produce.
//
// @opennextjs/cloudflare declares its own CloudflareEnv in global scope;
// our `declare global` extension merges into that so both sets of
// bindings are visible on `env`.

declare global {
  interface CloudflareEnv {
    // ---- Slack ----
    /** Slack bot OAuth token (xoxb-...). Required in prod. */
    SLACK_BOT_TOKEN?: string;
    /** Slack signing secret used to verify inbound Events API requests. Required in prod. */
    SLACK_SIGNING_SECRET?: string;
    /** Set to "1" to skip the real Slack client and return recording mocks. Local dev only. */
    SLACK_MOCK_MODE?: string;

    // ---- Anthropic ----
    /** Anthropic API key used for the Generator, Critique, and Assistant agents. */
    ANTHROPIC_API_KEY?: string;
    /** Anthropic model id. Defaults to claude-3-5-haiku-latest when unset. */
    ANTHROPIC_MODEL?: string;
    /** Set to "1" to skip real Anthropic calls. Local dev only. */
    ANTHROPIC_MOCK_MODE?: string;

    // ---- External APIs ----
    GITHUB_TOKEN?: string;
    GITHUB_ORG?: string;
    GITHUB_CODEOWNERS_REPO?: string;
    JIRA_BASE_URL?: string;
    JIRA_API_EMAIL?: string;
    JIRA_API_TOKEN?: string;
    CONFLUENCE_API_TOKEN?: string;
    CONFLUENCE_BASE_URL?: string;

    // ---- Session ----
    /**
     * Demo-mode fallback manager Slack id. Used when no session cookie is
     * present. Replace with Slack OAuth post-hackathon.
     */
    DEMO_MANAGER_SLACK_ID?: string;

    // ---- Bindings ----
    /** D1 binding for draft persistence. Provision in wrangler.jsonc. */
    DRAFTS_DB?: SparkD1Database;
  }

  /** Minimal D1Database surface — matches the subset draftStore.ts uses. */
  interface SparkD1Database {
    prepare(query: string): SparkD1PreparedStatement;
    exec(query: string): Promise<unknown>;
  }
  interface SparkD1PreparedStatement {
    bind(...values: unknown[]): SparkD1PreparedStatement;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results: T[] }>;
    run(): Promise<unknown>;
  }

  namespace NodeJS {
    interface ProcessEnv extends CloudflareEnv {}
  }
}

export {};
