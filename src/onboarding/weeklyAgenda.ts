import type {OnboardingPackage} from './types.js';

export type OnboardingWeekKey =
  | 'week1'
  | 'week2'
  | 'week3'
  | 'week4'
  | 'stretch60'
  | 'stretch90'
  | 'beyond90';

export interface OnboardingStage {
  weekKey: OnboardingWeekKey;
  daysSince: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeOnboardingWeekKey(
  pkg: OnboardingPackage | undefined,
  now: Date = new Date()
): OnboardingStage {
  if (!pkg || pkg.status !== 'published' || !pkg.publishedAt) {
    return {weekKey: 'week1', daysSince: 0};
  }

  const publishedAtMs = Date.parse(pkg.publishedAt);
  if (Number.isNaN(publishedAtMs)) {
    return {weekKey: 'week1', daysSince: 0};
  }

  const daysSince = Math.max(
    0,
    Math.floor((now.getTime() - publishedAtMs) / MS_PER_DAY)
  );

  const weekKey = bucketForDays(daysSince);
  return {weekKey, daysSince};
}

function bucketForDays(daysSince: number): OnboardingWeekKey {
  if (daysSince < 7) return 'week1';
  if (daysSince < 14) return 'week2';
  if (daysSince < 21) return 'week3';
  if (daysSince < 28) return 'week4';
  if (daysSince < 60) return 'stretch60';
  if (daysSince < 90) return 'stretch90';
  return 'beyond90';
}
