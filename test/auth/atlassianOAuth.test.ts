import {describe, expect, it, vi} from 'vitest';
import {
  ATLASSIAN_ACCESSIBLE_RESOURCES_URL,
  ATLASSIAN_TOKEN_URL,
  AtlassianOAuthError,
  buildAuthorizeUrl,
  exchangeCode,
  fetchAccessibleResources,
  refreshAccessToken,
} from '../../lib/auth/atlassianOAuth';

describe('buildAuthorizeUrl', () => {
  it('encodes all required params for a standard connect flow', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'spark-client',
        redirectUri: 'https://spark.wf.app/api/auth/atlassian/callback',
        state: 'csrf-abc',
      })
    );
    expect(url.host).toBe('auth.atlassian.com');
    expect(url.pathname).toBe('/authorize');
    expect(url.searchParams.get('audience')).toBe('api.atlassian.com');
    expect(url.searchParams.get('client_id')).toBe('spark-client');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://spark.wf.app/api/auth/atlassian/callback'
    );
    expect(url.searchParams.get('state')).toBe('csrf-abc');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('prompt')).toBe('consent');
    const scope = url.searchParams.get('scope') ?? '';
    expect(scope.split(' ')).toEqual(
      expect.arrayContaining([
        'read:jira-user',
        'read:jira-work',
        'read:confluence-content.all',
        'offline_access',
      ])
    );
  });

  it('respects a caller-supplied scope override', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'x',
        redirectUri: 'https://spark.wf.app/cb',
        state: 's',
        scopes: ['read:jira-work', 'offline_access'],
      })
    );
    expect(url.searchParams.get('scope')).toBe('read:jira-work offline_access');
  });
});

describe('exchangeCode', () => {
  it('POSTs the expected body and maps the response', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe(ATLASSIAN_TOKEN_URL);
      const body = JSON.parse((init as RequestInit).body as string) as Record<
        string,
        string
      >;
      expect(body).toEqual({
        grant_type: 'authorization_code',
        client_id: 'c',
        client_secret: 's',
        code: 'the-code',
        redirect_uri: 'https://spark.wf.app/cb',
      });
      return new Response(
        JSON.stringify({
          access_token: 'at-1',
          refresh_token: 'rt-1',
          expires_in: 3600,
          scope: 'read:jira-work offline_access',
          token_type: 'Bearer',
        })
      );
    });
    const result = await exchangeCode({
      clientId: 'c',
      clientSecret: 's',
      code: 'the-code',
      redirectUri: 'https://spark.wf.app/cb',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(result).toEqual({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresIn: 3600,
      scope: 'read:jira-work offline_access',
      tokenType: 'Bearer',
    });
  });

  it('surfaces Atlassian error payloads as AtlassianOAuthError', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'code expired',
          }),
          {status: 400}
        )
    );
    await expect(
      exchangeCode({
        clientId: 'c',
        clientSecret: 's',
        code: 'bad',
        redirectUri: 'https://x/y',
        fetchImpl: fetchMock as unknown as typeof fetch,
      })
    ).rejects.toBeInstanceOf(AtlassianOAuthError);
  });
});

describe('refreshAccessToken', () => {
  it('sends grant_type=refresh_token with the stored refresh token', async () => {
    const fetchMock = vi.fn(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string) as Record<
        string,
        string
      >;
      expect(body).toEqual({
        grant_type: 'refresh_token',
        client_id: 'c',
        client_secret: 's',
        refresh_token: 'rt-old',
      });
      return new Response(
        JSON.stringify({
          access_token: 'at-new',
          refresh_token: 'rt-new',
          expires_in: 3600,
          scope: '',
          token_type: 'Bearer',
        })
      );
    });
    const result = await refreshAccessToken({
      clientId: 'c',
      clientSecret: 's',
      refreshToken: 'rt-old',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(result.accessToken).toBe('at-new');
    expect(result.refreshToken).toBe('rt-new');
  });
});

describe('fetchAccessibleResources', () => {
  it('returns {id, url, name} for every site in the payload', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe(ATLASSIAN_ACCESSIBLE_RESOURCES_URL);
      expect(
        (init as RequestInit).headers as Record<string, string>
      ).toMatchObject({
        Authorization: 'Bearer at-1',
      });
      return new Response(
        JSON.stringify([
          {
            id: 'cloud-1',
            url: 'https://webflow.atlassian.net',
            name: 'Webflow',
            scopes: ['read:jira-work'],
          },
          {id: 'cloud-2', url: 'https://other.atlassian.net', name: 'Other'},
        ])
      );
    });
    const resources = await fetchAccessibleResources({
      accessToken: 'at-1',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(resources).toEqual([
      {
        id: 'cloud-1',
        url: 'https://webflow.atlassian.net',
        name: 'Webflow',
        scopes: ['read:jira-work'],
      },
      {
        id: 'cloud-2',
        url: 'https://other.atlassian.net',
        name: 'Other',
        scopes: undefined,
      },
    ]);
  });
});
