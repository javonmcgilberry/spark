import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {makeJiraClient} from '../../lib/services/jira';
import {makeConfluenceClient} from '../../lib/services/confluence';
import {createSilentLogger} from '../../lib/ctx';

/**
 * When the viewer has completed the Atlassian OAuth connect flow we
 * MUST hit the cloud-scoped Atlassian gateway
 * (`https://api.atlassian.com/ex/...`) with a Bearer token, not the
 * site's own REST root with Basic auth. These tests pin that contract.
 */

describe('Jira + Confluence: OAuth preferred, Basic fallback', () => {
  const env = {
    JIRA_BASE_URL: 'https://webflow.atlassian.net',
    JIRA_API_EMAIL: 'override@webflow.com',
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

  it('Jira: uses OAuth Bearer on api.atlassian.com/ex/jira/<cloudId> when token is present', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({issues: []}), {status: 200})
    );
    const jira = makeJiraClient({
      env,
      logger: createSilentLogger(),
      getAuthEmail: () => 'viewer@webflow.com',
      getOAuthToken: async () => ({
        accessToken: 'bearer-token',
        cloudId: 'cloud-42',
      }),
    });
    await jira.findAssignedToEmail('assignee@webflow.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toMatch(
      /^https:\/\/api\.atlassian\.com\/ex\/jira\/cloud-42\/rest\/api\/3\/search\?/
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer bearer-token'
    );
  });

  it('Jira: falls back to Basic on the site URL when OAuth token is null', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({issues: []}), {status: 200})
    );
    // makeJiraClient doesn't know about JIRA_API_EMAIL override; that
    // precedence lives in ctx.ts. What this module tests is that the
    // getAuthEmail callback's return value is what ends up in Basic
    // auth — and nothing else. ctx.ts has its own integration test
    // elsewhere.
    const jira = makeJiraClient({
      env,
      logger: createSilentLogger(),
      getAuthEmail: () => 'viewer@webflow.com',
      getOAuthToken: async () => null,
    });
    await jira.findAssignedToEmail('assignee@webflow.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toMatch(
      /^https:\/\/webflow\.atlassian\.net\/rest\/api\/3\/search\?/
    );
    const auth = (init?.headers as Record<string, string>).Authorization;
    expect(auth).toMatch(/^Basic /);
    expect(atob(auth.replace('Basic ', ''))).toBe(
      'viewer@webflow.com:jira-token'
    );
  });

  it('Confluence: uses OAuth Bearer on api.atlassian.com/ex/confluence/<cloudId> when token is present', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({results: []}), {status: 200})
    );
    const confluence = makeConfluenceClient({
      env,
      logger: createSilentLogger(),
      getAuthEmail: () => 'viewer@webflow.com',
      getOAuthToken: async () => ({
        accessToken: 'bearer-conf',
        cloudId: 'cloud-42',
      }),
    });
    await confluence.searchFirst('team home', 'fallback');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toMatch(
      /^https:\/\/api\.atlassian\.com\/ex\/confluence\/cloud-42\/wiki\/rest\/api\/content\/search\?/
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer bearer-conf'
    );
  });

  it('Confluence: falls back to Basic on the wiki URL when OAuth token is null', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({results: []}), {status: 200})
    );
    const confluence = makeConfluenceClient({
      env,
      logger: createSilentLogger(),
      getAuthEmail: () => 'viewer@webflow.com',
      getOAuthToken: async () => null,
    });
    await confluence.searchFirst('team home', 'fallback');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toMatch(
      /^https:\/\/webflow\.atlassian\.net\/wiki\/rest\/api\/content\/search\?/
    );
    expect((init?.headers as Record<string, string>).Authorization).toMatch(
      /^Basic /
    );
  });

  it('isConfigured is true whenever OAuth is wired, even without env Basic fallback', () => {
    const thinEnv = {};
    const jira = makeJiraClient({
      env: thinEnv,
      logger: createSilentLogger(),
      getAuthEmail: () => undefined,
      getOAuthToken: async () => null,
    });
    expect(jira.isConfigured()).toBe(true);

    const confluence = makeConfluenceClient({
      env: thinEnv,
      logger: createSilentLogger(),
      getAuthEmail: () => undefined,
      getOAuthToken: async () => null,
    });
    expect(confluence.isConfigured()).toBe(true);
  });
});
