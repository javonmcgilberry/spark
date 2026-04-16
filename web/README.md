# Spark Manager Dashboard

Next.js 15 manager-facing dashboard that runs on Webflow Cloud (Cloudflare
Workers edge runtime). Generates onboarding drafts via the Generator agent,
edits them inline, runs the Critique agent, and hands off to the Spark
Slack bot for review and publish.

## Local dev

```bash
# 1. Start the bot (in /spark)
cd spark
cp .env.example .env
# Fill in SLACK_*, ANTHROPIC_API_KEY, SPARK_API_TOKEN (openssl rand -hex 32)
npm install
npm run dev      # listens on :8787

# 2. Start the web UI (in /spark/web)
cd spark/web
cp .env.local.example .env.local
# Set SPARK_API_BASE_URL=http://localhost:8787, SPARK_API_TOKEN (matching
# the bot), ANTHROPIC_API_KEY, DEMO_MANAGER_SLACK_ID=U...
npm install
npm run dev      # http://localhost:3000/spark-manager
```

### Local OpenNext preview (runs the actual Workers bundle)

`next dev` uses the Node.js dev server. To validate the edge bundle that
Webflow Cloud actually runs, use the OpenNext preview — it compiles to
`.open-next/worker.js` and serves it via `wrangler dev`.

Because Cloudflare Workers don't inherit shell env vars, preview reads
runtime env from `.dev.vars` (Wrangler convention, already gitignored):

```bash
# spark/web/.dev.vars
SPARK_API_BASE_URL=http://localhost:8787
SPARK_API_TOKEN=...                # must match the bot's SPARK_API_TOKEN
ANTHROPIC_API_KEY=...
DEMO_MANAGER_SLACK_ID=U01...
```

Then:

```bash
npm run preview  # opennextjs-cloudflare build + wrangler dev
# Default port is 8787; pass --port 8788 if the bot is on 8787.
curl http://localhost:8788/spark-manager/healthz
```

## Webflow Cloud deploy

```bash
# One-time
webflow cloud init       # select nextjs, mount path /spark-manager
# Expose local bot
cloudflared tunnel --url http://localhost:8787
# Copy the tunnel URL into SPARK_API_BASE_URL in the Webflow Cloud env UI.
# Commit → Webflow Cloud auto-deploys on push.
```

The mount path `/spark-manager` is wired in [next.config.ts](next.config.ts)
as `basePath` and `assetPrefix`. If you change the mount path in Webflow
Cloud, update those two values to match.

## Layout

```
app/
  layout.tsx              Dashboard chrome (dark theme)
  page.tsx                Manager home — open drafts + published
  new/page.tsx            Intake form (feeds the Generator agent)
  draft/[newHireId]/      Draft detail shell
  api/drafts/             Edge routes proxying to the bot
  healthz/                Health check for deploy verification
components/               Client components (DraftWorkspace and friends)
lib/
  types.ts                Shared shape with the bot's OnboardingPackage
  sparkApi.ts             Typed fetch wrapper (bearer + manager header)
  session.ts              Demo session cookie + env fallback
```

## What the bot expects

Each request carries `Authorization: Bearer <SPARK_API_TOKEN>` and
`X-Spark-Manager-Slack-Id: U...`. The UI calls the bot server-to-server
from the Cloudflare Workers edge runtime, so there are no browser CORS
concerns on that hop.

## Tests

```bash
npm test
```
