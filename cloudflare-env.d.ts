/**
 * Environment bindings exposed to the Worker at runtime.
 *
 * Populate the vars in the Webflow Cloud project environment (or `.env`
 * for local dev); register bindings (D1, KV, R2, …) in wrangler.jsonc.
 * Everything here is optional at the type level because the app degrades
 * gracefully when a credential or integration is missing — see lib/ctx.ts
 * for the wiring.
 */

declare global {
  interface CloudflareEnv {
    // ---- Slack ----------------------------------------------------------
    /** Slack bot OAuth token (xoxb-…). Required unless SLACK_MOCK_MODE=1. */
    SLACK_BOT_TOKEN?: string;
    /** Verifies HMAC on inbound Slack Events API + interactivity requests. */
    SLACK_SIGNING_SECRET?: string;
    /** "1" / "true" swaps the real Slack client for a recording stub. */
    SLACK_MOCK_MODE?: string;

    // ---- Anthropic ------------------------------------------------------
    /** Anthropic API key for Generator, Critique, and Assistant agents. */
    ANTHROPIC_API_KEY?: string;
    /** Anthropic model id. Defaults to claude-3-5-haiku-latest when unset. */
    ANTHROPIC_MODEL?: string;
    /** "1" / "true" returns a canned LLM response instead of calling the API. */
    ANTHROPIC_MOCK_MODE?: string;

    // ---- GitHub ---------------------------------------------------------
    /** PAT used to read CODEOWNERS + public contribution signal. Optional. */
    GITHUB_TOKEN?: string;
    /** Org scope for repo/team lookups. Defaults to "webflow". */
    GITHUB_ORG?: string;
    /** Repo that hosts CODEOWNERS. Defaults to "webflow/webflow". */
    GITHUB_CODEOWNERS_REPO?: string;

    // ---- Atlassian ------------------------------------------------------
    /** Jira Cloud base URL (e.g. https://webflow.atlassian.net). */
    JIRA_BASE_URL?: string;
    /** Email paired with JIRA_API_TOKEN for Basic auth. */
    JIRA_API_EMAIL?: string;
    /** Jira API token. All three JIRA_* are required together or Jira is skipped. */
    JIRA_API_TOKEN?: string;
    /** Confluence base URL (e.g. https://webflow.atlassian.net/wiki). */
    CONFLUENCE_BASE_URL?: string;
    /** Confluence API token. Confluence uses the hire's email for Basic auth. */
    CONFLUENCE_API_TOKEN?: string;

    // ---- Session --------------------------------------------------------
    /**
     * Dev-only fallback manager Slack id. On Webflow Inside the acting
     * manager is identified automatically from the Cloudflare Access
     * JWT (via Okta SSO) — this var is only read when no CF Access
     * identity is present, e.g. running `npm run dev` locally. Must
     * start with "U".
     */
    DEMO_MANAGER_SLACK_ID?: string;

    // ---- Bindings (wrangler.jsonc, not .env) ---------------------------
    /** D1 binding for draft persistence. Configure in wrangler.jsonc. */
    DRAFTS_DB?: D1DatabaseBinding;
  }

  /**
   * Narrow D1 surface — matches the subset draftStore.ts actually uses.
   * Avoids a hard dep on @cloudflare/workers-types.
   */
  interface D1DatabaseBinding {
    prepare(query: string): D1PreparedStatementBinding;
    exec(query: string): Promise<unknown>;
  }
  interface D1PreparedStatementBinding {
    bind(...values: unknown[]): D1PreparedStatementBinding;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{results: T[]}>;
    run(): Promise<unknown>;
  }

  namespace NodeJS {
    interface ProcessEnv extends CloudflareEnv {}
  }
}

export {};
