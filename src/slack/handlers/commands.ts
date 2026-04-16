import type {App, RespondFn} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {publishPreparedHome} from '../publishHome.js';
import {
  buildDraftSetupModal,
  buildSparkCommandMenuBlocks,
} from '../workflowUi.js';

const TEST_CHANNEL_NAME = 'spark-test';

export function registerCommandHandlers(app: App, services: Services): void {
  const {logger} = services;

  app.command('/spark', async ({command, ack, respond, client}) => {
    await ack();

    logger.info(
      `/spark invoked by ${command.user_id} in ${command.channel_id}`
    );

    const subcommand = command.text.trim().toLowerCase();

    if (subcommand === 'test') {
      await handleTestMode(
        app,
        services,
        command.user_id,
        command.trigger_id,
        client,
        respond
      );
      return;
    }

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
      text: 'Create a draft here, then review it in the draft channel or Spark Home when you are ready.',
      blocks: buildSparkCommandMenuBlocks(),
    });
  });
}

async function handleTestMode(
  app: App,
  services: Services,
  userId: string,
  triggerId: string,
  client: App['client'],
  respond: RespondFn
): Promise<void> {
  const {logger} = services;

  logger.info(
    `/spark test: opening draft modal for self-onboarding (${userId})`
  );

  await client.views.open({
    trigger_id: triggerId,
    view: buildDraftSetupModal(userId),
  });
}

function parseMention(text: string): string | undefined {
  const match = text.match(/<@([A-Z0-9]+)>/i);
  return match?.[1];
}

async function findChannelByName(
  client: App['client'],
  name: string
): Promise<string | undefined> {
  try {
    let cursor: string | undefined;
    do {
      const result = await client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 1000,
        cursor,
      });
      const match = result.channels?.find((ch) => ch.name === name);
      if (match?.id) {
        return match.id;
      }
      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);
    return undefined;
  } catch {
    return undefined;
  }
}
