import {promisify} from 'node:util';
import {execFile} from 'node:child_process';

const execFileAsync = promisify(execFile);

const SKILLS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface DiscoveredSkill {
  slug: string;
  flowCommand: string;
  description: string;
}

interface SkillCache {
  skills: DiscoveredSkill[];
  fetchedAt: number;
}

/**
 * Reads available AgentFlow skills from the Webflow monorepo via the gh CLI.
 * Results are cached for one hour so suggestions stay current without
 * hitting GitHub on every onboarding session.
 *
 * When a skill is added to or removed from the monorepo, the next cache
 * refresh automatically updates what Spark can suggest to new hires.
 */
export class SkillDiscoveryService {
  private cache: SkillCache | null = null;

  async listContributionSkills(): Promise<DiscoveredSkill[]> {
    if (this.cache && Date.now() - this.cache.fetchedAt < SKILLS_CACHE_TTL_MS) {
      return this.cache.skills;
    }

    const skills = await this.fetchFromGitHub();
    this.cache = {skills, fetchedAt: Date.now()};
    return skills;
  }

  private async fetchFromGitHub(): Promise<DiscoveredSkill[]> {
    const slugs = await this.listSkillSlugs();
    const results = await Promise.allSettled(
      slugs.map((slug) => this.readSkillFrontmatter(slug))
    );

    return results
      .filter(
        (result): result is PromiseFulfilledResult<DiscoveredSkill | null> =>
          result.status === 'fulfilled'
      )
      .map((result) => result.value)
      .filter((skill): skill is DiscoveredSkill => skill !== null);
  }

  private async listSkillSlugs(): Promise<string[]> {
    const {stdout} = await execFileAsync(
      'gh',
      [
        'api',
        '/repos/webflow/webflow/contents/.agentflow/skills',
        '--jq',
        '.[].name',
      ],
      {timeout: 15000}
    );
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private async readSkillFrontmatter(
    slug: string
  ): Promise<DiscoveredSkill | null> {
    const {stdout} = await execFileAsync(
      'gh',
      [
        'api',
        `/repos/webflow/webflow/contents/.agentflow/skills/${slug}/SKILL.md`,
        '--jq',
        '.content',
      ],
      {timeout: 10000}
    );

    const content = Buffer.from(stdout.trim(), 'base64').toString('utf8');
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*(.+)$/m);

    if (!nameMatch || !descMatch) {
      return null;
    }

    const flowCommand = nameMatch[1].trim();
    const description = descMatch[1].trim();

    return {slug, flowCommand, description};
  }
}
