import type {App} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {publishPreparedHome} from '../publishHome.js';

export function registerCommandHandlers(app: App, services: Services): void {
  const {logger, identityResolver, journey} = services;

  app.command('/spark', async ({command, ack, respond, client}) => {
    await ack();

    logger.info(
      `/spark invoked by ${command.user_id} in ${command.channel_id}`
    );

    const profile = await identityResolver.resolveFromSlack(
      app,
      command.user_id
    );
    const prepared = await journey.prepareStart(profile, {slackClient: client});
    const reply = journey.buildStartReply(prepared);

    await client.chat.postMessage({
      channel: command.user_id,
      text: reply.text,
      blocks: reply.blocks,
    });

    await respond({
      response_type: 'ephemeral',
      text: `Hey <@${command.user_id}>! Check your DMs for your starter guide, then open Spark in the sidebar whenever you want to keep going.`,
    });

    await publishPreparedHome(services, client, command.user_id, prepared);
  });
}
