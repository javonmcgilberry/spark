/**
 * identityResolver — builds a TeamProfile from a Slack user id or
 * email. Sources of truth:
 *   1. Slack user profile + custom fields (team, pillar, manager)
 *   2. CODEOWNERS heuristics for team → GitHub slug + keyPaths
 *
 * Every call takes HandlerCtx so nothing here imports a client
 * directly. Caching is per-ctx via a Map kept on ctx.scratch.
 */

import type {HandlerCtx} from '../ctx';
import {
  buildChecklist,
  buildDefaultChannels,
  buildDefaultPeople,
  buildDefaultRituals,
  buildDefaultTools,
} from '../onboarding/catalog';
import {getDocDefinitions, DOC_PAGE_IDS} from '../onboarding/catalog';
import type {DocLink, OnboardingPerson, RoleTrack, TeamProfile} from '../types';
import {findGitHubTeamSlug, suggestPathsForTeam} from './codeowners';
import type {SlackProfileFieldValue, SlackUser} from './slack';

const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const SLACK_FIELD_IDS_TTL_MS = 60 * 60 * 1000;

interface ProfileSeed {
  userId: string;
  displayName: string;
  firstName?: string;
  avatarUrl?: string;
  email?: string;
  teamName?: string;
  pillarName?: string;
  manager?: OnboardingPerson;
}

interface SlackCustomFields {
  division?: SlackProfileFieldValue;
  team?: SlackProfileFieldValue;
  manager?: SlackProfileFieldValue;
}

interface Caches {
  profile: Map<string, {profile: TeamProfile; expiresAt: number}>;
  fieldIds: {fieldIds: Map<string, string>; expiresAt: number} | undefined;
}

function getCaches(ctx: HandlerCtx): Caches {
  const existing = ctx.scratch.identityCaches as Caches | undefined;
  if (existing) return existing;
  const created: Caches = {
    profile: new Map(),
    fieldIds: undefined,
  };
  ctx.scratch.identityCaches = created;
  return created;
}

export async function resolveFromSlack(
  ctx: HandlerCtx,
  userId: string
): Promise<TeamProfile> {
  const caches = getCaches(ctx);
  const cached = caches.profile.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  const slackSeed = await lookupSlackSeed(ctx, caches, userId);
  const profile = await buildProfile(
    ctx,
    mergeSeed(userId, slackSeed.displayName, slackSeed)
  );
  caches.profile.set(userId, {
    profile,
    expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
  });
  return profile;
}

export async function resolveFromEmail(
  ctx: HandlerCtx,
  email: string
): Promise<TeamProfile> {
  const caches = getCaches(ctx);
  const cached = caches.profile.get(email);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;

  const slackSeed = await lookupSlackSeedByEmail(ctx, caches, email);
  const canonicalUserId = slackSeed?.userId ?? email;
  const profile = await buildProfile(
    ctx,
    mergeSeed(canonicalUserId, email.split('@')[0], slackSeed, email)
  );
  const cacheEntry = {
    profile,
    expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
  };
  caches.profile.set(email, cacheEntry);
  if (canonicalUserId !== email) {
    caches.profile.set(canonicalUserId, cacheEntry);
  }
  return profile;
}

async function buildProfile(
  ctx: HandlerCtx,
  seed: ProfileSeed
): Promise<TeamProfile> {
  const resolvedFirstName =
    firstNonEmpty(
      seed.firstName,
      firstNameFromValue(seed.displayName),
      'there'
    ) ?? 'there';
  const teamName = seed.teamName ?? 'Engineering';
  const roleTrack = inferRoleTrack(teamName);
  const codeowners = await getCachedCodeowners(ctx);
  const githubTeamSlug = await findGitHubTeamSlug(codeowners, teamName);
  const keyPaths = await suggestPathsForTeam(
    codeowners,
    teamName,
    githubTeamSlug
  );
  const people = await buildPeople(ctx, teamName, seed.manager);

  return {
    userId: seed.userId,
    firstName: resolvedFirstName,
    displayName: seed.displayName,
    avatarUrl: seed.avatarUrl,
    email: seed.email,
    teamName,
    pillarName: seed.pillarName,
    githubTeamSlug,
    roleTrack,
    manager: people.manager,
    buddy: people.buddy,
    teammates: people.teammates,
    docs: getDocsForTrack(ctx, roleTrack),
    keyPaths,
    recommendedChannels: buildDefaultChannels(),
    tools: buildDefaultTools(),
    rituals: buildDefaultRituals(),
    checklist: buildChecklist(),
  };
}

async function buildPeople(
  ctx: HandlerCtx,
  teamName: string,
  managerOverride: OnboardingPerson | undefined
): Promise<{
  manager: OnboardingPerson;
  buddy: OnboardingPerson;
  teammates: OnboardingPerson[];
}> {
  const people = buildDefaultPeople();
  const managerCandidate = managerOverride
    ? {
        ...personalizePerson(people[0], teamName),
        ...managerOverride,
      }
    : personalizePerson(people[0], teamName);
  const manager =
    managerCandidate.slackUserId || managerCandidate.email
      ? await hydratePerson(ctx, managerCandidate).catch(() => managerCandidate)
      : managerCandidate;

  return {
    manager,
    buddy: personalizePerson(people[1], teamName),
    teammates: [buildFallbackTeammate(teamName, people[2]), ...people.slice(3)],
  };
}

async function hydratePerson(
  ctx: HandlerCtx,
  person: OnboardingPerson
): Promise<OnboardingPerson> {
  if (person.slackUserId) {
    const result = await ctx.slack.users.info({user: person.slackUserId});
    return mergeSlackUserProfile(person, result.user);
  }
  if (person.email) {
    const result = await ctx.slack.users.lookupByEmail({email: person.email});
    return mergeSlackUserProfile(person, result.user);
  }
  return person;
}

async function lookupSlackSeedByEmail(
  ctx: HandlerCtx,
  caches: Caches,
  email: string
): Promise<ProfileSeed | null> {
  try {
    const result = await ctx.slack.users.lookupByEmail({email});
    if (!result.user?.id) return null;
    const customFields = await lookupSlackCustomFields(
      ctx,
      caches,
      result.user.id
    );
    return buildSlackSeed(result.user.id, result.user, customFields);
  } catch {
    return null;
  }
}

async function lookupSlackSeed(
  ctx: HandlerCtx,
  caches: Caches,
  userId: string
): Promise<ProfileSeed> {
  const [userInfo, customFields] = await Promise.all([
    ctx.slack.users.info({user: userId}),
    lookupSlackCustomFields(ctx, caches, userId),
  ]);
  return buildSlackSeed(userId, userInfo.user, customFields);
}

async function lookupSlackCustomFields(
  ctx: HandlerCtx,
  caches: Caches,
  userId: string
): Promise<SlackCustomFields> {
  try {
    const [fieldIds, response] = await Promise.all([
      getSlackFieldIds(ctx, caches),
      ctx.slack.users.profile.get({user: userId}),
    ]);
    const fields = response.profile?.fields ?? {};
    return {
      division: readSlackField(fields, fieldIds, 'division'),
      team: readSlackField(fields, fieldIds, 'team'),
      manager: readSlackField(fields, fieldIds, 'manager'),
    };
  } catch {
    return {};
  }
}

async function getSlackFieldIds(
  ctx: HandlerCtx,
  caches: Caches
): Promise<Map<string, string>> {
  if (caches.fieldIds && caches.fieldIds.expiresAt > Date.now()) {
    return caches.fieldIds.fieldIds;
  }
  try {
    const response = await ctx.slack.team.profile.get();
    const fieldIds = new Map(
      (response.profile?.fields ?? []).flatMap((field) =>
        field.label && field.id ? [[field.label.toLowerCase(), field.id]] : []
      )
    );
    caches.fieldIds = {
      fieldIds,
      expiresAt: Date.now() + SLACK_FIELD_IDS_TTL_MS,
    };
    return fieldIds;
  } catch {
    return new Map();
  }
}

async function getCachedCodeowners(ctx: HandlerCtx): Promise<string> {
  const cached = ctx.scratch.codeownersText as
    | {text: string; expiresAt: number}
    | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.text;
  const fetched = (await ctx.github.fetchCodeowners().catch(() => null)) ?? '';
  ctx.scratch.codeownersText = {
    text: fetched,
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  return fetched;
}

function getDocsForTrack(ctx: HandlerCtx, track: RoleTrack): DocLink[] {
  const baseUrl = ctx.confluence.baseUrl();
  return getDocDefinitions(track).map((doc) => ({
    ...doc,
    url: baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/spaces/ENG/pages/${DOC_PAGE_IDS[doc.id]}`
      : null,
  }));
}

// ---- helpers ----

function mergeSeed(
  userId: string,
  fallbackDisplayName: string,
  slackSeed: ProfileSeed | null,
  email?: string
): ProfileSeed {
  return {
    userId,
    firstName: slackSeed?.firstName,
    displayName: slackSeed?.displayName ?? fallbackDisplayName,
    avatarUrl: slackSeed?.avatarUrl,
    email: slackSeed?.email ?? email,
    teamName: slackSeed?.teamName,
    pillarName: slackSeed?.pillarName,
    manager: slackSeed?.manager,
  };
}

function inferRoleTrack(teamName: string): RoleTrack {
  const normalized = teamName.toLowerCase();
  if (
    ['frontend', 'designer', 'design', 'ui', 'spring'].some((value) =>
      normalized.includes(value)
    )
  ) {
    return 'frontend';
  }
  if (
    ['backend', 'server', 'billing', 'cms', 'auth', 'api'].some((value) =>
      normalized.includes(value)
    )
  ) {
    return 'backend';
  }
  if (
    ['infra', 'platform', 'cloud', 'build', 'delivery'].some((value) =>
      normalized.includes(value)
    )
  ) {
    return 'infrastructure';
  }
  return 'general';
}

function personalizePerson(
  person: OnboardingPerson,
  teamName: string
): OnboardingPerson {
  if (person.role === 'Engineering Manager') {
    const label = teamName.toLowerCase().includes('engineering')
      ? 'Your engineering manager'
      : `Your ${teamName} engineering manager`;
    return {...person, name: label};
  }
  return person;
}

function buildFallbackTeammate(
  teamName: string,
  template: OnboardingPerson
): OnboardingPerson {
  return {
    ...template,
    name: `${teamName} teammate`,
    discussionPoints: `Ask about the parts of ${teamName} that matter most in the first month, the code paths they touch most often, and who would be most helpful to meet next.`,
  };
}

function buildSlackSeed(
  userId: string,
  user: SlackUser | undefined,
  customFields: SlackCustomFields
): ProfileSeed {
  const profile = user?.profile;
  return {
    userId,
    firstName: slackFirstName(user),
    displayName: slackDisplayName(user) ?? 'New hire',
    avatarUrl: profile?.image_192 ?? profile?.image_72,
    email: profile?.email,
    teamName: slackFieldText(customFields.team),
    pillarName: slackFieldText(customFields.division),
    manager: buildManagerPerson(customFields.manager),
  };
}

function mergeSlackUserProfile(
  person: OnboardingPerson,
  user: SlackUser | undefined
): OnboardingPerson {
  const profile = user?.profile;
  const title = profile?.title?.trim();
  return {
    ...person,
    name: slackDisplayName(user) ?? person.name,
    role: title || person.role,
    title,
    email: profile?.email ?? person.email,
    slackUserId: user?.id ?? person.slackUserId,
    avatarUrl: profile?.image_192 ?? profile?.image_72 ?? person.avatarUrl,
  };
}

function slackDisplayName(user: SlackUser | undefined): string | undefined {
  const profile = user?.profile;
  return firstNonEmpty(
    profile?.display_name,
    profile?.real_name,
    user?.real_name
  );
}

function slackFirstName(user: SlackUser | undefined): string | undefined {
  const profile = user?.profile;
  return firstNonEmpty(
    profile?.first_name,
    firstNameFromValue(profile?.display_name),
    firstNameFromValue(profile?.real_name),
    firstNameFromValue(user?.real_name)
  );
}

function readSlackField(
  fields: Record<string, SlackProfileFieldValue>,
  fieldIds: Map<string, string>,
  label: string
): SlackProfileFieldValue | undefined {
  const fieldId = fieldIds.get(label);
  return fieldId ? fields[fieldId] : undefined;
}

function buildManagerPerson(
  managerField: SlackProfileFieldValue | undefined
): OnboardingPerson | undefined {
  const name = slackFieldText(managerField);
  if (!name) return undefined;
  return {
    name,
    role: 'Engineering Manager',
    kind: 'manager',
    editableBy: 'manager',
    discussionPoints:
      'Role expectations, day-to-day support, performance goals, and how the team roadmap connects to your first few weeks.',
    weekBucket: 'week1-2',
    slackUserId: parseSlackUserId(managerField?.value),
  };
}

function slackFieldText(
  field: SlackProfileFieldValue | undefined
): string | undefined {
  const value = field?.alt?.trim() || field?.value?.trim();
  return value || undefined;
}

function parseSlackUserId(value?: string): string | undefined {
  const cleaned = value?.trim().replace(/[<@>]/g, '');
  return cleaned && /^U[A-Z0-9]+$/.test(cleaned) ? cleaned : undefined;
}

function firstNonEmpty(
  ...values: Array<string | undefined | null>
): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function firstNameFromValue(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.split(/\s+/)[0] || undefined;
}

// Used by Slack-less lookup paths (e.g. lookup/team route) to seed
// a profile purely from an email without requiring Slack scope.
export {
  inferRoleTrack as _inferRoleTrackForTest,
  buildFallbackTeammate as _buildFallbackTeammateForTest,
};
