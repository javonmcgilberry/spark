import type {
  ChecklistSection,
  DocLink,
  OnboardingPerson,
  RitualGuide,
  RoleTrack,
  SlackChannelGuide,
  ToolGuide,
} from './types.js';

export const JOURNEY_LABELS: Record<string, string> = {
  'day1-welcome': 'Day 1',
  'day2-3-follow-up': 'Day 2-3',
  'day4-5-orientation': 'Day 4-5',
  'contribution-milestone': 'Contribution',
  celebration: 'Celebration',
};

export const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    id: 'week1-setup',
    title: 'Week 1: Meet the Team and Setup',
    goal: 'Meet your teammates, complete HR tasks, and get the tools and baseline product knowledge you need.',
    items: [
      {
        label: 'Complete HR and Workday tasks',
        kind: 'task',
        notes:
          'Workday and HR tasks continue to unlock as you complete the first wave. Handle the first-day items immediately.',
      },
      {
        label: 'Participate in your onboarding cohort',
        kind: 'training',
        notes:
          'These sessions take priority while you are onboarding. Keep the calendar invites visible and ask questions live.',
      },
      {
        label: 'Begin required WorkRamp trainings',
        kind: 'training',
        notes:
          'Start the required learning modules early so they do not pile up alongside technical ramp-up.',
      },
      {
        label: 'Complete Webflow 101',
        kind: 'training',
        notes:
          'This gives you the product vocabulary you will hear in engineering discussions from day one.',
      },
      {
        label: 'Start Secure Code Warrior training',
        kind: 'training',
        notes:
          'You have 30 days to finish it, but starting in week one keeps it from turning into background debt.',
      },
      {
        label: 'Meet your onboarding buddy and engineering teammates',
        kind: 'task',
        notes:
          'Use these meetings to ask the day-to-day questions that do not belong in a formal doc.',
      },
    ],
  },
  {
    id: 'week2-workflows',
    title: 'Week 2: Intro to Engineering Workflows',
    goal: 'Learn the day-to-day engineering mechanics that make code review, planning, and collaboration work here.',
    items: [
      {
        label: 'Learn the PR and code review process',
        kind: 'task',
        notes:
          'Understand how review requests are routed, how draft PRs are used, and what good review hygiene looks like.',
      },
      {
        label: 'Review The Codex and engineering workflow docs',
        kind: 'resource',
        notes:
          'Use this week to ground yourself in how Webflow engineering works before taking on larger scoped work.',
      },
      {
        label:
          'Attend your team rituals and ask about the ones that are optional',
        kind: 'task',
        notes:
          'Use this week to learn which rituals are essential for your role and which ones are useful optional context.',
      },
    ],
  },
  {
    id: 'week3-contribution',
    title: 'Week 3: First Contribution and Scaling Up',
    goal: 'Make a first contribution, learn where your team owns code, and start connecting tasks to system architecture.',
    items: [
      {
        label: 'Ship a first contribution',
        kind: 'task',
        notes:
          'Start with a scoped change that teaches the repo, review flow, and team norms without overwhelming you.',
      },
      {
        label: 'Learn your team or system architecture',
        kind: 'resource',
        notes:
          'After the first contribution, spend time connecting the change you made to the larger system it lives inside.',
      },
      {
        label: 'Attend a retrospective or demo ritual',
        kind: 'task',
        notes:
          'This is where contribution starts to turn into belonging and shared context.',
      },
    ],
  },
];

export const PEOPLE_TEMPLATE: OnboardingPerson[] = [
  {
    name: 'Your Engineering Manager',
    role: 'Engineering Manager',
    discussionPoints:
      'Role expectations, day-to-day support, performance goals, and the team roadmap.',
    weekBucket: 'week1-2',
  },
  {
    name: 'Your Onboarding Buddy',
    role: 'Onboarding Buddy',
    discussionPoints:
      'Day-to-day help, codebase guidance, and the unwritten norms that never make it into docs.',
    weekBucket: 'week1-2',
  },
  {
    name: 'Engineering Teammates',
    role: 'Immediate Team',
    discussionPoints:
      'How the team works, what they own, and what good collaboration looks like in practice.',
    weekBucket: 'week1-2',
  },
  {
    name: 'Product Manager',
    role: 'Cross-functional partner',
    discussionPoints:
      'The problem space, roadmap context, and how engineering work maps to user value.',
    weekBucket: 'week2-3',
  },
  {
    name: 'Product Designer',
    role: 'Cross-functional partner',
    discussionPoints:
      'How design decisions are communicated, reviewed, and handed off to engineering.',
    weekBucket: 'week2-3',
  },
  {
    name: 'Pillar Director of Engineering',
    role: 'Pillar leadership',
    discussionPoints:
      'How your team fits into the larger pillar strategy and where the group is headed.',
    weekBucket: 'week3+',
  },
];

export const TOOL_GUIDES: ToolGuide[] = [
  {
    category: 'General',
    tool: 'Okta',
    description: 'SSO entrypoint for most internal tools.',
    accessHint: 'Use Okta first before assuming a tool is unavailable.',
  },
  {
    category: 'Communication',
    tool: 'Slack',
    description: 'Primary communication surface across Webflow.',
  },
  {
    category: 'Planning',
    tool: 'Jira',
    description:
      'Engineering, Product, and Design planning and execution tracker.',
  },
  {
    category: 'Documentation',
    tool: 'Confluence',
    description:
      'Primary internal documentation surface, though some docs still live in Google Docs.',
  },
  {
    category: 'Search',
    tool: 'Glean',
    description:
      'Enterprise search across connected workplace tools with permission-aware results.',
  },
  {
    category: 'Video',
    tool: 'Zoom',
    description: 'Default video meeting tool across the company.',
  },
];

export const CHANNEL_GUIDES: SlackChannelGuide[] = [
  {
    category: 'Company',
    channel: '#webflow-announcements',
    description: 'Where important company-wide announcements happen.',
  },
  {
    category: 'Company',
    channel: '#webflow-company-events',
    description: 'Follow and comment during company meetings and events.',
  },
  {
    category: 'Culture',
    channel: '#props',
    description: 'Public appreciation and thank-yous.',
  },
  {
    category: 'Culture',
    channel: '#webflow-celebrations',
    description: 'Introductions, milestones, and life updates.',
  },
  {
    category: 'Engineering',
    channel: '#engineering',
    description: 'Broad engineering announcements and shared context.',
  },
  {
    category: 'Engineering',
    channel: '#triage-build-loop',
    description: 'Get help when the build or local environment gets weird.',
  },
  {
    category: 'Engineering',
    channel: '#proj-agentflow',
    description:
      'AgentFlow workflows, automation, and AI-native engineering discussion.',
  },
];

export const RITUAL_GUIDES: RitualGuide[] = [
  {
    category: 'Engineering',
    meeting: 'Sprint Planning',
    description: 'Prioritize and commit to work for the sprint.',
    cadence: 'Biweekly on Tuesdays',
    attendance: 'Required when your team uses sprints',
  },
  {
    category: 'Engineering',
    meeting: 'Daily Standup',
    description:
      'Progress updates and blocker visibility, either async in Slack or sync in a meeting.',
    cadence: 'Daily',
    attendance: 'Team-dependent',
  },
  {
    category: 'Engineering',
    meeting: 'Engineering Monthly',
    description: 'Org-wide updates and demos.',
    cadence: 'Monthly, last Wednesday',
    attendance: 'Required',
  },
  {
    category: 'Engineering',
    meeting: 'Frontend Guild',
    description: 'Frontend architecture and implementation discussion.',
    cadence: 'Monthly, last Wednesday',
    attendance: 'Optional',
  },
  {
    category: 'Engineering',
    meeting: 'Backend Guild',
    description: 'Backend architecture and implementation discussion.',
    cadence: 'Biweekly on Tuesdays',
    attendance: 'Optional',
  },
  {
    category: 'Engineering',
    meeting: 'Tech Noodles',
    description: 'Brainstorming on technical questions and concepts.',
    cadence: 'Weekly on Tuesdays',
    attendance: 'Optional',
  },
  {
    category: 'Company',
    meeting: 'Webflow Together',
    description: 'Monthly company-wide meeting.',
    cadence: 'Monthly',
    attendance: 'Required',
  },
];

const SHARED_DOCS: Array<Omit<DocLink, 'url'>> = [
  {
    id: 'developer-onboarding',
    title: 'Developer Onboarding',
    description: 'Primary engineering onboarding hub for all new hires.',
    source: 'static',
  },
  {
    id: 'eng-onboarding-buddy',
    title: 'Eng Onboarding Buddy',
    description: 'How the buddy relationship should work during ramp-up.',
    source: 'static',
  },
];

const TRACK_DOCS: Record<RoleTrack, Array<Omit<DocLink, 'url'>>> = {
  frontend: [
    {
      id: 'frontend-onboarding',
      title: 'Frontend onboarding resources',
      description:
        'Frontend-specific learning resources and architecture pointers.',
      source: 'static',
    },
  ],
  backend: [
    {
      id: 'backend-onboarding',
      title: 'Backend onboarding resources',
      description: 'Backend systems, services, and operational resources.',
      source: 'static',
    },
  ],
  infrastructure: [
    {
      id: 'infrastructure-onboarding',
      title: 'Infrastructure onboarding resources',
      description:
        'Infrastructure, delivery, and platform-specific onboarding resources.',
      source: 'static',
    },
  ],
  general: [],
};

export const DOC_PAGE_IDS: Record<string, string> = {
  'developer-onboarding': '39914077',
  'eng-onboarding-buddy': '1482784881',
  'frontend-onboarding': '139659065',
  'backend-onboarding': '140149344',
  'infrastructure-onboarding': '1482588166',
};

export function getDocDefinitions(
  roleTrack: RoleTrack
): Array<Omit<DocLink, 'url'>> {
  return [...SHARED_DOCS, ...TRACK_DOCS[roleTrack]];
}

export function buildChecklist(): ChecklistSection[] {
  return CHECKLIST_SECTIONS.map((section) => ({
    ...section,
    items: section.items.map((item) => ({...item})),
  }));
}

export function buildDefaultPeople(): OnboardingPerson[] {
  return PEOPLE_TEMPLATE.map((person) => ({...person}));
}

export function buildDefaultChannels(): SlackChannelGuide[] {
  return CHANNEL_GUIDES.map((channel) => ({...channel}));
}

export function buildDefaultTools(): ToolGuide[] {
  return TOOL_GUIDES.map((tool) => ({...tool}));
}

export function buildDefaultRituals(): RitualGuide[] {
  return RITUAL_GUIDES.map((ritual) => ({...ritual}));
}
