# Spark

AI onboarding companion for new Webflow engineers. Spark lives in Slack, replaces the onboarding spreadsheet with a guided journey, and helps new hires learn their team, tools, docs, rituals, and codebase before guiding them into an early contribution.

## Quick Start

```bash
cp .env.example .env
npm install
npm run dev
```

Hit `http://localhost:8787/healthz` to confirm the process is up. Without Slack tokens the bot runs in HTTP-only mode.

Spark's main experience now runs through Slack AI assistant threads, with a DM fallback for quick starts and local testing.

## Project Structure

```
src/
  index.ts                  Boot sequence
  config/
    env.ts                  Zod-validated environment config
  app/
    logger.ts               Structured logger
    services.ts             Service container passed to all handlers
  server/
    createHttpServer.ts     Express health endpoint
  slack/
    createSlackApp.ts       Bolt app factory (Socket Mode)
    registerHandlers.ts     Wires all handler groups onto the app
    handlers/
      assistant.ts          Slack AI assistant thread lifecycle
      onboarding.ts         member_joined_channel, app_mention, DM fallback
      commands.ts           /spark slash command
      actions.ts            Block Kit interactive actions
  onboarding/
    catalog.ts              Spreadsheet-derived static onboarding content
    blocks.ts               Block Kit builders for each onboarding phase
  services/
    identityResolver.ts     Slack user -> team/profile resolution
    journeyService.ts       Stateful onboarding journey orchestration
    taskScannerService.ts   Contribution task discovery
    contributionGuideService.ts  Guided local contribution steps
```

## Environment Variables

Defined in `.env.example`:

- `PORT` -- HTTP server port (default 8787)
- `SLACK_APP_TOKEN` / `SLACK_BOT_TOKEN` -- Socket Mode credentials
- `ANTHROPIC_API_KEY` -- LLM reasoning
- `ANTHROPIC_MODEL` -- Optional Anthropic model override
- `GITHUB_TOKEN` -- Read-only GitHub access for skill discovery
- `STATSIG_CONSOLE_SDK_KEY` -- Stale flag scanning
- `DX_WAREHOUSE_DSN` -- Team lookup
- `CONFLUENCE_API_TOKEN` -- Onboarding docs
- `CONFLUENCE_BASE_URL` -- Base wiki URL for generating onboarding doc links
- `WEBFLOW_MONOREPO_PATH` -- Path to the monorepo for codebase scanning

## Slack Setup

See [docs/slack-app-setup.md](docs/slack-app-setup.md) for the app registration checklist, including the assistant scopes and events Spark needs for its native Slack agent experience.

## Content Strategy

Spark intentionally does **not** use an LLM for everything.

- Static, spreadsheet-shaped content stays structured in code: checklist phases, tool inventory, ritual guidance, baseline Slack channels, and onboarding phase goals.
- Dynamic but deterministic content is assembled from live context: team name, pillar, key paths, docs, and contribution tasks.
- LLM usage is reserved for places where reasoning actually helps: blocker triage, task framing, and PR description drafting.

The spreadsheet-to-product mapping is documented in [docs/spreadsheet-mapping.md](docs/spreadsheet-mapping.md).

## Onboarding assistant (Webflow Cloud)

Spark also ships a manager-facing drafting UI on Webflow Cloud that
composes with this Slack bot. Managers generate a full onboarding plan
via an autonomous multi-tool agent and then edit it inline — two welcome
voices (Spark + manager), an editable People-to-meet list with real
avatars, and a Week 1 / Week 2 / Week 3 / Week 4 checklist grid — before
publishing to Slack where async collaboration happens. The UI lives in
[`web/`](web/). It talks to this bot through the productized `/api/*`
surface protected by `SPARK_API_TOKEN` (bearer) and a per-request
`X-Spark-Manager-Slack-Id` header (server-to-server from Webflow Cloud).

Env is a single file — `spark/.env` — symlinked into the web app as
`.env.local` and `.dev.vars` so the bot, Next dev, and OpenNext preview
all read the same values. See
[docs/manager-dashboard-demo.md](docs/manager-dashboard-demo.md) for the
full end-to-end runbook (setup, Webflow Cloud deploy, demo script,
security note on the bearer token) and [`web/README.md`](web/README.md)
for local dev shortcuts.

## Demo Docs

- [docs/demo-script.md](docs/demo-script.md)
- [docs/web-dashboard.md](docs/web-dashboard.md)
- [docs/manager-dashboard-demo.md](docs/manager-dashboard-demo.md)
- [docs/manager-dashboard-submission.md](docs/manager-dashboard-submission.md)
