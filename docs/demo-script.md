# Spark — Loom Demo Script

A confident, slightly playful walkthrough for a 4–5 minute Loom.
Polished enough for judges, loose enough to feel like a person built this.

Total target: **~4 min**. Anything over 5 is too long.

---

## 0. Before you hit record

- [ ] Open the Spark dashboard at your demo URL (`spark.wf.app` or your
      tunnel). Sign in so the manager session is real.
- [ ] Make sure there's one real, resolvable new hire you can pick from
      the Slack picker. Ideally someone on a team with real Jira/GitHub
      activity so the `Ask me about…` blurbs hit.
- [ ] Open a second Slack window side-by-side, logged in as the
      "new hire" account (or someone whose Slack you can share) so the
      Slack delivery moment actually lands.
- [ ] Close noisy tabs. Loom picks up everything. Put your status on DND.
- [ ] Have this script on a second monitor. Don't read it. Glance.
- [ ] Deep breath. You built this thing. It's cool.

---

## 1. Cold open — 15 seconds

**Visible:** Spark dashboard, draft inbox empty or with one prior plan.

> "Hey — I'm Javon, and this is Spark. Onboarding a new engineer at
> Webflow takes a manager somewhere between four hours and four days
> of spreadsheet wrangling. I'm going to show you how Spark turns that
> into about four minutes, and I'm going to show you the agents doing
> the work while we go."

_Why this opener:_ names the problem in numbers, sets up the agent
angle, and promises a payoff.

---

## 2. The setup — 30 seconds

**Click:** "Create onboarding plan."
**Visible:** the `/new` page with the Slack user picker + team hint.

> "This is the entire manager-facing surface. I pick the new hire from
> our actual Slack directory — that's `users.list` running in the
> background, cached at the edge. Team hint is optional. That's it.
> No forms, no spreadsheets. I'm going to hit create and you're going
> to watch the agents actually work."

**Click:** the new hire's name in the picker (pre-type a couple letters
so it autocompletes fast).
**Click:** "Create draft & run agent."

---

## 3. Watch the agent work — 60 seconds

**Visible:** draft workspace. Agent timeline in the sidebar lights up.
Welcome note appears as `draft_welcome_note` fires.

> "This is the Generator agent. It's running Anthropic's tool-use API
> against real tools — you can see each one in the timeline as it
> fires. Before the loop even started, Spark pulled the real roster
> from the DX warehouse: actual engineering peers, the PM, the
> designer, and the director above the manager. The agent itself
> only writes the welcome copy and checklist — not the people."

**Point at:** the welcome note as it renders.

> "See that? The welcome note already landed before the agent was done.
> That's a design choice — the instant `draft_welcome_note` fires, the
> server persists it and streams a `draft_persisted` event, so the
> manager gets the part they're going to care about first while the
> rest of the loop finishes."

**Let the timeline finish.** Scroll down to People to Meet.

> "And this is the part I'm proudest of. Each person has an
> `Ask me about…` blurb — that's a separate micro-pipeline that pulled
> their recent Jira tickets and their recent GitHub PRs, fed those to
> Claude, and asked for a warm, specific one-liner. If any of it 404s,
> we just fall back gracefully. Real data, real context, zero
> fabrication."

---

## 4. Human in the loop — 45 seconds

**Scroll to:** the buddy slot (it says "Your Onboarding Buddy" with an
"Assign teammate" button).

> "One thing I want to be explicit about: Spark does not pick the
> buddy. That's the manager's call every time. Spark surfaces the
> candidates, but the manager chooses."

**Click:** "Assign teammate" on the buddy slot.
**Pick:** one of the engineers Spark surfaced in the roster.

> "Done. One click."

**Scroll to:** the welcome note. Edit a word or two.

> "Everything is editable. Every field is a real save with optimistic
> updates and a debounced PATCH. I can rewrite the welcome note, tweak
> a checklist item, swap a person — the draft store on D1 keeps up."

**Click:** "Ask agent to review."
**Visible:** Critique panel populates.

> "And this is the second agent. It re-reads the draft and flags
> issues — missing buddy, thin welcome note, people-to-meet list that
> doesn't match the assigned buddy. Each finding ships with a patch
> you can apply with one click."

_Only if there's a finding:_ click "Apply fix" on one.

> "One click, applied."

---

## 5. Publish — 45 seconds

**Click:** "Publish to Slack."
**Visible:** publish confirmation.

> "Now we send it. Webhook fires, Slack app creates a draft canvas in
> a channel scoped to the new hire, DMs them the welcome note, and
> the Slack-side assistant agent takes over from there."

**Switch to Slack window** (the new hire's view).
**Show:** the DM + the canvas + the Home tab.

> "From the new hire's side, they get a Slack canvas with their entire
> onboarding plan, a DM from the Spark assistant, and a Home tab that
> stays in sync. They can ask the assistant questions about their
> ramp-up, people to meet, checklist — it's a third agent, running on
> the same Worker."

---

## 6. The architecture flex — 30 seconds

**Switch back to browser.** Open a new tab to `/dev/slack-sandbox`
(optional, only if you have time).

> "Everything you just watched — the manager UI, the Slack webhook
> handlers, the agent loop, the Jira and GitHub lookups — ran inside
> a single Next.js app on a single Cloudflare Worker. One deploy,
> one URL, entire system on the edge."

**Open:** `/dev/slack-sandbox` briefly.

> "And because every tool takes a dependency-injected context, this is
> how I develop it — every Slack event fixture is replayable from a
> dropdown with signed requests. No Wireshark, no ngrok. Sub-second
> tests against the same agent loop that runs in prod."

---

## 7. Close — 15 seconds

**Back to:** the draft workspace.

> "Three agents, real tool use, one edge deployment, a human always in
> the loop. That's Spark. Built on Webflow Cloud for the Agents of
> Possibility hackathon. Thanks for watching."

---

## Backup lines if a demo beat hangs

- "While that's loading — notice how fast the Slack directory search
  was? That's `users.list` cached on `ctx.scratch` with a 10-minute TTL."
- "If the Jira lookup 404s for someone, the blurb gracefully falls
  back to a role-based intro. Agents need good fallbacks."
- "I'm running this off a Cloudflare Tunnel right now, but the
  production deploy URL is `spark.wf.app` — same code, same Worker."

---

## Things to say if a judge asks

**"What happens when the agent is wrong?"**

> "Every draft is reviewable before anyone outside the manager sees
> it. The Critique agent is a second pass. Publish is a deliberate
> click. Nothing ships autonomously."

**"Why three agents instead of one prompt?"**

> "Different jobs. Generator needs tools and iteration. Critique needs
> a clean pass over structured output. The Slack assistant needs
> different context and different surface area. One shared runtime,
> three agents."

**"Why Webflow Cloud?"**

> "Because the whole thing runs on the edge — manager UI, Slack
> webhooks, D1 draft store, agent loop. One Next.js app, one Worker,
> one deploy. Cloudflare's 'Build a Slack Agent' pattern, implemented
> as a native reference on Webflow Cloud."

---

## Post-record checklist

- [ ] Watch it back at 1.5x. If it's boring at 1.5x, it's too slow.
- [ ] Trim the dead air at the top and tail.
- [ ] Title it something concrete: _"Spark — AI onboarding co-pilot,
      multi-agent, built on Webflow Cloud (4 min)"_.
- [ ] Link it in the PR description and the hackathon submission.
