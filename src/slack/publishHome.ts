import type {App} from '@slack/bolt';
import type {Services} from '../app/services.js';
import {
  buildHomePendingView,
  buildHomeView,
  buildManagerSummaries,
  type ManagerHireSummary,
} from '../onboarding/home/index.js';
import type {PreparedJourneyData} from '../services/journeyService.js';
import {formatSlackError} from './platformError.js';

type ManagerSummaryServices = Pick<
  Services,
  'logger' | 'onboardingPackages' | 'journey' | 'github' | 'jira'
>;

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
      const managerSummaries = await computeManagerSummaries(
        services,
        userId,
        client
      );
      services.logger.info(
        `Publishing pending Spark Home state for ${userId} (package=${existingPackage?.status ?? 'none'}, drafts=${reviewerDrafts.length}, managerHires=${managerSummaries.length}).`
      );
      await publishHomeView(
        services,
        client,
        userId,
        buildHomePendingView(reviewerDrafts, managerSummaries)
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
  services: Pick<
    Services,
    | 'logger'
    | 'onboardingPackages'
    | 'peopleInsights'
    | 'journey'
    | 'github'
    | 'jira'
  >,
  client: App['client'],
  userId: string,
  prepared: PreparedJourneyData
): Promise<void> {
  const reviewerDrafts =
    services.onboardingPackages.getDraftsForReviewer(userId);
  const managerSummaries = await computeManagerSummaries(
    services,
    userId,
    client
  );

  if (
    !prepared.onboardingPackage ||
    prepared.onboardingPackage.status !== 'published'
  ) {
    const view = buildHomePendingView(reviewerDrafts, managerSummaries);
    services.logger.info(
      `Publishing Spark Home tab for ${userId} with ${view.blocks.length} blocks (section=${prepared.state.activeHomeSection}, package=${prepared.onboardingPackage?.status ?? 'pending'}, managerHires=${managerSummaries.length}).`
    );
    await publishHomeView(services, client, userId, view);
    return;
  }

  const peopleInsights =
    prepared.state.activeHomeSection === 'people-to-meet'
      ? await services.peopleInsights.getInsightsForPeople(
          prepared.onboardingPackage.sections.peopleToMeet.people,
          prepared.profile.teamName
        )
      : undefined;

  const view = buildHomeView(prepared.onboardingPackage, prepared.state, {
    peopleInsights,
    managerSummaries,
  });
  services.logger.info(
    `Publishing Spark Home tab for ${userId} with ${view.blocks.length} blocks (section=${prepared.state.activeHomeSection}, package=${prepared.onboardingPackage?.status ?? 'pending'}, managerHires=${managerSummaries.length}).`
  );
  await publishHomeView(services, client, userId, view);
}

async function computeManagerSummaries(
  services: ManagerSummaryServices,
  managerUserId: string,
  client: App['client']
): Promise<ManagerHireSummary[]> {
  const managed =
    services.onboardingPackages.getPackagesManagedBy(managerUserId);
  if (managed.length === 0) {
    return [];
  }

  return buildManagerSummaries(
    {
      journey: services.journey,
      logger: services.logger,
      github: services.github,
      jira: services.jira,
      resolveHireEmail: (hireUserId) => resolveHireEmail(client, hireUserId),
    },
    managed
  );
}

async function resolveHireEmail(
  client: App['client'],
  hireUserId: string
): Promise<string | undefined> {
  const response = await client.users.info({user: hireUserId});
  return response.user?.profile?.email ?? undefined;
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
