# Spark Onboarding Assistant

Next.js 15 app that runs on Webflow Cloud (Cloudflare Workers). Spark
generates onboarding drafts via the Generator agent, lets the manager
edit them inline — welcome, people to meet, weekly checklist — then
publishes to Slack. The Slack Events API webhook, the agent loop, and
the draft store all live in this same app.

Full runbook:
[../docs/manager-dashboard-demo.md](../docs/manager-dashboard-demo.md).
Developer setup (named tunnel, dev Slack app, preview deploys):
[../docs/dev-setup.md](../docs/dev-setup.md).

## Local dev

```bash
cd spark/web
npm install
SLACK_MOCK_MODE=1 ANTHROPIC_MOCK_MODE=1 npm run dev
# http://localhost:3000
# http://localhost:3000/dev/slack-sandbox   — Slack event replay sandbox
```

With the mock modes on, tests and manual flows never hit Slack or
Anthropic. Flip them off (or omit them) when you need real traffic —
see the dev-setup doc for the Cloudflare Tunnel + dev Slack app flow.

## Local OpenNext preview (validates the Workers bundle)

`next dev` uses the Node.js dev server. To validate the edge bundle
Webflow Cloud actually runs, use OpenNext preview — it compiles to
`.open-next/worker.js` and serves via `wrangler dev`:

```bash
npm run preview
curl http://localhost:8788/healthz
```

Catches OpenNext/Workers-specific issues (edge runtime splits, Node-only
API leaks) that `next build` does not.

## Layout

```
app/
  layout.tsx              Dashboard chrome + global CSS reset (dark theme)
  page.tsx                Manager home — open drafts + published
  new/page.tsx            Intake form (feeds the Generator agent)
  draft/[newHireId]/      Draft detail (Welcome + People + Checklist tabs)
  dev/slack-sandbox/      Dev-only Slack event replay UI
  api/drafts/             Draft CRUD + generate + critique + publish
  api/slack/events/       Slack Events API webhook (HMAC verified)
  api/slack/interactivity Block Kit actions
  healthz/                Health check
components/
  DraftContext.ts         React 19 context: {state, actions, meta}
  DraftProvider.tsx       Owns draft state, agent streaming, critique
  DraftWorkspace.tsx      Named subcomponents (Header/Body/Welcome/People/...)
  WelcomeNoteEditor.tsx   Two stacked voices: Spark intro + manager note
  PeopleEditor.tsx        Editable rows; avatars; add-teammate via Slack picker
  ChecklistTabs.tsx       Week 1 / Week 2 / Week 3 / Week 4 tabs
  AgentTimeline.tsx       Per-tool collapsible step cards + progress pill
  Avatar.tsx              Image or initials fallback
lib/
  ctx.ts                  HandlerCtx + makeProdCtx + mock-mode factories
  draftStore.ts           D1 + in-memory implementations of DraftStore
  types.ts                Onboarding domain types
  agents/                 Generator tool-use loop + Critique rules
  services/               slack, llm, jira, github, confluence, canvas, etc.
  slack/                  Events dispatcher + handlers (app_mention, assistant, home)
  handlers/               Route handler implementations (testable without Next)
test/
  fixtures/               Real-shape Slack event payloads for fixture-driven tests
  helpers/                postSignedEvent, makeTestCtx — the two-helper pair
  slack/                  Events route + dispatcher + HMAC tests
  services/               Per-service behavior tests (pure vitest, no Miniflare)
  handlers/               Route handler tests via makeTestCtx
  agents/                 Generator + Critique tests
```

## How it fits together

Every service + handler in `lib/` takes `HandlerCtx` as its first
argument. `makeProdCtx(env)` is the only place real Slack / Anthropic /
D1 clients are constructed; `makeTestCtx({overrides})` returns
recording/stub versions for vitest. That means every test is pure
vitest, sub-second, no external traffic.

## Tests

```bash
npm test
```

68+ tests, 12 files, ~1s.
