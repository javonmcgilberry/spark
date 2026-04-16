# Slack App Setup

Spark runs as a Slack AI agent in Socket Mode. `/spark` is the manager-team entry point for creating onboarding packages. Structured review actions stay in Block Kit cards and modals, while the draft or shared canvas stays the long-form workspace. The assistant thread and App Home experiences stay hidden from the new hire until the package is published.

## 1. Create the app

1. Go to https://api.slack.com/apps and create a new app **from scratch**.
2. Name it **Spark** and install it into the Webflow workspace.
3. Under **Socket Mode**, enable it and generate an app-level token with the `connections:write` scope. Copy it into `SLACK_APP_TOKEN`.
4. Under **OAuth & Permissions**, install the app and copy the bot token into `SLACK_BOT_TOKEN`.

## 2. Bot token scopes

Add these under **OAuth & Permissions > Scopes > Bot Token Scopes**:

| Scope                    | Why                                                            |
| ------------------------ | -------------------------------------------------------------- |
| `assistant:write`        | Set thread status, suggested prompts, and assistant titles     |
| `app_mentions:read`      | Respond when someone @mentions Spark                           |
| `canvases:read`          | Look up managed canvas sections before syncing shared progress |
| `canvases:write`         | Create and update the shared onboarding canvas                 |
| `channels:manage`        | Create the private per-hire draft channel                      |
| `channels:history`       | Read messages in cohort channels                               |
| `channels:read`          | List channels to find cohort channels                          |
| `channels:write.invites` | Invite reviewers into the private draft channel                |
| `chat:write`             | Send messages and Block Kit cards                              |
| `chat:write.public`      | Post to channels Spark hasn't been invited to                  |
| `commands`               | Handle the `/spark` slash command                              |
| `groups:history`         | Read private channel messages (cohort channels may be private) |
| `groups:read`            | List private channels                                          |
| `im:history`             | Read DMs from new hires                                        |
| `im:read`                | Know when a DM channel is opened                               |
| `im:write`               | Send DMs to new hires                                          |
| `users:read`             | Look up user profiles                                          |
| `users:read.email`       | Resolve Slack email for profile hydration and Confluence auth  |
| `users.profile:read`     | Read custom Slack profile fields like division, team, manager  |

## 3. Event subscriptions

Under **Event Subscriptions**, subscribe to these bot events:

| Event                      | Why                                               |
| -------------------------- | ------------------------------------------------- |
| `app_home_opened`          | Publish the personal onboarding dashboard         |
| `assistant_thread_started` | Start the native Spark assistant experience       |
| `app_mention`              | Trigger when someone @mentions Spark              |
| `member_joined_channel`    | Auto-greet when a new hire joins a cohort channel |
| `message.im`               | Handle assistant replies and DM fallback messages |

## 4. Slash command

Under **Slash Commands**, create:

- **Command**: `/spark`
- **Request URL**: Leave blank (Socket Mode handles routing)
- **Description**: Create or review a manager-led onboarding package

## 5. Interactivity

Under **Interactivity & Shortcuts**, toggle Interactivity **on**. Socket Mode handles the request URL automatically.

Spark uses interactivity for:

- the `/spark` entry menu
- draft creation and draft edit modals
- draft review cards with publish buttons
- Home pending-state draft edit buttons
- milestone sharing with a `conversations_select` channel picker filtered to public and private channels

## 6. App Home

Under **App Home**, turn Home Tab **on** so Spark can publish the workbook-shaped onboarding pseudo-tabs when Slack fires `app_home_opened`.

Before publish, reviewers see pending draft cards there and can open the draft edit modal directly from Home. After publish, the new hire sees the full workbook-shaped onboarding Home view.

## 7. Surface split

Use the surfaces this way:

- Block Kit and modals: create drafts, edit structured package details, publish, and share milestones
- Canvas markdown: keep the long-form onboarding workspace, team notes, seeded references, and shared progress mirror

## 8. Sanity check

Once the app is installed:

1. Open Spark from the Slack sidebar.
2. Open Spark as a test new hire before publish and confirm App Home stays in the pending state.
3. Run `/spark` and confirm the default action is manager-team draft creation.
4. Create a draft for a test user and confirm Spark creates:
   - a private draft channel
   - a seeded channel canvas
   - a draft review card in the draft channel with `Edit draft details` and `Publish to new hire`
   - a matching review card DM to the initiator
5. Confirm a reviewer can open the draft edit modal from the draft review card and from the pending Home state.
6. Confirm the edit modal updates the structured draft details and refreshes the draft canvas content without turning the canvas into the primary workflow control surface.
7. Confirm only the manager can use the publish action successfully.
8. Publish the draft and confirm the new hire receives:
   - a DM from Spark
   - a populated Home tab with workbook pseudo-tabs
   - access to the shared onboarding workspace channel/canvas
9. Click through the Home pseudo-tabs and checklist interactions to make sure the shared canvas progress section stays in sync.
10. Complete the first contribution milestone and confirm the manager and onboarding buddy each receive a DM with a `Choose channel` action.
11. Use the share modal to post the celebration into a public channel and a private channel where Spark is already present.
12. Start a new assistant thread and confirm Spark shows suggested prompts and a loading status before replying.

## 9. Sandbox smoke checklist

Keep the real-workspace pass intentionally thin. The automated harness and mocked Slack tests should prove most of the logic already.

Use this smoke pass to validate the Slack-only surface area:

1. Start Spark in Socket Mode and confirm the app connects cleanly.
2. Run `/spark` for a test new hire and confirm the draft modal opens.
3. Create a draft and confirm Spark creates the private draft channel and seeded canvas.
4. Publish the draft as the manager and confirm the new hire gets a DM plus a populated Home tab.
5. Click one Home checklist item and confirm the shared canvas progress section updates.
6. Complete the first contribution milestone and confirm celebration sharing works in one public channel and one private channel where Spark is already present.
