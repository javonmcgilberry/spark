# Spark local dev setup

Spark runs entirely on Webflow Cloud (Cloudflare Workers). This doc
walks you through the three-tier dev loop:

1. **Sub-second vitest loop** — default. No network, no tokens, no
   tunnel. This is where 90% of iteration should happen.
2. **Dev sandbox page** — `/dev/slack-sandbox` in `next dev`. Every
   event fixture Spark handles, triggerable from a dropdown.
3. **Named Cloudflare Tunnel + dev Slack app** — one-time 30min
   setup. Use when you genuinely need a real Slack round-trip.

## Tier 1: vitest (default, zero setup)

```sh
cd spark/web
npm run test          # one-shot
npm run test:watch    # watch mode
```

Tests use `makeTestCtx()` which builds an in-memory `HandlerCtx` with
recording Slack mock, stub LLM, stub Jira/GitHub/Confluence, and a
memory-backed draft store. You can assert against outbound Slack
calls with `ctx.slack._calls`.

## Tier 2: dev sandbox (local `next dev`)

```sh
cd spark/web
SLACK_MOCK_MODE=1 ANTHROPIC_MOCK_MODE=1 npm run dev
open http://localhost:3000/dev/slack-sandbox
```

Pick a scenario, tweak the JSON, click **Send**. The route runs the
full Events API pipeline — signature verify, payload parse, event
dispatch, handler execution — against the same mocked services used
by the tests. Response body and all outbound Slack calls the handler
made are shown inline.

Flip `ANTHROPIC_MOCK_MODE=0` to exercise real Anthropic calls while
keeping Slack mocked. Flip `SLACK_MOCK_MODE=0` to send real Slack
traffic (requires the tunnel setup below).

## Tier 3: Named Cloudflare Tunnel + dev Slack app

Required when testing real Slack → Spark roundtrips (e.g., verifying
`assistant_thread_started` behaves correctly end-to-end).

**One-time setup (~30 min):**

1. Create a free Cloudflare account (or use Webflow's).
2. Install `cloudflared`:
   ```sh
   brew install cloudflared
   ```
3. Authenticate:
   ```sh
   cloudflared tunnel login
   ```
4. Create a named tunnel:
   ```sh
   cloudflared tunnel create spark-dev
   ```
5. Create `~/.cloudflared/spark-dev.yml`:
   ```yaml
   tunnel: spark-dev
   credentials-file: /Users/<you>/.cloudflared/<tunnel-uuid>.json
   ingress:
     - hostname: spark-dev.<your-domain>.com
       service: http://localhost:3000
     - service: http_status:404
   ```
   (If you don't have a domain, use `<tunnel-id>.cfargotunnel.com` —
   no DNS config needed.)
6. Point a CNAME at the tunnel (skip if using `cfargotunnel.com`):
   ```sh
   cloudflared tunnel route dns spark-dev spark-dev.<your-domain>.com
   ```

**Create a dev Slack app:**

1. Go to https://api.slack.com/apps and click **Create New App** →
   **From scratch**. Name it "Spark (dev)" and choose a dev workspace
   (e.g., `webflow-inside-dev` or your personal one).
2. **Socket Mode**: leave disabled.
3. **Event Subscriptions** → Enable, Request URL:
   `https://spark-dev.<your-domain>.com/api/slack/events`
   (Slack will verify the URL via `url_verification`.)
4. **Subscribe to bot events**: `app_mention`, `message.im`,
   `app_home_opened`, `assistant_thread_started`,
   `assistant_thread_context_changed`, `member_joined_channel`.
5. **Interactivity**: Request URL
   `https://spark-dev.<your-domain>.com/api/slack/interactivity`
6. **OAuth & Permissions** → scopes: `chat:write`, `channels:history`,
   `im:history`, `im:write`, `app_mentions:read`, `canvases:write`,
   `users:read`, `users:read.email`.
7. Install to workspace. Copy bot token + signing secret into
   `spark/web/.env.local`:
   ```env
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...
   ```

**Daily use:**

```sh
# terminal 1
cloudflared tunnel run spark-dev

# terminal 2
cd spark/web
SLACK_MOCK_MODE=0 ANTHROPIC_MOCK_MODE=0 npm run dev
```

Now DM your dev bot in your dev workspace. Events flow through
Cloudflare Tunnel → `localhost:3000/api/slack/events`.

## Preview deploys

Webflow Cloud auto-deploys each branch to a preview URL. To acceptance-test
a PR with real Slack:

1. Open your dev Slack app in api.slack.com.
2. Change the Events Request URL to the preview URL.
3. Have the PR author DM the dev bot.
4. When happy, change the URL back to `spark-dev.<your-domain>.com`.

**Do NOT** repoint the production Slack app at a preview URL — that
routes real workspace events through a throwaway branch.

## Environment variables (summary)

Local `.env.local`:

```env
# Mocking — start here, flip off as needed
ANTHROPIC_MOCK_MODE=1
SLACK_MOCK_MODE=1

# Real clients (when mock modes are off)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-latest
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

# Integrations (optional)
GITHUB_TOKEN=ghp_...
JIRA_BASE_URL=https://webflow.atlassian.net
JIRA_API_EMAIL=you@webflow.com
JIRA_API_TOKEN=...
CONFLUENCE_API_TOKEN=...
CONFLUENCE_BASE_URL=https://webflow.atlassian.net/wiki

# Demo session
DEMO_MANAGER_SLACK_ID=U...
```
