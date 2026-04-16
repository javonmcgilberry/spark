import type {App} from '@slack/bolt';
import type {Services} from '../app/services.js';
import {buildHomePendingView, buildHomeView} from '../onboarding/home/index.js';
import type {PreparedJourneyData} from '../services/journeyService.js';
import {formatSlackError} from './platformError.js';

export async function publishHomeDashboard(
  app: App,
  services: Services,
  userId: string,
  client: App['client'] = app.client
): Promise<void> {
  try {
    services.logger.info(`Preparing Spark Home tab for ${userId}.`);
    const existingPackage =
      services.onboardingPackages.getPackageForUser(userId);
    const reviewerDrafts =
      services.onboardingPackages.getDraftsForReviewer(userId);
    if (!existingPackage || existingPackage.status === 'draft') {
      services.logger.info(
        `Publishing pending Spark Home state for ${userId} (package=${existingPackage?.status ?? 'none'}, drafts=${reviewerDrafts.length}).`
      );
      await publishHomeView(
        services,
        client,
        userId,
        buildHomePendingView(reviewerDrafts)
      );
      return;
    }

    const {identityResolver, journey} = services;
    const profile = await identityResolver.resolveFromSlack(app, userId);
    const prepared = await journey.prepareDashboard(profile);

    await publishPreparedHome(services, client, userId, prepared);
  } catch (error) {
    services.logger.warn(
      `Failed to prepare Spark Home tab for ${userId}.`,
      error
    );
  }
}

export async function publishPreparedHome(
  services: Pick<Services, 'logger' | 'onboardingPackages'>,
  client: App['client'],
  userId: string,
  prepared: PreparedJourneyData
): Promise<void> {
  const reviewerDrafts =
    services.onboardingPackages.getDraftsForReviewer(userId);
  const view =
    prepared.onboardingPackage &&
    prepared.onboardingPackage.status === 'published'
      ? buildHomeView(prepared.onboardingPackage, prepared.state)
      : buildHomePendingView(reviewerDrafts);
  services.logger.info(
    `Publishing Spark Home tab for ${userId} with ${view.blocks.length} blocks (section=${prepared.state.activeHomeSection}, package=${prepared.onboardingPackage?.status ?? 'pending'}).`
  );
  await publishHomeView(services, client, userId, view);
}

export async function syncSharedOnboardingWorkspace(
  app: App,
  services: Pick<
    Services,
    'logger' | 'identityResolver' | 'journey' | 'canvas'
  >,
  userId: string,
  client: App['client'] = app.client
): Promise<void> {
  try {
    const profile = await services.identityResolver.resolveFromSlack(
      app,
      userId
    );
    const prepared = await services.journey.prepareDashboard(profile);
    if (
      !prepared.onboardingPackage ||
      prepared.onboardingPackage.status !== 'published'
    ) {
      return;
    }
    await services.canvas.syncSharedProgress(
      client,
      prepared.onboardingPackage,
      prepared.state
    );
  } catch (error) {
    services.logger.warn(
      `Failed to sync shared onboarding workspace for ${userId}.`,
      error
    );
  }
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
      `Failed to publish Spark Home tab for ${userId}: ${formatSlackError(error)}`,
      error
    );
  }
}
