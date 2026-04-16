import {describe, expect, it} from 'vitest';
import {
  BUDDY_EXPECTATIONS,
  describeWeekForBuddy,
} from '../../src/onboarding/buddyGuide.js';
import type {OnboardingWeekKey} from '../../src/onboarding/weeklyAgenda.js';

const ONBOARDING_WEEK_KEYS: readonly OnboardingWeekKey[] = [
  'week1',
  'week2',
  'week3',
  'week4',
  'stretch60',
  'stretch90',
  'beyond90',
];

describe('BUDDY_EXPECTATIONS', () => {
  it.each(ONBOARDING_WEEK_KEYS)(
    'maps %s to a non-empty list of expectation bullets',
    (weekKey) => {
      const bullets = BUDDY_EXPECTATIONS[weekKey];
      expect(Array.isArray(bullets)).toBe(true);
      expect(bullets.length).toBeGreaterThan(0);
      for (const bullet of bullets) {
        expect(typeof bullet).toBe('string');
        expect(bullet.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it('covers every OnboardingWeekKey (drift guard)', () => {
    const covered = Object.keys(BUDDY_EXPECTATIONS).sort();
    const expected = [...ONBOARDING_WEEK_KEYS].sort();
    expect(covered).toEqual(expected);
  });
});

describe('describeWeekForBuddy', () => {
  it.each(ONBOARDING_WEEK_KEYS)(
    'returns a non-empty label for %s',
    (weekKey) => {
      const label = describeWeekForBuddy(weekKey);
      expect(typeof label).toBe('string');
      expect(label.trim().length).toBeGreaterThan(0);
    },
  );
});
