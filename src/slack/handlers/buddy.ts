import type {App, BlockAction} from '@slack/bolt';
import type {Services} from '../../app/services.js';
import {describeWeekForBuddy} from '../../onboarding/buddyGuide.js';
import type {OnboardingPackage} from '../../onboarding/types.js';
import {computeOnboardingWeekKey} from '../../onboarding/weeklyAgenda.js';
import {actions, header, section} from '../blockKit.js';
import {SPARK_BUDDY_MARK_CHECKIN_ACTION_ID} from '../workflowUi.js';

const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;

export function registerBuddyHandlers(app: App, services: Services): void {
  const {logger, identityResolver, journey, onboardingPackages} = services;
  const recentNudges = new Map<string, number>();

  function shouldSkipDueToDedup(key: string, now: number): boolean {
    const last = recentNudges.get(key);
    if (last !== undefined && now - last < DEDUP_TTL_MS) {
      return true;
    }
    recentNudges.set(key, now);
    return false;
  }

  async function resolveHireDisplayName(hireUserId: string): Promise<string> {
    try {
      const hireProfile = await identityResolver.resolveFromSlack(
        app,
        hireUserId,
      );
      return hireProfile.displayName || hireProfile.firstName || hireUserId;
    } catch (error) {
      logger.debug(
        `Buddy nudge: could not resolve hire ${hireUserId}: ${String(error)}`,
      );
      return hireUserId;
    }
  }

  app.message(async ({message, client}) => {
    if (message.channel_type !== 'im') return;
    if (message.subtype) return;
    const buddyUserId = message.user;
    if (!buddyUserId) return;

    const packages = onboardingPackages.getPackagesWhereBuddyIs(buddyUserId);
    if (packages.length === 0) return;

    const now = Date.now();

    for (const pkg of packages) {
      const hireUserId = pkg.userId;
      if (!journey.getBuddyCheckinDue(buddyUserId, hireUserId, new Date(now))) {
        continue;
      }

      const stage = computeOnboardingWeekKey(pkg, new Date(now));
      const dedupKey = `${buddyUserId}:${hireUserId}:${stage.weekKey}`;
      if (shouldSkipDueToDedup(dedupKey, now)) {
        continue;
      }

      const bullets = journey.buildBuddyExpectationBullets(stage.weekKey);
      const hireName = await resolveHireDisplayName(hireUserId);
      const weekLabel = describeWeekForBuddy(stage.weekKey);

      await client.chat.postMessage({
        channel: buddyUserId,
        text: `Buddy check-in for ${hireName}: ${weekLabel}`,
        blocks: buildBuddyNudgeBlocks({
          pkg,
          hireName,
          weekLabel,
          bullets,
        }),
      });

      logger.info(
        `Sent buddy nudge to ${buddyUserId} for hire ${hireUserId} (${stage.weekKey})`,
      );
    }
  });

  app.action<BlockAction>(
    SPARK_BUDDY_MARK_CHECKIN_ACTION_ID,
    async ({ack, body, client, action}) => {
      await ack();
      if (action.type !== 'button' || !action.value) {
        return;
      }
      const buddyUserId = body.user.id;
      const hireUserId = action.value;

      journey.saveBuddyCheckin(buddyUserId, hireUserId);

      const pkg = onboardingPackages.getPackageForUser(hireUserId);
      const stage = pkg ? computeOnboardingWeekKey(pkg, new Date()) : undefined;
      const weekLabel = stage
        ? describeWeekForBuddy(stage.weekKey)
        : 'this week';
      const hireName = await resolveHireDisplayName(hireUserId);

      await client.chat.postMessage({
        channel: buddyUserId,
        text: `Logged ${weekLabel} check-in with ${hireName}. Next nudge in 7 days.`,
      });
    },
  );
}

function buildBuddyNudgeBlocks(params: {
  pkg: OnboardingPackage;
  hireName: string;
  weekLabel: string;
  bullets: string[];
}) {
  const {pkg, hireName, weekLabel, bullets} = params;
  const bulletLines = bullets.map((bullet) => `• ${bullet}`).join('\n');

  return [
    header(weekLabel),
    section(
      `Buddy check-in for *${hireName}*. The onboarding buddy guide suggests focusing on:\n${bulletLines}`,
    ),
    actions([
      {
        label: `Mark ${weekLabel.split(':')[0]} as checked in`,
        actionId: SPARK_BUDDY_MARK_CHECKIN_ACTION_ID,
        value: pkg.userId,
        style: 'primary',
      },
    ]),
  ];
}
