import type {TeamProfile} from '../onboarding/types.js';
import type {JourneyReply, JourneyService} from '../services/journeyService.js';

export type JourneyTextResult =
  | {
      kind: 'reply';
      reply: JourneyReply;
      syncProgress: boolean;
      status: string;
      title: string;
    }
  | {
      kind: 'answer';
      answer: string;
      status: string;
      title: string;
    };

type JourneyRoute = {
  matchers: JourneyMatcher[];
  syncProgress: boolean;
  title: string;
  status: string;
  resolve: (
    profile: TeamProfile,
    journey: JourneyService
  ) => Promise<JourneyReply>;
};

type JourneyMatcher =
  | {
      type: 'exact';
      values: string[];
    }
  | {
      type: 'includes';
      values: string[];
    };

const JOURNEY_ROUTES: JourneyRoute[] = [
  {
    matchers: [
      {type: 'exact', values: ['', 'start', 'help']},
      {type: 'includes', values: ['onboarding']},
    ],
    syncProgress: false,
    title: 'Spark onboarding',
    status: 'Refreshing your onboarding guide...',
    resolve: (profile, journey) => journey.start(profile),
  },
  {
    matchers: [
      {type: 'includes', values: ['people', 'buddy', 'manager', 'meet first']},
    ],
    syncProgress: false,
    title: 'People to meet',
    status: 'Pulling together the right people to meet...',
    resolve: async (profile, journey) => journey.showPeople(profile),
  },
  {
    matchers: [
      {
        type: 'includes',
        values: ['day 2', 'day 3', 'setup', 'access', 'tool', 'slack'],
      },
    ],
    syncProgress: true,
    title: 'Tools and access',
    status: 'Gathering your setup guide...',
    resolve: (profile, journey) => journey.advance(profile, 'day2-3-follow-up'),
  },
  {
    matchers: [
      {
        type: 'includes',
        values: [
          'day 4',
          'day 5',
          'doc',
          'context',
          'ritual',
          'resource',
          '30-60-90',
          '30 60 90',
          'plan',
        ],
      },
    ],
    syncProgress: true,
    title: 'Plan and resources',
    status: 'Collecting your plan and resources...',
    resolve: (profile, journey) =>
      journey.advance(profile, 'day4-5-orientation'),
  },
  {
    matchers: [
      {
        type: 'includes',
        values: ['task', 'contribution', 'first pr', 'pull request'],
      },
    ],
    syncProgress: true,
    title: 'First contribution',
    status: 'Scanning for good first contributions...',
    resolve: (profile, journey) =>
      journey.advance(profile, 'contribution-milestone'),
  },
];

export async function resolveJourneyText(
  profile: TeamProfile,
  originalText: string,
  journey: JourneyService
): Promise<JourneyTextResult> {
  const normalized = originalText.trim().toLowerCase();
  const route = JOURNEY_ROUTES.find((candidate) =>
    matchesJourneyRoute(normalized, candidate)
  );
  if (route) {
    return {
      kind: 'reply',
      reply: await route.resolve(profile, journey),
      syncProgress: route.syncProgress,
      status: route.status,
      title: route.title,
    };
  }

  return {
    kind: 'answer',
    answer: await journey.answerQuestion(profile, originalText),
    status: 'Thinking through your blocker...',
    title: 'Onboarding help',
  };
}

function matchesJourneyRoute(text: string, route: JourneyRoute): boolean {
  return route.matchers.some((matcher) =>
    matcher.type === 'exact'
      ? matcher.values.includes(text)
      : matcher.values.some((value) => text.includes(value))
  );
}
