/**
 * Structural types for the Spark onboarding domain. Single source of
 * truth for the onboarding package shape.
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

export interface SlackChannelGuide {
  category: string;
  channel: string;
  description: string;
}

export interface ToolGuide {
  category: string;
  tool: string;
  description: string;
  accessHint?: string;
}

export interface RitualGuide {
  category: string;
  meeting: string;
  description: string;
  cadence: string;
  attendance: string;
}

export interface DocLink {
  id: string;
  title: string;
  description: string;
  url: string | null;
  source: 'static' | 'fetched';
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
  askMeAbout?: string;
  /**
   * Insight lifecycle state. `pending` — awaiting prewarm/refresh;
   * `ready` — blurb + data arrived; `data-starved` — no Jira/GitHub
   * signal so the row falls back to the catalog discussion points;
   * `error` / `retryable-error` — refresh failed, caller should retry;
   * `user-overridden` — the manager edited discussionPoints, so
   * server-side refreshes must not overwrite this row's text.
   */
  insightsStatus?:
    | 'pending'
    | 'ready'
    | 'error'
    | 'retryable-error'
    | 'data-starved'
    | 'user-overridden';
  insightsAttempts?: InsightAttempt[];
}

export interface InsightAttempt {
  kind: 'jira' | 'github';
  input: string;
  count: number;
  reason?: 'no_email' | 'not_configured' | 'lookup_failed';
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
  avatarUrl?: string;
  email?: string;
  teamName: string;
  pillarName?: string;
  githubTeamSlug?: string;
  roleTrack: RoleTrack;
  manager: OnboardingPerson;
  buddy: OnboardingPerson;
  teammates: OnboardingPerson[];
  docs: DocLink[];
  keyPaths: string[];
  recommendedChannels: SlackChannelGuide[];
  tools: ToolGuide[];
  rituals: RitualGuide[];
  checklist: ChecklistSection[];
}

export interface WelcomeJourneyMilestone {
  label: string;
  keyActivities: string;
  supportActions: string;
}

export interface WelcomePoc {
  label: string;
  owner: OnboardingPerson;
  summary: string;
}

export interface WelcomeSection {
  title: string;
  intro: string;
  personalizedNote?: string;
  onboardingPocs: WelcomePoc[];
  journeyMilestones: WelcomeJourneyMilestone[];
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

export interface ToolsAccessSection {
  title: string;
  intro: string;
  tools: ToolGuide[];
}

export interface SlackSection {
  title: string;
  intro: string;
  channels: SlackChannelGuide[];
}

export interface InitialEngineeringTasksSection {
  title: string;
  intro: string;
  managerPrompt: string;
  tasks: ContributionTask[];
}

export interface RitualsSection {
  title: string;
  intro: string;
  rituals: RitualGuide[];
}

export interface OnboardingReferences {
  teamPage?: ConfluenceLink;
  pillarPage?: ConfluenceLink;
  newHireGuide?: ConfluenceLink;
}

export interface EngineeringResourceLibrarySection {
  title: string;
  intro: string;
  docs: DocLink[];
  references: OnboardingReferences;
  keyPaths: string[];
}

export interface OnboardingPackage {
  userId: string;
  status: 'draft' | 'published';
  createdByUserId: string;
  managerUserId?: string;
  reviewerUserIds: string[];
  newHireName?: string;
  newHireAvatarUrl?: string;
  teamName?: string;
  pillarName?: string;
  welcomeNote?: string;
  welcomeIntro?: string;
  buddyUserId?: string;
  draftChannelId?: string;
  draftChannelName?: string;
  draftCanvasId?: string;
  draftCanvasUrl?: string;
  publishedAt?: string;
  publishedByUserId?: string;
  customChecklistItems?: ChecklistItem[];
  checklistRows?: Record<string, ChecklistItem[]>;
  createdAt: string;
  updatedAt: string;
  sections: {
    welcome: WelcomeSection;
    onboardingChecklist: OnboardingChecklistSection;
    peopleToMeet: PeopleToMeetSection;
    toolsAccess: ToolsAccessSection;
    slack: SlackSection;
    initialEngineeringTasks: InitialEngineeringTasksSection;
    rituals: RitualsSection;
    engineeringResourceLibrary: EngineeringResourceLibrarySection;
  };
}

export interface DraftFieldPatch {
  welcomeNote?: string | null;
  welcomeIntro?: string | null;
  customChecklistItems?: ChecklistItem[];
  /**
   * Manager's edits to the roster. Setting a buddy row's slackUserId
   * here is what promotes someone to the onboarding buddy — the server
   * derives pkg.buddyUserId from this list, so there's no separate
   * buddy-assignment affordance on the patch surface.
   */
  peopleToMeet?: OnboardingPerson[];
  checklistRows?: Record<string, ChecklistItem[]>;
}

export interface CreateDraftBody {
  newHireSlackId?: string;
  newHireEmail?: string;
  teamHint?: string;
}
