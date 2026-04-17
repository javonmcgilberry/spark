import {z} from 'zod';
import type {HandlerCtx} from '../../ctx';
import type {ManagerSession} from '../../session';
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
  slackUserId: z.string().optional(),
  avatarUrl: z.string().optional(),
  askMeAbout: z.string().optional(),
});

const patchBodySchema = z.object({
  welcomeNote: z.string().nullable().optional(),
  welcomeIntro: z.string().nullable().optional(),
  buddyUserId: z.string().nullable().optional(),
  stakeholderUserIds: z.array(z.string()).optional(),
  customChecklistItems: z.array(checklistItemSchema).optional(),
  peopleToMeet: z.array(personPatchSchema).optional(),
  checklistRows: z.record(z.string(), z.array(checklistItemSchema)).optional(),
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
  const pkg = await ctx.db.applyFieldPatch(userId, parsed.data);
  if (!pkg) {
    return Response.json(
      {error: 'draft not found or already published'},
      {status: 404}
    );
  }
  return Response.json({pkg: enrichPackageInsights(ctx, pkg)});
}
