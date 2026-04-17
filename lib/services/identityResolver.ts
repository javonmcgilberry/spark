/**
 * identityResolver — builds a TeamProfile from a Slack user id or
 * email. Sources of truth:
 *   1. Slack user profile + custom fields (team/department, division, manager)
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
import {listAllUsers, type SlackUserHit} from './slackUserDirectory';

const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const SLACK_FIELD_IDS_TTL_MS = 60 * 60 * 1000;
const SLACK_CUSTOM_FIELDS_TTL_MS = 10 * 60 * 1000;
const ORG_LOOKUP_CONCURRENCY = 8;

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
}

interface OrgLookupOptions {
  hireUserId: string;
  hireTitle?: string;
  teamName: string;
  pillarName?: string;
  managerUserId?: string;
}

interface OrgCandidate {
  user: SlackUserHit;
  customFields: SlackCustomFields;
}

function getCaches(ctx: HandlerCtx): Caches {
  const existing = ctx.scratch.identityCaches as Caches | undefined;
  if (existing) return existing;
  const created: Caches = {
    profile: new Map(),
    customFields: new Map(),
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
  const people = buildDefaultPeople();
  const buddy = personalizePerson(people[1], options.teamName);
  const managerCandidate = managerOverride
    ? {
        ...personalizePerson(people[0], options.teamName),
        ...managerOverride,
      }
    : personalizePerson(people[0], options.teamName);
  const manager =
    managerCandidate.slackUserId || managerCandidate.email
      ? await hydratePerson(ctx, managerCandidate).catch(() => managerCandidate)
      : managerCandidate;
  const orgPeople = await lookupOrgPeople(ctx, caches, {
    ...options,
    managerUserId: manager.slackUserId ?? options.managerUserId,
  }).catch(() => ({teammates: []}));

  return {
    manager,
    buddy,
    teammates:
      orgPeople.teammates.length > 0
        ? orgPeople.teammates
        : [
            buildFallbackTeammate(options.teamName, people[2]),
            ...people.slice(3),
          ],
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

async function lookupOrgPeople(
  ctx: HandlerCtx,
  caches: Caches,
  options: OrgLookupOptions
): Promise<{
  teammates: OnboardingPerson[];
}> {
  const directory = await listAllUsers(ctx).catch(() => []);
  if (directory.length === 0) return {teammates: []};

  const templates = buildDefaultPeople();
  const teammateTemplate = templates[2];
  const pmTemplate = templates[3];
  const designerTemplate = templates[4];
  const directorTemplate = templates[5];
  const peoplePartnerTemplate = templates[6];

  const engineerCandidates = await enrichCandidates(
    ctx,
    caches,
    directory.filter(
      (user) =>
        user.slackUserId !== options.hireUserId &&
        user.slackUserId !== options.managerUserId &&
        isEngineeringIcTitle(user.title)
    )
  );
  // Rank every engineer and keep the top 3. Weak signals (no manager,
  // no division/team, no role affinity) still return teammates — the
  // score just becomes a tie-breaker. Only filter to score>0 when we
  // actually have strong signals from the hire's custom fields.
  const hasStrongSignal =
    Boolean(options.managerUserId) ||
    Boolean(normalizeLabelValue(options.pillarName)) ||
    Boolean(normalizeLabelValue(options.teamName));
  const rankedEngineers = engineerCandidates
    .map((candidate) => ({
      candidate,
      score: rankEngineerCandidate(candidate, options),
    }))
    .filter((entry) => (hasStrongSignal ? entry.score > 0 : true))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const seniorityDelta =
        seniorityScore(b.candidate.user.title) -
        seniorityScore(a.candidate.user.title);
      if (seniorityDelta !== 0) return seniorityDelta;
      return a.candidate.user.name.localeCompare(
        b.candidate.user.name,
        undefined,
        {
          sensitivity: 'base',
        }
      );
    })
    .map((entry) => entry.candidate);

  const teammates: OnboardingPerson[] = [];
  for (const candidate of rankedEngineers.slice(0, 3)) {
    pushUniquePerson(
      teammates,
      buildResolvedPerson(teammateTemplate, candidate)
    );
  }

  const pmCandidate = await selectDivisionCandidate(
    ctx,
    caches,
    directory.filter(
      (user) =>
        user.slackUserId !== options.hireUserId &&
        isProductManagerTitle(user.title)
    ),
    options
  );
  if (pmCandidate) {
    pushUniquePerson(teammates, buildResolvedPerson(pmTemplate, pmCandidate));
  }

  const designerCandidate = await selectDivisionCandidate(
    ctx,
    caches,
    directory.filter(
      (user) =>
        user.slackUserId !== options.hireUserId && isDesignerTitle(user.title)
    ),
    options
  );
  if (designerCandidate) {
    pushUniquePerson(
      teammates,
      buildResolvedPerson(designerTemplate, designerCandidate)
    );
  }

  const directorCandidate = await resolveDirectorCandidate(
    ctx,
    caches,
    directory,
    options
  );
  if (directorCandidate) {
    pushUniquePerson(
      teammates,
      buildResolvedPerson(directorTemplate, directorCandidate)
    );
  }

  const peoplePartnerCandidate = directory
    .filter(
      (user) =>
        user.slackUserId !== options.hireUserId &&
        isPeoplePartnerTitle(user.title)
    )
    .sort((a, b) => {
      const seniorityDelta = seniorityScore(b.title) - seniorityScore(a.title);
      if (seniorityDelta !== 0) return seniorityDelta;
      return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'});
    })[0];
  if (peoplePartnerCandidate) {
    pushUniquePerson(
      teammates,
      buildResolvedPerson(peoplePartnerTemplate, {
        user: peoplePartnerCandidate,
        customFields: {},
      })
    );
  }

  return {teammates};
}

async function enrichCandidates(
  ctx: HandlerCtx,
  caches: Caches,
  users: SlackUserHit[]
): Promise<OrgCandidate[]> {
  const results: OrgCandidate[] = [];
  let index = 0;
  const workers = Array.from(
    {length: Math.min(ORG_LOOKUP_CONCURRENCY, users.length)},
    async () => {
      while (index < users.length) {
        const current = users[index++];
        const customFields = await lookupSlackCustomFields(
          ctx,
          caches,
          current.slackUserId
        );
        results.push({user: current, customFields});
      }
    }
  );
  await Promise.all(workers);
  return results;
}

async function selectDivisionCandidate(
  ctx: HandlerCtx,
  caches: Caches,
  users: SlackUserHit[],
  options: OrgLookupOptions
): Promise<OrgCandidate | undefined> {
  const candidates = await enrichCandidates(ctx, caches, users);
  return (
    candidates.find((candidate) =>
      matchesDivision(candidate, options.pillarName)
    ) ??
    candidates.find((candidate) =>
      matchesTeamName(candidate, options.teamName)
    ) ??
    candidates[0]
  );
}

async function resolveDirectorCandidate(
  ctx: HandlerCtx,
  caches: Caches,
  directory: SlackUserHit[],
  options: OrgLookupOptions
): Promise<OrgCandidate | undefined> {
  const byId = new Map(directory.map((user) => [user.slackUserId, user]));
  let currentId = options.managerUserId;
  for (let depth = 0; depth < 4 && currentId; depth += 1) {
    const user = byId.get(currentId);
    if (!user) break;
    const customFields = await lookupSlackCustomFields(ctx, caches, currentId);
    const candidate = {user, customFields};
    if (isEngineeringDirectorTitle(user.title)) {
      return candidate;
    }
    currentId = managerUserIdFromFields(customFields);
  }

  return selectDivisionCandidate(
    ctx,
    caches,
    directory.filter((user) => isEngineeringDirectorTitle(user.title)),
    options
  );
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

function buildResolvedPerson(
  template: OnboardingPerson,
  candidate: OrgCandidate
): OnboardingPerson {
  return {
    ...template,
    name: candidate.user.name,
    role: candidate.user.title?.trim() || template.role,
    title: candidate.user.title?.trim() || undefined,
    email: candidate.user.email,
    slackUserId: candidate.user.slackUserId,
    avatarUrl: candidate.user.avatarUrl,
  };
}

function pushUniquePerson(
  people: OnboardingPerson[],
  person: OnboardingPerson
): void {
  const key = (person.slackUserId || person.email || person.name).toLowerCase();
  if (
    people.some(
      (candidate) =>
        (
          candidate.slackUserId ||
          candidate.email ||
          candidate.name
        ).toLowerCase() === key
    )
  ) {
    return;
  }
  people.push(person);
}

function rankEngineerCandidate(
  candidate: OrgCandidate,
  options: OrgLookupOptions
): number {
  let score = 0;
  const managerUserId = managerUserIdFromFields(candidate.customFields);
  if (options.managerUserId && managerUserId === options.managerUserId) {
    score += 100;
  }
  if (matchesDivision(candidate, options.pillarName)) {
    score += 30;
  }
  if (matchesTeamName(candidate, options.teamName)) {
    score += 20;
  }
  score += roleAffinityScore(options.hireTitle, candidate.user.title);
  return score;
}

function matchesDivision(
  candidate: OrgCandidate,
  pillarName: string | undefined
): boolean {
  const expected = normalizeLabelValue(pillarName);
  if (!expected) return false;
  return (
    normalizeLabelValue(slackFieldText(candidate.customFields.division)) ===
    expected
  );
}

function matchesTeamName(
  candidate: OrgCandidate,
  teamName: string | undefined
): boolean {
  const expected = normalizeLabelValue(teamName);
  if (!expected) return false;
  return (
    normalizeLabelValue(
      firstNonEmpty(
        slackFieldText(candidate.customFields.team),
        normalizeDepartmentTeamName(
          slackFieldText(candidate.customFields.department)
        )
      )
    ) === expected
  );
}

function normalizeLabelValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || undefined;
}

function managerUserIdFromFields(
  customFields: SlackCustomFields
): string | undefined {
  return parseSlackUserId(customFields.manager?.value);
}

function roleAffinityScore(
  hireTitle: string | undefined,
  candidateTitle: string | undefined
): number {
  const hire = hireTitle?.toLowerCase() ?? '';
  const candidate = candidateTitle?.toLowerCase() ?? '';
  if (!hire || !candidate) return 0;
  if (hire.includes('frontend') && candidate.includes('frontend')) return 20;
  if (hire.includes('backend') && candidate.includes('backend')) return 20;
  if (hire.includes('fullstack') && candidate.includes('fullstack')) return 15;
  if (
    hire.includes('software engineer') &&
    candidate.includes('software engineer')
  ) {
    return 10;
  }
  return 0;
}

function isEngineeringIcTitle(title: string | undefined): boolean {
  const normalized = title?.toLowerCase() ?? '';
  if (!normalized) return false;
  if (/(manager|director|product|designer|people partner)/.test(normalized)) {
    return false;
  }
  return /(engineer|developer|frontend|backend|fullstack|architect)/.test(
    normalized
  );
}

function isProductManagerTitle(title: string | undefined): boolean {
  return /product manager/i.test(title ?? '');
}

function isDesignerTitle(title: string | undefined): boolean {
  return /designer/i.test(title ?? '');
}

function isEngineeringDirectorTitle(title: string | undefined): boolean {
  const normalized = title?.toLowerCase() ?? '';
  return normalized.includes('director') && normalized.includes('engineer');
}

function isPeoplePartnerTitle(title: string | undefined): boolean {
  return /(people (business )?partner|business partner)/i.test(title ?? '');
}

function seniorityScore(title: string | undefined): number {
  const normalized = title?.toLowerCase() ?? '';
  if (normalized.includes('lead')) return 3;
  if (normalized.includes('senior')) return 2;
  return 1;
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

// Used by Slack-less lookup paths (e.g. lookup/team route) to seed
// a profile purely from an email without requiring Slack scope.
export {
  inferRoleTrack as _inferRoleTrackForTest,
  buildFallbackTeammate as _buildFallbackTeammateForTest,
};
