import type {App} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {
  buildDraftSetupModal,
  buildSparkCommandMenuBlocks,
} from '../workflowUi.js';

export function registerCommandHandlers(app: App, services: Services): void {
  const {logger} = services;

  app.command('/spark', async ({command, ack, respond, client}) => {
    await ack();

    logger.info(
      `/spark invoked by ${command.user_id} in ${command.channel_id}`
    );

    const directTarget = parseMention(command.text);
    if (directTarget) {
      logger.info(
        `/spark routed ${command.user_id} directly into draft setup for ${directTarget}`
      );
      await client.views.open({
        trigger_id: command.trigger_id,
        view: buildDraftSetupModal(directTarget),
      });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      text: 'Use Spark to create a draft here, then review it from the draft channel or Spark Home.',
      blocks: buildSparkCommandMenuBlocks(),
    });
  });
}

function parseMention(text: string): string | undefined {
  const match = text.match(/<@([A-Z0-9]+)>/i);
  return match?.[1];
}
