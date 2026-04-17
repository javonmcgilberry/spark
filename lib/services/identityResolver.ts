/**
 * identityResolver — build a TeamProfile for a new hire.
 *
 * Data sources, in order of preference for each field:
 *   1. DX warehouse (ctx.org) — teammates, cross-functional partners,
 *      manager chain. Primary source of truth when DX_WAREHOUSE_DSN
 *      is configured.
 *   2. Slack — hydration layer (avatar, display name, Slack user id)
 *      for rows that came from the warehouse; also the hire's own
 *      custom fields (team / pillar / manager name) for bootstrapping.
 *   3. CODEOWNERS — GitHub team slug + keyPaths suggestions.
 *
 * When the warehouse is unreachable or unconfigured, the resolver
 * degrades to a Slack-only fallback: the hire's manager from custom
 * fields + catalog defaults for the rest of the roster. The UI stays
 * alive; the user sees a bounded set of real + placeholder rows,
 * never a half-populated list of invented names.
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
import type {OrgPerson} from './orgGraph';
import type {SlackProfileFieldValue, SlackUser} from './slack';
import {listAllUsers, type SlackUserHit} from './slackUserDirectory';

const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const SLACK_FIELD_IDS_TTL_MS = 60 * 60 * 1000;
const SLACK_CUSTOM_FIELDS_TTL_MS = 10 * 60 * 1000;

/**
 * Visible-roster caps. peopleToMeet stays small and reviewable; the
 * rest of the team is still discoverable via the workspace picker.
 */
const MAX_TEAMMATES = 4;
const MAX_CROSS_FUNCTIONAL_TOTAL = 3;

interface ProfileSeed {
  userId: string;
  displayName: string;
  firstName?: string;
  avatarUrl?: string;
  email?: string;
  title?: string;
  teamName?: string;
  pillarName?: string;
  manager?: OnboardingPerson;
}

interface SlackCustomFields {
  division?: SlackProfileFieldValue;
  team?: SlackProfileFieldValue;
  department?: SlackProfileFieldValue;
  manager?: SlackProfileFieldValue;
}

interface Caches {
  profile: Map<string, {profile: TeamProfile; expiresAt: number}>;
  customFields: Map<
    string,
    {customFields: SlackCustomFields; expiresAt: number}
  >;
  fieldIds: {fieldIds: Map<string, string>; expiresAt: number} | undefined;
  /** Directory lookup by lowercase email. Built lazily from listAllUsers. */
  directoryByEmail: Map<string, SlackUserHit> | undefined;
}

interface OrgLookupOptions {
  hireUserId: string;
  hireEmail?: string;
  hireTitle?: string;
  teamName: string;
  pillarName?: string;
  managerUserId?: string;
}

function getCaches(ctx: HandlerCtx): Caches {
  const existing = ctx.scratch.identityCaches as Caches | undefined;
  if (existing) return existing;
  const created: Caches = {
    profile: new Map(),
    customFields: new Map(),
    fieldIds: undefined,
    directoryByEmail: undefined,
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

export async function applyTeamHint(
  ctx: HandlerCtx,
  profile: TeamProfile,
  teamHint: string | undefined
): Promise<TeamProfile> {
  const trimmedHint = teamHint?.trim();
  if (!trimmedHint) return profile;
  if (trimmedHint.toLowerCase() === profile.teamName.trim().toLowerCase()) {
    return profile;
  }
  return buildProfile(ctx, {
    userId: profile.userId,
    firstName: profile.firstName,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    email: profile.email,
    teamName: trimmedHint,
    pillarName: profile.pillarName,
    manager: profile.manager,
  });
}

async function buildProfile(
  ctx: HandlerCtx,
  seed: ProfileSeed
): Promise<TeamProfile> {
  const caches = getCaches(ctx);
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
  const people = await buildPeople(
    ctx,
    caches,
    {
      hireUserId: seed.userId,
      hireEmail: seed.email,
      hireTitle: seed.title,
      teamName,
      pillarName: seed.pillarName,
      managerUserId: seed.manager?.slackUserId,
    },
    seed.manager
  );

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
  caches: Caches,
  options: OrgLookupOptions,
  managerOverride: OnboardingPerson | undefined
): Promise<{
  manager: OnboardingPerson;
  buddy: OnboardingPerson;
  teammates: OnboardingPerson[];
}> {
  const defaults = buildDefaultPeople();
  const buddy = personalizePerson(defaults[1], options.teamName);

  const managerCandidate = managerOverride
    ? {
        ...personalizePerson(defaults[0], options.teamName),
        ...managerOverride,
      }
    : personalizePerson(defaults[0], options.teamName);

  // Manager hydration and roster construction are independent Slack
  // round-trips; run them in parallel so the create-draft handler's
  // identity phase costs max(manager, roster) instead of the sum.
  const [manager, teammates] = await Promise.all([
    managerCandidate.slackUserId || managerCandidate.email
      ? hydratePerson(ctx, managerCandidate).catch(() => managerCandidate)
      : Promise.resolve(managerCandidate),
    buildOrgRoster(ctx, caches, options, defaults),
  ]);

  return {manager, buddy, teammates};
}

/**
 * Build the curated people-to-meet roster. Prefers DX warehouse data;
 * falls back to catalog defaults only when neither warehouse nor
 * Slack has anything meaningful to offer.
 */
async function buildOrgRoster(
  ctx: HandlerCtx,
  caches: Caches,
  options: OrgLookupOptions,
  defaults: OnboardingPerson[]
): Promise<OnboardingPerson[]> {
  const teammateTemplate = defaults[2];
  const pmTemplate = defaults[3];
  const designerTemplate = defaults[4];
  const directorTemplate = defaults[5];
  const peoplePartnerTemplate = defaults[6];

  if (ctx.org.isConfigured()) {
    try {
      const [rawTeammates, crossFunc] = await Promise.all([
        ctx.org.lookupTeammates(
          options.teamName,
          options.hireEmail,
          MAX_TEAMMATES
        ),
        ctx.org.lookupCrossFunctional(options.teamName, options.pillarName),
      ]);

      // Parallelize Slack hydration across every warehouse row.
      // Preserves warehouse ordering by attaching the template up-front.
      const teammateJobs = rawTeammates
        .slice(0, MAX_TEAMMATES)
        .map((entry) =>
          hydrateOrgPerson(ctx, caches, entry).then((hydrated) =>
            applyTemplate(teammateTemplate, hydrated)
          )
        );
      const crossFuncSlots: Array<[OrgPerson | undefined, OnboardingPerson]> = [
        [crossFunc.pm, pmTemplate],
        [crossFunc.designer, designerTemplate],
        [crossFunc.director, directorTemplate],
        [crossFunc.peoplePartner, peoplePartnerTemplate],
      ];
      const crossFuncJobs = crossFuncSlots
        .filter(
          (entry): entry is [OrgPerson, OnboardingPerson] =>
            entry[0] !== undefined
        )
        .map(([entry, template]) =>
          hydrateOrgPerson(ctx, caches, entry).then((hydrated) =>
            applyTemplate(template, hydrated)
          )
        );
      const [hydratedTeammates, hydratedCrossFunc] = await Promise.all([
        Promise.all(teammateJobs),
        Promise.all(crossFuncJobs),
      ]);

      const teammates: OnboardingPerson[] = [];
      for (const row of hydratedTeammates) {
        pushUniquePerson(teammates, row);
      }
      const crossFunctional: OnboardingPerson[] = [];
      for (const row of hydratedCrossFunc) {
        if (crossFunctional.length >= MAX_CROSS_FUNCTIONAL_TOTAL) break;
        pushUniquePerson(crossFunctional, row);
      }

      const combined = [...teammates, ...crossFunctional];
      if (combined.length > 0) {
        ctx.logger.info(
          `identityResolver: warehouse returned ${teammates.length} teammate(s) + ${crossFunctional.length} cross-functional for ${options.teamName}`
        );
        return combined;
      }
      ctx.logger.info(
        `identityResolver: warehouse returned no roster for ${options.teamName}; using Slack fallback`
      );
    } catch (error) {
      ctx.logger.warn(
        `identityResolver: warehouse roster lookup threw for ${options.teamName}; using Slack fallback`,
        error
      );
    }
  } else {
    ctx.logger.info(
      'identityResolver: DX warehouse not configured; using Slack fallback'
    );
  }

  return buildSlackFallbackRoster(ctx, options, defaults);
}

/**
 * Slack-only fallback. No Direct-Reports parsing, no division heuristic,
 * no full-engineer scan — just the hire's team name attached to the
 * default catalog templates so the UI has something meaningful to
 * render while an operator investigates why the warehouse call didn't
 * work.
 */
function buildSlackFallbackRoster(
  ctx: HandlerCtx,
  options: OrgLookupOptions,
  defaults: OnboardingPerson[]
): OnboardingPerson[] {
  const teammateTemplate = defaults[2];
  const fallback = buildFallbackTeammate(options.teamName, teammateTemplate);
  // Keep the catalog's PM / Designer / Director / People Partner
  // placeholders so the layout still has every section, even if they're
  // unnamed. The manager has already been hydrated above.
  return [fallback, ...defaults.slice(3)];
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

/**
 * Enrich an OrgPerson with Slack identity (slackUserId + avatar +
 * display name) via the cached workspace directory. Falls back to a
 * targeted users.lookupByEmail for emails we don't have in the cache
 * yet. Safe to call with a partial directory — a miss keeps the
 * warehouse fields as-is.
 */
async function hydrateOrgPerson(
  ctx: HandlerCtx,
  caches: Caches,
  entry: OrgPerson
): Promise<OrgPerson & {slackUserId?: string; avatarUrl?: string}> {
  const directoryByEmail = await getDirectoryByEmail(ctx, caches);
  const byEmail = directoryByEmail.get(entry.email.trim().toLowerCase());
  if (byEmail) {
    return {
      ...entry,
      slackUserId: byEmail.slackUserId,
      avatarUrl: byEmail.avatarUrl,
    };
  }
  try {
    const res = await ctx.slack.users.lookupByEmail({email: entry.email});
    if (!res.ok || !res.user?.id) return entry;
    const profile = res.user.profile;
    return {
      ...entry,
      slackUserId: res.user.id,
      avatarUrl: profile?.image_192 ?? profile?.image_72,
    };
  } catch {
    return entry;
  }
}

async function getDirectoryByEmail(
  ctx: HandlerCtx,
  caches: Caches
): Promise<Map<string, SlackUserHit>> {
  if (caches.directoryByEmail) return caches.directoryByEmail;
  const directory = await listAllUsers(ctx).catch(() => []);
  const byEmail = new Map<string, SlackUserHit>();
  for (const user of directory) {
    if (user.email) byEmail.set(user.email.toLowerCase(), user);
  }
  caches.directoryByEmail = byEmail;
  return byEmail;
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
  const cached = caches.customFields.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.customFields;
  }
  try {
    const [fieldIds, response] = await Promise.all([
      getSlackFieldIds(ctx, caches),
      ctx.slack.users.profile.get({user: userId}),
    ]);
    const fields = response.profile?.fields ?? {};
    const customFields = {
      division: readSlackField(fields, fieldIds, 'division'),
      team: readSlackField(fields, fieldIds, 'team'),
      department: readSlackField(fields, fieldIds, 'department'),
      manager: readSlackField(fields, fieldIds, 'manager'),
    };
    caches.customFields.set(userId, {
      customFields,
      expiresAt: Date.now() + SLACK_CUSTOM_FIELDS_TTL_MS,
    });
    return customFields;
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
    title: slackSeed?.title,
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

/**
 * Build an OnboardingPerson from a catalog template + a warehouse
 * OrgPerson (optionally hydrated with Slack identity). Preserves the
 * template's kind / editableBy / weekBucket / discussionPoints while
 * filling real identity from the org graph.
 */
function applyTemplate(
  template: OnboardingPerson,
  entry: OrgPerson & {slackUserId?: string; avatarUrl?: string}
): OnboardingPerson {
  return {
    ...template,
    name: entry.name,
    role: entry.title?.trim() || template.role,
    title: entry.title?.trim() || undefined,
    email: entry.email,
    slackUserId: entry.slackUserId,
    avatarUrl: entry.avatarUrl,
  };
}

function pushUniquePerson(
  people: OnboardingPerson[],
  person: OnboardingPerson
): void {
  const key = canonicalPersonKey(person);
  if (people.some((candidate) => canonicalPersonKey(candidate) === key)) return;
  people.push(person);
}

function canonicalPersonKey(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name)
    .trim()
    .toLowerCase();
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
    title: profile?.title?.trim() || undefined,
    teamName: firstNonEmpty(
      slackFieldText(customFields.team),
      normalizeDepartmentTeamName(slackFieldText(customFields.department))
    ),
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

function normalizeDepartmentTeamName(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const withoutPrefix = trimmed.replace(/^\d+\s+/, '');
  const withoutSuffix = withoutPrefix.replace(/\s+team$/i, '');
  return withoutSuffix.trim() || undefined;
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

export {
  inferRoleTrack as _inferRoleTrackForTest,
  buildFallbackTeammate as _buildFallbackTeammateForTest,
};
