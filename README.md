# Spark

AI onboarding companion for new Webflow engineers. Managers build
reviewable onboarding plans for their new hires in minutes — welcome
note, buddy, people to meet, weekly checklist, first contribution
target — then publish to Slack, where Spark delivers a personalized
experience to the hire via assistant threads, DMs, and a Home tab.

Spark runs **entirely on Webflow Cloud** following Cloudflare's "Build
a Slack Agent" pattern. One Next.js app, one Worker, one deploy, one
URL.

## Quick Start

```bash
npm install
npm run dev                          # in-memory draft store, zero setup
open http://localhost:3000
```

That's it for the everyday dev loop. `.env` is read automatically; if
it's empty, Slack and Anthropic fall back to their mock clients so you
can iterate with zero token burn.

When you want to exercise the real Worker + D1 runtime locally (what
Webflow Cloud actually runs), do this once:

```bash
npm run setup                        # one-time: auth, create D1, migrate
npm run preview                      # Worker on :8788, real D1
```

`npm run setup` is idempotent and handles the full Cloudflare D1 dance:
`wrangler login` if needed → creates `spark-drafts` if it doesn't exist
→ patches `wrangler.jsonc` with the UUID → applies migrations locally
→ offers to apply them remotely. Safe to re-run anytime.

For the full Slack round-trip setup (real tokens, named Cloudflare
Tunnel, dev Slack app), see `docs/dev-setup.md`.

## The three-tier dev loop

1. **vitest (default)** — `npm run test:watch`. Every handler, service,
   and tool is tested against `makeTestCtx()` which builds an in-memory
   `HandlerCtx` with recording Slack mock, stub LLM, and stub
   Jira/GitHub/Confluence. Sub-second feedback.
2. **Dev sandbox** — `/dev/slack-sandbox` in `next dev`. Every Slack
   event fixture Spark understands is reachable from a dropdown. Tweak
   the JSON, click Send, see response + outbound Slack calls inline.
3. **Named Cloudflare Tunnel + dev Slack app** — one-time 30-min setup
   for real end-to-end testing. Only needed when you genuinely need a
   real Slack round-trip.

Details in `docs/dev-setup.md`.

## Architecture

```
Browser → spark.wf.app (Next.js on Webflow Cloud / Cloudflare Workers)
    ├─ app/                        Pages (manager dashboard)
    │   ├─ page.tsx                Draft inbox
    │   ├─ new/                    Create-draft flow
    │   ├─ draft/[newHireId]/      Draft workspace
    │   └─ dev/slack-sandbox/      Dev-only Slack event replay
    ├─ app/api/
    │   ├─ drafts/…                Manager CRUD on onboarding packages
    │   ├─ lookup/slack-users      Slack directory search
    │   ├─ slack/events            Slack Events API webhook
    │   └─ slack/interactivity     Block Kit interactivity
    └─ lib/
        ├─ ctx.ts                  HandlerCtx + makeProdCtx/makeTestCtx
        ├─ draftStore.ts           D1 + in-memory DraftStore
        ├─ services/               slack, llm, jira, github,
        │                          confluence, peopleInsights,
        │                          slackUserDirectory, identityResolver,
        │                          canvas, onboardingPackages,
        │                          codeowners, confluenceSearch
        ├─ handlers/drafts/        Manager HTTP handler logic
        ├─ handlers/lookup/        Lookup handler logic
        ├─ slack/events.ts         Slack event dispatcher
        ├─ slack/handlers/         assistant, onboarding, home
        └─ agents/                 Generator + Critique
```

Every handler, service, and tool takes a `HandlerCtx` — the DI
backbone. Production builds `makeProdCtx(env)` which resolves real
clients (D1, fetch-based Slack, Anthropic SDK). Tests build
`makeTestCtx({...overrides})`. Sandbox uses recording mocks.

## Environment Variables (Webflow Cloud)

```env
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-latest

# Integrations (optional)
GITHUB_TOKEN=ghp_...
JIRA_BASE_URL=https://webflow.atlassian.net
JIRA_API_EMAIL=you@webflow.com
JIRA_API_TOKEN=...
CONFLUENCE_API_TOKEN=...
CONFLUENCE_BASE_URL=https://webflow.atlassian.net/wiki

# Demo session (replace with Slack OAuth post-hackathon)
DEMO_MANAGER_SLACK_ID=U...

# D1 binding — configure in wrangler.jsonc, set database_id from
# `wrangler d1 create spark-drafts`.
```

## Slack app configuration

Once per workspace, in https://api.slack.com/apps → your app:

1. **Socket Mode** → Disable.
2. **Event Subscriptions** → Enable, Request URL
   `https://spark.wf.app/api/slack/events`.
3. Subscribe to bot events: `app_mention`, `message.im`,
   `app_home_opened`, `assistant_thread_started`,
   `assistant_thread_context_changed`, `member_joined_channel`.
4. **Interactivity** → Request URL
   `https://spark.wf.app/api/slack/interactivity`.
5. **OAuth & Permissions** scopes: `chat:write`, `channels:history`,
   `im:history`, `im:write`, `app_mentions:read`, `canvases:write`,
   `users:read`, `users:read.email`.
6. Copy signing secret + bot token into Webflow Cloud env.
7. Reinstall app to workspace.

## Pitch line

Spark is a Slack agent built on Webflow Cloud. Entire system on the
edge. Multi-workspace ready. Cloudflare's "Build a Slack Agent" guide,
implemented as a native reference on Webflow Cloud.

## Testing

```bash
npm run test           # 68+ tests, sub-second
npm run test:watch     # watch mode
npm run typecheck      # tsc --noEmit
npm run build          # next build (Workers-compatible bundle)
```
