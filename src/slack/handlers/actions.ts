import type {App, BlockAction} from '@slack/bolt';
import type {KnownBlock} from '@slack/types';
import type {Services} from '../../app/services.js';
import {isJourneyStepId, type TeamProfile} from '../../onboarding/types.js';
import {
  publishPreparedHome,
  syncSharedOnboardingWorkspace,
} from '../publishHome.js';
import {formatSlackError, hasSlackErrorCode} from '../platformError.js';
import {
  buildCelebrationShareBlocks,
  buildCelebrationShareModal,
  buildDraftEditModal,
  buildDraftReadyBlocks,
  buildDraftSetupModal,
  SPARK_CREATE_DRAFT_CALLBACK_ID,
  SPARK_EDIT_DRAFT_CALLBACK_ID,
  SPARK_OPEN_CELEBRATION_SHARE_MODAL_ACTION_ID,
  SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID,
  SPARK_OPEN_DRAFT_MODAL_ACTION_ID,
  SPARK_PUBLISH_DRAFT_ACTION_ID,
  SPARK_SHARE_CELEBRATION_CALLBACK_ID,
} from '../workflowUi.js';

export function registerActionHandlers(app: App, services: Services): void {
  const {logger, identityResolver, journey, onboardingPackages, canvas} =
    services;

  app.action<BlockAction>(
    SPARK_OPEN_DRAFT_MODAL_ACTION_ID,
    async ({ack, body, client}) => {
      await ack();
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildDraftSetupModal(),
      });
    }
  );

  app.action<BlockAction>(
    SPARK_OPEN_DRAFT_EDIT_MODAL_ACTION_ID,
    async ({ack, body, client, action}) => {
      await ack();
      if (action.type !== 'button' || !action.value) {
        return;
      }

      const pkg = onboardingPackages.getPackageForUser(action.value);
      if (!pkg || pkg.status !== 'draft') {
        return;
      }

      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildDraftEditModal(pkg),
      });
    }
  );

  app.view(
    SPARK_CREATE_DRAFT_CALLBACK_ID,
    async ({ack, body, view, client}) => {
      await ack();
      const state = view.state.values;
      const newHireId = state.new_hire?.selected_user?.selected_user;
      if (!newHireId) {
        return;
      }

      const welcomeNote = state.welcome_note?.value?.value?.trim() || undefined;
      const buddyUserId =
        state.buddy?.selected_user?.selected_user || undefined;
      const stakeholderUserIds =
        state.stakeholders?.selected_users?.selected_users ?? [];
      const profile = await identityResolver.resolveFromSlack(app, newHireId);
      const isSelfOnboarding = newHireId === body.user.id;
      const pkg = await onboardingPackages.createDraftPackage({
        profile,
        createdByUserId: body.user.id,
        welcomeNote,
        buddyUserId,
        stakeholderUserIds,
        slackClient: isSelfOnboarding ? undefined : client,
      });

      if (isSelfOnboarding && !pkg.draftChannelId) {
        const testChannel = await findTestChannel(client);
        if (testChannel) {
          pkg.draftChannelId = testChannel.id;
          pkg.draftChannelName = testChannel.name;
        }
      }

      const reviewText = `Your draft for ${profile.displayName} is ready to review.`;
      const reviewBlocks = buildDraftReadyBlocks(profile, pkg);

      if (pkg.draftChannelId) {
        await client.chat.postMessage({
          channel: pkg.draftChannelId,
          text: reviewText,
          blocks: reviewBlocks,
        });
      }

      await client.chat.postMessage({
        channel: body.user.id,
        text: reviewText,
        blocks: reviewBlocks,
      });
    }
  );

  app.view(SPARK_EDIT_DRAFT_CALLBACK_ID, async ({ack, body, view, client}) => {
    await ack();
    const newHireId = view.private_metadata;
    if (!newHireId) {
      return;
    }

    const state = view.state.values;
    const welcomeNote = state.welcome_note?.value?.value?.trim() ?? null;
    const buddyUserId = state.buddy?.selected_user?.selected_user ?? null;
    const stakeholderUserIds =
      state.stakeholders?.selected_users?.selected_users ?? [];
    const profile = await identityResolver.resolveFromSlack(app, newHireId);
    const pkg = await onboardingPackages.updateDraftPackage({
      profile,
      createdByUserId: body.user.id,
      welcomeNote,
      buddyUserId,
      stakeholderUserIds,
      slackClient: client,
    });
    if (!pkg) {
      return;
    }

    if (pkg.draftChannelId) {
      await client.chat.postMessage({
        channel: pkg.draftChannelId,
        text: `Spark refreshed the draft for ${profile.displayName}.`,
        blocks: buildDraftReadyBlocks(profile, pkg),
      });
    }

    await client.chat.postMessage({
      channel: body.user.id,
      text: `Your draft for ${profile.displayName} has been updated.`,
    });
  });

  app.action(
    SPARK_PUBLISH_DRAFT_ACTION_ID,
    async ({ack, body, client, action}) => {
      await ack();
      if (action.type !== 'button' || !action.value) {
        return;
      }

      const publishResult = onboardingPackages.publishPackage(
        action.value,
        body.user.id
      );
      if (!publishResult.ok) {
        await client.chat.postMessage({
          channel: body.user.id,
          text:
            publishResult.reason === 'not_manager'
              ? "Only the new hire's manager can publish this onboarding plan."
              : "Spark couldn't find that onboarding draft anymore.",
        });
        return;
      }

      logger.info(`Publishing onboarding package for ${action.value}`);
      const profile = await identityResolver.resolveFromSlack(
        app,
        action.value
      );
      const prepared = await journey.prepareDashboard(profile);
      if (
        prepared.onboardingPackage &&
        prepared.onboardingPackage.status === 'published'
      ) {
        await canvas.publishWorkspace(
          client,
          prepared.onboardingPackage,
          profile,
          prepared.state
        );
      }
      const reply = journey.buildStartReply(prepared);

      await client.chat.postMessage({
        channel: action.value,
        text: reply.text,
        blocks: reply.blocks,
      });

      await publishPreparedHome(services, client, action.value, prepared);

      if (body.channel?.id) {
        await client.chat.postMessage({
          channel: body.channel.id,
          text: `Spark onboarding is live for <@${action.value}>.`,
        });
      }
    }
  );

  app.action<BlockAction>(
    SPARK_OPEN_CELEBRATION_SHARE_MODAL_ACTION_ID,
    async ({ack, body, client, action}) => {
      await ack();
      if (action.type !== 'button' || !action.value) {
        return;
      }

      const profile = await identityResolver.resolveFromSlack(
        app,
        action.value
      );
      await client.views.open({
        trigger_id: body.trigger_id,
        view: buildCelebrationShareModal(
          buildCelebrationShareCopy(profile),
          action.value
        ),
      });
    }
  );

  app.view(
    SPARK_SHARE_CELEBRATION_CALLBACK_ID,
    async ({ack, body, view, client}) => {
      await ack();
      const newHireId = view.private_metadata;
      const channelId =
        view.state.values.share_destination?.selected_conversation
          ?.selected_conversation;
      if (!newHireId || !channelId) {
        return;
      }

      const profile = await identityResolver.resolveFromSlack(app, newHireId);
      const celebrationText = buildCelebrationShareCopy(profile);

      try {
        await client.chat.postMessage({
          channel: channelId,
          text: celebrationText,
        });
        await client.chat.postMessage({
          channel: body.user.id,
          text: `Shared ${profile.displayName}'s milestone in <#${channelId}>.`,
        });
      } catch (error) {
        await client.chat.postMessage({
          channel: body.user.id,
          text:
            hasSlackErrorCode(error, 'not_in_channel') ||
            hasSlackErrorCode(error, 'channel_not_found')
              ? "Spark couldn't post there yet. If it's a private channel, invite Spark first and then try again."
              : `Spark couldn't share that milestone yet. ${formatSlackError(error)}`,
        });
      }
    }
  );

  app.action<BlockAction>(
    'spark_go_to_step',
    async ({ack, body, client, action}) => {
      await ack();

      const channelId = body.channel?.id;
      if (action.type !== 'button' || !action.value || !channelId) {
        return;
      }
      if (!isJourneyStepId(action.value)) {
        return;
      }

      logger.info(`Journey step ${action.value} selected by ${body.user.id}`);

      const profile = await identityResolver.resolveFromSlack(
        app,
        body.user.id
      );
      const reply = await journey.advance(profile, action.value);

      await postThreadMessage(
        client,
        channelId,
        reply.text,
        reply.blocks,
        body.message?.ts
      );
      await syncSharedOnboardingWorkspace(app, services, body.user.id, client);
    }
  );

  app.action<BlockAction>('spark_show_people', async ({ack, body, client}) => {
    await ack();
    const channelId = body.channel?.id;
    if (!channelId) return;

    const profile = await identityResolver.resolveFromSlack(app, body.user.id);
    const reply = journey.showPeople(profile);

    await postThreadMessage(
      client,
      channelId,
      reply.text,
      reply.blocks,
      body.message?.ts
    );
  });

  app.action<BlockAction>(
    'spark_select_task',
    async ({ack, body, client, action}) => {
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

      const profile = await identityResolver.resolveFromSlack(
        app,
        body.user.id
      );
      const reply = journey.selectTask(profile, action.selected_option.value);

      await postThreadMessage(
        client,
        channelId,
        reply.text,
        reply.blocks,
        body.message?.ts
      );
    }
  );

  app.action<BlockAction>('spark_confirm_pr', async ({ack, body, client}) => {
    await ack();
    const channelId = body.channel?.id;
    if (!channelId) return;

    logger.info(`Contribution milestone confirmed by ${body.user.id}`);

    const profile = await identityResolver.resolveFromSlack(app, body.user.id);
    const reply = await journey.confirmTask(profile);

    await postThreadMessage(
      client,
      channelId,
      reply.text,
      reply.blocks,
      body.message?.ts
    );
    await syncSharedOnboardingWorkspace(app, services, body.user.id, client);

    if (body.message?.ts) {
      await client.reactions.add({
        channel: channelId,
        timestamp: body.message.ts,
        name: 'tada',
      });
    }

    await sendCelebrationDrafts(client, profile);
  });
}

async function sendCelebrationDrafts(
  client: App['client'],
  profile: TeamProfile
) {
  const recipientUserIds = Array.from(
    new Set(
      [profile.manager.slackUserId, profile.buddy.slackUserId].filter(
        (userId): userId is string => Boolean(userId)
      )
    )
  );

  for (const userId of recipientUserIds) {
    await client.chat.postMessage({
      channel: userId,
      text: buildCelebrationShareCopy(profile),
      blocks: buildCelebrationShareBlocks(
        buildCelebrationShareCopy(profile),
        profile.userId
      ),
    });
  }
}

function buildCelebrationShareCopy(profile: TeamProfile): string {
  return `${profile.displayName} just opened their first contribution at Webflow. Shoutout to ${profile.buddy.name} for the support along the way.`;
}

async function postThreadMessage(
  client: App['client'],
  channel: string,
  text: string,
  blocks: KnownBlock[],
  threadTs?: string
) {
  await client.chat.postMessage({
    channel,
    text,
    blocks,
    ...(threadTs ? {thread_ts: threadTs} : {}),
  });
}

const TEST_CHANNEL_NAME = 'spark-test';

async function findTestChannel(
  client: App['client']
): Promise<{id: string; name: string} | undefined> {
  try {
    let cursor: string | undefined;
    do {
      const result = await client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 1000,
        cursor,
      });
      const match = result.channels?.find(
        (ch) => ch.name === TEST_CHANNEL_NAME
      );
      if (match?.id && match.name) {
        return {id: match.id, name: match.name};
      }
      cursor = result.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch {
    // fall through
  }
  return undefined;
}
