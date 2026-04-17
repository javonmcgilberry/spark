/**
 * Atlassian OAuth 2.0 (3LO) primitives.
 *
 * Atlassian calls their flow "three-legged OAuth" — the standard
 * authorization-code grant you'd expect for a web app acting on a
 * user's behalf. Flow:
 *
 *   1. buildAuthorizeUrl — redirect the user here. They log in and
 *      consent to the requested scopes.
 *   2. Atlassian bounces back to our callback with ?code=...&state=...
 *   3. exchangeCode — POST the code + client secret to the token URL,
 *      get access_token + refresh_token (refresh requires offline_access
 *      scope).
 *   4. fetchAccessibleResources — with the access token, list the
 *      Atlassian sites (cloudIds) the token is authorized for. We pick
 *      the first one for Spark.
 *   5. refreshAccessToken — swap an expiring refresh_token for a new
 *      access_token + refresh_token. Atlassian rotates refresh tokens
 *      on every exchange, so always persist the new one.
 *
 * See
 * https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
 */

export const ATLASSIAN_AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
export const ATLASSIAN_TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
export const ATLASSIAN_ACCESSIBLE_RESOURCES_URL =
  'https://api.atlassian.com/oauth/token/accessible-resources';

/**
 * Scope set matching what Spark actually reads. `offline_access` is
 * required for refresh tokens; everything else is read-only.
 */
export const DEFAULT_ATLASSIAN_SCOPES = [
  'read:jira-user',
  'read:jira-work',
  'read:confluence-content.all',
  'read:confluence-space.summary',
  'offline_access',
];

export interface BuildAuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
}

export function buildAuthorizeUrl(input: BuildAuthorizeUrlInput): string {
  const url = new URL(ATLASSIAN_AUTHORIZE_URL);
  url.searchParams.set('audience', 'api.atlassian.com');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set(
    'scope',
    (input.scopes ?? DEFAULT_ATLASSIAN_SCOPES).join(' ')
  );
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  scope: string;
  tokenType: string;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export interface ExchangeCodeInput {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}

export async function exchangeCode(
  input: ExchangeCodeInput
): Promise<TokenResponse> {
  const body = {
    grant_type: 'authorization_code',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  };
  return postToken(input.fetchImpl ?? fetch, body);
}

export interface RefreshTokenInput {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}

export async function refreshAccessToken(
  input: RefreshTokenInput
): Promise<TokenResponse> {
  const body = {
    grant_type: 'refresh_token',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    refresh_token: input.refreshToken,
  };
  return postToken(input.fetchImpl ?? fetch, body);
}

async function postToken(
  fetchImpl: typeof fetch,
  body: Record<string, string>
): Promise<TokenResponse> {
  const response = await fetchImpl(ATLASSIAN_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as RawTokenResponse;
  if (!response.ok) {
    throw new AtlassianOAuthError(
      payload.error ?? `http_${response.status}`,
      payload.error_description ??
        `Atlassian token endpoint returned ${response.status}`,
      response.status
    );
  }
  if (!payload.access_token || !payload.refresh_token) {
    throw new AtlassianOAuthError(
      'malformed_token_response',
      'Atlassian token response missing access_token or refresh_token.',
      502
    );
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in ?? 3600,
    scope: payload.scope ?? '',
    tokenType: payload.token_type ?? 'Bearer',
  };
}

export interface AccessibleResource {
  id: string;
  url: string;
  name: string;
  scopes?: string[];
}

export interface FetchAccessibleResourcesInput {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

export async function fetchAccessibleResources(
  input: FetchAccessibleResourcesInput
): Promise<AccessibleResource[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(ATLASSIAN_ACCESSIBLE_RESOURCES_URL, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new AtlassianOAuthError(
      `http_${response.status}`,
      `accessible-resources returned ${response.status}`,
      response.status
    );
  }
  const payload = (await response.json()) as Array<{
    id?: string;
    url?: string;
    name?: string;
    scopes?: string[];
  }>;
  return payload
    .filter(
      (
        item
      ): item is {id: string; url: string; name: string; scopes?: string[]} =>
        typeof item.id === 'string' &&
        typeof item.url === 'string' &&
        typeof item.name === 'string'
    )
    .map(({id, url, name, scopes}) => ({id, url, name, scopes}));
}

export class AtlassianOAuthError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
