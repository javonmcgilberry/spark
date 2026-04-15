export type RoleTrack = 'frontend' | 'backend' | 'infrastructure' | 'general';

export const HOME_SECTION_IDS = [
  'welcome',
  'onboarding-checklist',
  '30-60-90-plan',
  'people-to-meet',
  'tools-access-checklist',
  'slack',
  'initial-engineering-tasks',
  'rituals',
  'engineering-resource-library',
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export type OnboardingPackageStatus = 'draft' | 'published';

export const JOURNEY_STEP_IDS = [
  'day1-welcome',
  'day2-3-follow-up',
  'day4-5-orientation',
  'contribution-milestone',
  'celebration',
] as const;

export type JourneyStepId = (typeof JOURNEY_STEP_IDS)[number];

export type ChecklistItemKind = 'task' | 'training' | 'resource';

export interface ChecklistItem {
  label: string;
  kind: ChecklistItemKind;
  notes: string;
  resourceLabel?: string;
  resourceUrl?: string;
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
}

/**
 * Only task types with a corresponding AgentFlow skill are surfaced to new
 * hires. Types without skill backing are tracked in docs/future-task-types.md.
 */
export type ContributionTaskType = 'stale-flag' | 'styled-migration';

export interface ContributionTask {
  id: string;
  type: ContributionTaskType;
  title: string;
  description: string;
  rationale: string;
  difficulty: 'easy' | 'medium';
  filePaths: string[];
  previewLines: string[];
  suggestedPurpose: string;
  /** The exact AgentFlow skill command to run in Claude Code / Cursor. */
  skillCommand: string;
  /** Human-readable name of the skill. */
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
  docs: DocLink[];
  keyPaths: string[];
  recommendedChannels: SlackChannelGuide[];
  tools: ToolGuide[];
  rituals: RitualGuide[];
  checklist: ChecklistSection[];
}

export interface WelcomeJourneyMilestone {
  label: string;
  goal: string;
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

export interface MilestonePlanItem {
  timeframe: string;
  goalSummary: string;
  keyActivities: string;
  supportActions: string;
}

export interface MilestonePlanSection {
  title: string;
  intro: string;
  items: MilestonePlanItem[];
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
  status: OnboardingPackageStatus;
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
  createdAt: string;
  updatedAt: string;
  sections: {
    welcome: WelcomeSection;
    onboardingChecklist: OnboardingChecklistSection;
    plan306090: MilestonePlanSection;
    peopleToMeet: PeopleToMeetSection;
    toolsAccess: ToolsAccessSection;
    slack: SlackSection;
    initialEngineeringTasks: InitialEngineeringTasksSection;
    rituals: RitualsSection;
    engineeringResourceLibrary: EngineeringResourceLibrarySection;
  };
}

export interface JourneyState {
  userId: string;
  currentStep: JourneyStepId;
  completedSteps: JourneyStepId[];
  activeHomeSection: HomeSectionId;
  completedChecklist: string[];
  tasks: ContributionTask[];
  taskExplanation?: string;
  tasksUpdatedAt?: string;
  selectedTaskId?: string;
  startedAt: string;
  updatedAt: string;
}

export interface SuggestedNextStep {
  label: string;
  actionId: string;
  value?: string;
  style?: 'primary' | 'danger';
}

export function isHomeSectionId(value: string): value is HomeSectionId {
  return HOME_SECTION_IDS.some((section) => section === value);
}

export function isJourneyStepId(value: string): value is JourneyStepId {
  return JOURNEY_STEP_IDS.some((step) => step === value);
}
