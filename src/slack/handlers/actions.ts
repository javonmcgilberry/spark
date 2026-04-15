import type {App} from '@slack/bolt';
import type {KnownBlock} from '@slack/types';
import type {Services} from '../../app/services.js';
import {isJourneyStepId, type TeamProfile} from '../../onboarding/types.js';

type ActionBody = Parameters<Parameters<App['action']>[1]>[0]['body'];

export function registerActionHandlers(app: App, services: Services): void {
  const {logger, identityResolver, journey} = services;

  app.action('spark_go_to_step', async ({ack, body, client, action}) => {
    await ack();

    const channelId = body.channel?.id;
    if (action.type !== 'button' || !action.value || !channelId) {
      return;
    }
    if (!isJourneyStepId(action.value)) {
      return;
    }

    logger.info(`Journey step ${action.value} selected by ${body.user.id}`);

    const profile = await identityResolver.resolveFromSlack(app, body.user.id);
    const reply = await journey.advance(profile, action.value);

    await postThreadMessage(client, body, channelId, reply.text, reply.blocks);
  });

  app.action('spark_show_people', async ({ack, body, client}) => {
    await ack();
    const channelId = body.channel?.id;
    if (!channelId) return;

    const profile = await identityResolver.resolveFromSlack(app, body.user.id);
    const reply = journey.showPeople(profile);

    await postThreadMessage(client, body, channelId, reply.text, reply.blocks);
  });

  app.action('spark_select_task', async ({ack, body, client, action}) => {
    await ack();
    const channelId = body.channel?.id;
    if (
      action.type !== 'static_select' ||
      !action.selected_option ||
      !channelId
    ) {
      return;
    }

    logger.info(`Task selected by ${body.user.id}`);

    const profile = await identityResolver.resolveFromSlack(app, body.user.id);
    const reply = journey.selectTask(profile, action.selected_option.value);

    await postThreadMessage(client, body, channelId, reply.text, reply.blocks);
  });

  app.action('spark_confirm_pr', async ({ack, body, client}) => {
    await ack();
    const channelId = body.channel?.id;
    if (!channelId) return;

    logger.info(`Contribution milestone confirmed by ${body.user.id}`);

    const profile = await identityResolver.resolveFromSlack(app, body.user.id);
    const reply = await journey.confirmTask(profile);
    const threadTs = threadTsFromBody(body);

    await postThreadMessage(client, body, channelId, reply.text, reply.blocks);

    if (threadTs) {
      await client.reactions.add({
        channel: channelId,
        timestamp: threadTs,
        name: 'tada',
      });
    }

    await postCelebrationMessage(client, profile);
  });
}

async function postCelebrationMessage(
  client: App['client'],
  profile: TeamProfile
) {
  const response = await client.conversations.list({
    types: 'public_channel,private_channel',
    limit: 200,
  });
  const celebrationChannel = response.channels?.find(
    (channel) => channel.name === 'webflow-celebrations'
  );

  if (!celebrationChannel?.id) {
    return;
  }

  await client.chat.postMessage({
    channel: celebrationChannel.id,
    text: `${profile.displayName} just opened their first contribution at Webflow! Shoutout to ${profile.buddy.name} for the buddy support.`,
  });
}

function threadTsFromBody(body: ActionBody): string | undefined {
  return 'message' in body ? body.message?.ts : undefined;
}

async function postThreadMessage(
  client: App['client'],
  body: ActionBody,
  channel: string,
  text: string,
  blocks: KnownBlock[]
) {
  const threadTs = threadTsFromBody(body);

  await client.chat.postMessage({
    channel,
    text,
    blocks,
    ...(threadTs ? {thread_ts: threadTs} : {}),
  });
}
