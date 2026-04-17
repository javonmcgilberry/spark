import type {App} from '@slack/bolt';
import type {Logger} from '../app/logger.js';
import {buildOnboardingPackageSections} from '../onboarding/catalog.js';
import type {
  ChecklistItem,
  OnboardingPackage,
  OnboardingPerson,
  OnboardingPersonKind,
  TeamProfile,
} from '../onboarding/types.js';
import {CanvasService} from './canvasService.js';
import {ConfluenceSearchService} from './confluenceSearchService.js';

export interface DraftPackageOptions {
  profile: TeamProfile;
  createdByUserId: string;
  welcomeNote?: string | null;
  welcomeIntro?: string | null;
  buddyUserId?: string | null;
  stakeholderUserIds?: string[];
  slackClient?: App['client'];
}

export interface DraftFieldPatch {
  welcomeNote?: string | null;
  welcomeIntro?: string | null;
  buddyUserId?: string | null;
  stakeholderUserIds?: string[];
  customChecklistItems?: ChecklistItem[];
  peopleToMeet?: OnboardingPerson[];
  checklistRows?: Record<string, ChecklistItem[]>;
}

export type PublishPackageResult =
  | {ok: false; reason: 'not_found' | 'not_manager'}
  | {ok: true; pkg: OnboardingPackage};

export class OnboardingPackageService {
  private readonly packages = new Map<string, OnboardingPackage>();

  constructor(
    private readonly confluenceSearch: ConfluenceSearchService,
    private readonly canvasService: CanvasService,
    private readonly logger: Logger
  ) {}

  getPackageForUser(userId: string): OnboardingPackage | undefined {
    return this.packages.get(userId);
  }

  getDraftsForReviewer(userId: string): OnboardingPackage[] {
    return Array.from(this.packages.values()).filter(
      (pkg) => pkg.status === 'draft' && pkg.reviewerUserIds.includes(userId)
    );
  }

  getPackagesWhereBuddyIs(userId: string): OnboardingPackage[] {
    return Array.from(this.packages.values()).filter(
      (pkg) => pkg.buddyUserId === userId && pkg.status === 'published'
    );
  }

  getPackagesManagedBy(userId: string): OnboardingPackage[] {
    return Array.from(this.packages.values()).filter(
      (pkg) => pkg.createdByUserId === userId || pkg.managerUserId === userId
    );
  }

  listDraftsForManager(managerUserId: string): OnboardingPackage[] {
    return Array.from(this.packages.values()).filter(
      (pkg) =>
        pkg.status === 'draft' &&
        (pkg.managerUserId === managerUserId ||
          pkg.createdByUserId === managerUserId ||
          pkg.reviewerUserIds.includes(managerUserId))
    );
  }

  applyFieldPatch(
    userId: string,
    patch: DraftFieldPatch
  ): OnboardingPackage | undefined {
    const existing = this.packages.get(userId);
    if (!existing || existing.status !== 'draft') {
      return undefined;
    }

    if (patch.welcomeNote !== undefined) {
      const next = patch.welcomeNote ?? undefined;
      existing.welcomeNote = next;
      existing.sections.welcome.personalizedNote = next;
    }
    if (patch.welcomeIntro !== undefined) {
      const next = patch.welcomeIntro ?? undefined;
      existing.welcomeIntro = next;
      existing.sections.welcome.intro = next ?? existing.sections.welcome.intro;
    }
    if (patch.buddyUserId !== undefined) {
      existing.buddyUserId = patch.buddyUserId ?? undefined;
    }
    if (patch.stakeholderUserIds) {
      const baseIds = [
        existing.createdByUserId,
        existing.managerUserId,
        existing.buddyUserId,
        ...patch.stakeholderUserIds,
      ].filter((value): value is string => Boolean(value));
      existing.reviewerUserIds = Array.from(new Set(baseIds));
    }
    if (patch.customChecklistItems) {
      existing.customChecklistItems = patch.customChecklistItems.map(
        (item) => ({
          ...item,
        })
      );
    }
    if (patch.peopleToMeet) {
      existing.sections.peopleToMeet.people = patch.peopleToMeet.map(
        (person) => ({...person})
      );
    }
    if (patch.checklistRows) {
      existing.checklistRows = {
        ...(existing.checklistRows ?? {}),
        ...Object.fromEntries(
          Object.entries(patch.checklistRows).map(([key, items]) => [
            key,
            items.map((item) => ({...item})),
          ])
        ),
      };
      // Mirror the overrides into the rendered section items so
      // downstream consumers (Slack canvas publish, Block Kit render,
      // manager summary) see the manager's edits instead of the catalog
      // defaults. checklistRows is the source of truth once touched.
      for (const section of existing.sections.onboardingChecklist.sections) {
        const override = existing.checklistRows[section.id];
        if (override) {
          section.items = override.map((item) => ({...item}));
        }
      }
    }
    existing.updatedAt = new Date().toISOString();
    this.logger.info(
      `Patched onboarding draft for ${userId} (fields: ${Object.keys(patch).join(', ')})`
    );
    return existing;
  }

  async createDraftPackage(
    options: DraftPackageOptions
  ): Promise<OnboardingPackage> {
    const existing = this.packages.get(options.profile.userId);
    const pkg = await this.buildPackage({
      profile: options.profile,
      createdByUserId: options.createdByUserId,
      status: 'draft',
      welcomeNote: options.welcomeNote,
      welcomeIntro: options.welcomeIntro,
      buddyUserId: options.buddyUserId,
      stakeholderUserIds: options.stakeholderUserIds,
      slackClient: options.slackClient,
      existing,
    });

    if (options.slackClient) {
      const workspace = await this.canvasService.createDraftWorkspace(
        options.slackClient,
        pkg,
        options.profile
      );
      if (workspace) {
        pkg.draftChannelId = workspace.channelId;
        pkg.draftChannelName = workspace.channelName;
        pkg.draftCanvasId = workspace.canvasId;
        pkg.draftCanvasUrl = workspace.canvasUrl;
      }
    }

    pkg.updatedAt = new Date().toISOString();
    this.packages.set(options.profile.userId, pkg);
    this.logger.info(
      `Created onboarding draft for ${options.profile.userId} by ${options.createdByUserId}`
    );
    return pkg;
  }

  async updateDraftPackage(
    options: DraftPackageOptions
  ): Promise<OnboardingPackage | undefined> {
    const existing = this.packages.get(options.profile.userId);
    if (!existing || existing.status !== 'draft') {
      return;
    }

    const pkg = await this.buildPackage({
      profile: options.profile,
      createdByUserId: existing.createdByUserId,
      status: existing.status,
      welcomeNote: options.welcomeNote,
      welcomeIntro: options.welcomeIntro,
      buddyUserId: options.buddyUserId,
      stakeholderUserIds: options.stakeholderUserIds,
      slackClient: options.slackClient,
      existing,
      preserveExistingReviewers: false,
    });

    pkg.updatedAt = new Date().toISOString();
    this.packages.set(options.profile.userId, pkg);

    if (options.slackClient) {
      await this.canvasService.syncDraftWorkspaceMembers(
        options.slackClient,
        pkg
      );
      await this.canvasService.syncDraftWorkspace(
        options.slackClient,
        pkg,
        options.profile
      );
    }

    this.logger.info(
      `Updated onboarding draft for ${options.profile.userId} by ${options.createdByUserId}`
    );
    return pkg;
  }

  publishPackage(
    userId: string,
    publishedByUserId: string
  ): PublishPackageResult {
    const pkg = this.packages.get(userId);
    if (!pkg) {
      return {ok: false, reason: 'not_found'};
    }
    const isManager =
      !pkg.managerUserId || pkg.managerUserId === publishedByUserId;
    const isCreator = pkg.createdByUserId === publishedByUserId;
    if (!isManager && !isCreator) {
      return {ok: false, reason: 'not_manager'};
    }

    pkg.status = 'published';
    pkg.publishedAt = new Date().toISOString();
    pkg.publishedByUserId = publishedByUserId;
    pkg.updatedAt = pkg.publishedAt;
    this.logger.info(
      `Published onboarding package for ${userId} by ${publishedByUserId}`
    );
    return {ok: true, pkg};
  }

  private async buildPackage(params: {
    profile: TeamProfile;
    createdByUserId: string;
    status: OnboardingPackage['status'];
    welcomeNote?: string | null;
    welcomeIntro?: string | null;
    buddyUserId?: string | null;
    stakeholderUserIds?: string[];
    slackClient?: App['client'];
    existing?: OnboardingPackage;
    preserveExistingReviewers?: boolean;
  }): Promise<OnboardingPackage> {
    const {
      profile,
      createdByUserId,
      status,
      welcomeNote,
      welcomeIntro,
      buddyUserId,
      stakeholderUserIds = [],
      slackClient,
      existing,
      preserveExistingReviewers = true,
    } = params;
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    const resolvedWelcomeNote =
      welcomeNote === undefined
        ? existing?.welcomeNote
        : welcomeNote || undefined;
    const resolvedWelcomeIntro =
      welcomeIntro === undefined
        ? existing?.welcomeIntro
        : welcomeIntro || undefined;
    const buddy =
      buddyUserId && slackClient
        ? await this.lookupSlackPerson(
            slackClient,
            buddyUserId,
            'buddy',
            'week1-2',
            'manager'
          )
        : profile.buddy;
    const stakeholderPeople =
      slackClient && stakeholderUserIds.length > 0
        ? await Promise.all(
            stakeholderUserIds.map((userId) =>
              this.lookupSlackPerson(
                slackClient,
                userId,
                undefined,
                'week2-3',
                'manager'
              )
            )
          )
        : [];
    const people = dedupePeople([
      profile.manager,
      buddy,
      ...profile.teammates,
      ...stakeholderPeople,
    ]);
    const references =
      await this.confluenceSearch.findOnboardingReferences(profile);
    const peopleGuides = await this.confluenceSearch.findPeopleGuides(
      profile,
      people
    );
    const peopleWithGuides = people.map((person) => ({
      ...person,
      userGuide: peopleGuides[personIdentifier(person)] ?? person.userGuide,
    }));
    const reviewerUserIds = dedupeUserIds([
      createdByUserId,
      profile.manager.slackUserId,
      buddy.slackUserId,
      ...stakeholderUserIds,
      ...(preserveExistingReviewers ? (existing?.reviewerUserIds ?? []) : []),
    ]);
    const customChecklistItems = (existing?.customChecklistItems ?? []).map(
      cloneChecklistItem
    );

    return {
      userId: profile.userId,
      status,
      createdByUserId,
      managerUserId:
        profile.manager.slackUserId ??
        existing?.managerUserId ??
        createdByUserId,
      reviewerUserIds,
      newHireName: profile.displayName || existing?.newHireName,
      newHireAvatarUrl: profile.avatarUrl ?? existing?.newHireAvatarUrl,
      welcomeNote: resolvedWelcomeNote,
      welcomeIntro: resolvedWelcomeIntro,
      buddyUserId: buddy.slackUserId ?? existing?.buddyUserId,
      draftChannelId: existing?.draftChannelId,
      draftChannelName: existing?.draftChannelName,
      draftCanvasId: existing?.draftCanvasId,
      draftCanvasUrl: existing?.draftCanvasUrl,
      publishedAt: existing?.publishedAt,
      publishedByUserId: existing?.publishedByUserId,
      customChecklistItems,
      createdAt,
      updatedAt: new Date().toISOString(),
      sections: buildOnboardingPackageSections({
        profile: {
          ...profile,
          buddy,
        },
        references,
        people: peopleWithGuides,
        tasks: existing?.sections.initialEngineeringTasks.tasks ?? [],
        welcomeNote: resolvedWelcomeNote,
        welcomeIntro: resolvedWelcomeIntro,
        customChecklistItems,
      }),
    };
  }

  private async lookupSlackPerson(
    client: App['client'],
    userId: string,
    fallbackKind: OnboardingPersonKind | undefined,
    weekBucket: OnboardingPerson['weekBucket'],
    editableBy: OnboardingPerson['editableBy']
  ): Promise<OnboardingPerson> {
    const response = await client.users.info({user: userId});
    const user = response.user;
    const profile = user?.profile;
    const name =
      user?.real_name ||
      profile?.real_name ||
      profile?.display_name ||
      'Slack user';
    const title = profile?.title?.trim();
    const kind = inferPersonKind(title, fallbackKind);
    return {
      name,
      role: title || roleForKind(kind),
      kind,
      title,
      discussionPoints: discussionPointsForKind(name, kind),
      weekBucket,
      editableBy,
      email: profile?.email,
      slackUserId: user?.id,
      avatarUrl: profile?.image_192 ?? profile?.image_72,
    };
  }
}

function dedupePeople(people: OnboardingPerson[]): OnboardingPerson[] {
  const seen = new Set<string>();
  const result: OnboardingPerson[] = [];
  for (const person of people) {
    const key = personIdentifier(person);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(person);
  }
  return result;
}

function cloneChecklistItem(item: ChecklistItem): ChecklistItem {
  return {...item};
}

function dedupeUserIds(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

function personIdentifier(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name).toLowerCase();
}

function inferPersonKind(
  title: string | undefined,
  fallbackKind: OnboardingPersonKind | undefined
): OnboardingPersonKind {
  const normalized = title?.toLowerCase() ?? '';
  if (normalized.includes('product manager')) {
    return 'pm';
  }
  if (normalized.includes('designer')) {
    return 'designer';
  }
  if (
    normalized.includes('people partner') ||
    normalized.includes('business partner')
  ) {
    return 'people-partner';
  }
  if (normalized.includes('director')) {
    return 'director';
  }
  return fallbackKind ?? 'teammate';
}

function roleForKind(kind: OnboardingPersonKind): string {
  switch (kind) {
    case 'manager':
      return 'Engineering Manager';
    case 'buddy':
      return 'Onboarding Buddy';
    case 'pm':
      return 'Product Manager';
    case 'designer':
      return 'Product Designer';
    case 'director':
      return 'Director';
    case 'people-partner':
      return 'People Partner';
    default:
      return 'Teammate';
  }
}

function discussionPointsForKind(
  name: string,
  kind: OnboardingPersonKind
): string {
  const firstName = name.split(/\s+/)[0] || name;
  switch (kind) {
    case 'manager':
      return 'Role expectations, day-to-day support, performance goals, and how the team roadmap connects to the first few weeks.';
    case 'buddy':
      return 'Day-to-day help, codebase guidance, debugging habits, and the team norms that rarely make it into docs.';
    case 'pm':
      return `Ask ${firstName} about roadmap context, priority tradeoffs, and how engineering work connects to customer value.`;
    case 'designer':
      return `Ask ${firstName} how design intent is shared, reviewed, and handed off in your area.`;
    case 'director':
      return `Ask ${firstName} how your team fits into the broader pillar strategy and where the group is headed next.`;
    case 'people-partner':
      return `Ask ${firstName} about growth support, milestone conversations, and people programs that become more relevant after the first month.`;
    default:
      return `Ask ${firstName} what they own, which systems they touch most often, and what they wish they had known in their first month at Webflow.`;
  }
}
