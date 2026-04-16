# Slack Assistant API - behaviors to verify manually

The Slack Assistant API (`@slack/bolt` v4, `chat.*Stream`, `assistant.threads.*`)
has three behaviors that are not fully documented. Verify these at first-run
and before a demo. The current implementation takes the defensive default in
each case, so nothing should be broken if the docs reflect real behavior, but
watch for surprises.

Context: this file documents the ambiguous points surfaced while building the
LLM-first chat routing. See `llm-first_chat_routing_v2` plan for the change
set.

## 1. `setSuggestedPrompts` timing relative to `stopStream`

**Question:** When the agent finishes a reply via `sayStream().stop()` and
then calls `setSuggestedPrompts(...)`, does the pill bar render cleanly under
the streamed message? What if prompts are set BEFORE `stopStream`?

**Current implementation choice:** Always call `setSuggestedPrompts` AFTER
`stream.stop()`. See the ordering in
`spark/src/slack/handlers/assistant.ts` `userMessage`. Slack's canonical
ordering in
[developing-agents](https://docs.slack.dev/ai/developing-agents/#full-example)
is `setStatus → startStream → appendStream → stopStream → setSuggestedPrompts`.

**Test:** Swap the order in a scratch build, observe. If the bar flickers or
disappears, lock in the current order permanently and add a comment pointing
here.

## 2. Multiple `setSuggestedPrompts` calls in one turn

**Question:** If the LLM accidentally invokes the `set_suggested_prompts`
tool twice in the same turn (or we deliberately set prompts once before the
stream and again after), does the last call replace cleanly, or is there a
race?

**Current implementation choice:** `LlmService.runAgentLoop` captures the
LATEST `set_suggested_prompts` tool-use it sees across the turn (each
tool-use assignment overwrites `capturedPrompts`). We only invoke
`setSuggestedPrompts` once per turn after the stream stops.

**Test:** Prompt the LLM in a way that encourages it to call the tool twice
(the system prompt says at most once, but models sometimes drift). Confirm
that the final pill bar shows only the second call's prompts and the first
is discarded.

## 3. Auto-clear on next user message

**Question:** When the user sends a new message, does Slack automatically
clear the existing suggested-prompt bar, or does it persist until we call
`setSuggestedPrompts` again?

**Current implementation choice:** Defensively re-set prompts on every
`userMessage` turn — either the LLM's agentic picks (via the
`set_suggested_prompts` tool) or live signals from
`computeLiveSignals(ctx)` computed from current state (joined channels,
user guide progress, checklist, tool access, PRs, tickets, onboarding
stage). So auto-clear behavior does not matter for correctness.

**Test:** Send a message, do not wait for the reply, send another message.
Observe whether the prompt bar updates cleanly or stacks oddly. If there is
a visible race, add a small debounce before `setSuggestedPrompts`.

## 4. `users.conversations` per-turn lookup + TTL cache

**Question:** Calling `client.users.conversations` once per `userMessage`
turn to build the "joined channels" set means one Tier 3 call per DM per
user. Is this safe at scale, and does the 10-minute in-process cache hold
up under realistic assistant sessions?

**Current implementation choice:** `fetchJoinedChannels` in
`spark/src/slack/handlers/assistant.ts` paginates `users.conversations`
(public + private, up to 10 pages) and caches the result per `userId` for
10 minutes (`JOINED_CHANNEL_TTL_MS`). On API failure we log a warning and
drop the join-state so the LLM still answers, just without strikethroughs.

**Test:** Send several DMs in quick succession and confirm we hit the
cache (check the bot logs for only one `users.conversations` call per 10
minutes per user). Then wait past the TTL and confirm it re-queries.
Re-verify if Slack ever changes the Tier 3 rate limit (today: ~50+/min).

## How to verify

1. Deploy to the Webflow test workspace (or Socket-mode local dev).
2. Open the Spark Assistant thread from the sidebar.
3. Send a message, observe the prompt bar and message body.
4. Repeat with edge cases listed above.
5. Capture screenshots if anything looks off; link them back here.
