import type {OnboardingPackage} from '../../lib/types';

/**
 * Fixture package that mirrors the shape the Spark bot produces. Used by
 * component tests + integration tests. Keep field values obviously fake
 * so snapshots can tell fixtures apart from real data.
 */
export function fixturePackage(
  overrides: Partial<OnboardingPackage> = {}
): OnboardingPackage {
  return {
    userId: 'U_FIXTURE_HIRE',
    status: 'draft',
    createdByUserId: 'U_FIXTURE_MGR',
    managerUserId: 'U_FIXTURE_MGR',
    reviewerUserIds: ['U_FIXTURE_MGR', 'U_FIXTURE_BUDDY'],
    welcomeNote: 'Welcome to the team. Excited to have you.',
    buddyUserId: 'U_FIXTURE_BUDDY',
    customChecklistItems: [],
    createdAt: '2026-04-14T10:00:00.000Z',
    updatedAt: '2026-04-15T12:00:00.000Z',
    sections: {
      welcome: {
        title: 'Welcome to Webflow',
        intro: 'Here is your first day guide.',
        personalizedNote: 'Welcome to the team. Excited to have you.',
        onboardingPocs: [],
        journeyMilestones: [],
      },
      onboardingChecklist: {
        title: 'Onboarding checklist',
        intro: 'Work through these across your first month.',
        sections: [
          {
            id: 'week-1',
            title: 'Week 1',
            goal: 'Get set up and meet the team.',
            items: [
              {
                label: 'Install GitHub',
                kind: 'task',
                notes: 'Use the Webflow install doc.',
              },
              {
                label: 'Meet your buddy',
                kind: 'live-training',
                notes: '30 minutes.',
              },
            ],
          },
          {
            id: 'week-2',
            title: 'Week 2',
            goal: 'Learn engineering workflows.',
            items: [
              {
                label: 'Read the Codex',
                kind: 'reading',
                notes: '2 hours.',
              },
            ],
          },
        ],
      },
      peopleToMeet: {
        title: 'People to meet',
        intro: 'Schedule 1:1s in the first two weeks.',
        people: [
          {
            name: 'Grace Hopper',
            role: 'Engineering Manager',
            discussionPoints: 'Priorities and expectations.',
            weekBucket: 'week1-2',
            slackUserId: 'U_FIXTURE_MGR',
            kind: 'manager',
          },
          {
            name: 'Lin Clark',
            role: 'Onboarding Buddy',
            discussionPoints: 'Codebase tour and team norms.',
            weekBucket: 'week1-2',
            slackUserId: 'U_FIXTURE_BUDDY',
            kind: 'buddy',
          },
        ],
      },
      toolsAccess: {title: 'Tools', intro: 'Access to these:', tools: []},
      slack: {title: 'Slack', intro: 'Join these channels:', channels: []},
      initialEngineeringTasks: {
        title: 'First contribution',
        intro: 'Pick a starter task:',
        managerPrompt: 'Review these with your new hire in week 3.',
        tasks: [
          {
            id: 'task-1',
            type: 'styled-migration',
            title: 'Migrate NavCard.tsx',
            description: 'Swap styledDiv for emotionStyled.',
            rationale: 'Small contained UI cleanup.',
            difficulty: 'easy',
            filePaths: ['packages/frontend/navigation/NavCard.tsx'],
            previewLines: [],
            suggestedPurpose: 'Learn the PR flow.',
            skillCommand: 'migrate-styled-to-emotionStyled',
            skillName: 'migrate-styled-to-emotionStyled',
            metadata: {},
          },
        ],
      },
      rituals: {
        title: 'Rituals',
        intro: 'Team cadences:',
        rituals: [],
      },
      engineeringResourceLibrary: {
        title: 'Resource library',
        intro: 'Key docs:',
        docs: [],
        references: {},
        keyPaths: [],
      },
    },
    ...overrides,
  };
}
