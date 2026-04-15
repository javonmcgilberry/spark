# Slack App Setup

Spark runs as a Slack AI agent in Socket Mode. The assistant thread experience powers the main onboarding flow, while slash commands and DMs remain available as backup entry points.

## 1. Create the app

1. Go to https://api.slack.com/apps and create a new app **from scratch**.
2. Name it **Spark** and install it into the Webflow workspace.
3. Under **Socket Mode**, enable it and generate an app-level token with the `connections:write` scope. Copy it into `SLACK_APP_TOKEN`.
4. Under **OAuth & Permissions**, install the app and copy the bot token into `SLACK_BOT_TOKEN`.

## 2. Bot token scopes

Add these under **OAuth & Permissions > Scopes > Bot Token Scopes**:

| Scope                | Why                                                            |
| -------------------- | -------------------------------------------------------------- |
| `assistant:write`    | Set thread status, suggested prompts, and assistant titles     |
| `app_mentions:read`  | Respond when someone @mentions Spark                           |
| `canvases:write`     | Create the shared onboarding canvas for each new hire          |
| `channels:history`   | Read messages in cohort channels                               |
| `channels:read`      | List channels to find cohort channels                          |
| `chat:write`         | Send messages and Block Kit cards                              |
| `chat:write.public`  | Post to channels Spark hasn't been invited to                  |
| `commands`           | Handle the `/spark` slash command                              |
| `groups:history`     | Read private channel messages (cohort channels may be private) |
| `groups:read`        | List private channels                                          |
| `im:history`         | Read DMs from new hires                                        |
| `im:read`            | Know when a DM channel is opened                               |
| `im:write`           | Send DMs to new hires                                          |
| `users:read`         | Look up user profiles                                          |
| `users:read.email`   | Resolve Slack email for profile hydration and Confluence auth  |
| `users.profile:read` | Read custom Slack profile fields like division, team, manager  |

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
- **Description**: Start your onboarding journey with Spark

## 5. Interactivity

Under **Interactivity & Shortcuts**, toggle Interactivity **on**. Socket Mode handles the request URL automatically.

## 6. App Home

Under **App Home**, turn Home Tab **on** so Spark can publish the personal dashboard when Slack fires `app_home_opened`.

## 7. Sanity check

Once the app is installed:

1. Open Spark from the Slack sidebar.
2. Confirm the Home tab loads your onboarding dashboard and checklist.
3. Start a new assistant thread.
4. Confirm Spark shows suggested prompts and a loading status before replying.
5. Click through one of the Block Kit buttons to make sure interactivity is wired correctly.
6. Confirm the welcome message includes a canvas link once `canvases:write` is available.
