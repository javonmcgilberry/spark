export type RoleTrack = 'frontend' | 'backend' | 'infrastructure' | 'general';

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

export interface OnboardingPerson {
  name: string;
  role: string;
  discussionPoints: string;
  weekBucket: 'week1-2' | 'week2-3' | 'week3+';
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
  confluenceLinks: ConfluenceLink[];
}

export interface JourneyState {
  userId: string;
  currentStep: JourneyStepId;
  completedSteps: JourneyStepId[];
  completedChecklist: string[];
  tasks: ContributionTask[];
  taskExplanation?: string;
  tasksUpdatedAt?: string;
  selectedTaskId?: string;
  confluenceLinks: ConfluenceLink[];
  canvasId?: string;
  canvasUrl?: string;
  canvasUnavailable?: boolean;
  startedAt: string;
  updatedAt: string;
}

export interface SuggestedNextStep {
  label: string;
  actionId: string;
  value?: string;
  style?: 'primary' | 'danger';
}

export function isJourneyStepId(value: string): value is JourneyStepId {
  return JOURNEY_STEP_IDS.some((step) => step === value);
}
