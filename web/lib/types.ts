/**
 * Structural types shared between the web dashboard and the Spark bot's
 * /api/* surface. These mirror the shapes in spark/src/onboarding/types.ts
 * — keep them in sync when the bot adds fields.
 *
 * We intentionally duplicate instead of importing across the package
 * boundary to keep spark/web shippable on Cloudflare Workers without
 * dragging Node-only code into the bundle.
 */

export type RoleTrack = 'frontend' | 'backend' | 'infrastructure' | 'general';

export type ChecklistItemKind =
  | 'task'
  | 'live-training'
  | 'workramp'
  | 'reading'
  | 'recording';

export type ChecklistItemStatus = 'not-started' | 'in-progress' | 'completed';

export interface ChecklistItem {
  label: string;
  kind: ChecklistItemKind;
  notes: string;
  resourceLabel?: string;
  resourceUrl?: string;
  sectionId?: string;
}

export interface ChecklistSection {
  id: string;
  title: string;
  goal: string;
  items: ChecklistItem[];
}

export interface ConfluenceLink {
  title: string;
  url: string;
  summary: string;
}

export type OnboardingPersonKind =
  | 'manager'
  | 'buddy'
  | 'teammate'
  | 'pm'
  | 'designer'
  | 'director'
  | 'people-partner'
  | 'custom';

export interface OnboardingPerson {
  name: string;
  role: string;
  discussionPoints: string;
  weekBucket: 'week1-2' | 'week2-3' | 'week3+';
  kind?: OnboardingPersonKind;
  title?: string;
  notes?: string;
  editableBy?: 'spark' | 'manager' | 'buddy' | 'team';
  userGuide?: ConfluenceLink;
  email?: string;
  slackUserId?: string;
  avatarUrl?: string;
}

export interface ContributionTask {
  id: string;
  type: 'stale-flag' | 'styled-migration';
  title: string;
  description: string;
  rationale: string;
  difficulty: 'easy' | 'medium';
  filePaths: string[];
  previewLines: string[];
  suggestedPurpose: string;
  skillCommand: string;
  skillName: string;
  metadata: Record<string, string | number | boolean | string[] | null>;
}

export interface TeamProfile {
  userId: string;
  firstName: string;
  displayName: string;
  email?: string;
  teamName: string;
  pillarName?: string;
  githubTeamSlug?: string;
  roleTrack: RoleTrack;
  manager: OnboardingPerson;
  buddy: OnboardingPerson;
  teammates: OnboardingPerson[];
  docs: Array<{
    id: string;
    title: string;
    description: string;
    url: string | null;
    source: 'static' | 'fetched';
  }>;
  keyPaths: string[];
}

export interface WelcomeSection {
  title: string;
  intro: string;
  personalizedNote?: string;
  onboardingPocs: Array<{
    label: string;
    owner: OnboardingPerson;
    summary: string;
  }>;
  journeyMilestones: Array<{
    label: string;
    keyActivities: string;
    supportActions: string;
  }>;
}

export interface OnboardingChecklistSection {
  title: string;
  intro: string;
  sections: ChecklistSection[];
}

export interface PeopleToMeetSection {
  title: string;
  intro: string;
  people: OnboardingPerson[];
}

export interface InitialEngineeringTasksSection {
  title: string;
  intro: string;
  managerPrompt: string;
  tasks: ContributionTask[];
}

export interface OnboardingPackage {
  userId: string;
  status: 'draft' | 'published';
  createdByUserId: string;
  managerUserId?: string;
  reviewerUserIds: string[];
  welcomeNote?: string;
  buddyUserId?: string;
  draftChannelId?: string;
  draftChannelName?: string;
  draftCanvasId?: string;
  draftCanvasUrl?: string;
  publishedAt?: string;
  publishedByUserId?: string;
  customChecklistItems?: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
  sections: {
    welcome: WelcomeSection;
    onboardingChecklist: OnboardingChecklistSection;
    peopleToMeet: PeopleToMeetSection;
    toolsAccess: {title: string; intro: string; tools: unknown[]};
    slack: {title: string; intro: string; channels: unknown[]};
    initialEngineeringTasks: InitialEngineeringTasksSection;
    rituals: {title: string; intro: string; rituals: unknown[]};
    engineeringResourceLibrary: {
      title: string;
      intro: string;
      docs: unknown[];
      references: {
        teamPage?: ConfluenceLink;
        pillarPage?: ConfluenceLink;
        newHireGuide?: ConfluenceLink;
      };
      keyPaths: string[];
    };
  };
}

export interface DraftFieldPatch {
  welcomeNote?: string | null;
  buddyUserId?: string | null;
  stakeholderUserIds?: string[];
  customChecklistItems?: ChecklistItem[];
}

export interface CreateDraftBody {
  newHireSlackId?: string;
  newHireEmail?: string;
  welcomeNote?: string;
  buddyUserId?: string;
  stakeholderUserIds?: string[];
}
