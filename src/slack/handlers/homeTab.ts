import type {App} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {
  buildHomeView,
  HOME_CHECKLIST_ACTION_ID,
  HOME_NAV_ACTION_ID,
  parseChecklistSectionId,
} from '../../onboarding/homeBlocks.js';
import {isHomeSectionId} from '../../onboarding/types.js';
import type {PreparedJourneyData} from '../../services/journeyService.js';
import {
  publishHomeDashboard,
  publishHomeView,
  syncSharedOnboardingWorkspace,
} from '../publishHome.js';

export function registerHomeTabHandlers(app: App, services: Services): void {
  const {logger} = services;

  app.event('app_home_opened', async ({event, client}) => {
    if (event.tab !== 'home') {
      return;
    }
    logger.info(`Publishing Spark Home tab for ${event.user}`);
    await publishHomeDashboard(app, services, event.user, client);
  });

  app.action(HOME_NAV_ACTION_ID, async ({ack, body, client, action}) => {
    await ack();

    if (
      action.type !== 'button' ||
      !action.value ||
      !isHomeSectionId(action.value)
    ) {
      return;
    }

    const prepared = await loadPublishedPreparedOrRepublish(
      app,
      services,
      client,
      body.user.id
    );
    if (!prepared?.onboardingPackage) {
      return;
    }

    const state = services.journey.setActiveHomeSection(
      body.user.id,
      action.value
    );
    await publishHomeView(
      services,
      client,
      body.user.id,
      buildHomeView(prepared.onboardingPackage, state)
    );
  });

  app.action(HOME_CHECKLIST_ACTION_ID, async ({ack, body, client, action}) => {
    await ack();

    if (action.type !== 'checkboxes') {
      return;
    }

    const sectionId = parseChecklistSectionId(action.block_id);
    if (!sectionId) {
      return;
    }

    logger.info(`Home checklist updated for ${body.user.id} (${sectionId})`);

    const prepared = await loadPublishedPreparedOrRepublish(
      app,
      services,
      client,
      body.user.id
    );
    if (!prepared?.onboardingPackage) {
      return;
    }
    const state = services.journey.setCompletedChecklistForSection(
      prepared.onboardingPackage,
      sectionId,
      action.selected_options
        .filter(hasOptionValue)
        .map((option) => option.value)
    );

    await publishHomeView(
      services,
      client,
      body.user.id,
      buildHomeView(prepared.onboardingPackage, state)
    );
    await syncSharedOnboardingWorkspace(app, services, body.user.id, client);
  });
}

async function loadPublishedPreparedOrRepublish(
  app: App,
  services: Services,
  client: App['client'],
  userId: string
): Promise<PreparedJourneyData | null> {
  const profile = await services.identityResolver.resolveFromSlack(app, userId);
  const prepared = await services.journey.prepareDashboard(profile);
  if (
    !prepared.onboardingPackage ||
    prepared.onboardingPackage.status !== 'published'
  ) {
    await publishHomeDashboard(app, services, userId, client);
    return null;
  }

  return prepared;
}

function hasOptionValue<T extends {value?: string}>(
  option: T
): option is T & {value: string} {
  return typeof option.value === 'string';
}
