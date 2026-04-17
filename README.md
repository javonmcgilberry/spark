# Spark

https://spark.wf.app/new

**An AI onboarding co-pilot for engineering managers.** Tell Spark who's
starting next Monday. A team of agents pulls the real org data, drafts
the welcome, picks the right people to meet, tunes the checklist, and
hands you back a reviewable plan — then delivers it through Slack to the
new hire themselves.

One Next.js app. One Cloudflare Worker. Entire system on the edge.
Manager UI, Slack bot, and the agent loop all served from the same
deploy.

---

## Agents of Possibility — why Spark fits the theme

The hackathon asked for apps where the **LLM is the reasoning engine**,
not a fancy autocomplete. Spark is built around three agents doing real
work against real production systems:

| Agent               | What it reasons about                                                              | Tools it can actually call                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Generator**       | "What should the welcome note say and which checklist items are right for week 1?" | `resolve_new_hire`, `resolve_team`, `find_team_references`, `draft_welcome_note`, `tune_checklist`, `finalize_draft` |
| **Critique**        | "Does this draft actually make sense to ship?"                                     | Structured findings back into the draft store — the manager can one-click apply a fix.                               |
| **Slack assistant** | "What does this new hire need right now?"                                          | Assistant threads, 1:1 DMs, Home tab surfaces, Block Kit canvases.                                                   |

The roster itself is resolved deterministically from the DX warehouse
(`ctx.org`, over Cloudflare Workers TCP sockets) before the LLM loop
starts. Slack hydrates avatars + display names. The LLM never names
people, never fabricates Slack ids, and never picks the buddy — that's
the manager's call, every time.

The agents share a single dependency-injected runtime (`HandlerCtx`) so
the same tools run in prod, in vitest, and in the dev sandbox. You can
watch every tool call stream in live on the manager UI while the agent
is working — it's not a progress bar, it's the actual
`resolve_new_hire → draft_welcome_note → tune_checklist → finalize_draft`
trace.

### What makes it genuinely agentic (not just LLM-wrapped)

- **Real tool use via Anthropic's `tool_use` API.** The model chooses
  tools and arguments; the server runs them, feeds results back, and
  the model decides what to do next. Up to 20 iterations with per-tool
  timeouts and validation.
- **Streaming autonomy.** The generator emits Server-Sent Events as it
  works. The welcome note persists the instant `draft_welcome_note`
  fires, so the manager sees the real output before the rest of the
  loop finishes.
- **Multi-system grounding.** The DX warehouse is the source of truth
  for the org graph: a single SQL call returns teammates, the manager
  chain, and cross-functional partners. Slack (`users.list`,
  `users.profile.get`, `team.profile.get`) hydrates avatars + display
  names. Jira (`/rest/api/3/search/jql`), GitHub (`search/issues`,
  CODEOWNERS), and Confluence ground the "Ask me about…" blurbs. The
  LLM never names a teammate; every surfaced person is a verified
  warehouse row with a verified Slack id.
- **Human in the loop by design.** Spark hands the manager a draft, not
  a published plan. Buddy assignment is always the manager's call.
  Publishing is explicit.
- **Second-opinion agent.** The Critique agent re-reads the draft and
  flags missing buddy, thin welcome note, roster mismatches, etc. —
  each finding ships with a patch the manager can apply with one click.

---

## What a manager actually does

1. **Open the dashboard** → pick the new hire from Slack.
2. **Hit "Create onboarding plan"** → Spark streams the agent timeline
   on screen while real tools fan out.
3. **Review the draft** → welcome note (two voices: manager + Spark),
   people to meet with per-person "Ask me about…" blurbs pulled from
   their recent Jira and GitHub activity, a team-tuned checklist, and
   a first-contribution target.
4. **Assign the buddy** → one of the teammates Spark surfaced.
5. **Publish** → new hire receives a Slack canvas + DM. The Slack
   assistant agent takes over from there.

Total time: minutes, not hours. Every line is reviewable before anyone
outside the manager sees it.

---

## Quick start

```bash
npm install
npm run dev
open http://localhost:3000
```

Zero setup. No tokens required. `.env` is read automatically; if empty,
Slack and Anthropic fall back to mock clients so you can iterate with
zero token burn.

To exercise the real Worker + D1 runtime locally (what Webflow Cloud
actually runs in prod):

```bash
npm run preview                      # Worker on :8788, local SQLite D1
```

This wraps `wrangler d1 migrations apply spark-drafts --local` — fully
idempotent.

For real Slack round-trips locally (Cloudflare Tunnel + dev Slack app),
see [`docs/dev-setup.md`](docs/dev-setup.md).

---

## Architecture

```
Browser → spark.wf.app (Next.js on Webflow Cloud / Cloudflare Workers)
  │
  ├─ Manager UI                  app/ (dashboard, draft workspace, new-plan flow)
  ├─ Slack webhooks              app/api/slack/{events,interactivity}
  ├─ Draft API                   app/api/drafts/[id]/{generate,critique,publish,…}
  │
  └─ lib/
      ├─ agents/                 Generator + Critique agents (Anthropic tool_use)
      ├─ services/               slack, llm, jira, github, confluence, orgGraph
      │                          (DX warehouse via Workers TCP sockets),
      │                          peopleInsights, slackUserDirectory,
      │                          identityResolver, canvas, onboardingPackages
      ├─ handlers/               HTTP handler logic (drafts, lookup)
      ├─ slack/handlers/         assistant, onboarding, home
      ├─ auth/                   Cloudflare Access JWT + Atlassian OAuth
      └─ ctx.ts                  HandlerCtx DI — makeProdCtx / makeTestCtx
```

### DX warehouse org graph

Spark looks up the hire's team, manager chain, and cross-functional
partners from the DX warehouse (`public.dx_users`,
`dx_versioned_team_members`, `dx_versioned_teams`). The warehouse
client ([lib/services/orgGraph.ts](lib/services/orgGraph.ts)) speaks
Postgres directly from Cloudflare Workers via `postgres.js` on
Workers TCP sockets — no Hyperdrive binding needed. Set
`DX_WAREHOUSE_DSN` in the Webflow Cloud environment variables to turn
it on. When the DSN is unset or the warehouse is unreachable, the
identity resolver logs the miss and falls back to Slack custom fields

- catalog defaults so the UI still works on laptops and in demo
  sandboxes.

Every handler, service, and tool takes a `HandlerCtx`. Production builds
`makeProdCtx(env)` which resolves real clients (D1, fetch-based Slack,
Anthropic SDK). Tests build `makeTestCtx({...overrides})`. The dev
sandbox at `/dev/slack-sandbox` uses recording mocks so every outbound
Slack call is inspectable inline.

---

## Who is the acting manager?

Webflow Inside gates every app behind Okta via Cloudflare Access. Every
request carries a signed JWT with the authenticated user's email
(`Cf-Access-Jwt-Assertion` header). `lib/session.ts` pulls the email,
resolves it to a Slack user id via `users.lookupByEmail`, and that's
the manager session — zero env vars, zero login friction.

Hit `/api/whoami` on any deploy to see what Cloudflare Access is
passing through. Local dev falls back to `DEMO_MANAGER_SLACK_ID` in
`.env`.

---

## Jira + Confluence

Two paths, tried in order on every request:

1. **Atlassian OAuth 2.0 (3LO), per-viewer.** Manager clicks "Connect
   Jira & Confluence" on the new-plan page, goes through Atlassian's
   consent flow, and their tokens land in the `atlassian_tokens` D1
   table keyed on their CF Access email. Subsequent calls hit
   `api.atlassian.com/ex/{jira,confluence}/<cloudId>/…` with a Bearer
   token scoped to that viewer. Access tokens refresh transparently.
2. **Basic auth fallback.** Uses `JIRA_API_TOKEN` / `CONFLUENCE_API_TOKEN`
   paired with the viewer's CF Access email (or `JIRA_API_EMAIL`
   override for local dev).

OAuth is strictly additive — the form never blocks on it.

---

## Deploying to Webflow Cloud

Just push. Branch pushes auto-deploy to a preview URL; `main` deploys
to production. Webflow Cloud provisions the D1 database, fills in the
real `database_id` in `wrangler.jsonc` at deploy time, and applies
everything in `migrations/` automatically.

Before the first deploy, set these in the Webflow Cloud env:

```env
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-latest

# Integrations (optional — missing values just disable those tools)
GITHUB_TOKEN=ghp_...
JIRA_BASE_URL=https://webflow.atlassian.net
JIRA_API_TOKEN=...
CONFLUENCE_BASE_URL=https://webflow.atlassian.net/wiki
CONFLUENCE_API_TOKEN=...

# Optional Atlassian OAuth (per-viewer)
ATLASSIAN_OAUTH_CLIENT_ID=...
ATLASSIAN_OAUTH_CLIENT_SECRET=...

# Local-dev session fallback. On Webflow Inside the manager is
# identified automatically from the Cloudflare Access JWT (Okta SSO).
DEMO_MANAGER_SLACK_ID=U...
DEMO_MANAGER_EMAIL=you@webflow.com
```

Then update the Slack app Request URLs to point at your deploy URL
(see [`docs/manager-dashboard-demo.md`](docs/manager-dashboard-demo.md)).

---

## Testing

```bash
npm run test           # vitest, sub-second
npm run test:watch     # watch mode
npm run typecheck      # tsc --noEmit
npm run build          # next build (Workers-compatible bundle)
```

Every handler, service, and agent tool is covered by vitest against
`makeTestCtx()`. Slack, Anthropic, Jira, GitHub, and Confluence are
all swappable via DI, so the full agent loop runs deterministic with
no network in under a second.

---

## Docs

- [`docs/manager-dashboard-demo.md`](docs/manager-dashboard-demo.md) — full getting-started + deploy runbook
- [`docs/demo-script.md`](docs/demo-script.md) — ~4-minute Loom walkthrough
- [`docs/dev-setup.md`](docs/dev-setup.md) — tunnels + dev Slack app for real round-trips
- [`HACKATHON.md`](HACKATHON.md) — Agents of Possibility security guide

---

## Pitch line

Spark is a Slack agent built on Webflow Cloud. Multi-agent system —
Generator, Critique, Slack assistant — running on a single edge
deployment. Cloudflare's "Build a Slack Agent" pattern, implemented as
a native reference on Webflow Cloud with real tool use, streaming
autonomy, and a human always in the loop.
