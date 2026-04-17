import {z} from 'zod';

/**
 * Zod schema for the Generator agent's finalize_draft tool input.
 *
 * Scope: welcome copy (two voices) + team-specific checklist additions.
 * That's it. People selection, buddy assignment, and reviewer identity
 * are resolved deterministically server-side — the LLM is not allowed
 * to name people, fabricate Slack ids, or carry reviewer state.
 */

export const checklistItemSchema = z.object({
  label: z.string().min(1).max(240),
  kind: z.enum(['task', 'live-training', 'workramp', 'reading', 'recording']),
  notes: z.string().max(2000),
  resourceLabel: z.string().max(240).optional(),
  resourceUrl: z.string().url().optional(),
  sectionId: z.string().optional(),
});

export const generatorFinalizeSchema = z.object({
  welcomeIntro: z.string().min(20).max(280),
  welcomeNote: z.string().min(40),
  customChecklistItems: z.array(checklistItemSchema).min(0).max(20),
  summary: z.string().max(600),
});

export type GeneratorFinalize = z.infer<typeof generatorFinalizeSchema>;
