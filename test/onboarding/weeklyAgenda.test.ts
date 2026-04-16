import {describe, expect, it} from 'vitest';
import {computeOnboardingWeekKey} from '../../src/onboarding/weeklyAgenda.js';
import type {OnboardingPackage} from '../../src/onboarding/types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function publishedPackage(publishedAt: string): OnboardingPackage {
  return {
    status: 'published',
    publishedAt,
  } as unknown as OnboardingPackage;
}

function draftPackage(): OnboardingPackage {
  return {
    status: 'draft',
  } as unknown as OnboardingPackage;
}

function daysAfter(base: Date, days: number): Date {
  return new Date(base.getTime() + days * MS_PER_DAY);
}

describe('computeOnboardingWeekKey', () => {
  const anchor = new Date('2026-01-01T00:00:00.000Z');
  const publishedAt = anchor.toISOString();

  it.each([
    {days: 0, expected: 'week1'},
    {days: 6, expected: 'week1'},
    {days: 7, expected: 'week2'},
    {days: 13, expected: 'week2'},
    {days: 14, expected: 'week3'},
    {days: 20, expected: 'week3'},
    {days: 21, expected: 'week4'},
    {days: 27, expected: 'week4'},
    {days: 28, expected: 'stretch60'},
    {days: 59, expected: 'stretch60'},
    {days: 60, expected: 'stretch90'},
    {days: 89, expected: 'stretch90'},
    {days: 90, expected: 'beyond90'},
    {days: 365, expected: 'beyond90'},
  ] as const)('day $days buckets into $expected', ({days, expected}) => {
    const stage = computeOnboardingWeekKey(
      publishedPackage(publishedAt),
      daysAfter(anchor, days)
    );
    expect(stage.weekKey).toBe(expected);
    expect(stage.daysSince).toBe(days);
  });

  it('falls back to week1 when the package is undefined', () => {
    expect(computeOnboardingWeekKey(undefined, anchor)).toEqual({
      weekKey: 'week1',
      daysSince: 0,
    });
  });

  it('falls back to week1 when the package is still a draft', () => {
    expect(computeOnboardingWeekKey(draftPackage(), anchor)).toEqual({
      weekKey: 'week1',
      daysSince: 0,
    });
  });

  it('falls back to week1 when publishedAt is missing', () => {
    const pkg = {status: 'published'} as unknown as OnboardingPackage;
    expect(computeOnboardingWeekKey(pkg, anchor)).toEqual({
      weekKey: 'week1',
      daysSince: 0,
    });
  });

  it('falls back to week1 when publishedAt is unparseable', () => {
    expect(
      computeOnboardingWeekKey(publishedPackage('not-a-date'), anchor)
    ).toEqual({weekKey: 'week1', daysSince: 0});
  });

  it('clamps daysSince at 0 when publishedAt is in the future', () => {
    const future = daysAfter(anchor, 5).toISOString();
    const stage = computeOnboardingWeekKey(publishedPackage(future), anchor);
    expect(stage.daysSince).toBe(0);
    expect(stage.weekKey).toBe('week1');
  });
});
