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

To exercise the real Worker + D1 runtime locally (what Webflow Cloud
actually runs in prod):

```bash
npm run preview                      # Worker on :8788, local SQLite D1
```

That'll run `npm run setup` for you — a thin wrapper around
`wrangler d1 migrations apply spark-drafts --local` that creates the
local SQLite file at `.wrangler/state/v3/d1/`. Idempotent.

### Deploying to Webflow Cloud

Just push. Webflow Cloud provisions the D1 database, fills in the
real `database_id` in `wrangler.jsonc` at deploy time, and applies
everything in `migrations/` automatically. The
`REPLACE_WITH_D1_DATABASE_ID` placeholder is intentional — see the
comment in `wrangler.jsonc` or [Webflow Cloud's storage
docs](https://developers.webflow.com/webflow-cloud/storing-data/overview).

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
        ├─ auth/cloudflareAccess.ts  CF Access JWT → {email, sub}
        ├─ auth/atlassianOAuth.ts    Atlassian OAuth 2.0 (3LO) primitives
        ├─ auth/atlassianSession.ts  Token resolution + auto-refresh
        ├─ auth/atlassianTokenStore  Per-viewer tokens (D1 or in-memory)
        ├─ session.ts              CF Access → cookie → env fallback
        └─ agents/                 Generator + Critique
```

Every handler, service, and tool takes a `HandlerCtx` — the DI
backbone. Production builds `makeProdCtx(env)` which resolves real
clients (D1, fetch-based Slack, Anthropic SDK). Tests build
`makeTestCtx({...overrides})`. Sandbox uses recording mocks.

### Who is the acting manager?

Webflow Inside gates every app behind Okta via Cloudflare Access, which
attaches a signed JWT with the authenticated user's email to every
request (`Cf-Access-Jwt-Assertion` header + `CF_Authorization` cookie).
`lib/session.ts` pulls the email off the JWT, resolves it to a Slack
user id via `users.lookupByEmail`, and that's the manager session —
zero env vars, zero login friction. Hit `/api/whoami` on any deploy to
see what Cloudflare Access is passing through.

Local dev doesn't have Cloudflare Access in front, so session falls
back to `DEMO_MANAGER_SLACK_ID` in `.env`.

### Jira + Confluence

Two authentication paths, tried in this order on every request:

1. **Atlassian OAuth 2.0 (3LO), per-viewer.** When the manager clicks
   "Connect Jira & Confluence" on the new-plan page, they go through
   Atlassian's consent screen; Spark stores their access + refresh
   tokens in the `atlassian_tokens` D1 table keyed on their CF Access
   email. Subsequent Jira/Confluence calls hit
   `https://api.atlassian.com/ex/{jira,confluence}/<cloudId>/…` with
   a Bearer token, scoped to that viewer's own Jira/Confluence
   permissions. Access tokens refresh transparently. Code lives in
   `lib/auth/atlassian{OAuth,Session,TokenStore}.ts` and
   `app/api/auth/atlassian/*`.
2. **Basic auth fallback.** When the viewer hasn't completed OAuth —
   or OAuth isn't configured on the env — Spark falls back to Basic
   auth against the site's REST API using `JIRA_API_TOKEN` +
   `CONFLUENCE_API_TOKEN`. The paired email is the viewer's CF Access
   identity, or the explicit `JIRA_API_EMAIL` override if that's set
   (useful for testing and service-account scenarios).

The `AtlassianConnectBanner` on the `/new` page polls
`/api/auth/atlassian/status` on mount. Before generation it shows a
value-prop CTA ("combines Jira, Confluence, and GitHub to pull team
tickets, user guides, and related PRs"); once connected it collapses
to a green confirmation pill + subtle disconnect link. It never blocks
the form — OAuth is strictly additive to the fallback.

To register the OAuth app (one-time, per environment):

1. Visit [developer.atlassian.com/console/myapps/](https://developer.atlassian.com/console/myapps/)
   and create an **OAuth 2.0 integration**.
2. Add the **Jira API** and **Confluence API** products. Granted scopes
   should include `read:jira-user`, `read:jira-work`,
   `read:confluence-content.all`, `read:confluence-space.summary`, and
   `offline_access`.
3. Set the callback URL to
   `https://<your-spark-url>/api/auth/atlassian/callback`.
4. Copy the client ID + secret into Webflow Cloud as
   `ATLASSIAN_OAUTH_CLIENT_ID` and `ATLASSIAN_OAUTH_CLIENT_SECRET`
   (mark the secret as a Secret). Redeploy.

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

# Local-dev session fallback. On Webflow Inside the manager is identified
# automatically from the Cloudflare Access JWT (Okta SSO). This var is
# only read when no CF Access identity is present.
DEMO_MANAGER_SLACK_ID=U...

# D1 binding is declared in wrangler.jsonc (not here). Webflow Cloud
# auto-provisions the database on deploy and runs migrations — no env
# vars needed.
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
