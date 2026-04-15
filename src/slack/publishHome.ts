import type {App} from '@slack/bolt';
import type {Services} from '../app/services.js';
import {buildHomeView} from '../onboarding/homeBlocks.js';
import type {PreparedJourneyData} from '../services/journeyService.js';

export async function publishHomeDashboard(
  app: App,
  services: Services,
  userId: string,
  client: App['client'] = app.client
): Promise<void> {
  try {
    services.logger.info(`Preparing Spark Home tab for ${userId}.`);
    const {identityResolver, journey} = services;
    const profile = await identityResolver.resolveFromSlack(app, userId);
    const prepared = await journey.prepareDashboard(profile, {
      slackClient: client,
    });

    await publishPreparedHome(services, client, userId, prepared);
  } catch (error) {
    services.logger.warn(
      `Failed to prepare Spark Home tab for ${userId}.`,
      error
    );
  }
}

export async function publishPreparedHome(
  services: Pick<Services, 'logger'>,
  client: App['client'],
  userId: string,
  prepared: PreparedJourneyData
): Promise<void> {
  const view = buildHomeView(prepared.profile, prepared.state);
  services.logger.info(
    `Publishing Spark Home tab for ${userId} with ${view.blocks.length} blocks.`
  );
  await publishHomeView(services, client, userId, view);
}

export async function publishHomeView(
  services: Pick<Services, 'logger'>,
  client: App['client'],
  userId: string,
  view: ReturnType<typeof buildHomeView>
): Promise<void> {
  try {
    await client.views.publish({
      user_id: userId,
      view,
    });
    services.logger.info(`Published Spark Home tab for ${userId}.`);
  } catch (error) {
    services.logger.warn(
      `Failed to publish Spark Home tab for ${userId}: ${describeSlackError(error)}`,
      error
    );
  }
}

function describeSlackError(error: unknown): string {
  const slackError = error as {
    code?: string;
    data?: {
      error?: string;
      needed?: string;
      provided?: string;
    };
  };

  if (slackError.code === 'slack_webapi_platform_error') {
    return [
      slackError.data?.error,
      slackError.data?.needed ? `needed=${slackError.data.needed}` : undefined,
      slackError.data?.provided
        ? `provided=${slackError.data.provided}`
        : undefined,
    ]
      .filter(Boolean)
      .join(', ');
  }

  return error instanceof Error ? error.message : String(error);
}
