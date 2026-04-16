import type {OnboardingWeekKey} from './weeklyAgenda.js';

/**
 * Expectation bullets for onboarding buddies, per the Eng Onboarding Buddy
 * Guide. Keys must stay in sync with OnboardingWeekKey; a drift test in
 * buddyGuide.test.ts asserts that every week key maps to a non-empty list.
 */
export const BUDDY_EXPECTATIONS: Record<OnboardingWeekKey, string[]> = {
  week1: [
    'Welcome the new hire',
    'Pair on dev environment setup',
    'Walk through team Slack, repos, docs',
  ],
  week2: [
    'Explain sprints, code review, deploys',
    'Demo issue tracking and branching strategies',
    'Share examples of good PRs and docs',
  ],
  week3: [
    'Pair on first ticket or bug',
    'Guide through team norms in GitHub',
    'Review feedback loops (testing, CI, approvals)',
  ],
  week4: [
    'Help scope a slightly bigger task',
    'Offer context on system design and team ownership',
    'Encourage joining eng-wide syncs or groups',
  ],
  stretch60: [
    'Encourage independent work with async backup',
    'Share deployment or incident response tips',
    'Normalize asking "why" around processes',
  ],
  stretch90: [
    'Step back, but stay available',
    'Celebrate key wins and growth',
    'Share feedback with manager',
  ],
  beyond90: [
    'Step back, but stay available',
    'Celebrate key wins and growth',
    'Share feedback with manager',
  ],
};

const WEEK_HEADERS: Record<OnboardingWeekKey, string> = {
  week1: 'Week 1: Welcome and setup',
  week2: 'Week 2: Engineering workflows',
  week3: 'Week 3: First contribution',
  week4: 'Week 4: Scale-up',
  stretch60: 'Day 60: Independent work',
  stretch90: 'Day 90: Step back',
  beyond90: 'Beyond day 90: Stay available',
};

export function describeWeekForBuddy(weekKey: OnboardingWeekKey): string {
  return WEEK_HEADERS[weekKey];
}
