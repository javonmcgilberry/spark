import {z} from 'zod';
import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
import type {OnboardingPerson} from '../../types';
import {listAllUsers} from '../../services/slackUserDirectory';
import {enrichPackageInsights} from './enrich';

const checklistItemSchema = z.object({
  label: z.string().min(1),
  kind: z.enum(['task', 'live-training', 'workramp', 'reading', 'recording']),
  notes: z.string(),
  resourceLabel: z.string().optional(),
  resourceUrl: z.string().optional(),
  sectionId: z.string().optional(),
});

const personPatchSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  discussionPoints: z.string(),
  weekBucket: z.enum(['week1-2', 'week2-3', 'week3+']),
  kind: z
    .enum([
      'manager',
      'buddy',
      'teammate',
      'pm',
      'designer',
      'director',
      'people-partner',
      'custom',
    ])
    .optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  editableBy: z.enum(['spark', 'manager', 'buddy', 'team']).optional(),
  email: z.string().optional(),
  slackUserId: z
    .string()
    .regex(
      /^U[A-Z0-9]{8,}$/,
      'slackUserId must be a Slack workspace user id (starts with U)'
    )
    .optional(),
  avatarUrl: z.string().optional(),
  askMeAbout: z.string().optional(),
  insightsStatus: z
    .enum([
      'pending',
      'ready',
      'error',
      'retryable-error',
      'data-starved',
      'user-overridden',
    ])
    .optional(),
});

const patchBodySchema = z.object({
  welcomeNote: z.string().nullable().optional(),
  welcomeIntro: z.string().nullable().optional(),
  customChecklistItems: z.array(checklistItemSchema).optional(),
  peopleToMeet: z.array(personPatchSchema).optional(),
  checklistRows: z.record(z.string(), z.array(checklistItemSchema)).optional(),
  /**
   * Optional optimistic-concurrency token. Clients that render the
   * draft pass the `updatedAt` they last read; the server rejects the
   * write with 409 if the stored copy has moved on since then. When
   * omitted (e.g. server-initiated patches from the generator or
   * refresh-insights paths) the check is skipped.
   */
  expectedUpdatedAt: z.string().optional(),
});

export async function handleGetDraft(
  ctx: HandlerCtx,
  _session: ManagerSession,
  userId: string
): Promise<Response> {
  const pkg = await ctx.db.get(userId);
  if (!pkg) {
    return Response.json({error: 'draft not found'}, {status: 404});
  }
  return Response.json({pkg: enrichPackageInsights(ctx, pkg)});
}

export async function handlePatchDraft(
  request: Request,
  ctx: HandlerCtx,
  _session: ManagerSession,
  userId: string
): Promise<Response> {
  const raw = await request.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return Response.json(
      {error: 'invalid body', issues: parsed.error.issues},
      {status: 400}
    );
  }
  const {expectedUpdatedAt, ...patch} = parsed.data;
  if (expectedUpdatedAt) {
    const current = await ctx.db.get(userId);
    if (current && current.updatedAt !== expectedUpdatedAt) {
      return Response.json(
        {
          error: 'conflict',
          reason:
            'The draft has been updated by another tab or process. Reload to pick up the latest.',
          currentUpdatedAt: current.updatedAt,
        },
        {status: 409}
      );
    }
  }
  if (patch.peopleToMeet) {
    patch.peopleToMeet = await hydratePeoplePatch(
      ctx,
      userId,
      patch.peopleToMeet
    );
  }
  const pkg = await ctx.db.applyFieldPatch(userId, patch);
  if (!pkg) {
    return Response.json(
      {error: 'draft not found or already published'},
      {status: 404}
    );
  }
  return Response.json({pkg: enrichPackageInsights(ctx, pkg)});
}

/**
 * When a PATCH carries peopleToMeet, hydrate rows whose Slack user id
 * was changed (or newly assigned) from the cached workspace directory:
 * fill in name, title, email, avatar. A "text-only edit" (typing in
 * the textarea) does NOT trigger any Slack work because the slackUserId
 * matches what the server already has for that row.
 */
async function hydratePeoplePatch(
  ctx: HandlerCtx,
  userId: string,
  rows: OnboardingPerson[]
): Promise<OnboardingPerson[]> {
  const existing = await ctx.db.get(userId).catch(() => undefined);
  const knownSlackIds = new Set<string>();
  for (const row of existing?.sections.peopleToMeet.people ?? []) {
    if (row.slackUserId) knownSlackIds.add(row.slackUserId);
  }
  const hasNewAssignment = rows.some(
    (row) => row.slackUserId && !knownSlackIds.has(row.slackUserId)
  );
  if (!hasNewAssignment) return rows;
  const directory = await listAllUsers(ctx).catch(() => []);
  const directoryById = new Map(
    directory.map((user) => [user.slackUserId, user])
  );
  return rows.map((row) => {
    if (!row.slackUserId || knownSlackIds.has(row.slackUserId)) return row;
    const hit = directoryById.get(row.slackUserId);
    if (!hit) return row;
    return {
      ...row,
      name: row.name || hit.displayName || hit.name,
      title: row.title || hit.title,
      email: row.email || hit.email,
      avatarUrl: row.avatarUrl || hit.avatarUrl,
    };
  });
}
