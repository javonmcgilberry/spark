import type {
  ChecklistSection,
  ContributionTask,
  DocLink,
  EngineeringResourceLibrarySection,
  HomeSectionId,
  MilestonePlanItem,
  OnboardingPackage,
  OnboardingPerson,
  OnboardingReferences,
  RitualGuide,
  RoleTrack,
  SlackChannelGuide,
  TeamProfile,
  ToolGuide,
  WelcomeJourneyMilestone,
} from './types.js';

export const JOURNEY_LABELS: Record<string, string> = {
  'day1-welcome': 'Day 1',
  'day2-3-follow-up': 'Day 2-3',
  'day4-5-orientation': 'Day 4-5',
  'contribution-milestone': 'Contribution',
  celebration: 'Celebration',
};

export const HOME_SECTION_TABS: Array<{
  id: HomeSectionId;
  label: string;
}> = [
  {id: 'welcome', label: 'Welcome'},
  {id: 'onboarding-checklist', label: 'Checklist'},
  {id: '30-60-90-plan', label: '30/60/90'},
  {id: 'people-to-meet', label: 'People'},
  {id: 'tools-access-checklist', label: 'Tools'},
  {id: 'slack', label: 'Slack'},
  {id: 'initial-engineering-tasks', label: 'Tasks'},
  {id: 'rituals', label: 'Rituals'},
  {id: 'engineering-resource-library', label: 'Library'},
];

const WELCOME_JOURNEY_MILESTONES: WelcomeJourneyMilestone[] = [
  {
    label: 'Week 1',
    goal: 'Meet the team, complete HR tasks, set up tools, and build foundational product knowledge.',
  },
  {
    label: 'Week 2',
    goal: 'Learn core engineering workflows, development expectations, and career-growth context.',
  },
  {
    label: 'Week 3',
    goal: 'Apply technical knowledge by making a first contribution and learning how your team owns software.',
  },
  {
    label: 'Week 4',
    goal: 'Operate more independently, contribute meaningfully, and start engineering citizenship habits.',
  },
  {
    label: '60 Days',
    goal: 'Ship meaningful code, follow team workflows confidently, and grow operational confidence.',
  },
  {
    label: '90 Days',
    goal: 'Own complex work, collaborate cross-functionally, and suggest process improvements.',
  },
];

export const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    id: 'week1-setup',
    title: 'Week 1: Meet the Team and Setup',
    goal: 'Meet your new teammates, complete HR tasks, set up tools, and build foundational knowledge.',
    items: [
      {
        label: 'Complete HR & Workday tasks',
        kind: 'task',
        notes:
          'Handle the first-day Workday tasks immediately, then keep checking for the next wave as onboarding continues.',
      },
      {
        label: 'Participate in your onboarding cohort',
        kind: 'training',
        notes:
          'These cohort sessions take priority while you are onboarding. Keep the calendar invites visible and ask questions live.',
      },
      {
        label: 'Begin required e-learning trainings',
        kind: 'training',
        notes:
          'WorkRamp is part of the standard onboarding path. Start early so it does not pile up beside technical ramp-up.',
      },
      {
        label: 'Meet with your engineering manager',
        kind: 'task',
        notes:
          'Your manager should schedule time on day one. Use it to align on expectations, support, and the first few weeks.',
      },
      {
        label: 'Complete Webflow 101',
        kind: 'training',
        resourceUrl: 'https://university.webflow.com/courses/webflow-101',
        notes:
          'Finish the Webflow University course by the end of week one so the product vocabulary feels familiar in engineering conversations.',
      },
      {
        label: 'Start Secure Code Warrior training',
        kind: 'training',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/SEC/pages/1224933772/Secure+Code+Warrior+Training+-+New+Hire+FAQ',
        notes:
          'You have 30 days to complete it, but starting now keeps it from becoming lingering background debt.',
      },
      {
        label: 'Meet with your onboarding buddy',
        kind: 'task',
        notes:
          'Use this meeting for the day-to-day questions that do not belong in a formal doc.',
      },
      {
        label: 'Meet with your engineering teammates',
        kind: 'task',
        notes:
          'Grab 15-30 minute intros with teammates so names, ownership, and current work stop feeling abstract.',
      },
      {
        label: 'Add the engineering calendar to your Google calendar',
        kind: 'task',
        resourceUrl:
          'https://calendar.google.com/calendar/u/0?cid=d2ViZmxvdy5jb21fOGdmdnIzcGMwOXJtOWtpZ2I3cTA3cGVrdHNAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ',
        notes:
          'Subscribe early so company, engineering, and team rituals show up in one place.',
      },
      {
        label: 'Request access to tools & systems',
        kind: 'task',
        resourceLabel: 'Supporting Software Setup',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/134087310/Supporting+Software+Setup',
        notes:
          'Most tools come through Okta. For missing permissions, ask @Flowbot in Slack for the specific tool you need.',
      },
      {
        label: 'Read through systems diagrams',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/623280258/System+Diagrams',
        notes:
          'Focus on the interactions between services, databases, caching, and infrastructure before you start tracing code.',
      },
      {
        label: 'Orient yourself with the engineering org chart',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/1071448164/Engineering+Org+Charts+by+Team+Pillar',
        notes:
          'Use the org chart to understand how pillars and teams map to product ownership.',
      },
      {
        label: 'Explore and join 3 relevant Slack channels',
        kind: 'task',
        notes:
          'Join broad channels like #engineering, then add the team and specialty channels that matter for your role.',
      },
    ],
  },
  {
    id: 'week2-workflows',
    title: 'Week 2: Engineering Workflows',
    goal: 'Learn the engineering workflows, development environment, and architecture context you need before a first contribution.',
    items: [
      {
        label: 'Continue Secure Code Warrior training',
        kind: 'training',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/SEC/pages/1224933772/Secure+Code+Warrior+Training+-+New+Hire+FAQ',
        notes:
          'Keep it moving so the 30-day completion window does not sneak up on you.',
      },
      {
        label: 'Continue regular meetings with your manager & onboarding buddy',
        kind: 'task',
        notes:
          'These are your fastest path to clearing ambiguity while onboarding is still fresh.',
      },
      {
        label: 'Continue requesting access to tools & systems',
        kind: 'task',
        resourceLabel: 'Okta dashboard',
        resourceUrl: 'https://webflow.okta.com/app/UserHome',
        notes:
          'If you hit missing access during setup, keep using @Flowbot and close the gaps before contribution work starts.',
      },
      {
        label: 'Schedule meetings with additional team members',
        kind: 'task',
        notes:
          'Use week two to learn who owns what and where your likely focus area intersects their work.',
      },
      {
        label: 'Explore the feature & service team mapping structure',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/EPD/pages/440697869/Feature+Service+Team+Mapping',
        notes:
          'Understand how Webflow organizes EPDI pillars, feature teams, and service ownership before you get assigned scoped work.',
      },
      {
        label: 'Read the Webflow Codex and engineering best practices',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/1018331179/The+Webflow+Codex+v0.1',
        notes:
          'This is the architectural and workflow baseline that keeps engineers on the development golden path.',
      },
      {
        label: 'Read and follow the Webflow platform overview',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/140051185/Webflow+Platform+Overview',
        notes:
          'Use the platform overview to start building a mental model for how the product and monorepo fit together.',
      },
      {
        label: 'Set up your local development environment',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/139985579/Local+Development+Setup',
        notes:
          'Complete local setup now and use the troubleshooting guide or #triage-build-loop if anything feels cursed.',
      },
      {
        label: 'Profile Webflow server & renderer performance locally',
        kind: 'resource',
        resourceUrl:
          'https://www.loom.com/share/b5798b46089647ffa800cbad626baac0',
        notes:
          'Even if you do not run a performance investigation yet, the local profiling workflow is worth learning early.',
      },
      {
        label: 'Get started with Cursor & Augment',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/DP/pages/1056212669/Cursor+and+Augment+Code+AI+Codegen+tools+Getting+Started',
        notes:
          'Ask @Flowbot for access, then get comfortable with the AI-assisted development workflow the team already uses.',
      },
      {
        label: 'Learn how to write code in the monorepo',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/608109081/How+to+write+code+at+Webflow',
        notes:
          'Use the monorepo guide as your high-level entry point for standards, paths, and common development flows.',
      },
      {
        label: 'Read the intro to Webflow Design Language (WFDL)',
        kind: 'resource',
        resourceUrl: 'https://webflow.com/blog/webflow-design-language',
        notes:
          'This is foundational context for how Webflow models the product and visual authoring experience.',
      },
      {
        label: 'Review additional WFDL resources',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/596803922/Webflow+Design+Language+WFDL',
        notes:
          'Use the extra reading when your team or onboarding buddy points you toward relevant rendering or editor areas.',
      },
      {
        label: 'Learn how to contribute code in GitHub',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/140149407/Github+Development+Processes+i.e.+How+to+contribute+code',
        notes:
          'Review draft PRs, review routing, stacked work, and the repo’s contribution expectations before you pick a task.',
      },
      {
        label: 'Understand the build & deploy process',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/40140883/Build+Deploy+Process',
        notes:
          'Familiarize yourself with CI/CD, deployment workflows, and where to look when a build breaks.',
      },
      {
        label: 'Learn how to debug unit & integration tests',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/DP/pages/744816814/Guide+run+watch+and+debug+Unit+and+Integration+tests',
        notes:
          'You will need this sooner than you think. Learn the local loop before your first PR depends on it.',
      },
      {
        label: 'Shadow your onboarding buddy debugging an issue',
        kind: 'task',
        notes:
          'Seeing a real debugging workflow is often more valuable than reading ten docs about it.',
      },
      {
        label: 'Participate in team standups & sprint planning',
        kind: 'task',
        notes:
          'Use ceremonies to understand current sprint goals, backlog shape, and how the team talks about work.',
      },
    ],
  },
  {
    id: 'week3-contribution',
    title: 'Week 3: First Contribution & Scaling Up',
    goal: 'Apply technical knowledge by contributing code and connecting your first scoped task to the bigger system.',
    items: [
      {
        label: 'Read the onboarding resources for your track',
        kind: 'resource',
        notes:
          'Pick the frontend, backend, or infrastructure startup materials that match your current role and go deeper there.',
      },
      {
        label: 'Explore engineering career growth paths and promo processes',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/folder/1058799996',
        notes:
          'Use this context to shape better growth conversations with your manager as onboarding continues.',
      },
      {
        label: 'Schedule meetings with remaining key team members',
        kind: 'task',
        notes:
          'Keep filling in the ownership map around your feature area, support systems, and close partner teams.',
      },
      {
        label: 'Reference the GitHub development process again',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/140149407/Github+Development+Processes+i.e.+How+to+contribute+code',
        notes:
          'Re-read it right before your first PR so the review and merge mechanics are fresh.',
      },
      {
        label: 'Reference the build & deploy process again',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/40140883/Build+Deploy+Process',
        notes:
          'Your first contribution will land more smoothly if the CI and deploy path already feel familiar.',
      },
      {
        label: 'Re-read debugging guidance for unit & integration tests',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/DP/pages/744816814/Guide+run+watch+and+debug+Unit+and+Integration+tests',
        notes:
          'Use this as a refresher before your first change starts failing tests.',
      },
      {
        label: 'Make your first contribution from a small Jira ticket',
        kind: 'task',
        notes:
          'Start with a scoped bug fix or enhancement that teaches repo flow, review expectations, and collaboration patterns without overwhelming you.',
      },
      {
        label: 'Learn the feature development process',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/EPD/pages/700613064/Feature+Development+Rituals',
        notes:
          'Understand who owns which decisions in each phase of the work and where engineering expectations change.',
      },
      {
        label: 'Review the EPDI OKRs',
        kind: 'resource',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/EPD/pages/1140457967/FY26+Q1+OKR+Updates',
        notes:
          'This is how your work ladders up to pillar and company priorities.',
      },
      {
        label: 'Participate in a sprint retro',
        kind: 'task',
        notes:
          'Share onboarding feedback while your first few weeks are still fresh and specific.',
      },
      {
        label: 'Document and improve an engineering process',
        kind: 'task',
        notes:
          'New hires notice onboarding and workflow gaps faster than anyone else. Write down one improvement while you still have fresh eyes.',
      },
    ],
  },
  {
    id: 'week4-citizenship',
    title: 'Week 4: Projects & Engineering Citizenship',
    goal: 'Operate more independently, participate in the surrounding engineering system, and start the milestone conversations that shape your long-term ramp.',
    items: [
      {
        label: 'Shadow 2-3 PR reviews with your onboarding buddy',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/798425098/Pull+Requests+Code+Reviews',
        notes:
          'Focus on how reviewers talk about maintainability, security, performance, and scope.',
      },
      {
        label: 'Shadow an on-call engineer',
        kind: 'task',
        notes:
          'Use this to learn how the team handles incidents and operational pressure in real time.',
      },
      {
        label: 'Attend Spring Bootcamp if required for your role',
        kind: 'training',
        resourceLabel: 'Email Emily Hornberger',
        resourceUrl: 'mailto:emily.hornberger@webflow.com',
        notes:
          'Frontend and fullstack engineers should attend the Spring training cohort once they are added to it.',
      },
      {
        label: 'Begin active work on your first project and workstreams',
        kind: 'task',
        notes:
          'Transition from pure onboarding into active delivery work that contributes meaningfully to team goals.',
      },
      {
        label: 'Have an onboarding milestone conversation with your manager',
        kind: 'task',
        notes:
          'Use the milestone conversation to talk about what is going well, what is still fuzzy, and what should happen next.',
      },
      {
        label: 'Reflect back on onboarding materials with new context',
        kind: 'resource',
        notes:
          'Return to the docs and notes that felt abstract in week one. They usually click differently after a few weeks of real work.',
      },
    ],
  },
];

export const PEOPLE_TEMPLATE: OnboardingPerson[] = [
  {
    name: 'Your Engineering Manager',
    role: 'Engineering Manager',
    kind: 'manager',
    editableBy: 'manager',
    discussionPoints:
      'Day-to-day support, role expectations, performance goals, and how the team roadmap should shape your first 90 days.',
    weekBucket: 'week1-2',
  },
  {
    name: 'Your Onboarding Buddy',
    role: 'Onboarding Buddy',
    kind: 'buddy',
    editableBy: 'manager',
    discussionPoints:
      'Day-to-day help, codebase guidance, debugging habits, and the unwritten team norms that never make it into docs.',
    weekBucket: 'week1-2',
  },
  {
    name: 'Engineering Teammate',
    role: 'Teammate',
    kind: 'teammate',
    discussionPoints:
      'How they navigate the codebase, what they currently own, and what they wish they had known during their first month.',
    weekBucket: 'week2-3',
  },
  {
    name: 'Product Manager',
    role: 'Product Manager',
    kind: 'pm',
    editableBy: 'manager',
    discussionPoints:
      'The problem space, roadmap context, and how engineering work maps to customer value and planning tradeoffs.',
    weekBucket: 'week2-3',
  },
  {
    name: 'Product Designer',
    role: 'Product Designer',
    kind: 'designer',
    editableBy: 'manager',
    discussionPoints:
      'How design decisions are communicated, reviewed, and handed off to engineering in your area.',
    weekBucket: 'week2-3',
  },
  {
    name: 'Pillar Director of Engineering',
    role: 'Pillar Director of Engineering',
    kind: 'director',
    editableBy: 'manager',
    discussionPoints:
      'How your team fits into the larger pillar strategy and which engineering bets matter most this quarter.',
    weekBucket: 'week3+',
  },
  {
    name: 'Lead People Business Partner',
    role: 'People Partner',
    kind: 'people-partner',
    editableBy: 'manager',
    discussionPoints:
      'Career support, growth conversations, and the people-program context that becomes more relevant after the first few weeks.',
    weekBucket: 'week3+',
  },
];

export const TOOL_GUIDES: ToolGuide[] = [
  {
    category: 'General',
    tool: 'Okta',
    description: 'SSO entrypoint for most internal tools.',
    accessHint: 'Start here before assuming a tool is unavailable.',
  },
  {
    category: 'General',
    tool: 'Slack',
    description: 'Primary communication surface across Webflow.',
  },
  {
    category: 'General',
    tool: 'Jira',
    description: 'EPDI uses Jira to track planning, execution, and delivery.',
  },
  {
    category: 'General',
    tool: 'Confluence',
    description:
      'Primary internal documentation surface, even though some docs still live in Google Docs.',
  },
  {
    category: 'General',
    tool: 'Google Workspace',
    description: 'Gmail, Calendar, Drive, Docs, Slides, and Sheets.',
  },
  {
    category: 'General',
    tool: 'Engineering Calendar',
    description:
      'Shared engineering calendar for recurring ceremonies and org events.',
  },
  {
    category: 'General',
    tool: 'Glean',
    description:
      'Permission-aware enterprise search across the tools and documents connected to your Webflow account.',
  },
  {
    category: 'General',
    tool: 'Zoom',
    description: 'Default video meeting tool across the company.',
  },
  {
    category: 'General',
    tool: 'Loom',
    description:
      'Viewer access is standard. Ask Flowbot for a time-boxed creator license when you need to record something.',
  },
  {
    category: 'General',
    tool: 'Navan',
    description: 'Travel booking and policy workflow.',
  },
  {
    category: 'General',
    tool: 'Workday',
    description: 'HR tasks, onboarding milestones, and training tracking.',
  },
  {
    category: 'Engineering',
    tool: 'GitHub',
    description: 'Primary source control and code review surface.',
  },
  {
    category: 'Engineering',
    tool: 'Datadog',
    description: 'Metrics, traces, and dashboards for production systems.',
  },
  {
    category: 'Engineering',
    tool: 'Opensearch',
    description: 'Log search and operational debugging.',
  },
  {
    category: 'Engineering',
    tool: 'Buildkite',
    description: 'CI pipelines, test runs, and deployment gating.',
  },
  {
    category: 'Engineering',
    tool: 'Rootly',
    description:
      'Incident response coordination and related operational workflows.',
  },
  {
    category: 'Engineering',
    tool: 'Swarmia',
    description: 'Engineering delivery insights and work analytics.',
  },
  {
    category: 'Engineering',
    tool: 'DX',
    description:
      'Developer experience tooling and internal engineering metadata.',
  },
  {
    category: 'Engineering',
    tool: 'Tailscale',
    description:
      'VPN access for internal systems and resources that should not be exposed publicly.',
  },
  {
    category: 'Engineering',
    tool: 'Webflow Admin Dash',
    description:
      'Internal admin and workspace-management surfaces used during debugging and support workflows.',
  },
  {
    category: 'Engineering',
    tool: 'Webflow Acceptance',
    description: 'Acceptance environment access for testing and QA.',
  },
  {
    category: 'Engineering',
    tool: 'Local server setup',
    description:
      'Your local development environment and the supporting setup scripts.',
  },
];

export const CHANNEL_GUIDES: SlackChannelGuide[] = [
  {
    category: 'Webflow',
    channel: '#webflow-announcements',
    description: 'Where important company-wide announcements happen.',
  },
  {
    category: 'Webflow',
    channel: '#webflow-culture',
    description: 'Culture-related conversation relevant to the whole company.',
  },
  {
    category: 'Webflow',
    channel: '#webflow-company-events',
    description: 'Follow and comment during company meetings and events.',
  },
  {
    category: 'Webflow',
    channel: '#announce-usa',
    description: 'US-focused official communications.',
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
    category: 'Culture',
    channel: '#random',
    description: 'A random channel for truly random things.',
  },
  {
    category: 'Culture',
    channel: '#remote-life',
    description: 'Remote-work conversation, solidarity, and practical advice.',
  },
  {
    category: 'Business',
    channel: '#sales-wins',
    description:
      'Follow the customers, expansions, and enterprise momentum shaping demand.',
  },
  {
    category: 'Business',
    channel: '#mentions',
    description: 'Mentions of Webflow from around the web.',
  },
  {
    category: 'Business',
    channel: '#made-in-webflow',
    description: 'Sites and projects built in Webflow.',
  },
  {
    category: 'Support',
    channel: '#support',
    description:
      'Get help from the customer support team when you need product or account context.',
  },
  {
    category: 'Support',
    channel: '#support-team-update',
    description: 'Support-facing updates on changes, PRs, and process updates.',
  },
  {
    category: 'Internal Help',
    channel: '#help',
    description: 'General questions when you are not sure where else to ask.',
  },
  {
    category: 'Internal Help',
    channel: '@Flowbot',
    description:
      'Fastest way to request tool access, IT help, and common internal workflows.',
  },
  {
    category: 'Internal Help',
    channel: '#benefits_q_and_a',
    description: 'Questions about benefits and related employee support.',
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
      'AI-native engineering workflows, automation, and agent discussion.',
  },
  {
    category: 'Learning',
    channel: '#open-roles-announcements',
    description:
      'Follow internal and external role openings across the company.',
  },
  {
    category: 'Learning',
    channel: '#learning',
    description:
      'Share and discover learning resources, tools, and ongoing growth opportunities.',
  },
];

export const RITUAL_GUIDES: RitualGuide[] = [
  {
    category: 'Engineering',
    meeting: 'Sprint Planning',
    description: 'Prioritize and commit to work for the sprint.',
    cadence: 'Biweekly on Tuesdays',
    attendance: 'Required (if your team uses sprints)',
  },
  {
    category: 'Engineering',
    meeting: 'Daily standup',
    description:
      'Quick progress updates and blockers, either async in Slack or sync in a live meeting.',
    cadence: 'Daily',
    attendance: 'Team-dependent',
  },
  {
    category: 'Engineering',
    meeting: 'Engineering Monthly',
    description: 'Org-wide all-hands with updates and demos.',
    cadence: 'Monthly, last Wednesday',
    attendance: 'Required',
  },
  {
    category: 'Engineering',
    meeting: 'Frontend Guild',
    description:
      'Engineers and EM sponsors focused on frontend code and architecture.',
    cadence: 'Monthly, last Wednesday',
    attendance: 'Optional',
  },
  {
    category: 'Engineering',
    meeting: 'Backend Guild',
    description:
      'Engineers and EM sponsors focused on backend code and architecture.',
    cadence: 'Biweekly on Tuesdays',
    attendance: 'Optional',
  },
  {
    category: 'Engineering',
    meeting: 'Tech Noodles',
    description:
      'Brainstorming sessions on technical questions, concepts, and engineering ideas.',
    cadence: 'Weekly on Tuesdays',
    attendance: 'Optional',
  },
  {
    category: 'Engineering',
    meeting: 'Brown Bag',
    description:
      'Informal learning sessions to expand skills and share technical ideas.',
    cadence: 'Monthly, last Thursday',
    attendance: 'Optional, encouraged',
  },
  {
    category: 'EPD',
    meeting: 'EPD All Team',
    description:
      'Quarterly review of past-quarter work, WXP updates, and OKRs across pillars.',
    cadence: 'Quarterly',
    attendance: 'Required',
  },
  {
    category: 'EPD',
    meeting: 'Show & Tell',
    description: 'An informal meeting to show end-of-sprint demos.',
    cadence: 'Biweekly on Thursdays',
    attendance: 'Optional, encouraged',
  },
  {
    category: 'Company',
    meeting: 'Webflow Together',
    description: 'Monthly company-wide meeting.',
    cadence: 'Monthly on Thursdays',
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

const TRACK_DOC_ID_BY_ROLE: Partial<Record<RoleTrack, string>> = {
  frontend: 'frontend-onboarding',
  backend: 'backend-onboarding',
  infrastructure: 'infrastructure-onboarding',
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

function buildChecklistForProfile(profile: TeamProfile): ChecklistSection[] {
  const checklist = buildChecklist();
  const trackDocId = TRACK_DOC_ID_BY_ROLE[profile.roleTrack];
  const trackDoc = trackDocId
    ? profile.docs.find((doc) => doc.id === trackDocId && doc.url)
    : undefined;
  const trackChecklistItem = checklist
    .find((section) => section.id === 'week3-contribution')
    ?.items.find(
      (item) => item.label === 'Read the onboarding resources for your track'
    );
  if (trackChecklistItem && trackDoc?.url) {
    trackChecklistItem.resourceLabel = trackDoc.title;
    trackChecklistItem.resourceUrl = trackDoc.url;
  }
  return checklist;
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

const PLAN_ITEMS: MilestonePlanItem[] = [
  {
    timeframe: 'Week 1',
    goalSummary: 'Setup & Foundations',
    keyActivities:
      'Complete HR and work tools, review Webflow 101, and meet your team and mentor.',
    supportActions:
      'Assign an onboarding buddy, schedule 1:1s, and confirm checklist progress.',
  },
  {
    timeframe: 'Week 2',
    goalSummary: 'Intro to Engineering Workflows',
    keyActivities:
      'Review The Codex, learn the PR and code-review process, and get hands-on with debugging and local development.',
    supportActions:
      'Review their early PRs, discuss career growth, and confirm engagement with team ceremonies.',
  },
  {
    timeframe: 'Week 3',
    goalSummary: 'First Contribution & Scaling',
    keyActivities:
      'Submit a first PR, learn your team or system architecture, and attend retrospectives.',
    supportActions:
      'Give feedback on the first PR, encourage knowledge sharing, and track exposure to team OKRs.',
  },
  {
    timeframe: 'Week 4',
    goalSummary: 'Project Onboarding & Engineering Citizenship',
    keyActivities:
      'Contribute meaningfully to a project, understand incident response, and take on early ownership.',
    supportActions:
      'Support task ownership and guide the new hire through project onboarding and role-specific training.',
  },
  {
    timeframe: '60 Days',
    goalSummary: 'Operate with Confidence',
    keyActivities:
      'Ship meaningful code, follow team workflows smoothly, and develop operational confidence.',
    supportActions:
      'Hold the milestone conversation and reinforce growth in tooling, collaboration, and delivery.',
  },
  {
    timeframe: '90 Days',
    goalSummary: 'Full Ownership & Autonomy',
    keyActivities:
      'Lead more complex work, collaborate cross-functionally, and suggest process improvements.',
    supportActions:
      'Conduct the career-growth conversation and mark the full ramp milestone.',
  },
];

export function buildOnboardingPackageSections(params: {
  profile: TeamProfile;
  references?: OnboardingReferences;
  tasks?: ContributionTask[];
  people?: OnboardingPerson[];
  welcomeNote?: string;
}): OnboardingPackage['sections'] {
  const {
    profile,
    references = {},
    tasks = [],
    people = [profile.manager, profile.buddy, ...profile.teammates],
    welcomeNote,
  } = params;
  const checklist = buildChecklistForProfile(profile);

  return {
    welcome: {
      title: 'Welcome',
      intro: `You’re joining *${profile.teamName}*${
        profile.pillarName ? ` in *${profile.pillarName}*.` : '.'
      } Spark is organizing the real onboarding flow from the engineering workbook so your first few weeks feel more like a guided ramp than a scavenger hunt.`,
      personalizedNote: welcomeNote,
      onboardingPocs: [
        {
          label: 'Engineering Manager',
          owner: profile.manager,
          summary:
            'Provides clear structure, support, milestone conversations, and guidance throughout onboarding.',
        },
        {
          label: 'Onboarding Buddy',
          owner: profile.buddy,
          summary:
            'Helps with day-to-day questions, codebase navigation, and practical team norms.',
        },
      ],
      journeyMilestones: WELCOME_JOURNEY_MILESTONES.map((milestone) => ({
        ...milestone,
      })),
    },
    onboardingChecklist: {
      title: 'Onboarding Checklist',
      intro:
        'Use this as the concrete week-by-week checklist. It mirrors the onboarding workbook instead of collapsing everything into a generic Spark task dump.',
      sections: checklist,
    },
    plan306090: {
      title: '30-60-90 Plan',
      intro:
        'This is the milestone view of the same ramp: what the new hire should be doing and what support the manager or buddy should be providing.',
      items: PLAN_ITEMS.map((item) => ({...item})),
    },
    peopleToMeet: {
      title: 'People to Meet',
      intro:
        'These are the people most worth spending time with early. Start with the teammates and stakeholders most relevant to your role and team.',
      people: people.map((person) => ({...person})),
    },
    toolsAccess: {
      title: 'Tools Access Checklist',
      intro:
        'Do not try to set everything up in the first week. Use this as a working checklist and ask @Flowbot whenever you hit missing access.',
      tools: profile.tools.map((tool) => ({...tool})),
    },
    slack: {
      title: 'Slack',
      intro:
        'Slack is the company’s communication lifeline. Join the core channels first, then add the team and specialty channels that matter for your ramp.',
      channels: profile.recommendedChannels.map((channel) => ({...channel})),
    },
    initialEngineeringTasks: {
      title: 'Initial Engineering Tasks',
      intro:
        'Use this section to track the first scoped engineering work the new hire should take on with support from the manager and onboarding buddy.',
      managerPrompt:
        'Managers should add or confirm the first scoped Jira tickets before publishing the package to the new hire.',
      tasks: tasks.map((task) => ({
        ...task,
        filePaths: [...task.filePaths],
        previewLines: [...task.previewLines],
        metadata: {...task.metadata},
      })),
    },
    rituals: {
      title: 'Rituals',
      intro:
        'These are the recurring engineering, EPD, and company rituals that shape how information moves at Webflow.',
      rituals: profile.rituals.map((ritual) => ({...ritual})),
    },
    engineeringResourceLibrary: buildResourceLibrarySection(
      profile,
      references
    ),
  };
}

function buildResourceLibrarySection(
  profile: TeamProfile,
  references: OnboardingReferences
): EngineeringResourceLibrarySection {
  return {
    title: 'Engineering Resource Library',
    intro:
      'This is the central hub for the docs, workflows, and codebase entry points most relevant during ramp-up. It focuses on the canonical engineering docs plus your team and pillar context.',
    docs: profile.docs.map((doc) => ({...doc})),
    references: {
      ...references,
    },
    keyPaths: [...profile.keyPaths],
  };
}
