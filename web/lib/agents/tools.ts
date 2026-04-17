/**
 * Generator agent tools. Every tool takes the agent's own
 * HandlerCtx — nothing here reaches out to external clients directly.
 *
 * Scope cut per migration plan: find_contribution_tasks is gone. The
 * Node bot's monorepo filesystem scanner isn't Workers-compatible.
 */

import type { HandlerCtx } from "../ctx";
import {
  findOnboardingReferences,
  findPeopleGuides,
} from "../services/confluenceSearch";
import {
  resolveFromEmail,
  resolveFromSlack,
} from "../services/identityResolver";
import type { OnboardingPerson } from "../types";

export interface AgentToolContext {
  ctx: HandlerCtx;
  signal: AbortSignal;
  perToolTimeoutMs: number;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  run: (input: unknown, tctx: AgentToolContext) => Promise<unknown>;
}

async function withTimeout<T>(
  tctx: AgentToolContext,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  tctx.signal.addEventListener("abort", onAbort);
  const timer = setTimeout(() => controller.abort(), tctx.perToolTimeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
    tctx.signal.removeEventListener("abort", onAbort);
  }
}

export function sanitizePerson(
  person: OnboardingPerson,
): Omit<OnboardingPerson, "email"> & { email?: never } {
  const { email: _email, ...rest } = person;
  return rest;
}

export const resolveNewHireTool: ToolDescriptor = {
  name: "resolve_new_hire",
  description:
    "Look up the new hire by Slack id or email. Use this first so downstream tools have a real profile to anchor on.",
  input_schema: {
    type: "object",
    properties: {
      slackId: { type: "string" },
      email: { type: "string" },
    },
  },
  async run(input, tctx) {
    const { slackId, email } = (input ?? {}) as {
      slackId?: string;
      email?: string;
    };
    if (!slackId && !email) {
      return { resolved: false, reason: "no slackId or email provided" };
    }
    return withTimeout(tctx, async () => {
      try {
        const profile = slackId
          ? await resolveFromSlack(tctx.ctx, slackId)
          : await resolveFromEmail(tctx.ctx, email!);
        tctx.ctx.scratch.resolvedHire = profile;
        return {
          resolved: true,
          teamName: profile.teamName,
          pillarName: profile.pillarName,
          roleTrack: profile.roleTrack,
          manager: sanitizePerson(profile.manager),
          buddy: profile.buddy ? sanitizePerson(profile.buddy) : undefined,
        };
      } catch (error) {
        return {
          resolved: false,
          reason: error instanceof Error ? error.message : "lookup failed",
        };
      }
    });
  },
};

export const resolveTeamTool: ToolDescriptor = {
  name: "resolve_team",
  description:
    "Look up team metadata by a hint (email or team name). Use when the new hire lookup did not produce a team.",
  input_schema: {
    type: "object",
    required: ["hint"],
    properties: { hint: { type: "string" } },
  },
  async run(input, tctx) {
    const { hint } = input as { hint: string };
    return withTimeout(tctx, async () => {
      const profile = hint.includes("@")
        ? await resolveFromEmail(tctx.ctx, hint)
        : await resolveFromEmail(
            tctx.ctx,
            `${hint.toLowerCase().replace(/\s+/g, "-")}@webflow-test.local`,
          );
      return {
        teamName: profile.teamName,
        pillarName: profile.pillarName,
        roleTrack: profile.roleTrack,
        githubTeamSlug: profile.githubTeamSlug,
      };
    });
  },
};

export const fetchTeamRosterTool: ToolDescriptor = {
  name: "fetch_team_roster",
  description:
    "Fetch the roster of engineers on the new hire's team. Use to pick a buddy and teammates to meet.",
  input_schema: {
    type: "object",
    properties: {
      team: { type: "string" },
      emailSeed: { type: "string" },
    },
  },
  async run(input, tctx) {
    const opts = (input ?? {}) as { team?: string; emailSeed?: string };
    return withTimeout(tctx, async () => {
      const seedEmail =
        opts.emailSeed ??
        (opts.team
          ? `${opts.team.toLowerCase().replace(/\s+/g, "-")}@webflow-test.local`
          : undefined);
      if (!seedEmail) {
        return { teamName: opts.team ?? "Engineering", teammates: [] };
      }
      const profile = await resolveFromEmail(tctx.ctx, seedEmail);
      return {
        teamName: profile.teamName,
        teammates: profile.teammates.map(sanitizePerson),
      };
    });
  },
};

export const proposeBuddyTool: ToolDescriptor = {
  name: "propose_buddy",
  description:
    "LLM-native tool. Take a roster and return 3 ranked buddy candidates with rationale. The model should call this after fetch_team_roster to synthesize its pick.",
  input_schema: {
    type: "object",
    required: ["candidates", "recommendedSlackUserId"],
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          required: ["slackUserId", "name", "rationale"],
          properties: {
            slackUserId: { type: "string" },
            name: { type: "string" },
            rationale: { type: "string" },
          },
        },
      },
      recommendedSlackUserId: { type: "string" },
    },
  },
  async run(input) {
    return { received: true, candidates: input };
  },
};

export const findStakeholdersTool: ToolDescriptor = {
  name: "find_stakeholders",
  description:
    "Look up Confluence user guides for the team's manager, buddy, and teammates.",
  input_schema: {
    type: "object",
    required: ["email"],
    properties: { email: { type: "string" } },
  },
  async run(input, tctx) {
    const { email } = input as { email: string };
    return withTimeout(tctx, async () => {
      const profile = await resolveFromEmail(tctx.ctx, email);
      const people = [profile.manager, profile.buddy, ...profile.teammates];
      const [refs, guides] = await Promise.all([
        findOnboardingReferences(tctx.ctx, profile),
        findPeopleGuides(tctx.ctx, profile, people),
      ]);
      return { references: refs, guides };
    });
  },
};

export const draftWelcomeNoteTool: ToolDescriptor = {
  name: "draft_welcome_note",
  description:
    "LLM-native tool. Record the final welcome text for BOTH voices (welcomeIntro = Spark, welcomeNote = manager). The server PATCHes the draft as soon as this tool is called so the manager sees the welcome in the UI before the rest of the loop runs. Pass the real final text here, not a placeholder — finalize_draft must receive the same values at the end.",
  input_schema: {
    type: "object",
    required: ["welcomeIntro", "welcomeNote"],
    properties: {
      welcomeIntro: { type: "string" },
      welcomeNote: { type: "string" },
    },
  },
  async run(input) {
    const parsed = input as { welcomeIntro: string; welcomeNote: string };
    return {
      received: true,
      welcomeIntro: parsed.welcomeIntro,
      welcomeNote: parsed.welcomeNote,
    };
  },
};

export const tuneChecklistTool: ToolDescriptor = {
  name: "tune_checklist",
  description:
    "LLM-native tool. Record team-specific checklist additions (NOT restatements of company defaults). Use once per draft.",
  input_schema: {
    type: "object",
    required: ["items"],
    properties: {
      items: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          required: ["label", "kind", "notes"],
          properties: {
            label: { type: "string" },
            kind: {
              type: "string",
              enum: [
                "task",
                "live-training",
                "workramp",
                "reading",
                "recording",
              ],
            },
            notes: { type: "string" },
            resourceLabel: { type: "string" },
            resourceUrl: { type: "string" },
            sectionId: { type: "string" },
          },
        },
      },
    },
  },
  async run(input) {
    return { received: true, items: (input as { items: unknown[] }).items };
  },
};

export const finalizeDraftTool: ToolDescriptor = {
  name: "finalize_draft",
  description:
    "Commit the full draft. Call this EXACTLY ONCE at the end. The server validates against a schema; if it fails you will get a retry with the errors.",
  input_schema: {
    type: "object",
    required: [
      "welcomeIntro",
      "welcomeNote",
      "stakeholderUserIds",
      "peopleToMeet",
      "customChecklistItems",
      "summary",
    ],
    properties: {
      welcomeIntro: { type: "string" },
      welcomeNote: { type: "string" },
      buddyUserId: { type: "string" },
      stakeholderUserIds: { type: "array", items: { type: "string" } },
      peopleToMeet: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "role", "discussionPoints", "weekBucket"],
          properties: {
            name: { type: "string" },
            role: { type: "string" },
            discussionPoints: { type: "string" },
            weekBucket: {
              type: "string",
              enum: ["week1-2", "week2-3", "week3+"],
            },
            slackUserId: { type: "string" },
          },
        },
      },
      customChecklistItems: { type: "array" },
      summary: { type: "string" },
    },
  },
  async run(input) {
    return { received: true, payload: input };
  },
};

// find_contribution_tasks intentionally removed — Workers cannot run
// the monorepo filesystem scanner. Listed as a known scope cut in
// the migration plan and README.

export const GENERATOR_TOOLS: ToolDescriptor[] = [
  resolveNewHireTool,
  resolveTeamTool,
  fetchTeamRosterTool,
  proposeBuddyTool,
  findStakeholdersTool,
  draftWelcomeNoteTool,
  tuneChecklistTool,
  finalizeDraftTool,
];

export function getToolByName(name: string): ToolDescriptor | undefined {
  return GENERATOR_TOOLS.find((tool) => tool.name === name);
}
