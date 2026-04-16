import type {App} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {
  buildToolAccessKey,
  HOME_CHECKLIST_ACTION_ID,
  HOME_NAV_ACTION_ID,
  HOME_TOOL_ACCESS_ACTION_ID,
  parseChecklistItemActionId,
  slugifyToolCategory,
  TOOL_CHECKBOX_CHUNK_SIZE,
} from '../../onboarding/home/index.js';
import {
  buildChecklistItemStatusKey,
  isHomeSectionId,
  isChecklistItemStatus,
} from '../../onboarding/types.js';
import type {PreparedJourneyData} from '../../services/journeyService.js';
import {
  publishHomeDashboard,
  publishPreparedHome,
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

  app.action(
    new RegExp(`^${HOME_NAV_ACTION_ID}:`),
    async ({ack, body, client, action}) => {
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

      services.journey.setActiveHomeSection(body.user.id, action.value);
      await publishPreparedHome(services, client, body.user.id, prepared);
    }
  );

  app.action(
    new RegExp(`^${HOME_CHECKLIST_ACTION_ID}:`),
    async ({ack, body, client, action}) => {
      await ack();

      if (
        action.type !== 'static_select' ||
        typeof action.action_id !== 'string' ||
        !action.selected_option?.value ||
        !isChecklistItemStatus(action.selected_option.value)
      ) {
        return;
      }

      const parsed = parseChecklistItemActionId(action.action_id);
      if (!parsed) {
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

      const checklistSection =
        prepared.onboardingPackage.sections.onboardingChecklist.sections.find(
          (section) => section.id === parsed.sectionId
        );
      if (!checklistSection || !checklistSection.items[parsed.itemIndex]) {
        return;
      }

      logger.info(
        `Home checklist updated for ${body.user.id} (${parsed.sectionId}:${parsed.itemIndex})`
      );

      services.journey.setItemStatus(
        body.user.id,
        buildChecklistItemStatusKey(parsed.sectionId, parsed.itemIndex),
        action.selected_option.value
      );

      await publishPreparedHome(services, client, body.user.id, prepared);
      await syncSharedOnboardingWorkspace(app, services, body.user.id, client);
    }
  );

  app.action(
    new RegExp(`^${HOME_TOOL_ACCESS_ACTION_ID}:`),
    async ({ack, body, client, action}) => {
      await ack();

      if (
        action.type !== 'checkboxes' ||
        !Array.isArray(action.selected_options)
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

      const selectedValues = new Set(
        action.selected_options
          .map((option) =>
            typeof option?.value === 'string' ? option.value : undefined
          )
          .filter((value): value is string => Boolean(value))
      );

      const allCategoryValues = collectToolAccessValuesForAction(
        prepared.onboardingPackage,
        typeof action.action_id === 'string' ? action.action_id : ''
      );

      services.journey.setToolAccessForKeys(
        body.user.id,
        allCategoryValues,
        selectedValues
      );

      await publishPreparedHome(services, client, body.user.id, prepared);
    }
  );
}

function collectToolAccessValuesForAction(
  onboardingPackage: PreparedJourneyData['onboardingPackage'],
  actionId: string
): string[] {
  if (!onboardingPackage) {
    return [];
  }

  const parts = actionId.split(':');
  if (parts.length < 3) {
    return [];
  }

  const categorySlug = parts[1];
  const chunkIndex = Number(parts[2]);
  if (!categorySlug || Number.isNaN(chunkIndex)) {
    return [];
  }

  const tools = onboardingPackage.sections.toolsAccess.tools.filter(
    (tool) => slugifyToolCategory(tool.category) === categorySlug
  );
  if (tools.length === 0) {
    return [];
  }

  const chunkStart = chunkIndex * TOOL_CHECKBOX_CHUNK_SIZE;
  const chunk = tools.slice(chunkStart, chunkStart + TOOL_CHECKBOX_CHUNK_SIZE);
  return chunk.map((tool) => buildToolAccessKey(tool.category, tool.tool));
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
