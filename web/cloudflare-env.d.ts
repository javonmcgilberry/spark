// Environment bindings injected by Webflow Cloud / Cloudflare Workers.
// Populate these in the Webflow Cloud environment settings for your site.

interface CloudflareEnv {
  /** Fully qualified URL of the Spark bot HTTP API (e.g. Cloudflare tunnel URL). */
  SPARK_API_BASE_URL: string;
  /** Shared bearer token matching SPARK_API_TOKEN on the bot. */
  SPARK_API_TOKEN: string;
  /** Anthropic API key used for the Generator + Critique agents. */
  ANTHROPIC_API_KEY: string;
  /** Anthropic model id. Defaults to claude-3-5-haiku-latest when unset. */
  ANTHROPIC_MODEL?: string;
  /**
   * Demo-mode fallback manager Slack id. Used when no session cookie is
   * present. Replace with Slack OAuth post-hackathon.
   */
  DEMO_MANAGER_SLACK_ID?: string;
}

declare namespace NodeJS {
  interface ProcessEnv extends CloudflareEnv {}
}

export {};
