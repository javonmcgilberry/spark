import type {
  ContributionTask,
  ContributionTaskType,
  TeamProfile,
} from '../onboarding/types.js';
import {CodebaseService} from './codebaseService.js';
import {
  type DiscoveredSkill,
  SkillDiscoveryService,
} from './skillDiscoveryService.js';
import {StatsigService} from './statsigService.js';

/**
 * Maps a skill slug to the detection logic used to find contribution
 * opportunities in the team's codebase. Each entry here represents a
 * skill that is appropriate for a new hire's first contribution.
 *
 * When a new cleanup or migration skill is added to the monorepo:
 *   1. Add a detector here that matches the skill's slug.
 *   2. If a corresponding ContributionTaskType does not exist, add one in types.ts.
 *   3. Remove it from docs/future-task-types.md if it was tracked there.
 *
 * If a skill in this map is removed from the monorepo, SkillDiscoveryService
 * will not return it and the detector will never be called.
 */
const SKILL_DETECTORS: Record<
  string,
  {
    taskType: ContributionTaskType;
    detect: (
      profile: TeamProfile,
      codebase: CodebaseService,
      statsig: StatsigService,
      skill: DiscoveredSkill
    ) => Promise<ContributionTask[]>;
  }
> = {
  'clean-up-feature-flag': {
    taskType: 'stale-flag',
    detect: detectStaleFlags,
  },
  'migrate-styled-to-emotionStyled': {
    taskType: 'styled-migration',
    detect: detectStyledMigrations,
  },
};

export class TaskScannerService {
  constructor(
    private readonly skillDiscovery: SkillDiscoveryService,
    private readonly statsigService: StatsigService,
    private readonly codebaseService: CodebaseService
  ) {}

  async scan(profile: TeamProfile): Promise<ContributionTask[]> {
    const availableSkills = await this.skillDiscovery.listContributionSkills();
    const relevantSkills = availableSkills.filter(
      (skill) => skill.slug in SKILL_DETECTORS
    );

    const taskGroups = await Promise.all(
      relevantSkills.map((skill) => {
        const detector = SKILL_DETECTORS[skill.slug];
        return detector.detect(
          profile,
          this.codebaseService,
          this.statsigService,
          skill
        );
      })
    );

    return taskGroups.flat().slice(0, 5);
  }
}

async function detectStaleFlags(
  profile: TeamProfile,
  codebase: CodebaseService,
  statsig: StatsigService,
  skill: DiscoveredSkill
): Promise<ContributionTask[]> {
  const staleGates = await statsig.listStaleGates();
  const searchPaths = profile.keyPaths.length > 0 ? profile.keyPaths : ['.'];
  const candidates: ContributionTask[] = [];

  for (const gate of staleGates.slice(0, 60)) {
    const matches = await codebase.searchLiteralInPaths(gate.name, searchPaths);
    if (matches.length === 0) {
      continue;
    }

    candidates.push({
      id: `stale-flag:${gate.name}`,
      type: 'stale-flag',
      title: `Remove stale flag \`${gate.name}\``,
      description:
        'This gate is already disabled or archived in Statsig but still appears in the codebase.',
      rationale:
        'Real cleanup with a clear before-and-after state — a good way to learn the flag lifecycle and the review flow.',
      difficulty: 'easy',
      filePaths: matches,
      previewLines: matches.map(
        (filePath) => `Still referenced in ${filePath}`
      ),
      suggestedPurpose:
        'Remove a stale feature flag that is already disabled or archived.',
      skillCommand: `${skill.flowCommand} ${gate.name}`,
      skillName: skill.slug,
      metadata: {flagName: gate.name, status: gate.status, matches},
    });

    if (candidates.length >= 2) break;
  }

  return candidates;
}

async function detectStyledMigrations(
  profile: TeamProfile,
  codebase: CodebaseService,
  _statsig: StatsigService,
  skill: DiscoveredSkill
): Promise<ContributionTask[]> {
  if (profile.keyPaths.length === 0) return [];

  const files = await codebase.listFiles(profile.keyPaths, ['*.ts', '*.tsx']);
  const candidates: ContributionTask[] = [];

  for (const filePath of files) {
    const matches = await codebase.searchLiteralInPaths('styledDiv', [
      filePath,
    ]);
    if (matches.length === 0) continue;

    candidates.push({
      id: `styled-migration:${filePath}`,
      type: 'styled-migration',
      title: `Migrate \`styledDiv\` in \`${filePath}\``,
      description:
        'This file uses the legacy `styledDiv` utility that the codebase is actively migrating away from.',
      rationale:
        "Small, well-scoped, and directly improves code health in your team's area. The skill handles the mechanical parts.",
      difficulty: 'easy',
      filePaths: [filePath],
      previewLines: [`${filePath} uses styledDiv`],
      suggestedPurpose:
        'Migrate a file from the legacy styled utility to emotionStyled.',
      skillCommand: `${skill.flowCommand} ${filePath}`,
      skillName: skill.slug,
      metadata: {filePath},
    });

    if (candidates.length >= 2) break;
  }

  return candidates;
}
