import type {EnvConfig} from '../config/env.js';
import {CodeownersService} from '../services/codeownersService.js';
import {CodebaseService} from '../services/codebaseService.js';
import {CanvasService} from '../services/canvasService.js';
import {ConfluenceDocsService} from '../services/confluenceDocsService.js';
import {ConfluenceSearchService} from '../services/confluenceSearchService.js';
import {ContributionGuideService} from '../services/contributionGuideService.js';
import {GitHubService} from '../services/githubService.js';
import {IdentityResolver} from '../services/identityResolver.js';
import {JiraService} from '../services/jiraService.js';
import {JourneyService} from '../services/journeyService.js';
import {LlmService} from '../services/llmService.js';
import {OnboardingPackageService} from '../services/onboardingPackageService.js';
import {SkillDiscoveryService} from '../services/skillDiscoveryService.js';
import {StatsigService} from '../services/statsigService.js';
import {TaskScannerService} from '../services/taskScannerService.js';
import type {Logger} from './logger.js';

export interface Services {
  env: EnvConfig;
  logger: Logger;
  codeowners: CodeownersService;
  codebase: CodebaseService;
  docs: ConfluenceDocsService;
  confluenceSearch: ConfluenceSearchService;
  canvas: CanvasService;
  identityResolver: IdentityResolver;
  llm: LlmService;
  github: GitHubService;
  jira: JiraService;
  skillDiscovery: SkillDiscoveryService;
  taskScanner: TaskScannerService;
  contributionGuide: ContributionGuideService;
  onboardingPackages: OnboardingPackageService;
  journey: JourneyService;
}

export function createServices(env: EnvConfig, logger: Logger): Services {
  const codeowners = new CodeownersService(env.webflowMonorepoPath, logger);
  const codebase = new CodebaseService(env.webflowMonorepoPath, logger);
  const docs = new ConfluenceDocsService(env);
  const confluenceSearch = new ConfluenceSearchService(env, logger);
  const canvas = new CanvasService(logger);
  const github = new GitHubService(env, logger);
  const jira = new JiraService(env, logger);
  const llm = new LlmService(env.anthropicApiKey, logger, env.anthropicModel, {
    github,
    jira,
  });
  const statsig = new StatsigService(env.statsigConsoleSdkKey, logger);
  const skillDiscovery = new SkillDiscoveryService();
  const taskScanner = new TaskScannerService(skillDiscovery, statsig, codebase);
  const contributionGuide = new ContributionGuideService(llm);
  const identityResolver = new IdentityResolver(env, logger, docs, codeowners);
  const onboardingPackages = new OnboardingPackageService(
    confluenceSearch,
    canvas,
    logger
  );
  const journey = new JourneyService(
    taskScanner,
    llm,
    contributionGuide,
    onboardingPackages,
    {github, jira}
  );

  return {
    env,
    logger,
    codeowners,
    codebase,
    docs,
    confluenceSearch,
    canvas,
    identityResolver,
    llm,
    github,
    jira,
    skillDiscovery,
    taskScanner,
    contributionGuide,
    onboardingPackages,
    journey,
  };
}
