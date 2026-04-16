import {z} from 'zod';

/**
 * Zod schemas mirroring spark/src/onboarding/types.ts. The Generator
 * agent's finalize_draft tool is validated against these before the
 * draft is persisted. If the bot's types drift, add the field here too.
 */

export const checklistItemSchema = z.object({
  label: z.string().min(1).max(240),
  kind: z.enum(['task', 'live-training', 'workramp', 'reading', 'recording']),
  notes: z.string().max(2000),
  resourceLabel: z.string().max(240).optional(),
  resourceUrl: z.string().url().optional(),
  sectionId: z.string().optional(),
});

export const onboardingPersonSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  discussionPoints: z.string().min(1),
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
  slackUserId: z.string().optional(),
});

export const buddyProposalSchema = z.object({
  candidates: z
    .array(
      z.object({
        slackUserId: z.string(),
        name: z.string(),
        rationale: z.string(),
      })
    )
    .min(1)
    .max(5),
  recommendedSlackUserId: z.string(),
});

/**
 * Minimum shape the Generator must produce for the finalize_draft tool
 * to succeed. We only validate the fields the agent is expected to
 * populate — the bot will merge these with the existing draft shell
 * through PATCH, so sections already built from the catalog stay intact.
 */
export const generatorFinalizeSchema = z.object({
  welcomeNote: z.string().min(40).max(1200),
  buddyUserId: z.string().optional(),
  stakeholderUserIds: z.array(z.string()).min(0).max(10),
  peopleToMeet: z.array(onboardingPersonSchema).min(1).max(12),
  customChecklistItems: z.array(checklistItemSchema).min(0).max(20),
  summary: z.string().max(600),
});

export type GeneratorFinalize = z.infer<typeof generatorFinalizeSchema>;
