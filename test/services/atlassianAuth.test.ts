import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {makeJiraClient} from '../../lib/services/jira';
import {makeConfluenceClient} from '../../lib/services/confluence';
import {createSilentLogger} from '../../lib/ctx';

/**
 * These tests pin the contract that Atlassian auth email comes from
 * the viewer (via CF Access), not from an env var. If either client
 * falls back to reading an email out of env, these fail.
 */

describe('atlassian auth email plumbing', () => {
  const env = {
    JIRA_BASE_URL: 'https://webflow.atlassian.net',
    JIRA_API_TOKEN: 'jira-token',
    CONFLUENCE_BASE_URL: 'https://webflow.atlassian.net/wiki',
    CONFLUENCE_API_TOKEN: 'confluence-token',
  };

  const fetchMock =
    vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Jira', () => {
    it('isConfigured returns false when viewerEmail is missing, even when env is complete', () => {
      const jira = makeJiraClient({
        env,
        logger: createSilentLogger(),
        getAuthEmail: () => undefined,
      });
      expect(jira.isConfigured()).toBe(false);
    });

    it('returns [] without hitting the network when viewerEmail is missing', async () => {
      const jira = makeJiraClient({
        env,
        logger: createSilentLogger(),
        getAuthEmail: () => undefined,
      });
      const result = await jira.findAssignedToEmail('hire@webflow.com');
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uses the getAuthEmail return value in the Basic auth header', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({issues: []}), {status: 200})
      );
      const jira = makeJiraClient({
        env,
        logger: createSilentLogger(),
        getAuthEmail: () => 'viewer@webflow.com',
      });
      await jira.findAssignedToEmail('hire@webflow.com');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const headers = fetchMock.mock.calls[0][1]?.headers as
        | Record<string, string>
        | undefined;
      const authHeader = headers?.Authorization;
      expect(authHeader).toBeDefined();
      // Base64 of "viewer@webflow.com:jira-token"
      const expected = `Basic ${btoa('viewer@webflow.com:jira-token')}`;
      expect(authHeader).toBe(expected);
    });
  });

  describe('Confluence', () => {
    it('isConfigured returns false when viewerEmail is missing', () => {
      const confluence = makeConfluenceClient({
        env,
        logger: createSilentLogger(),
        getAuthEmail: () => undefined,
      });
      expect(confluence.isConfigured()).toBe(false);
    });

    it('returns undefined without hitting the network when viewerEmail is missing', async () => {
      const confluence = makeConfluenceClient({
        env,
        logger: createSilentLogger(),
        getAuthEmail: () => undefined,
      });
      const result = await confluence.searchFirst('team home', 'fallback');
      expect(result).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uses the getAuthEmail return value in the Basic auth header', async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            results: [
              {
                title: 'Team home',
                _links: {
                  base: 'https://webflow.atlassian.net/wiki',
                  webui: '/p/1',
                },
              },
            ],
          }),
          {status: 200}
        )
      );
      const confluence = makeConfluenceClient({
        env,
        logger: createSilentLogger(),
        getAuthEmail: () => 'viewer@webflow.com',
      });
      await confluence.searchFirst('team home', 'fallback');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const headers = fetchMock.mock.calls[0][1]?.headers as
        | Record<string, string>
        | undefined;
      const authHeader = headers?.Authorization;
      const expected = `Basic ${btoa('viewer@webflow.com:confluence-token')}`;
      expect(authHeader).toBe(expected);
    });
  });
});
