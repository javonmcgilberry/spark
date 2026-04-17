# Hackathon Submission — Spark: Manager Dashboard + Draft Generator Agent

**Team:** Javon McGilberry (+ collaborators)

**Theme adherence:** Agents of Possibility — uses an autonomous multi-tool
LLM loop (DX warehouse → team roster → buddy selection → welcome draft →
checklist tuning → Confluence → contribution task scanner → Zod-gated
finalize) to replace the drafting lift that previously lived in a Slack
modal.

## Problem

Engineering managers at Webflow spend hours of pre-boarding time on the
personalized onboarding guide that every new hire expects on day one:
welcome note, buddy assignment, people to meet, team-tuned checklist
items, first contribution targets. The existing Spark Slack bot ships
the guide to the hire on day 1 — but drafting itself still happened in
a cramped Slack modal, field by field. The generic catalog covers
company-wide basics but doesn't know _this team_, _this hire_, _this
moment_.

## Solution

A Next.js 15 manager dashboard on Webflow Cloud with two AI teammates:

1. **Generator agent.** Takes a sentence from the manager ("Maria,
   backend, joining Commerce on May 1, cares about reliability") and
   autonomously runs a 9-tool loop — looks up the team in DX warehouse,
   fetches the roster, ranks 3 buddy candidates, drafts the welcome
   note, tunes the week-3 contribution task to the team's codebase,
   and hands back a Zod-validated draft in ~20 seconds.

2. **Critique agent.** Runs on every save and on demand. Seven
   deterministic rules flag weak welcome notes, missing buddies,
   thin people-to-meet lists, uniform task difficulty, and dead
   resource links. Each finding has a one-click Apply Fix.

After editing, the manager clicks "Publish to Slack" and the existing
Spark bot materializes the draft channel + canvas and notifies the
reviewers, so all the async collaboration stays where it already works.

## What we built (links)

- Code: <github link>
- Loom demo (4 min): <loom link>
- Webflow Cloud preview: <webflow url>/spark-manager

## Architecture at a glance

```
Manager browser
  → Webflow Cloud (Next.js 15 edge, Cloudflare Workers)
    → Anthropic API (tool-use loop, claude-3-5-haiku)
    → Spark bot HTTP API (bearer auth, CORS-locked)
      → DX warehouse, GitHub, Confluence, Webflow monorepo, Slack Web API
```

The bot stays a long-running Node process with its existing in-memory
draft store. The UI is a thin, stateless edge consumer. For the demo,
the bot is exposed through a Cloudflare tunnel.

## How autonomy shows up

- 9 tools the model composes without prompting:
  `resolve_new_hire`, `resolve_team`, `fetch_team_roster`,
  `propose_buddy`, `find_stakeholders`, `find_contribution_tasks`,
  `draft_welcome_note`, `tune_checklist`, `finalize_draft`.
- Zod-gated finalize: invalid payloads feed validation errors back to
  the model; the loop retries.
- Per-tool 10s timeout, 20-iteration hard cap, exponential backoff on
  Anthropic 529s.
- PII hygiene — emails stripped before being passed to the model.
- Streaming SSE so the manager watches the agent think in real time.

## What we intentionally didn't do (yet)

- Slack OAuth. The demo uses a session cookie + `DEMO_MANAGER_SLACK_ID`
  env fallback.
- Hosted bot. We tunnel for the demo.
- Edge-native storage. The bot's in-memory Map is still the source of
  truth; Webflow Cloud SQLite is the next step.
- Rate limiting per manager.

Each of these is a straightforward post-hackathon step with no
architectural surprise.

## Code requirements (hackathon checklist)

- Runs on `dev` branch ✓
- Setup instructions: see `spark/README.md` and
  `spark/web/README.md`
- Demo steps: see `spark/docs/manager-dashboard-demo.md`
- Required env vars documented in `spark/.env.example` and
  `spark/web/.env.local.example`
- Security pre-submission checklist
  (`spark/HACKATHON.md`): ggshield clean, no hardcoded secrets,
  Anthropic spending limit set, no PII sent to LLMs beyond Slack
  ids + first names.
