import type {SparkApiContext} from '../sparkApi';
import {
  lookupConfluencePeople,
  lookupContributionTasks,
  lookupTeam,
  lookupTeammates,
} from '../sparkApi';
import type {OnboardingPerson} from '../types';

/**
 * Tool descriptors in the Anthropic tool-use schema. Each entry wires a
 * tool name to its JSON schema (what the model must produce) and a run
 * function (what actually happens). Server-side executes the run functions;
 * the LLM only sees names + schemas.
 */

export interface AgentToolContext {
  spark: SparkApiContext;
  signal: AbortSignal;
  perToolTimeoutMs: number;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  run: (input: unknown, ctx: AgentToolContext) => Promise<unknown>;
}

async function withTimeout<T>(
  ctx: AgentToolContext,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  ctx.signal.addEventListener('abort', onAbort);
  const timer = setTimeout(() => controller.abort(), ctx.perToolTimeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
    ctx.signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Strip PII (emails) from a person before handing to the model. Preserves
 * Slack ids + first names, which are safe to feed back into the prompt.
 */
export function sanitizePerson(
  person: OnboardingPerson
): Omit<OnboardingPerson, 'email'> & {email?: never} {
  const {email: _email, ...rest} = person;
  return rest;
}

export const resolveNewHireTool: ToolDescriptor = {
  name: 'resolve_new_hire',
  description:
    'Look up the new hire by Slack id or email. Use this first so downstream tools have a real profile to anchor on.',
  input_schema: {
    type: 'object',
    properties: {
      slackId: {type: 'string'},
      email: {type: 'string'},
    },
  },
  async run(input, ctx) {
    const {slackId, email} = (input ?? {}) as {
      slackId?: string;
      email?: string;
    };
    if (!slackId && !email) {
      return {resolved: false, reason: 'no slackId or email provided'};
    }
    const hint = slackId ?? email;
    if (!hint) return {resolved: false};
    return withTimeout(ctx, async (signal) => {
      try {
        const team = await lookupTeam({...ctx.spark, signal}, hint);
        return {
          resolved: true,
          teamName: team.teamName,
          pillarName: team.pillarName,
          roleTrack: team.roleTrack,
          manager: sanitizePerson(team.manager),
          buddy: team.buddy ? sanitizePerson(team.buddy) : undefined,
        };
      } catch (error) {
        return {
          resolved: false,
          reason: error instanceof Error ? error.message : 'lookup failed',
        };
      }
    });
  },
};

export const resolveTeamTool: ToolDescriptor = {
  name: 'resolve_team',
  description:
    'Look up team metadata by a hint (email or team name). Use when the new hire lookup did not produce a team.',
  input_schema: {
    type: 'object',
    required: ['hint'],
    properties: {hint: {type: 'string'}},
  },
  async run(input, ctx) {
    const {hint} = input as {hint: string};
    return withTimeout(ctx, async (signal) => {
      const team = await lookupTeam({...ctx.spark, signal}, hint);
      return {
        teamName: team.teamName,
        pillarName: team.pillarName,
        roleTrack: team.roleTrack,
        githubTeamSlug: team.githubTeamSlug,
      };
    });
  },
};

export const fetchTeamRosterTool: ToolDescriptor = {
  name: 'fetch_team_roster',
  description:
    "Fetch the roster of engineers on the new hire's team. Use to pick a buddy and teammates to meet.",
  input_schema: {
    type: 'object',
    properties: {
      team: {type: 'string'},
      emailSeed: {type: 'string'},
    },
  },
  async run(input, ctx) {
    const opts = (input ?? {}) as {team?: string; emailSeed?: string};
    return withTimeout(ctx, async (signal) => {
      const result = await lookupTeammates({...ctx.spark, signal}, opts);
      return {
        teamName: result.teamName,
        teammates: result.teammates.map(sanitizePerson),
      };
    });
  },
};

export const proposeBuddyTool: ToolDescriptor = {
  name: 'propose_buddy',
  description:
    'LLM-native tool. Take a roster and return 3 ranked buddy candidates with rationale. The model should call this after fetch_team_roster to synthesize its pick.',
  input_schema: {
    type: 'object',
    required: ['candidates', 'recommendedSlackUserId'],
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          required: ['slackUserId', 'name', 'rationale'],
          properties: {
            slackUserId: {type: 'string'},
            name: {type: 'string'},
            rationale: {type: 'string'},
          },
        },
      },
      recommendedSlackUserId: {type: 'string'},
    },
  },
  async run(input) {
    // No external call — just echo the model's ranking back. The finalize
    // step reads from this via the transcript, not via a separate store.
    return {received: true, candidates: input};
  },
};

export const findStakeholdersTool: ToolDescriptor = {
  name: 'find_stakeholders',
  description:
    "Look up Confluence user guides for the team's manager, buddy, and teammates.",
  input_schema: {
    type: 'object',
    required: ['email'],
    properties: {email: {type: 'string'}},
  },
  async run(input, ctx) {
    const {email} = input as {email: string};
    return withTimeout(ctx, async (signal) => {
      const result = await lookupConfluencePeople(
        {...ctx.spark, signal},
        email
      );
      return {guides: result.guides};
    });
  },
};

export const findContributionTasksTool: ToolDescriptor = {
  name: 'find_contribution_tasks',
  description:
    'Scan the monorepo for first-contribution tasks scoped to the team (stale flags, styled migrations, etc).',
  input_schema: {
    type: 'object',
    required: ['email'],
    properties: {email: {type: 'string'}},
  },
  async run(input, ctx) {
    const {email} = input as {email: string};
    return withTimeout(ctx, async (signal) => {
      const result = await lookupContributionTasks(
        {...ctx.spark, signal},
        email
      );
      return {tasks: result.tasks};
    });
  },
};

export const draftWelcomeNoteTool: ToolDescriptor = {
  name: 'draft_welcome_note',
  description:
    'LLM-native tool. Record the final welcome note text after synthesizing team context and manager intent. The tool response is just an ack; the real write happens in finalize_draft.',
  input_schema: {
    type: 'object',
    required: ['welcomeNote'],
    properties: {welcomeNote: {type: 'string'}},
  },
  async run(input) {
    return {
      received: true,
      welcomeNote: (input as {welcomeNote: string}).welcomeNote,
    };
  },
};

export const tuneChecklistTool: ToolDescriptor = {
  name: 'tune_checklist',
  description:
    'LLM-native tool. Record team-specific checklist additions (NOT restatements of company defaults). Use once per draft.',
  input_schema: {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          required: ['label', 'kind', 'notes'],
          properties: {
            label: {type: 'string'},
            kind: {
              type: 'string',
              enum: [
                'task',
                'live-training',
                'workramp',
                'reading',
                'recording',
              ],
            },
            notes: {type: 'string'},
            resourceLabel: {type: 'string'},
            resourceUrl: {type: 'string'},
            sectionId: {type: 'string'},
          },
        },
      },
    },
  },
  async run(input) {
    return {received: true, items: (input as {items: unknown[]}).items};
  },
};

export const finalizeDraftTool: ToolDescriptor = {
  name: 'finalize_draft',
  description:
    'Commit the full draft. Call this EXACTLY ONCE at the end. The server validates against a schema; if it fails you will get a retry with the errors.',
  input_schema: {
    type: 'object',
    required: [
      'welcomeIntro',
      'welcomeNote',
      'stakeholderUserIds',
      'peopleToMeet',
      'customChecklistItems',
      'summary',
    ],
    properties: {
      welcomeIntro: {type: 'string'},
      welcomeNote: {type: 'string'},
      buddyUserId: {type: 'string'},
      stakeholderUserIds: {type: 'array', items: {type: 'string'}},
      peopleToMeet: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'role', 'discussionPoints', 'weekBucket'],
          properties: {
            name: {type: 'string'},
            role: {type: 'string'},
            discussionPoints: {type: 'string'},
            weekBucket: {
              type: 'string',
              enum: ['week1-2', 'week2-3', 'week3+'],
            },
            slackUserId: {type: 'string'},
          },
        },
      },
      customChecklistItems: {type: 'array'},
      summary: {type: 'string'},
    },
  },
  async run(input) {
    // finalize is validated by the caller via Zod, not here.
    return {received: true, payload: input};
  },
};

export const GENERATOR_TOOLS: ToolDescriptor[] = [
  resolveNewHireTool,
  resolveTeamTool,
  fetchTeamRosterTool,
  proposeBuddyTool,
  findStakeholdersTool,
  findContributionTasksTool,
  draftWelcomeNoteTool,
  tuneChecklistTool,
  finalizeDraftTool,
];

export function getToolByName(name: string): ToolDescriptor | undefined {
  return GENERATOR_TOOLS.find((tool) => tool.name === name);
}
