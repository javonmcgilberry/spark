import type {App} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {
  buildHomeView,
  HOME_CHECKLIST_ACTION_ID,
  parseChecklistSectionId,
} from '../../onboarding/homeBlocks.js';
import {publishHomeDashboard, publishHomeView} from '../publishHome.js';

export function registerHomeTabHandlers(app: App, services: Services): void {
  const {logger, identityResolver, journey} = services;

  app.event('app_home_opened', async ({event, client}) => {
    logger.info(`Publishing Spark Home tab for ${event.user}`);
    await publishHomeDashboard(app, services, event.user, client);
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

    const profile = await identityResolver.resolveFromSlack(app, body.user.id);
    const prepared = await journey.prepareDashboard(profile, {
      slackClient: client,
    });
    const state = journey.setCompletedChecklistForSection(
      prepared.profile,
      sectionId,
      action.selected_options
        .filter(hasOptionValue)
        .map((option) => option.value)
    );

    await publishHomeView(
      services,
      client,
      body.user.id,
      buildHomeView(prepared.profile, state)
    );
  });
}

function hasOptionValue<T extends {value?: string}>(
  option: T
): option is T & {value: string} {
  return typeof option.value === 'string';
}
