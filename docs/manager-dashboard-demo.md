# Spark Manager Dashboard — Getting Started & Demo Runbook

End-to-end: clone → local dev → Webflow Cloud deploy → 4-minute Loom.
Nothing assumes prior familiarity with Webflow Cloud.

---

## 1. Prerequisites

|                        |                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Node                   | 20.19+ (check: `node --version`)                                                                                            |
| npm                    | 10+ (Webflow Cloud supports npm only)                                                                                       |
| `cloudflared`          | `brew install cloudflared` (macOS)                                                                                          |
| `@webflow/webflow-cli` | `npm install -g @webflow/webflow-cli`                                                                                       |
| Anthropic API key      | [console.anthropic.com](https://console.anthropic.com) — **set a spending limit per [spark/HACKATHON.md](../HACKATHON.md)** |
| Slack workspace        | Admin access to the Webflow Slack workspace with the `canvases:write` scope granted to the Spark app                        |
| Webflow site           | Admin on a Webflow site in the `webflow-inside` workspace (see [spark/HACKATHON.md](../HACKATHON.md))                       |

---

## 2. One-time setup

```bash
# Clone (spark is a submodule inside the webflow monorepo)
cd ~/webflow/spark
git fetch && git checkout <your-branch>

# Fill in the single env file. Both bot AND web read from this.
cp .env.example .env
# Edit .env — required values:
#   SLACK_APP_TOKEN=xapp-...           (from Slack app config)
#   SLACK_BOT_TOKEN=xoxb-...
#   ANTHROPIC_API_KEY=sk-ant-...       (with spending limit set)
#   SPARK_API_TOKEN=$(openssl rand -hex 32)
#   SPARK_API_BASE_URL=http://localhost:8787
#   DEMO_MANAGER_SLACK_ID=U01...       (your Slack user id)

# Install bot deps
npm install

# Symlink .env into the web app so it's a single source of truth.
# Next reads .env.local, Wrangler reads .dev.vars — both point at ../.env.
cd web
ln -s ../.env .env.local
ln -s ../.env .dev.vars
npm install
cd ..

# Sanity check
ls -la web/.env.local web/.dev.vars
#   lrwxr-xr-x  ...  .env.local -> ../.env
#   lrwxr-xr-x  ...  .dev.vars  -> ../.env
```

Both symlinks match patterns in [spark/web/.gitignore](../web/.gitignore)
(`.env*.local` and `.dev.vars`), so `spark/.env` stays on your machine.

---

## 3. Local dev loop

Two terminals, both inside `spark/`.

```bash
# Terminal A — bot (Node, Socket Mode)
cd spark
npm run dev
# Expect: "HTTP server listening on port 8787" + "Slack Socket Mode connected"

# Terminal B — Next.js dev server
cd spark/web
npm run dev
# Expect: "✓ Ready in ..."  served at http://localhost:3000/spark-manager
```

Healthy state:

```bash
curl -s localhost:8787/healthz
# {"ok":true,"pid":...,"slackConfigured":true,"apiConfigured":true}

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/spark-manager
# 200 (or 308 redirect then 200)
```

Open `http://localhost:3000/spark-manager` in a browser. If
`DEMO_MANAGER_SLACK_ID` is set, you should see "Draft your first
onboarding plan". If you see "No manager session", your env var isn't
loading — check `spark/web/.env.local` is a symlink pointing at `../.env`.

---

## 4. Local OpenNext preview (recommended before deploy)

`next dev` runs a Node server. To validate the **actual Workers bundle**
Webflow Cloud will run:

```bash
cd spark/web
npm run preview   # opennextjs-cloudflare build + wrangler dev on :8788

curl -s localhost:8788/spark-manager/healthz
# {"ok":true,"app":"spark-manager","timestamp":"..."}
```

What this catches that `next build` does not:

- Routes marked `export const runtime = 'edge'` that OpenNext refuses to bundle in the default worker.
- Node-only API leaks (e.g. `node:fs` in an edge route).
- `process.env` values that aren't wired up for Workers.

If the preview build passes, the Webflow Cloud deploy will almost
certainly work.

---

## 5. Webflow Cloud setup (first deploy)

### 5a. Initialize the project

```bash
cd spark/web
webflow cloud init
```

Prompts, with the exact answers for this project:

| #   | Prompt                                     | Answer                                                                                  |
| --- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1   | `Login to Webflow?`                        | Yes → browser opens, log in with your `webflow-inside` account                          |
| 2   | `Select a framework`                       | **Next.js**                                                                             |
| 3   | `Enter the mount path`                     | **`/spark-manager`** ← must match `basePath` in [next.config.ts](../web/next.config.ts) |
| 4   | `Select a Webflow site`                    | Pick the site in the `webflow-inside` workspace you want to host this under             |
| 5   | `Import Webflow design system components?` | **Skip** (not needed for the admin UI)                                                  |

The CLI writes `WEBFLOW_SITE_ID` and `WEBFLOW_API_TOKEN` into
`spark/web/.env` (tracked as `.env.local` thanks to our symlink; note
`.env.local` trumps `.env` per Next precedence, so this ends up in
`spark/.env` — the CLI appends, it doesn't overwrite existing keys).

### 5b. Connect GitHub + create project in the Webflow dashboard

The CLI can't do these steps — they require the Webflow Cloud UI.

1. Open your Webflow site → **Site Settings** → **Webflow Cloud** (sidebar).
2. **Login to GitHub** → OAuth.
3. **Install GitHub App** → grant access to the **spark** repo specifically (NOT the parent webflow monorepo).
4. **Create New Project**:
   - Name: `spark-manager` (any label)
   - Repository: the `spark` repo
   - Directory path: `web` ← relative to the spark repo root
5. **Create Environment**:
   - Branch: whichever branch you're deploying from
   - **Mount path: `/spark-manager`** ← must match [next.config.ts](../web/next.config.ts)
6. **Environment variables** (Environment details → Environment variables):
   | Name | Value |
   |---|---|
   | `SPARK_API_BASE_URL` | Set later, after tunnel comes up |
   | `SPARK_API_TOKEN` | Same 32-byte hex from your `spark/.env` |
   | `ANTHROPIC_API_KEY` | Your Anthropic key (with spending limit) |
   | `ANTHROPIC_MODEL` | Optional, defaults to `claude-3-5-haiku-latest` |
   | `DEMO_MANAGER_SLACK_ID` | Your Slack user id, e.g. `U01...` |
7. **Publish Webflow Site** (top right of Designer) once — required before any environment goes live.

### 5c. Expose the local bot via Cloudflare Tunnel

```bash
cd spark
./scripts/tunnel.sh
# Prints: SPARK_TUNNEL_URL=https://spark-bot-<handle>.trycloudflare.com
```

Paste that URL into the Webflow Cloud `SPARK_API_BASE_URL` env var, then
redeploy (or push a commit to trigger).

**Keep the tunnel script running during the demo.** If it dies, the
public URL changes and you must re-paste it.

### 5d. Deploy

```bash
git add -A && git commit -m "hackathon: deploy manager dashboard"
git push origin <your-branch>
# Watch: Webflow Cloud → Deployments → Build logs
```

Or push-less manual deploy:

```bash
cd spark/web
webflow cloud deploy
```

Deploys take ~2 min.

### 5e. Verify production

```bash
curl -s https://<your-site>.webflow.io/spark-manager/healthz
# {"ok":true,"app":"spark-manager","timestamp":"..."}

# Open in browser:
open https://<your-site>.webflow.io/spark-manager
# Should show "Draft your first onboarding plan" plus — until the tunnel is
# reachable — a "Bot unreachable" banner. That banner clears once
# SPARK_API_BASE_URL points at a live tunnel.
```

---

## 6. Demo script (4-minute Loom)

1. **00:00–00:30 Problem setup.**

   > "Engineering managers at Webflow spend hours prepping each new hire's
   > onboarding guide. Spark Manager Dashboard lets an agent do the heavy
   > lifting — buddy selection, welcome note, team-specific tasks — in ~20
   > seconds."
   > Open `https://<your-site>.webflow.io/spark-manager`.

2. **00:30–01:00 Start the draft.**
   Click "Create onboarding plan", fill:

   ```
   New hire:   Maria Vega
   Slack id:   U01EXAMPLE
   Team hint:  Commerce Sprint, backend
   Intent:     Maria cares about reliability and is joining after parental leave.
   ```

   Click **Create draft & run agent**.

3. **01:00–02:30 The agent loop (money shot).**
   Right rail streams tool calls: resolve_team → fetch_team_roster →
   propose_buddy → find_stakeholders → find_contribution_tasks →
   draft_welcome_note → tune_checklist → finalize_draft.

4. **02:30–03:00 Edit + critique.**
   Tweak the welcome note (show "Saving…" → "Saved" pill). Click
   "Ask agent to review". Critique returns 1–2 findings. Click
   "Apply fix" on one.

5. **03:00–03:30 Publish to Slack.**
   Click "Publish to Slack". Cut to Slack: `#spark-draft-maria-v` with
   canvas + invited reviewers appears.

6. **03:30–04:00 Theme tie-in.**
   > "The Generator is a real multi-step tool-using agent — DX warehouse,
   > GitHub, Confluence, monorepo scanner, LLM synthesis, Zod-gated
   > finalize. 20 autonomous seconds. Slack stays the review surface.
   > That's Agents of Possibility."

Reset between takes: `pkill -f 'tsx.*spark/src/index.ts'` then
`cd spark && npm run dev`.

---

## 7. Why the `SPARK_API_TOKEN` exists (security note)

The Webflow Cloud deployment sits behind your workspace's SSO — any
browser hitting `<your-site>.webflow.io/spark-manager` must be logged
into a `webflow-inside` account. That gates **browsers talking to the
UI**.

But the UI itself calls the bot via **server-to-server `fetch` from
Cloudflare Workers** — no browser, no SSO cookie. The bot tunnel URL
(`https://…trycloudflare.com`) is a public HTTPS endpoint. Anyone who
learns the tunnel URL skips the UI entirely and can:

- Create draft onboarding packages for any Slack user id.
- Publish to Slack — **materializes a real private channel, invites real
  users, sends real messages**.
- Enumerate every in-flight draft.
- Hit the tool-proxy lookups.

`SPARK_API_TOKEN` (bearer) is what stops a leaked tunnel URL from being
destructive. The post-hackathon upgrade is Cloudflare Zero Trust Access
on the tunnel itself (see section 9).

**If you ever think the token leaked, rotate it now:**

```bash
openssl rand -hex 32  # generate new
# Update spark/.env  AND  the Webflow Cloud SPARK_API_TOKEN env var
# Restart the bot. The old token becomes invalid immediately.
```

---

## 8. Troubleshooting

| Symptom                                                 | Cause                                     | Fix                                                                                                                                                           |
| ------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI shows "No manager session"                           | `DEMO_MANAGER_SLACK_ID` not loaded        | Check `spark/web/.env.local` is a symlink to `../.env` with `readlink .env.local`                                                                             |
| UI shows "Bot unreachable"                              | Tunnel down, wrong URL, or wrong token    | Restart `scripts/tunnel.sh`, update `SPARK_API_BASE_URL` in Webflow Cloud, confirm `SPARK_API_TOKEN` matches on both sides                                    |
| `/spark-manager/new` → 404                              | basePath mismatch                         | `basePath` in [next.config.ts](../web/next.config.ts) must exactly equal the Webflow Cloud mount path                                                         |
| OpenNext build fails with "cannot use the edge runtime" | `runtime = 'edge'` marker on a route      | Remove the export; OpenNext runs the entire app on Workers and doesn't allow split edge functions                                                             |
| Webflow Cloud deploy doesn't start on push              | GitHub App not installed on the repo      | Site Settings → Webflow Cloud → reinstall the GitHub App and grant access to the `spark` repo                                                                 |
| Agent stalls at "Looking up team"                       | `DX_WAREHOUSE_DSN` missing on the bot     | Add it to `spark/.env`, restart the bot                                                                                                                       |
| Canvas creation fails in Slack                          | `canvases:write` scope missing            | Add the scope in your Slack app config, reinstall the app to the workspace                                                                                    |
| `.env` changes don't take effect                        | Node/Next processes cached the old values | Restart both the bot (`npm run dev` in `spark/`) and the UI (`npm run dev` in `spark/web/`)                                                                   |
| `.dev.vars` changes don't take effect in preview        | Wrangler caches                           | Kill `npm run preview` and restart                                                                                                                            |
| `.env.example` gained new keys, unsure which            | Template updated without touching `.env`  | `cd spark && diff <(grep -oE '^[A-Z_]+=' .env.example \| sort -u) <(grep -oE '^[A-Z_]+=' .env \| sort -u)` — keys only on the left need to be added to `.env` |

---

## 9. Post-hackathon followups (not blocking the demo)

- **Replace `SPARK_API_TOKEN` with Cloudflare Zero Trust Access on the
  tunnel.** Requires a Cloudflare Zero Trust plan on the webflow account;
  lets us gate the tunnel URL with the same SSO that fronts the UI. ~30
  minutes of Cloudflare dashboard work, zero code change. After that the
  token can be deleted.
- **Slack OAuth** on the UI (replaces `DEMO_MANAGER_SLACK_ID` fallback).
- **Host the bot on Fly.io or Render** (replaces the Cloudflare tunnel).
- **Move drafts to Webflow Cloud SQLite** (replaces the bot's in-memory
  Map; lets the UI work if the bot is down).
- **Rate-limit per manager** on the Generator agent route.
- **Slack user typeahead** in the intake form (the `/new` form requires
  manual Slack-id entry today — the bot already has `users.list`
  available for a typeahead).

---

## 10. Fallback plan if the live demo breaks mid-Loom

1. Cut to `docs/demo-fallback.mp4` (pre-recorded the night before).
2. If Slack publish fails, show a screenshot of a previously hydrated
   `#spark-draft-*` canvas instead.
3. Worst case, `localhost:3000` demo against the bot + narrate.
