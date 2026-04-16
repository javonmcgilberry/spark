import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {EnvConfig} from '../../src/config/env.js';
import {
  createTestLogger,
  type TestLogger,
} from '../helpers/createTestLogger.js';

const searchMock = vi.fn();
const octokitCtorMock = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    search = {issuesAndPullRequests: searchMock};
    constructor(options: unknown) {
      octokitCtorMock(options);
    }
  },
}));

const {GitHubService} = await import('../../src/services/githubService.js');

const UNCONFIGURED_ENV: EnvConfig = {
  port: 31337,
  anthropicModel: 'claude-3-5-haiku-latest',
  webflowMonorepoPath: '/tmp/webflow',
};

const CONFIGURED_ENV: EnvConfig = {
  ...UNCONFIGURED_ENV,
  githubToken: 'ghp_test_token',
};

interface SearchItem {
  number: number;
  title: string;
  html_url: string;
  state: string;
  user: {login: string} | null;
  repository_url: string;
  updated_at: string;
  draft?: boolean;
}

function buildSearchResponse(items: SearchItem[]) {
  return {data: {items}};
}

describe('GitHubService', () => {
  let logger: TestLogger;

  beforeEach(() => {
    logger = createTestLogger();
    searchMock.mockReset();
    octokitCtorMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isConfigured', () => {
    it('returns false when no github token is set', () => {
      const service = new GitHubService(UNCONFIGURED_ENV, logger);

      expect(service.isConfigured()).toBe(false);
    });

    it('returns true and constructs an Octokit client when configured', () => {
      const service = new GitHubService(CONFIGURED_ENV, logger);

      expect(service.isConfigured()).toBe(true);
      expect(octokitCtorMock).toHaveBeenCalledWith(
        expect.objectContaining({auth: 'ghp_test_token'})
      );
    });
  });

  describe('findOpenPullRequestsForUser', () => {
    it('returns an empty list when unconfigured without hitting the network', async () => {
      const service = new GitHubService(UNCONFIGURED_ENV, logger);

      const prs = await service.findOpenPullRequestsForUser('ada');

      expect(prs).toEqual([]);
      expect(searchMock).not.toHaveBeenCalled();
    });

    it('returns an empty list when the github username is blank', async () => {
      const service = new GitHubService(CONFIGURED_ENV, logger);

      const prs = await service.findOpenPullRequestsForUser('');

      expect(prs).toEqual([]);
      expect(searchMock).not.toHaveBeenCalled();
    });

    it('issues the correct author-scoped search query and parses PRs', async () => {
      const service = new GitHubService(CONFIGURED_ENV, logger);
      searchMock.mockResolvedValueOnce(
        buildSearchResponse([
          {
            number: 101,
            title: 'Initial onboarding fix',
            html_url: 'https://github.com/webflow/webflow/pull/101',
            state: 'open',
            user: {login: 'ada'},
            repository_url: 'https://api.github.com/repos/webflow/webflow',
            updated_at: '2026-04-14T08:00:00Z',
            draft: false,
          },
        ])
      );

      const prs = await service.findOpenPullRequestsForUser('ada', 5);

      expect(searchMock).toHaveBeenCalledWith({
        q: 'is:pr is:open author:ada org:webflow',
        per_page: 5,
        sort: 'updated',
        order: 'desc',
      });
      expect(prs).toEqual([
        {
          number: 101,
          title: 'Initial onboarding fix',
          url: 'https://github.com/webflow/webflow/pull/101',
          state: 'open',
          author: 'ada',
          repository: 'webflow/webflow',
          updatedAt: '2026-04-14T08:00:00Z',
          draft: false,
        },
      ]);
    });

    it('falls back to "unknown" author when the user is missing', async () => {
      const service = new GitHubService(CONFIGURED_ENV, logger);
      searchMock.mockResolvedValueOnce(
        buildSearchResponse([
          {
            number: 5,
            title: 'Anonymous PR',
            html_url: 'https://github.com/webflow/webflow/pull/5',
            state: 'open',
            user: null,
            repository_url: 'https://api.github.com/repos/webflow/webflow',
            updated_at: '2026-04-14T08:00:00Z',
          },
        ])
      );

      const [pr] = await service.findOpenPullRequestsForUser('ada');

      expect(pr.author).toBe('unknown');
    });

    it('caches the result and reuses it on the next call', async () => {
      const service = new GitHubService(CONFIGURED_ENV, logger);
      searchMock.mockResolvedValueOnce(buildSearchResponse([]));

      await service.findOpenPullRequestsForUser('ada');
      await service.findOpenPullRequestsForUser('ada');

      expect(searchMock).toHaveBeenCalledTimes(1);
    });

    it('returns an empty list and logs when the search throws', async () => {
      const service = new GitHubService(CONFIGURED_ENV, logger);
      searchMock.mockRejectedValueOnce(new Error('rate limited'));

      const prs = await service.findOpenPullRequestsForUser('ada');

      expect(prs).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('GitHub search failed'),
        expect.any(Error)
      );
    });
  });

  describe('findPullRequestsAwaitingReview', () => {
    it('uses the review-requested qualifier', async () => {
      const service = new GitHubService(CONFIGURED_ENV, logger);
      searchMock.mockResolvedValueOnce(buildSearchResponse([]));

      await service.findPullRequestsAwaitingReview('ada');

      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'is:pr is:open review-requested:ada org:webflow',
        })
      );
    });
  });

  describe('findRecentPullRequestsForTeam', () => {
    it('uses the team-review-requested qualifier with the org prefix', async () => {
      const service = new GitHubService(CONFIGURED_ENV, logger);
      searchMock.mockResolvedValueOnce(buildSearchResponse([]));

      await service.findRecentPullRequestsForTeam('frontend-eng');

      expect(searchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'is:pr is:open team-review-requested:webflow/frontend-eng org:webflow',
        })
      );
    });

    it('returns an empty list when the team slug is blank', async () => {
      const service = new GitHubService(CONFIGURED_ENV, logger);

      const prs = await service.findRecentPullRequestsForTeam('');

      expect(prs).toEqual([]);
      expect(searchMock).not.toHaveBeenCalled();
    });
  });
});
