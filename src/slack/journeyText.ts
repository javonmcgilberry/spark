import type {App} from '@slack/bolt';
import type {TeamProfile} from '../onboarding/types.js';
import type {JourneyReply, JourneyService} from '../services/journeyService.js';

export type JourneyTextResult =
  | {
      kind: 'reply';
      reply: JourneyReply;
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
  title: string;
  status: string;
  resolve: (
    profile: TeamProfile,
    journey: JourneyService,
    slackClient?: App['client']
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
    title: 'Spark onboarding',
    status: 'Refreshing your onboarding guide...',
    resolve: (profile, journey, slackClient) =>
      journey.start(profile, {slackClient}),
  },
  {
    matchers: [
      {type: 'includes', values: ['people', 'buddy', 'manager', 'meet first']},
    ],
    title: 'People to meet',
    status: 'Pulling together the right people to meet...',
    resolve: async (profile, journey) => journey.showPeople(profile),
  },
  {
    matchers: [
      {type: 'includes', values: ['day 2', 'day 3', 'setup', 'access', 'tool']},
    ],
    title: 'Tools and access',
    status: 'Gathering your setup guide...',
    resolve: (profile, journey) => journey.advance(profile, 'day2-3-follow-up'),
  },
  {
    matchers: [
      {
        type: 'includes',
        values: ['day 4', 'day 5', 'doc', 'channel', 'context', 'ritual'],
      },
    ],
    title: 'Docs and context',
    status: 'Collecting your docs and context...',
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
    title: 'First contribution',
    status: 'Scanning for good first contributions...',
    resolve: (profile, journey) =>
      journey.advance(profile, 'contribution-milestone'),
  },
];

export async function resolveJourneyText(
  profile: TeamProfile,
  originalText: string,
  journey: JourneyService,
  slackClient?: App['client']
): Promise<JourneyTextResult> {
  const normalized = originalText.trim().toLowerCase();
  const route = JOURNEY_ROUTES.find((candidate) =>
    matchesJourneyRoute(normalized, candidate)
  );
  if (route) {
    return {
      kind: 'reply',
      reply: await route.resolve(profile, journey, slackClient),
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
