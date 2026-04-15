import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {Logger} from '../app/logger.js';

const execFileAsync = promisify(execFile);

interface CodeownerEntry {
  pattern: string;
  owners: string[];
}

const TEAM_PATH_HINTS: Array<{keywords: string[]; paths: string[]}> = [
  {
    keywords: ['design', 'designer', 'frontend', 'spring', 'ux'],
    paths: [
      'public/js/designer-flux',
      'packages/systems/spring',
      'packages/systems/permissions',
    ],
  },
  {
    keywords: ['backend', 'server', 'api', 'cms', 'billing', 'auth'],
    paths: [
      'entrypoints/server',
      'packages/domains/billing',
      'packages/domains/collections',
      'packages/systems/feature-config/server',
    ],
  },
  {
    keywords: ['infra', 'platform', 'build', 'delivery', 'cloud'],
    paths: [
      'entrypoints/webflow-hud',
      'packages/tooling',
      'entrypoints/dashboard',
      'packages/systems/feature-config',
    ],
  },
];

export interface CodeownersGap {
  filePath: string;
  suggestedOwner: string;
  suggestedRule: string;
}

export class CodeownersService {
  private cachedEntries: CodeownerEntry[] | null = null;

  constructor(
    private readonly monorepoPath: string,
    private readonly logger: Logger
  ) {}

  async suggestPathsForTeam(
    teamName: string | undefined,
    githubTeamSlug?: string
  ): Promise<string[]> {
    const entries = await this.loadEntries();
    const candidates = new Set<string>();

    if (githubTeamSlug) {
      for (const entry of entries) {
        if (entry.owners.some((owner) => owner.includes(githubTeamSlug))) {
          candidates.add(this.patternToDirectory(entry.pattern));
        }
      }
    }

    if (teamName) {
      const keywords = tokenize(teamName);
      for (const entry of entries) {
        const haystack =
          `${entry.pattern} ${entry.owners.join(' ')}`.toLowerCase();
        if (keywords.some((keyword) => haystack.includes(keyword))) {
          candidates.add(this.patternToDirectory(entry.pattern));
        }
      }

      for (const hint of TEAM_PATH_HINTS) {
        if (hint.keywords.some((keyword) => keywords.includes(keyword))) {
          for (const hintPath of hint.paths) {
            candidates.add(hintPath);
          }
        }
      }
    }

    return [...candidates].filter(Boolean).slice(0, 6);
  }

  async findGitHubTeamSlug(teamName?: string): Promise<string | undefined> {
    if (!teamName) {
      return undefined;
    }

    const entries = await this.loadEntries();
    const keywords = tokenize(teamName);
    const matches = new Map<string, number>();

    for (const entry of entries) {
      for (const owner of entry.owners) {
        if (!owner.startsWith('@webflow/')) continue;
        const slug = owner.replace('@webflow/', '');
        const haystack = slug.toLowerCase();
        const score = keywords.filter((keyword) =>
          haystack.includes(keyword)
        ).length;
        if (score > 0) {
          matches.set(slug, Math.max(matches.get(slug) ?? 0, score));
        }
      }
    }

    return [...matches.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }

  async findCoverageGaps(
    paths: string[],
    suggestedOwner?: string
  ): Promise<CodeownersGap[]> {
    if (paths.length === 0) {
      return [];
    }

    try {
      const {stdout: fileStdout} = await execFileAsync(
        'git',
        ['-C', this.monorepoPath, 'ls-files', '--', ...paths],
        {timeout: 15000}
      );
      const files = fileStdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 80);

      if (files.length === 0) {
        return [];
      }

      const coBinary = path.join(this.monorepoPath, 'bin', 'co');
      const {stdout} = await execFileAsync(coBinary, ['who', '-j', ...files], {
        cwd: this.monorepoPath,
        timeout: 20000,
      });
      const parsed = JSON.parse(stdout) as Array<{
        path: string;
        owners?: string[];
      }>;
      const ownerToUse = suggestedOwner ?? '@webflow/unknown-team';

      return parsed
        .filter((entry) => !entry.owners || entry.owners.length === 0)
        .slice(0, 3)
        .map((entry) => ({
          filePath: entry.path,
          suggestedOwner: ownerToUse,
          suggestedRule: `${normalizeRulePath(entry.path)} ${ownerToUse}`,
        }));
    } catch (error) {
      this.logger.warn(
        'Unable to compute CODEOWNERS gaps automatically. Falling back to empty results.',
        error
      );
      return [];
    }
  }

  private async loadEntries(): Promise<CodeownerEntry[]> {
    if (this.cachedEntries) {
      return this.cachedEntries;
    }

    const codeownersPath = path.join(
      this.monorepoPath,
      '.github',
      'CODEOWNERS'
    );
    const contents = await readFile(codeownersPath, 'utf8');
    this.cachedEntries = contents
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [pattern, ...owners] = line.split(/\s+/);
        return {pattern, owners};
      });
    return this.cachedEntries;
  }

  private patternToDirectory(pattern: string): string {
    return pattern
      .replace(/^\//, '')
      .replace(/\/\*\*\/\*$/, '')
      .replace(/\/\*\*$/, '')
      .replace(/\/\*$/, '')
      .replace(/\*.*$/, '')
      .replace(/\/$/, '');
  }
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function normalizeRulePath(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 2) {
    return `/${filePath}`;
  }

  return `/${parts.slice(0, -1).join('/')}/**/*`;
}
