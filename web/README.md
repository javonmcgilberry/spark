# Spark Manager Dashboard

Next.js 15 manager-facing dashboard that runs on Webflow Cloud (Cloudflare
Workers). Generates onboarding drafts via the Generator agent, edits them
inline, runs the Critique agent, and hands off to the Spark Slack bot for
review and publish.

The full getting-started runbook lives at
[../docs/manager-dashboard-demo.md](../docs/manager-dashboard-demo.md) —
start there if this is your first time.

## Local dev (short version)

Environment lives in a single file: `spark/.env`. Two symlinks make it
available to the Next dev server and to Wrangler for OpenNext preview.

```bash
# 1) Fill in the bot/web env once (in spark/)
cd spark
cp .env.example .env
#   then edit .env — SLACK_*, ANTHROPIC_API_KEY, SPARK_API_TOKEN, SPARK_API_BASE_URL,
#   DEMO_MANAGER_SLACK_ID. The bot and the web app both read this file.
npm install

# 2) Symlink from the web app (one-time)
cd web
ln -s ../.env .env.local     # Next reads .env.local
ln -s ../.env .dev.vars      # Wrangler reads .dev.vars for OpenNext preview
npm install

# 3) Two terminals
cd spark        && npm run dev      # bot on :8787
cd spark/web    && npm run dev      # UI on http://localhost:3000/spark-manager
```

Both symlinks are gitignored (`.env*.local`, `.dev.vars` in
[.gitignore](.gitignore)), so the single `spark/.env` never leaves your
machine.

## Local OpenNext preview (validates the Workers bundle)

`next dev` uses the Node.js dev server. To validate the edge bundle
Webflow Cloud actually runs, use OpenNext preview — it compiles to
`.open-next/worker.js` and serves via `wrangler dev`:

```bash
npm run preview       # listens on :8788 (bot is on :8787)
curl http://localhost:8788/spark-manager/healthz
```

The preview catches OpenNext/Workers-specific issues (edge-runtime-split
errors, Node-only API leaks) that `next build` does not.

## Webflow Cloud deploy

See [../docs/manager-dashboard-demo.md](../docs/manager-dashboard-demo.md)
for every prompt and dashboard click. Short version:

```bash
cd spark/web
webflow cloud init      # mount path: /spark-manager
# Connect the spark repo to Webflow Cloud → set env vars in the UI
# Start the tunnel
cd ../ && ./scripts/tunnel.sh
# Push to the connected branch → auto-deploy
```

The mount path `/spark-manager` is wired in [next.config.ts](next.config.ts)
as `basePath` and `assetPrefix`. If you change the mount path in Webflow
Cloud, change those two values to match.

## Layout

```
app/
  layout.tsx              Dashboard chrome (dark theme)
  page.tsx                Manager home — open drafts + published
  new/page.tsx            Intake form (feeds the Generator agent)
  draft/[newHireId]/      Draft detail shell (DraftWorkspace compound)
  api/drafts/             Routes that proxy to the bot
  healthz/                Health check for deploy verification
components/
  DraftContext.ts         React 19 context: {state, actions, meta}
  DraftProvider.tsx       Owns draft state, agent streaming, critique
  DraftWorkspace.tsx      Compound namespace: Root/Header/Body/Sidebar/...
  DraftPreview.tsx        Pure renderer of the full OnboardingPackage
  *Editor.tsx, *Panel.tsx Pure leaves used by the compound subcomponents
lib/
  types.ts                Shared shape with the bot's OnboardingPackage
  sparkApi.ts             Typed fetch wrapper (bearer + manager header)
  session.ts              Demo session cookie + env fallback
  useDraft.ts             Debounced-PATCH + optimistic update hook
  agents/                 Generator (9-tool loop) + Critique (7 rules)
```

## What the bot expects

Each request carries `Authorization: Bearer <SPARK_API_TOKEN>` and
`X-Spark-Manager-Slack-Id: U...`. The UI calls the bot server-to-server
from the Cloudflare Workers runtime, so there are no browser CORS
concerns on that hop. See
[../docs/manager-dashboard-demo.md](../docs/manager-dashboard-demo.md#why-the-spark_api_token-exists)
for why the bearer token is still required even with Webflow workspace
SSO on the UI.

## Tests

```bash
npm test
```
