/**
 * app_home_opened handler — publishes the hire's Home view.
 *
 * Renders a lightweight Block Kit view that links to the hire's
 * published onboarding package if one exists, or a holding card
 * otherwise.
 */

import type {HandlerCtx} from '../../ctx';
import {resolveFromSlack} from '../../services/identityResolver';
import {APP_NAME} from '../../branding';

interface AppHomeOpenedEvent {
  type: 'app_home_opened';
  user: string;
  channel: string;
  tab: string;
  event_ts: string;
}

export async function handleAppHomeOpened(
  event: AppHomeOpenedEvent,
  ctx: HandlerCtx
): Promise<void> {
  if (event.tab !== 'home') return;
  const profile = await resolveFromSlack(ctx, event.user).catch(() => null);
  const firstName = profile?.firstName ?? 'there';
  const pkg =
    (await ctx.db.get(event.user).catch(() => undefined)) ??
    (profile?.email
      ? await ctx.db.get(profile.email).catch(() => undefined)
      : undefined);

  const blocks: unknown[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Welcome, ${firstName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          pkg?.status === 'published'
            ? `Your onboarding plan is live. It covers your checklist, people to meet, and starter tasks.`
            : pkg?.status === 'draft'
              ? `Your manager is preparing your onboarding plan. Expect a Slack ping when it's published.`
              : `Your onboarding plan isn't set up yet. Your manager will walk you through it soon.`,
      },
    },
  ];

  if (pkg?.sections?.welcome?.intro) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(pkg.sections.welcome.intro, 1500),
      },
    });
  }

  if (pkg?.draftCanvasUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${pkg.draftCanvasUrl}|Open your onboarding workspace canvas>`,
      },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Ping @${APP_NAME} in any channel or DM to ask about your checklist, people to meet, or Slack channels.`,
      },
    ],
  });

  await ctx.slack.views.publish({
    user_id: event.user,
    view: {
      type: 'home',
      blocks,
    },
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
