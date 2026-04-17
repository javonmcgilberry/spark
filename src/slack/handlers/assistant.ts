import {Assistant, type App} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {APP_NAME} from '../../config/constants.js';
import {
  computeLiveSignals,
  type LiveSignalContext,
} from '../../onboarding/liveSignals.js';
import {computeOnboardingWeekKey} from '../../onboarding/weeklyAgenda.js';
import type {
  ConversationHistoryTurn,
  SuggestedPrompt,
} from '../../services/journeyService.js';
import {resolveJourneyText} from '../journeyText.js';
import {publishPreparedHome} from '../publishHome.js';

const HISTORY_LIMIT = 10;
const MAX_PROMPT_PILLS = 4;
const JOINED_CHANNEL_TTL_MS = 10 * 60 * 1000;

interface JoinedChannelCacheEntry {
  channels: Set<string>;
  expiresAt: number;
}

const joinedChannelCache = new Map<string, JoinedChannelCacheEntry>();

export function registerAssistantHandlers(app: App, services: Services): void {
  const {logger, identityResolver, journey, onboardingPackages} = services;

  app.assistant(
    new Assistant({
      threadStarted: async ({
        event,
        client,
        setSuggestedPrompts,
        setTitle,
        setStatus,
        say,
      }) => {
        const userId = event.assistant_thread.user_id;
        logger.info(`Assistant thread started for ${userId}`);

        await setStatus({
          status: 'Getting your onboarding plan ready...',
          loading_messages: [
            'Looking up your team',
            'Pulling together your plan',
            `Getting ${APP_NAME} ready`,
          ],
        });

        const profile = await identityResolver.resolveFromSlack(app, userId);
        const prepared = await journey.prepareStart(profile);
        const reply = journey.buildStartReply(prepared);
        const stage = computeOnboardingWeekKey(prepared.onboardingPackage);
        const joinedSlackChannels = await getJoinedChannelsCached(
          client,
          userId,
          services.logger
        );

        const signalContext: LiveSignalContext = {
          profile,
          state: prepared.state,
          onboardingPackage: prepared.onboardingPackage,
          stage,
          joinedSlackChannels,
          github: services.github,
          jira: services.jira,
          logger: services.logger,
        };

        await setTitle(`${APP_NAME} for ${profile.firstName}`);
        await setSuggestedPrompts(
          await pickPromptsForTurn(null, signalContext)
        );
        await say({
          text: reply.text,
          blocks: reply.blocks,
        });
        await publishPreparedHome(services, client, userId, prepared);
      },
      userMessage: async ({
        message,
        client,
        setStatus,
        setTitle,
        setSuggestedPrompts,
        say,
        sayStream,
      }) => {
        if (message.subtype || !message.user) {
          return;
        }

        const text = message.text ?? '';
        const profile = await identityResolver.resolveFromSlack(
          app,
          message.user
        );

        const history = await fetchThreadHistory(
          client,
          message.channel,
          message.thread_ts ?? message.ts
        );

        const pkg = onboardingPackages.getPackageForUser(message.user);
        const stage = computeOnboardingWeekKey(pkg);
        const joinedSlackChannels = await getJoinedChannelsCached(
          client,
          message.user,
          services.logger
        );

        const response = await resolveJourneyText(profile, text, journey, {
          history,
          onboardingStage: stage,
          joinedSlackChannels,
        });

        await setTitle(response.title);

        const signalContext: LiveSignalContext = {
          profile,
          state: journey.getState(profile.userId),
          onboardingPackage: pkg,
          stage,
          joinedSlackChannels,
          github: services.github,
          jira: services.jira,
          logger: services.logger,
        };

        if (response.kind === 'reply') {
          await setStatus(response.status);
          await say({
            text: response.reply.text,
            blocks: response.reply.blocks,
          });
          await setSuggestedPrompts(
            await pickPromptsForTurn(null, signalContext)
          );
          return;
        }

        await setStatus({
          status: response.status,
          loading_messages: [
            'Thinking through your question',
            'Grounding the answer in your onboarding',
            'Putting together a clear next step',
          ],
        });

        const stream = sayStream({buffer_size: 96});
        for (const chunk of chunkMarkdown(response.answer)) {
          await stream.append({markdown_text: chunk});
        }
        await stream.stop();

        // setSuggestedPrompts AFTER stopStream per Slack canonical order.
        await setSuggestedPrompts(
          await pickPromptsForTurn(response.suggestedPrompts, signalContext)
        );
      },
    })
  );
}

export async function pickPromptsForTurn(
  agentPrompts: SuggestedPrompt[] | null,
  ctx: LiveSignalContext
): Promise<{title: string; prompts: SuggestedPrompt[]}> {
  if (agentPrompts && agentPrompts.length > 0) {
    return {
      title: 'Try one of these next',
      prompts: agentPrompts.slice(0, MAX_PROMPT_PILLS),
    };
  }
  const signals = await computeLiveSignals(ctx);
  return {
    title: 'Try one of these next',
    prompts: signals.map(({title, message}) => ({title, message})),
  };
}

export async function fetchThreadHistory(
  client: App['client'],
  channel: string | undefined,
  threadTs: string | undefined
): Promise<ConversationHistoryTurn[]> {
  if (!channel || !threadTs) {
    return [];
  }

  try {
    const response = await client.conversations.replies({
      channel,
      ts: threadTs,
      oldest: threadTs,
      limit: HISTORY_LIMIT,
    });

    const messages = response.messages ?? [];
    return messages
      .slice(0, -1) // exclude the current user message we are about to answer
      .map((m) => ({
        role: (m.bot_id ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.text ?? '',
      }))
      .filter((turn) => turn.content.trim().length > 0)
      .slice(-HISTORY_LIMIT);
  } catch {
    // If history lookup fails, fall back to zero-shot.
    return [];
  }
}

export async function fetchJoinedChannels(
  client: App['client'],
  userId: string
): Promise<Set<string>> {
  const joined = new Set<string>();
  let cursor: string | undefined;
  // Guard against pathological pagination.
  const MAX_PAGES = 10;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await client.users.conversations({
      user: userId,
      types: 'public_channel,private_channel',
      limit: 200,
      exclude_archived: true,
      cursor,
    });
    const channels = response.channels ?? [];
    for (const channel of channels) {
      if (channel.name) {
        joined.add(channel.name.toLowerCase());
      }
    }
    cursor = response.response_metadata?.next_cursor;
    if (!cursor) {
      break;
    }
  }
  return joined;
}

async function getJoinedChannelsCached(
  client: App['client'],
  userId: string,
  logger: Services['logger']
): Promise<Set<string> | undefined> {
  const now = Date.now();
  const cached = joinedChannelCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.channels;
  }
  try {
    const channels = await fetchJoinedChannels(client, userId);
    joinedChannelCache.set(userId, {
      channels,
      expiresAt: now + JOINED_CHANNEL_TTL_MS,
    });
    return channels;
  } catch (error) {
    logger.warn(
      `Failed to fetch joined channels for ${userId}; answering without join-state.`,
      error
    );
    return undefined;
  }
}

/**
 * Test-only: clear the joined-channel TTL cache. Not exported from the
 * package barrel.
 */
export function _resetJoinedChannelCacheForTests(): void {
  joinedChannelCache.clear();
}

function chunkMarkdown(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return ["I didn't get a response that time. Try asking again."];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs.map((paragraph, index) =>
      index === paragraphs.length - 1 ? paragraph : `${paragraph}\n\n`
    );
  }

  return [normalized];
}
