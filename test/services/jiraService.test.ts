import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {EnvConfig} from '../../src/config/env.js';
import {JiraService} from '../../src/services/jiraService.js';
import {
  createTestLogger,
  type TestLogger,
} from '../helpers/createTestLogger.js';

const BASE_ENV: EnvConfig = {
  port: 31337,
  anthropicModel: 'claude-3-5-haiku-latest',
  webflowMonorepoPath: '/tmp/webflow',
};

const CONFIGURED_ENV: EnvConfig = {
  ...BASE_ENV,
  jiraBaseUrl: 'https://webflow.atlassian.net',
  jiraApiEmail: 'spark@webflow.com',
  jiraApiToken: 'jira-token-abc',
};

function mockJsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('JiraService', () => {
  let logger: TestLogger;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = createTestLogger();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('returns false when jira env vars are missing', () => {
      const service = new JiraService(BASE_ENV, logger);

      expect(service.isConfigured()).toBe(false);
    });

    it('returns true when jira env vars are all present', () => {
      const service = new JiraService(CONFIGURED_ENV, logger);

      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('findAssignedToEmail', () => {
    it('returns an empty array when jira is not configured', async () => {
      const service = new JiraService(BASE_ENV, logger);

      const issues = await service.findAssignedToEmail('ada@webflow.com');

      expect(issues).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns an empty array when the email is blank', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);

      const issues = await service.findAssignedToEmail('');

      expect(issues).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('issues a JQL search scoped to the assignee and parses issues', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);
      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          issues: [
            {
              key: 'ABC-42',
              fields: {
                summary: 'Fix onboarding step',
                status: {name: 'In Progress'},
                priority: {name: 'Medium'},
                assignee: {displayName: 'Ada Lovelace'},
                updated: '2026-04-14T00:00:00.000Z',
              },
            },
          ],
        })
      );

      const issues = await service.findAssignedToEmail('ada@webflow.com', 5);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(requestUrl.pathname).toContain('/rest/api/3/search');
      expect(requestUrl.searchParams.get('jql')).toBe(
        'assignee = "ada@webflow.com" AND resolution = Unresolved ORDER BY updated DESC'
      );
      expect(requestUrl.searchParams.get('maxResults')).toBe('5');
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        Authorization: expect.stringMatching(/^Basic /),
      });
      expect(issues).toEqual([
        {
          key: 'ABC-42',
          summary: 'Fix onboarding step',
          status: 'In Progress',
          url: 'https://webflow.atlassian.net/browse/ABC-42',
          priority: 'Medium',
          assignee: 'Ada Lovelace',
          updated: '2026-04-14T00:00:00.000Z',
        },
      ]);
    });

    it('skips malformed issues that lack a key or summary', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);
      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          issues: [
            {fields: {summary: 'Missing key'}},
            {key: 'ABC-1', fields: {}},
            {
              key: 'ABC-2',
              fields: {summary: 'Good ticket', status: {name: 'Open'}},
            },
          ],
        })
      );

      const issues = await service.findAssignedToEmail('ada@webflow.com');

      expect(issues).toHaveLength(1);
      expect(issues[0].key).toBe('ABC-2');
    });

    it('returns an empty array and logs when the API responds with an error', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);
      fetchMock.mockResolvedValueOnce(mockJsonResponse({}, false, 500));

      const issues = await service.findAssignedToEmail('ada@webflow.com');

      expect(issues).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('HTTP 500')
      );
    });

    it('returns an empty array when fetch throws', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);
      fetchMock.mockRejectedValueOnce(new Error('network down'));

      const issues = await service.findAssignedToEmail('ada@webflow.com');

      expect(issues).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        'Jira request failed.',
        expect.any(Error)
      );
    });

    it('caches results so repeated calls do not hit the network', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);
      fetchMock.mockResolvedValue(mockJsonResponse({issues: []}));

      await service.findAssignedToEmail('ada@webflow.com');
      await service.findAssignedToEmail('ada@webflow.com');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('findByKey', () => {
    it('returns null when jira is not configured', async () => {
      const service = new JiraService(BASE_ENV, logger);

      const issue = await service.findByKey('ABC-1');

      expect(issue).toBeNull();
    });

    it('rejects malformed issue keys without making a network call', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);

      const issue = await service.findByKey('not a key');

      expect(issue).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('normalizes the key to uppercase and issues a scoped search', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);
      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          issues: [
            {
              key: 'ABC-9',
              fields: {
                summary: 'Found it',
                status: {name: 'Done'},
              },
            },
          ],
        })
      );

      const issue = await service.findByKey('abc-9');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl] = fetchMock.mock.calls[0] as [URL];
      expect(requestUrl.searchParams.get('jql')).toBe('issuekey = ABC-9');
      expect(issue?.key).toBe('ABC-9');
      expect(issue?.url).toBe('https://webflow.atlassian.net/browse/ABC-9');
    });

    it('returns null when the search returns no issues', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);
      fetchMock.mockResolvedValueOnce(mockJsonResponse({issues: []}));

      const issue = await service.findByKey('ABC-404');

      expect(issue).toBeNull();
    });
  });

  describe('findForTextQuery', () => {
    it('returns empty when query is whitespace', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);

      const issues = await service.findForTextQuery('   ');

      expect(issues).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('escapes quotes and backslashes inside the JQL text clause', async () => {
      const service = new JiraService(CONFIGURED_ENV, logger);
      fetchMock.mockResolvedValueOnce(mockJsonResponse({issues: []}));

      await service.findForTextQuery('onboarding "flow" \\path');

      const [requestUrl] = fetchMock.mock.calls[0] as [URL];
      expect(requestUrl.searchParams.get('jql')).toBe(
        'text ~ "onboarding \\"flow\\" \\\\path" ORDER BY updated DESC'
      );
    });
  });
});
