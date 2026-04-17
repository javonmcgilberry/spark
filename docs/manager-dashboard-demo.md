# Spark Manager Dashboard — Getting Started & Demo Runbook

End-to-end: clone → local dev → deploy → 4-minute Loom.

Spark runs as a single Next.js app. Pick one base URL for the run you
are about to demo and use that same URL in the browser and in Slack.

---

## 1. Prerequisites

|                        |                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Node                   | 20.19+ (check: `node --version`)                                                                                            |
| npm                    | 10+ (Webflow Cloud supports npm only)                                                                                       |
| `@webflow/webflow-cli` | `npm install -g @webflow/webflow-cli`                                                                                       |
| Anthropic API key      | [console.anthropic.com](https://console.anthropic.com) — **set a spending limit per [spark/HACKATHON.md](../HACKATHON.md)** |
| Slack workspace        | Admin access to the Webflow Slack workspace with the `canvases:write` scope granted to the Spark app                        |
| Webflow site           | Admin on a Webflow site in the `webflow-inside` workspace (see [spark/HACKATHON.md](../HACKATHON.md))                       |
| `cloudflared` (opt.)   | `brew install cloudflared` — only if you need real Slack round-trips locally                                                |

---

## 2. One-time setup

```bash
cd ~/webflow/spark
npm install
```

Create `spark/.env`:

```env
# Mock modes — flip off as you need real traffic
ANTHROPIC_MOCK_MODE=1
SLACK_MOCK_MODE=1

# Real credentials (required when mock modes are off)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-latest

# Integrations (optional — missing values just disable those tools)
GITHUB_TOKEN=ghp_...
JIRA_BASE_URL=https://webflow.atlassian.net
JIRA_API_EMAIL=you@webflow.com
JIRA_API_TOKEN=...
CONFLUENCE_BASE_URL=https://webflow.atlassian.net/wiki
CONFLUENCE_API_TOKEN=...

# Demo session
DEMO_MANAGER_SLACK_ID=U01...
DEMO_MANAGER_EMAIL=you@webflow.com
```

---

## 3. Local dev

The default loop — zero external traffic, sub-second tests:

```bash
cd spark
npm run test:watch   # 68+ vitest cases against makeTestCtx
```

For the full UI:

```bash
cd spark
npm run dev
# visit http://localhost:3000
# visit http://localhost:3000/dev/slack-sandbox for Slack event replay
```

For Worker preview (`npm run preview`), `scripts/setup.mjs` points
`.dev.vars` at `.env.dev` when that file exists, otherwise `.env`. Keep
your preview-only overrides in `.env.dev` if you want them to win
without editing `.env`.

When you need a real Slack round-trip, see `docs/dev-setup.md` for
the Cloudflare Tunnel + dev Slack app setup.

---

## 4. Slack app configuration

Choose the base URL for this run before you touch the Slack app:

- Webflow Cloud: `https://spark.wf.app`
- Local preview with a public tunnel: `https://<random>.trycloudflare.com`

In https://api.slack.com/apps:

1. Open the Spark app in the workspace you are using for the demo.
2. Open **Socket Mode** in the left nav and make sure it is disabled.
3. Open **Event Subscriptions**.
4. Turn **Enable Events** on.
5. In the **Request URL** field, paste:
   `<base-url>/api/slack/events`
6. Wait for Slack to show the green verification state, then click
   **Save Changes**.
7. Under **Subscribe to bot events**, confirm these events are present:
   `app_mention`, `message.im`, `app_home_opened`,
   `assistant_thread_started`, `assistant_thread_context_changed`,
   `member_joined_channel`.
8. Open **Interactivity & Shortcuts**.
9. Turn **Interactivity** on.
10. In the **Request URL** field, paste:
    `<base-url>/api/slack/interactivity`
11. Click **Save Changes**.
12. Open **OAuth & Permissions** and confirm these scopes are present:
    `chat:write`, `channels:history`, `im:history`, `im:write`,
    `app_mentions:read`, `canvases:write`, `users:read`,
    `users:read.email`.
13. If Slack shows **Reinstall to Workspace**, click it and finish the
    reinstall flow.
14. Copy the bot token and signing secret into the environment for the
    app you are running.

---

## 4.1 Local public URL for Slack delivery

Use these steps when the demo is running from a local Worker preview and
Slack needs a public URL:

```bash
# terminal 1
cd ~/webflow/spark
set -a && source ".env.dev" && set +a
npm run setup && npx opennextjs-cloudflare build && npx opennextjs-cloudflare preview --port 8791

# terminal 2
cd ~/webflow/spark
cloudflared tunnel --url http://localhost:8791 --no-autoupdate
```

After both commands are running:

1. In terminal 1, wait for:
   `Ready on http://localhost:8791`
2. In terminal 2, copy the full
   `https://<random>.trycloudflare.com` URL from the `cloudflared`
   output.
3. Go back to the Slack app settings page.
4. Open **Event Subscriptions** and paste:
   `https://<random>.trycloudflare.com/api/slack/events`
   into the **Request URL** field.
5. Wait for the green verification state and click **Save Changes**.
6. Open **Interactivity & Shortcuts** and paste:
   `https://<random>.trycloudflare.com/api/slack/interactivity`
   into the **Request URL** field.
7. Click **Save Changes**.
8. Open the same `https://<random>.trycloudflare.com` URL in the
   browser and run the demo there. Use `/new` if you want to land
   directly on the draft-creation page.
9. Keep the laptop awake and keep both terminals running for the entire
   demo. If either process stops, the public URL stops.

---

## 5. Webflow Cloud deploy

Branch pushes auto-deploy to a preview URL; `main` deploys to
production.

Before first deploy:

1. **Set env vars in Webflow Cloud**: everything from `spark/.env`
   above (minus the `MOCK_MODE` flags). Configure them per environment
   in the Webflow Cloud dashboard.
2. Push to your branch and watch the preview deploy. Webflow Cloud
   reads the `d1_databases` binding in `wrangler.jsonc`, provisions a
   D1 database for this environment, fills in the real `database_id`,
   and applies everything under `migrations/`. See [the storage
   docs](https://developers.webflow.com/webflow-cloud/storing-data/overview)
   for the auto-provisioning contract.
3. Open the Slack app settings and update:
   - **Event Subscriptions** → **Request URL** →
     `<preview-url>/api/slack/events`
   - **Interactivity & Shortcuts** → **Request URL** →
     `<preview-url>/api/slack/interactivity`
4. Wait for Slack to verify both URLs, save the changes, and reinstall
   the app if Slack prompts for it.
5. Merge to main so production deploys, then repeat the same Slack
   update flow with the production base URL.

---

## 6. Demo flow (~4 min)

1. Open the same app URL you configured in Slack. Show the draft inbox.
2. Click **Create onboarding plan**. Pick a new hire.
3. Click **Ask Spark to draft**. Watch the agent timeline in the
   sidebar tick through `resolve_new_hire → fetch_team_roster →
propose_buddy → draft_welcome_note → find_stakeholders →
tune_checklist → finalize_draft`. The welcome text renders live
   as soon as `draft_welcome_note` fires.
4. Edit the welcome note, swap a person, check the Critique
   findings in the sidebar.
5. Click **Publish**. Show the new hire receiving the Slack canvas
   - DM confirmation in a second window.
6. Mention the dev sandbox at `/dev/slack-sandbox` — every Slack
   event the agent handles is replayable from there with a signed
   request and inline recorded outbound calls. "This is the debug
   tool, not Wireshark."
7. Close with: **"Everything you just saw came through one app: the
   same routes handled the manager UI and the Slack delivery path."**

---

## 7. Environment variable table

Deployed on Webflow Cloud:

- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL` (optional)
- `GITHUB_TOKEN` (optional)
- `JIRA_BASE_URL`, `JIRA_API_EMAIL`, `JIRA_API_TOKEN` (optional)
- `CONFLUENCE_BASE_URL`, `CONFLUENCE_API_TOKEN` (optional)
- `DEMO_MANAGER_SLACK_ID`

---

## 8. Troubleshooting

- **Slack returns `invalid_request` on the events URL**: check the
  signing secret matches. In dev, use the sandbox's built-in
  signature helper and compare.
- **Draft draft's canvas isn't created**: Slack's `canvases:write`
  scope requires app reinstall. Spark logs a friendly info message
  and continues without the canvas.
- **Generator hits iteration cap**: add a team hint and retry.
  Usually means CODEOWNERS didn't resolve the new hire's team.
- **D1 query errors**: apply the migration:
  `wrangler d1 migrations apply spark-drafts`.
