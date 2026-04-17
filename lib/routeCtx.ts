/**
 * routeCtx — small adapter that bridges a Next.js route handler to
 * a HandlerCtx. It hides the Cloudflare context lookup from the
 * route files so they stay small:
 *
 *     export async function GET(req: Request) {
 *       const {ctx, session} = await buildManagerCtx();
 *       return handleListDrafts(req, ctx, session);
 *     }
 *
 * On Cloudflare: pulls the env via @opennextjs/cloudflare's
 * getCloudflareContext so D1 + secrets are visible.
 * Locally: falls back to process.env so `next dev` works without
 * requiring `opennextjs-cloudflare preview`.
 */

import {getCloudflareContext} from '@opennextjs/cloudflare';
import {makeProdCtx, type HandlerCtx} from './ctx';
import {requireManagerSession, type ManagerSession} from './session';

export interface RouteCtx {
  ctx: HandlerCtx;
  env: CloudflareEnv;
}

export async function buildRouteCtx(): Promise<RouteCtx> {
  const env = await resolveEnv();
  const ctx = makeProdCtx(env);
  return {ctx, env};
}

export async function buildManagerCtx(): Promise<
  RouteCtx & {session: ManagerSession}
> {
  const env = await resolveEnv();
  const session = await requireManagerSession(env);
  const ctx = makeProdCtx(env);
  return {ctx, env, session};
}

async function resolveEnv(): Promise<CloudflareEnv> {
  try {
    const cfCtx = await getCloudflareContext({async: true});
    return cfCtx.env;
  } catch {
    // Fallback for plain `next dev` without the opennext preview harness.
    return process.env as unknown as CloudflareEnv;
  }
}

/**
 * Helper that converts thrown Response objects and generic errors
 * into JSON responses. Used at the boundary of every route handler
 * so business-logic handlers can `throw new Response(...)` freely.
 */
export function handleRouteError(error: unknown): Response {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : 'internal error';
  return new Response(JSON.stringify({error: message}), {
    status: 500,
    headers: {'Content-Type': 'application/json'},
  });
}
