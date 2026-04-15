import pg from 'pg';
import type {App} from '@slack/bolt';
import type {
  TeamProfileGetResponse,
  UsersInfoResponse,
  UsersLookupByEmailResponse,
  UsersProfileGetResponse,
} from '@slack/web-api';
import type {Logger} from '../app/logger.js';
import type {EnvConfig} from '../config/env.js';
import {
  buildChecklist,
  buildDefaultChannels,
  buildDefaultPeople,
  buildDefaultRituals,
  buildDefaultTools,
} from '../onboarding/catalog.js';
import type {
  OnboardingPerson,
  RoleTrack,
  TeamProfile,
} from '../onboarding/types.js';
import {CodeownersService} from './codeownersService.js';
import {ConfluenceDocsService} from './confluenceDocsService.js';

const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const SLACK_PROFILE_FIELDS_CACHE_TTL_MS = 60 * 60 * 1000;

interface DxLookupResult {
  displayName?: string;
  email?: string;
  teamName?: string;
  pillarName?: string;
}

interface ProfileSeed {
  userId: string;
  displayName: string;
  email?: string;
  teamName?: string;
  pillarName?: string;
  manager?: OnboardingPerson;
}

type SlackProfileFieldValue = NonNullable<
  NonNullable<UsersProfileGetResponse['profile']>['fields']
>[string];

interface SlackCustomFields {
  division?: SlackProfileFieldValue;
  team?: SlackProfileFieldValue;
  manager?: SlackProfileFieldValue;
}

type SlackUserRecord =
  | UsersInfoResponse['user']
  | UsersLookupByEmailResponse['user'];

export class IdentityResolver {
  private readonly profileCache = new Map<
    string,
    {profile: TeamProfile; expiresAt: number}
  >();
  private slackFieldIdsCache:
    | {fieldIds: Map<string, string>; expiresAt: number}
    | undefined;

  constructor(
    private readonly env: EnvConfig,
    private readonly logger: Logger,
    private readonly docsService: ConfluenceDocsService,
    private readonly codeownersService: CodeownersService
  ) {}

  async resolveFromEmail(
    email: string,
    slackClient?: App['client']
  ): Promise<TeamProfile> {
    const cached = this.profileCache.get(email);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.profile;
    }

    const slackSeed = slackClient
      ? await this.lookupSlackSeedByEmail(slackClient, email)
      : null;
    const dx =
      (slackSeed?.teamName && slackSeed.pillarName) || !this.env.dxWarehouseDsn
        ? null
        : await this.lookupTeam(email);
    const profile = await this.buildProfile(
      this.mergeSeed(email, email.split('@')[0], slackSeed, dx, email),
      slackClient
    );
    this.cacheProfile(email, profile);
    return profile;
  }

  async resolveFromSlack(app: App, userId: string): Promise<TeamProfile> {
    const cached = this.profileCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.profile;
    }

    const slackSeed = await this.lookupSlackSeed(app.client, userId);
    const dx =
      slackSeed.email &&
      (!slackSeed.teamName || !slackSeed.pillarName) &&
      this.env.dxWarehouseDsn
        ? await this.lookupTeam(slackSeed.email)
        : null;
    const profile = await this.buildProfile(
      this.mergeSeed(userId, slackSeed.displayName, slackSeed, dx),
      app.client
    );

    this.cacheProfile(userId, profile);
    return profile;
  }

  private async buildProfile(
    seed: ProfileSeed,
    slackClient?: App['client']
  ): Promise<TeamProfile> {
    const firstName = seed.displayName.split(/\s+/)[0] || 'there';
    const teamName = seed.teamName ?? 'Engineering';
    const roleTrack = inferRoleTrack(teamName);
    const githubTeamSlug =
      await this.codeownersService.findGitHubTeamSlug(teamName);
    const keyPaths = await this.codeownersService.suggestPathsForTeam(
      teamName,
      githubTeamSlug
    );
    const people = await this.buildPeople(
      teamName,
      seed.email,
      seed.manager,
      slackClient
    );

    return {
      userId: seed.userId,
      firstName,
      displayName: seed.displayName,
      email: seed.email,
      teamName,
      pillarName: seed.pillarName,
      githubTeamSlug,
      roleTrack,
      manager: people.manager,
      buddy: people.buddy,
      teammates: people.teammates,
      docs: this.docsService.getDocsForTrack(roleTrack),
      keyPaths,
      recommendedChannels: buildDefaultChannels(),
      tools: buildDefaultTools(),
      rituals: buildDefaultRituals(),
      checklist: buildChecklist(),
    };
  }

  private async buildPeople(
    teamName: string,
    email: string | undefined,
    managerOverride: OnboardingPerson | undefined,
    slackClient?: App['client']
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
      slackClient && (managerCandidate.slackUserId || managerCandidate.email)
        ? await this.hydratePersonWithSlackProfile(
            slackClient,
            managerCandidate
          )
        : managerCandidate;
    const rawTeammates = await this.lookupTeammates(teamName, email);
    const teammates = await this.hydratePeopleWithSlackProfiles(
      slackClient,
      rawTeammates
    );

    return {
      manager,
      buddy: personalizePerson(people[1], teamName),
      teammates:
        teammates.length > 0
          ? [...scheduleTeammates(teammates), ...people.slice(3)]
          : [buildFallbackTeammate(teamName, people[2]), ...people.slice(3)],
    };
  }

  private cacheProfile(cacheKey: string, profile: TeamProfile): void {
    this.profileCache.set(cacheKey, {
      profile,
      expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
    });
  }

  private mergeSeed(
    userId: string,
    fallbackDisplayName: string,
    slackSeed: ProfileSeed | null,
    dx: DxLookupResult | null,
    email?: string
  ): ProfileSeed {
    return {
      userId,
      displayName:
        slackSeed?.displayName ?? dx?.displayName ?? fallbackDisplayName,
      email: slackSeed?.email ?? dx?.email ?? email,
      teamName: slackSeed?.teamName ?? dx?.teamName,
      pillarName: slackSeed?.pillarName ?? dx?.pillarName,
      manager: slackSeed?.manager,
    };
  }

  private async withDxClient<T>(
    work: (client: pg.Client) => Promise<T>
  ): Promise<T> {
    const client = new pg.Client({
      connectionString: this.env.dxWarehouseDsn,
      ssl: {rejectUnauthorized: false},
    });
    await client.connect();

    try {
      return await work(client);
    } finally {
      await client.end();
    }
  }

  private async lookupTeammates(
    teamName: string,
    excludeEmail?: string
  ): Promise<OnboardingPerson[]> {
    if (!this.env.dxWarehouseDsn) {
      return [];
    }

    try {
      this.logger.info(`Looking up teammates for team: ${teamName}`);
      const rows = await this.withDxClient(async (client) => {
        const result = await client.query<{name: string; email: string}>(
          `SELECT u.name, u.email
           FROM public.dx_users u
           JOIN (
             SELECT vtm.user_id, MAX(vd.date) AS latest_date
             FROM public.dx_versioned_team_members vtm
             JOIN public.dx_versioned_teams vt ON vtm.versioned_team_id = vt.id
             JOIN public.dx_versioned_team_dates vd ON vt.versioned_team_date_id = vd.id
             GROUP BY vtm.user_id
           ) lpu ON lpu.user_id = u.id
           JOIN public.dx_versioned_team_members vtm ON vtm.user_id = u.id
           JOIN public.dx_versioned_teams vt ON vtm.versioned_team_id = vt.id
           JOIN public.dx_versioned_team_dates vd
             ON vt.versioned_team_date_id = vd.id AND vd.date = lpu.latest_date
           WHERE u.deleted_at IS NULL
             AND vt.name ILIKE $1
           ORDER BY u.name
           LIMIT 15`,
          [teamName]
        );
        return result.rows;
      });

      this.logger.info(`Teammate query returned ${rows.length} rows`);

      const results: OnboardingPerson[] = [];
      for (const row of rows) {
        if (row.email === excludeEmail) continue;
        results.push({
          name: row.name,
          email: row.email,
          kind: 'teammate',
          editableBy: 'team',
          role: 'Teammate',
          discussionPoints: `How ${firstName(row.name)} contributes to ${teamName}, which systems they tend to touch, and what they would tell a new teammate to learn first.`,
          weekBucket: 'week2-3',
        });
        if (results.length >= 8) break;
      }
      return results;
    } catch (error) {
      this.logger.warn('Teammate lookup failed, using defaults.', error);
      return [];
    }
  }

  private async hydratePeopleWithSlackProfiles(
    slackClient: App['client'] | undefined,
    people: OnboardingPerson[]
  ): Promise<OnboardingPerson[]> {
    if (!slackClient || people.length === 0) {
      return people;
    }

    return Promise.all(
      people.map(async (person) => {
        try {
          return await this.hydratePersonWithSlackProfile(slackClient, person);
        } catch {
          return person;
        }
      })
    );
  }

  private async hydratePersonWithSlackProfile(
    slackClient: App['client'] | undefined,
    person: OnboardingPerson
  ): Promise<OnboardingPerson> {
    if (!slackClient) {
      return person;
    }

    if (person.slackUserId) {
      const result = await slackClient.users.info({
        user: person.slackUserId,
      });
      return mergeSlackUserProfile(person, result.user);
    }

    const result = await slackClient.users.lookupByEmail({
      email: person.email!,
    });
    return mergeSlackUserProfile(person, result.user);
  }

  private async lookupSlackSeedByEmail(
    slackClient: App['client'],
    email: string
  ): Promise<ProfileSeed | null> {
    try {
      const result = await slackClient.users.lookupByEmail({email});
      if (!result.user?.id) {
        return null;
      }

      const customFields = await this.lookupSlackCustomFields(
        slackClient,
        result.user.id
      );
      return buildSlackSeed(result.user.id, result.user, customFields);
    } catch {
      return null;
    }
  }

  private async lookupSlackSeed(
    slackClient: App['client'],
    userId: string
  ): Promise<ProfileSeed> {
    const [userInfo, customFields] = await Promise.all([
      slackClient.users.info({user: userId}),
      this.lookupSlackCustomFields(slackClient, userId),
    ]);
    return buildSlackSeed(userId, userInfo.user, customFields);
  }

  private async lookupSlackCustomFields(
    slackClient: App['client'],
    userId: string
  ): Promise<SlackCustomFields> {
    try {
      const [fieldIds, response]: [
        Map<string, string>,
        UsersProfileGetResponse,
      ] = await Promise.all([
        this.getSlackFieldIds(slackClient),
        slackClient.users.profile.get({user: userId}),
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

  private async getSlackFieldIds(
    slackClient: App['client']
  ): Promise<Map<string, string>> {
    if (
      this.slackFieldIdsCache &&
      this.slackFieldIdsCache.expiresAt > Date.now()
    ) {
      return this.slackFieldIdsCache.fieldIds;
    }

    try {
      const response: TeamProfileGetResponse =
        await slackClient.team.profile.get();
      const fieldIds = new Map(
        (response.profile?.fields ?? []).flatMap((field) =>
          field.label && field.id ? [[field.label.toLowerCase(), field.id]] : []
        )
      );
      this.slackFieldIdsCache = {
        fieldIds,
        expiresAt: Date.now() + SLACK_PROFILE_FIELDS_CACHE_TTL_MS,
      };
      return fieldIds;
    } catch {
      return new Map();
    }
  }

  private async lookupTeam(email: string): Promise<DxLookupResult | null> {
    if (!this.env.dxWarehouseDsn) {
      return null;
    }

    try {
      this.logger.info(`Looking up team for ${email}`);
      const rows = await this.withDxClient(async (client) => {
        const result = await client.query<{
          name: string;
          email: string;
          team: string;
          pillar: string | null;
        }>(
          `SELECT u.name, u.email, vt.name AS team,
           COALESCE(
             CASE WHEN ggpt.parent_id IS NULL AND ggpt.is_parent THEN ggpt.name END,
             CASE WHEN  gpt.parent_id IS NULL AND  gpt.is_parent THEN  gpt.name END,
             CASE WHEN   pt.parent_id IS NULL AND   pt.is_parent THEN   pt.name END,
             CASE WHEN   vt.parent_id IS NULL AND   vt.is_parent THEN   vt.name END
           ) AS pillar
           FROM public.dx_users u
           JOIN (
             SELECT vtm.user_id, MAX(vd.date) AS latest_date
             FROM public.dx_versioned_team_members vtm
             JOIN public.dx_versioned_teams vt ON vtm.versioned_team_id = vt.id
             JOIN public.dx_versioned_team_dates vd ON vt.versioned_team_date_id = vd.id
             GROUP BY vtm.user_id
           ) lpu ON lpu.user_id = u.id
           JOIN public.dx_versioned_team_members vtm ON vtm.user_id = u.id
           JOIN public.dx_versioned_teams vt ON vtm.versioned_team_id = vt.id
           JOIN public.dx_versioned_team_dates vd
             ON vt.versioned_team_date_id = vd.id AND vd.date = lpu.latest_date
           LEFT JOIN public.dx_versioned_teams pt   ON vt.parent_id  = pt.id   AND pt.versioned_team_date_id  = vd.id
           LEFT JOIN public.dx_versioned_teams gpt  ON pt.parent_id  = gpt.id  AND gpt.versioned_team_date_id = vd.id
           LEFT JOIN public.dx_versioned_teams ggpt ON gpt.parent_id = ggpt.id AND ggpt.versioned_team_date_id = vd.id
           WHERE u.deleted_at IS NULL AND u.email ILIKE $1
           LIMIT 1`,
          [email]
        );
        return result.rows;
      });

      if (rows.length === 0) {
        this.logger.info(`No DX result for ${email}`);
        return null;
      }

      const row = rows[0];
      this.logger.info(`DX resolved: team=${row.team}, pillar=${row.pillar}`);
      return {
        displayName: row.name,
        email: row.email,
        teamName: row.team,
        pillarName: row.pillar ?? undefined,
      };
    } catch (error) {
      this.logger.warn(
        'DX warehouse lookup failed, using fallback team resolution.',
        error
      );
      return null;
    }
  }
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
      ? 'Your Engineering Manager'
      : `Your ${teamName} Engineering Manager`;
    return {...person, name: label};
  }

  return person;
}

function buildSlackSeed(
  userId: string,
  user: SlackUserRecord,
  customFields: SlackCustomFields
): ProfileSeed {
  const profile = user?.profile;

  return {
    userId,
    displayName:
      user?.real_name ||
      profile?.real_name ||
      profile?.display_name ||
      'New hire',
    email: profile?.email,
    teamName: slackFieldText(customFields.team),
    pillarName: slackFieldText(customFields.division),
    manager: buildManagerPerson(customFields.manager),
  };
}

function mergeSlackUserProfile(
  person: OnboardingPerson,
  user: SlackUserRecord
): OnboardingPerson {
  const profile = user?.profile;
  const title = profile?.title?.trim();

  return {
    ...person,
    name:
      user?.real_name ||
      profile?.real_name ||
      profile?.display_name ||
      'Slack user',
    role: title || person.role,
    title,
    email: profile?.email,
    slackUserId: user?.id,
    avatarUrl: profile?.image_192 ?? profile?.image_72,
  };
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
  if (!name) {
    return undefined;
  }

  return {
    name,
    role: 'Engineering Manager',
    kind: 'manager',
    editableBy: 'manager',
    discussionPoints:
      'Role expectations, day-to-day support, performance goals, and the team roadmap.',
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

function buildFallbackTeammate(
  teamName: string,
  template: OnboardingPerson
): OnboardingPerson {
  return {
    ...template,
    name: `${teamName} teammate`,
    discussionPoints: `Ask about the parts of ${teamName} that are most important during the first month, the code paths they touch most often, and the best next person to meet after this conversation.`,
  };
}

function scheduleTeammates(teammates: OnboardingPerson[]): OnboardingPerson[] {
  return teammates.map((teammate, index) => ({
    ...teammate,
    weekBucket: index < 2 ? 'week1-2' : 'week2-3',
  }));
}

function firstName(value: string): string {
  return value.split(/\s+/)[0] || value;
}
