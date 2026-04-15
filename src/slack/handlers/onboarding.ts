import type {App} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {resolveJourneyText} from '../journeyText.js';
import {
  publishPreparedHome,
  syncSharedOnboardingWorkspace,
} from '../publishHome.js';

export function registerOnboardingHandlers(app: App, services: Services): void {
  const {logger, identityResolver, journey} = services;

  app.event('member_joined_channel', async ({event, client}) => {
    if (event.user === undefined) return;

    const channelInfo = await client.conversations.info({
      channel: event.channel,
    });
    const channelName = channelInfo.channel?.name ?? '';
    if (!isOnboardingChannel(channelName)) {
      return;
    }

    logger.info(
      `User ${event.user} joined onboarding channel ${event.channel}`
    );

    const profile = await identityResolver.resolveFromSlack(app, event.user);
    const prepared = await journey.prepareStart(profile);
    const reply = journey.buildStartReply(prepared);

    await client.chat.postMessage({
      channel: event.user,
      text: reply.text,
      blocks: reply.blocks,
    });

    await publishPreparedHome(services, client, event.user, prepared);
  });

  app.event('app_mention', async ({event, say, client}) => {
    if (!event.user) return;
    const profile = await identityResolver.resolveFromSlack(app, event.user);
    const prepared = await journey.prepareStart(profile);
    const reply = journey.buildStartReply(prepared);
    const hasPublishedPackage =
      prepared.onboardingPackage?.status === 'published';

    await say({
      text: hasPublishedPackage
        ? `Hey <@${event.user}>! I sent you a DM with your onboarding guide. Open Spark in the sidebar any time if you want to keep going there.`
        : `Hey <@${event.user}>! I sent you a DM with your current onboarding status. Spark will unlock once your manager or onboarding team publishes your package.`,

      thread_ts: event.ts,
    });

    await client.chat.postMessage({
      channel: event.user,
      text: reply.text,
      blocks: reply.blocks,
    });

    await publishPreparedHome(services, client, event.user, prepared);
  });

  app.message(async ({message, say}) => {
    if (message.channel_type !== 'im') return;
    if (message.subtype) return;

    const profile = await identityResolver.resolveFromSlack(app, message.user);
    const response = await resolveJourneyText(
      profile,
      message.text ?? '',
      journey
    );

    if (response.kind === 'reply') {
      await say({text: response.reply.text, blocks: response.reply.blocks});
      if (response.syncProgress) {
        await syncSharedOnboardingWorkspace(app, services, message.user);
      }
      return;
    }

    await say(response.answer);
  });
}

function isOnboardingChannel(channelName: string): boolean {
  const normalized = channelName.toLowerCase();
  return normalized.includes('onboarding') || normalized.includes('cohort');
}
