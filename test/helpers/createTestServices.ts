import type {App} from '@slack/bolt';
import type {Services} from '../../src/app/services.js';
import type {Logger} from '../../src/app/logger.js';
import {
  buildChecklist,
  buildDefaultChannels,
  buildDefaultRituals,
  buildDefaultTools,
} from '../../src/onboarding/catalog.js';
import type {
  ConfluenceLink,
  ContributionTask,
  OnboardingPerson,
  OnboardingReferences,
  TeamProfile,
} from '../../src/onboarding/types.js';
import {CodeownersService} from '../../src/services/codeownersService.js';
import {CodebaseService} from '../../src/services/codebaseService.js';
import {CanvasService} from '../../src/services/canvasService.js';
import {ConfluenceDocsService} from '../../src/services/confluenceDocsService.js';
import {ConfluenceSearchService} from '../../src/services/confluenceSearchService.js';
import {ContributionGuideService} from '../../src/services/contributionGuideService.js';
import {IdentityResolver} from '../../src/services/identityResolver.js';
import {JourneyService} from '../../src/services/journeyService.js';
import {LlmService} from '../../src/services/llmService.js';
import {OnboardingPackageService} from '../../src/services/onboardingPackageService.js';
import {SkillDiscoveryService} from '../../src/services/skillDiscoveryService.js';
import {StatsigService} from '../../src/services/statsigService.js';
import {TaskScannerService} from '../../src/services/taskScannerService.js';

export interface TestServicesBundle {
  profile: TeamProfile;
  services: Services;
  tasks: ContributionTask[];
}

interface CreateTestServicesOptions {
  profile?: TeamProfile;
  tasks?: ContributionTask[];
}

export function createTestServices(
  options: CreateTestServicesOptions = {}
): TestServicesBundle {
  const profile = options.profile ?? createTestProfile();
  const tasks = (options.tasks ?? createDefaultTasks()).map(cloneTask);
  const env = createTestEnv();
  const logger = createTestLogger();
  const codeowners = new CodeownersService(env.webflowMonorepoPath, logger);
  const codebase = new CodebaseService(env.webflowMonorepoPath, logger);
  const docs = new ConfluenceDocsService(env);
  const canvas = new CanvasService(logger);
  const confluenceSearch = new TestConfluenceSearchService(
    env,
    logger,
    profile
  );
  const llm = new LlmService(undefined, logger);
  const skillDiscovery = new SkillDiscoveryService();
  const statsig = new StatsigService(env.statsigConsoleSdkKey, logger);
  const taskScanner = new FixedTaskScannerService(
    tasks,
    skillDiscovery,
    statsig,
    codebase
  );
  const contributionGuide = new ContributionGuideService(llm);
  const onboardingPackages = new OnboardingPackageService(
    confluenceSearch,
    canvas,
    logger
  );
  const journey = new JourneyService(
    taskScanner,
    llm,
    contributionGuide,
    onboardingPackages
  );
  const identityResolver = new TestIdentityResolver(
    env,
    logger,
    docs,
    codeowners,
    profile
  );

  const services: Services = {
    env,
    logger,
    codeowners,
    codebase,
    docs,
    confluenceSearch,
    canvas,
    identityResolver,
    llm,
    skillDiscovery,
    taskScanner,
    contributionGuide,
    onboardingPackages,
    journey,
  };

  return {
    profile,
    services,
    tasks,
  };
}

function createTestProfile(): TeamProfile {
  return {
    userId: 'UADA123',
    firstName: 'Ada',
    displayName: 'Ada Lovelace',
    email: 'ada@webflow.com',
    teamName: 'Frontend Engineering',
    pillarName: 'Core Experience',
    githubTeamSlug: 'frontend-eng',
    roleTrack: 'frontend',
    manager: {
      name: 'Grace Hopper',
      role: 'Engineering Manager',
      discussionPoints:
        'Role expectations, support rhythms, and first-month priorities.',
      kind: 'manager',
      editableBy: 'manager',
      weekBucket: 'week1-2',
      email: 'grace@webflow.com',
      slackUserId: 'UMGR123',
    },
    buddy: {
      name: 'Lin Clark',
      role: 'Onboarding Buddy',
      discussionPoints:
        'Day-to-day questions, codebase context, and debugging habits.',
      kind: 'buddy',
      editableBy: 'manager',
      weekBucket: 'week1-2',
      email: 'lin@webflow.com',
      slackUserId: 'UBUD123',
    },
    teammates: [
      {
        name: 'Riley Chen',
        role: 'Product Manager',
        discussionPoints: 'Roadmap context and product tradeoffs.',
        kind: 'pm',
        editableBy: 'manager',
        weekBucket: 'week2-3',
        email: 'riley@webflow.com',
        slackUserId: 'UPM123',
      },
      {
        name: 'Olivia Taylor',
        role: 'Product Designer',
        discussionPoints: 'Design intent and handoff expectations.',
        kind: 'designer',
        editableBy: 'manager',
        weekBucket: 'week2-3',
        email: 'olivia@webflow.com',
        slackUserId: 'UDES123',
      },
    ],
    docs: [
      {
        id: 'developer-onboarding',
        title: 'Developer Onboarding',
        description: 'Primary onboarding guide.',
        url: 'https://example.com/developer-onboarding',
        source: 'static',
      },
    ],
    keyPaths: ['packages/frontend/navigation'],
    recommendedChannels: buildDefaultChannels(),
    tools: buildDefaultTools(),
    rituals: buildDefaultRituals(),
    checklist: buildChecklist(),
  };
}

function createDefaultTasks(): ContributionTask[] {
  return [
    {
      id: 'styled-migration:packages/frontend/navigation/NavCard.tsx',
      type: 'styled-migration',
      title: 'Migrate `styledDiv` in `NavCard.tsx`',
      description:
        'Replace the legacy styling helper in the card component that powers the onboarding navigation.',
      rationale:
        'This is a contained UI cleanup with a straightforward before-and-after state.',
      difficulty: 'easy',
      filePaths: ['packages/frontend/navigation/NavCard.tsx'],
      previewLines: [
        'const Wrapper = styledDiv({',
        '  display: "flex",',
        '});',
      ],
      suggestedPurpose:
        'Move a single component off the legacy styling helper to the modern path.',
      skillCommand:
        'migrate-styled-to-emotionStyled packages/frontend/navigation/NavCard.tsx',
      skillName: 'migrate-styled-to-emotionStyled',
      metadata: {
        filePath: 'packages/frontend/navigation/NavCard.tsx',
      },
    },
    {
      id: 'stale-flag:ff-test-welcome-banner',
      type: 'stale-flag',
      title: 'Remove stale flag `ff-test-welcome-banner`',
      description:
        'Delete a disabled welcome-banner flag that still appears in the new-hire flow.',
      rationale:
        'Flag cleanup is production-adjacent but still easy to review and validate.',
      difficulty: 'easy',
      filePaths: ['packages/frontend/onboarding/WelcomeBanner.tsx'],
      previewLines: [
        'if (statsig.checkGate("ff-test-welcome-banner")) {',
        '  return <WelcomeBanner />;',
        '}',
      ],
      suggestedPurpose:
        'Remove a feature flag that no longer changes runtime behavior.',
      skillCommand: 'clean-up-feature-flag ff-test-welcome-banner',
      skillName: 'clean-up-feature-flag',
      metadata: {
        flagName: 'ff-test-welcome-banner',
        status: 'disabled',
      },
    },
  ];
}

function cloneTask(task: ContributionTask): ContributionTask {
  return {
    ...task,
    filePaths: [...task.filePaths],
    previewLines: [...task.previewLines],
    metadata: {...task.metadata},
  };
}

function createTestLogger(): Logger {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };
}

function personIdentifier(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name).toLowerCase();
}

function createTestEnv() {
  return {
    anthropicApiKey: undefined,
    anthropicModel: undefined,
    confluenceApiToken: undefined,
    confluenceBaseUrl: 'https://example.atlassian.net/wiki',
    dxWarehouseDsn: undefined,
    port: 31337,
    slackAppToken: 'xapp-test',
    slackBotToken: 'xoxb-test',
    statsigConsoleSdkKey: undefined,
    webflowMonorepoPath: '/Users/javonmcgilberry/webflow',
  };
}

class FixedTaskScannerService extends TaskScannerService {
  constructor(
    private readonly tasks: ContributionTask[],
    skillDiscovery: SkillDiscoveryService,
    statsig: StatsigService,
    codebase: CodebaseService
  ) {
    super(skillDiscovery, statsig, codebase);
  }

  override async scan(_profile: TeamProfile): Promise<ContributionTask[]> {
    return this.tasks.map(cloneTask);
  }
}

class TestIdentityResolver extends IdentityResolver {
  constructor(
    env: Services['env'],
    logger: Logger,
    docs: ConfluenceDocsService,
    codeowners: CodeownersService,
    private readonly profile: TeamProfile
  ) {
    super(env, logger, docs, codeowners);
  }

  override async resolveFromEmail(
    email: string,
    _slackClient?: App['client']
  ): Promise<TeamProfile> {
    if (email !== this.profile.email) {
      throw new Error(`Unknown test email: ${email}`);
    }

    return this.profile;
  }

  override async resolveFromSlack(
    _app: App,
    userId: string
  ): Promise<TeamProfile> {
    if (userId !== this.profile.userId) {
      throw new Error(`Unknown test Slack user: ${userId}`);
    }

    return this.profile;
  }
}

class TestConfluenceSearchService extends ConfluenceSearchService {
  constructor(
    env: Services['env'],
    logger: Logger,
    private readonly profile: TeamProfile
  ) {
    super(env, logger);
  }

  override async findOnboardingPages(
    _profile: TeamProfile
  ): Promise<ConfluenceLink[]> {
    return [
      {
        title: 'Developer Onboarding',
        url: 'https://example.com/developer-onboarding',
        summary: 'Primary onboarding guide.',
      },
    ];
  }

  override async findOnboardingReferences(
    _profile: TeamProfile
  ): Promise<OnboardingReferences> {
    return {
      teamPage: {
        title: `${this.profile.teamName} team page`,
        url: 'https://example.com/team-page',
        summary: 'Team ownership and context.',
      },
      pillarPage: this.profile.pillarName
        ? {
            title: `${this.profile.pillarName} pillar page`,
            url: 'https://example.com/pillar-page',
            summary: 'Pillar priorities and partners.',
          }
        : undefined,
      newHireGuide: {
        title: 'New hire guide',
        url: 'https://example.com/new-hire-guide',
        summary: 'Shared onboarding expectations.',
      },
    };
  }

  override async findPeopleGuides(
    _profile: TeamProfile,
    people: OnboardingPerson[]
  ): Promise<Record<string, ConfluenceLink>> {
    return Object.fromEntries(
      people.map((person) => [
        personIdentifier(person),
        {
          title: `${person.name} guide`,
          url: `https://example.com/people/${personIdentifier(person)}`,
          summary: `${person.name}'s onboarding context.`,
        },
      ])
    );
  }
}
