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

const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;

const JOURNEY_ROUTES: JourneyRoute[] = [
  {
    matchers: [
      {type: 'exact', values: ['', 'start', 'help']},
      {type: 'includes', values: ['onboarding']},
    ],
    syncProgress: false,
    title: 'Your onboarding plan',
    status: 'Refreshing your onboarding plan...',
    resolve: (profile, journey) => journey.start(profile),
  },
  {
    matchers: [
      {type: 'includes', values: ['people', 'buddy', 'manager', 'meet first']},
    ],
    syncProgress: false,
    title: 'People to meet',
    status: 'Pulling together the people who can help most...',
    resolve: async (profile, journey) => journey.showPeople(profile),
  },
  {
    matchers: [
      {
        type: 'includes',
        values: [
          'review requested',
          'awaiting review',
          'needs my review',
          'prs to review',
          'code review',
        ],
      },
    ],
    syncProgress: false,
    title: 'PRs to review',
    status: 'Looking up PRs that need your review...',
    resolve: (profile, journey) =>
      journey.showGitHubPullRequests(profile, {mode: 'review'}),
  },
  {
    matchers: [
      {
        type: 'includes',
        values: ['team pr', 'team prs', 'team review', 'squad prs'],
      },
    ],
    syncProgress: false,
    title: 'Team pull requests',
    status: 'Looking up PRs for your team...',
    resolve: (profile, journey) =>
      journey.showGitHubPullRequests(profile, {mode: 'team'}),
  },
  {
    matchers: [
      {
        type: 'includes',
        values: ['my pr', 'my prs', 'open pr', 'pull request', 'github pr'],
      },
    ],
    syncProgress: false,
    title: 'Your pull requests',
    status: 'Looking up your open pull requests...',
    resolve: (profile, journey) =>
      journey.showGitHubPullRequests(profile, {mode: 'mine'}),
  },
  {
    matchers: [
      {
        type: 'includes',
        values: [
          'my ticket',
          'my tickets',
          'my jira',
          'assigned to me',
          'jira ticket',
          'open ticket',
        ],
      },
    ],
    syncProgress: false,
    title: 'Your Jira tickets',
    status: 'Looking up your Jira tickets...',
    resolve: (profile, journey) => journey.showJiraTickets(profile),
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
    status: 'Getting your setup guide ready...',
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
    status: 'Pulling together your plan and resources...',
    resolve: (profile, journey) =>
      journey.advance(profile, 'day4-5-orientation'),
  },
  {
    matchers: [
      {
        type: 'includes',
        values: ['task', 'contribution', 'first pr'],
      },
    ],
    syncProgress: true,
    title: 'Starter task',
    status: 'Looking for a good first contribution...',
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
  const jiraKeyMatch = originalText.match(JIRA_KEY_PATTERN);
  if (jiraKeyMatch) {
    return {
      kind: 'reply',
      reply: await journey.showJiraTickets(profile, {
        issueKey: jiraKeyMatch[1],
      }),
      syncProgress: false,
      status: `Looking up ${jiraKeyMatch[1]}...`,
      title: `Jira ${jiraKeyMatch[1]}`,
    };
  }

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
    status: 'Thinking through the best next step...',
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
