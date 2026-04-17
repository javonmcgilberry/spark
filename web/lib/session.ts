import { cookies } from "next/headers";

/**
 * Demo session — cookie first, DEMO_MANAGER_SLACK_ID env fallback.
 * Replace with Slack OAuth post-hackathon.
 *
 * The old getSparkApiEnv helper is gone — routes now build a ctx via
 * makeProdCtx(env) and read directly from CloudflareEnv.
 */

export const SESSION_COOKIE_NAME = "spark_manager_slack_id";

export interface ManagerSession {
  managerSlackId: string;
  source: "cookie" | "env";
}

export async function getManagerSession(
  env?: CloudflareEnv,
): Promise<ManagerSession | null> {
  const store = await cookies();
  const cookieValue = store.get(SESSION_COOKIE_NAME)?.value?.trim();
  if (cookieValue && /^[A-Z0-9]+$/.test(cookieValue)) {
    return { managerSlackId: cookieValue, source: "cookie" };
  }
  const envFallback = (
    env?.DEMO_MANAGER_SLACK_ID ?? process.env.DEMO_MANAGER_SLACK_ID
  )?.trim();
  if (envFallback && /^[A-Z0-9]+$/.test(envFallback)) {
    return { managerSlackId: envFallback, source: "env" };
  }
  return null;
}

export async function requireManagerSession(
  env?: CloudflareEnv,
): Promise<ManagerSession> {
  const session = await getManagerSession(env);
  if (!session) {
    throw new Response(JSON.stringify({ error: "no session" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return session;
}
