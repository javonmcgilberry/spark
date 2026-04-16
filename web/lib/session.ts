import {cookies} from 'next/headers';
import type {SparkApiEnv} from './sparkApi';

// Demo session: cookie first, DEMO_MANAGER_SLACK_ID env fallback. Replace
// with Slack OAuth post-hackathon.
export const SESSION_COOKIE_NAME = 'spark_manager_slack_id';

export interface ManagerSession {
  managerSlackId: string;
  source: 'cookie' | 'env';
}

export async function getManagerSession(): Promise<ManagerSession | null> {
  const store = await cookies();
  const cookieValue = store.get(SESSION_COOKIE_NAME)?.value?.trim();
  if (cookieValue && /^[A-Z0-9]+$/.test(cookieValue)) {
    return {managerSlackId: cookieValue, source: 'cookie'};
  }
  const envFallback = process.env.DEMO_MANAGER_SLACK_ID?.trim();
  if (envFallback && /^[A-Z0-9]+$/.test(envFallback)) {
    return {managerSlackId: envFallback, source: 'env'};
  }
  return null;
}

export function getSparkApiEnv(): SparkApiEnv {
  const base = process.env.SPARK_API_BASE_URL;
  const token = process.env.SPARK_API_TOKEN;
  if (!base || !token) {
    throw new Error(
      'SPARK_API_BASE_URL and SPARK_API_TOKEN must be configured'
    );
  }
  return {SPARK_API_BASE_URL: base, SPARK_API_TOKEN: token};
}

export async function requireManagerContext(): Promise<{
  managerSlackId: string;
  env: SparkApiEnv;
}> {
  const session = await getManagerSession();
  if (!session) {
    throw new Response(JSON.stringify({error: 'no session'}), {
      status: 401,
      headers: {'Content-Type': 'application/json'},
    });
  }
  return {
    managerSlackId: session.managerSlackId,
    env: getSparkApiEnv(),
  };
}
