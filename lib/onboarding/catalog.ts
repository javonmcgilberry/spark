import type {
  ChecklistItem,
  ChecklistSection,
  ContributionTask,
  DocLink,
  EngineeringResourceLibrarySection,
  OnboardingPackage,
  OnboardingPerson,
  OnboardingReferences,
  RitualGuide,
  RoleTrack,
  SlackChannelGuide,
  TeamProfile,
  ToolGuide,
  WelcomeJourneyMilestone,
} from '../types';

type HomeSectionId =
  | 'welcome'
  | 'onboarding-checklist'
  | 'people-to-meet'
  | 'resources'
  | 'initial-engineering-tasks';

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
  {id: 'people-to-meet', label: 'People'},
  {id: 'resources', label: 'Resources'},
  {id: 'initial-engineering-tasks', label: 'Tasks'},
];

const WELCOME_JOURNEY_MILESTONES: WelcomeJourneyMilestone[] = [
  {
    label: 'Week 1: Meet the Team & Setup',
    keyActivities:
      'Complete HR and work tools, review Webflow 101, and meet your team and mentor.',
    supportActions:
      'Assign an onboarding buddy, schedule 1:1s, and confirm checklist progress.',
  },
  {
    label: 'Week 2: Intro to Eng Workflows',
    keyActivities:
      'Review The Codex, learn the PR and code-review process, and get hands-on with debugging and local development.',
    supportActions:
      'Review their early PRs, discuss career growth, and confirm engagement with team ceremonies.',
  },
  {
    label: 'Week 3: First Contribution & Scaling Up',
    keyActivities:
      'Submit a first PR, learn your team or system architecture, and attend retrospectives.',
    supportActions:
      'Give feedback on the first PR, encourage knowledge sharing, and track exposure to team OKRs.',
  },
  {
    label: 'Week 4: Project Onboarding & Eng Citizenship',
    keyActivities:
      'Contribute meaningfully to a project, understand incident response, and take on early ownership.',
    supportActions:
      'Support task ownership and guide the new hire through project onboarding and role-specific training.',
  },
  {
    label: '60 Days',
    keyActivities:
      'Ship meaningful code, follow team workflows smoothly, and develop operational confidence.',
    supportActions:
      'Hold the milestone conversation and reinforce growth in tooling, collaboration, and delivery.',
  },
  {
    label: '90 Days',
    keyActivities:
      'Lead more complex work, collaborate cross-functionally, and suggest process improvements.',
    supportActions:
      'Conduct the career-growth conversation and mark the full ramp milestone.',
  },
];

export const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    id: 'week1-setup',
    title: 'Week 1: meet the team and get set up',
    goal: 'Meet your new teammates, complete HR tasks, set up tools, and build foundational knowledge.',
    items: [
      {
        label: 'Complete HR & Workday tasks',
        kind: 'task',
        notes:
          "You'll have Workday tasks assigned to you. Some will be timely to complete on the first day and others will continue to be assigned as you complete tasks. Workday is accessed via Okta.",
      },
      {
        label: 'Participate in your onboarding cohort',
        kind: 'live-training',
        notes:
          "A company-wide cohort of new joiners will go through the onboarding process together. You should have invites to your sessions already in Google Calendar. While you're onboarding these sessions take priority over other meetings.",
      },
      {
        label: 'Begin required e-learning trainings',
        kind: 'workramp',
        notes:
          'As part of onboarding, your cohort will be instructed to complete trainings in our training platform, WorkRamp. Feel free to get started - it can be accessed via Okta.',
      },
      {
        label: 'Meet with your engineering manager',
        kind: 'task',
        notes:
          'Your engineering manager will schedule time with you on your first day. Please be sure to prioritize this meeting!',
      },
      {
        label: 'Complete Webflow 101',
        kind: 'task',
        resourceUrl: 'https://university.webflow.com/courses/webflow-101',
        notes:
          "You may have already finished this as part of your e-learning trainings, but if not make sure you've finished this Webflow University course by the end of week 1!",
      },
      {
        label: 'Start Secure Code Warrior training',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/SEC/pages/1224933772/Secure+Code+Warrior+Training+-+New+Hire+FAQ',
        notes:
          'You have 30 days to complete this training. Find Secure Code Warrior in your Okta Dashboard or via an invite sent to your email. Once done, mark the task as done in Workday.',
      },
      {
        label: 'Meet with your onboarding buddy',
        kind: 'task',
        notes:
          "Set up time with your onboarding buddy to hear more about life at Webflow. They're a great resource for questions about the day-to-day as a Webflower.",
      },
      {
        label: 'Meet with your engineering teammates',
        kind: 'task',
        notes:
          "Grab 15-30 minutes with your engineering teammates for casual introductions now that you've arrived!",
      },
      {
        label: 'Add the engineering calendar to your Google calendar',
        kind: 'task',
        resourceUrl:
          'https://calendar.google.com/calendar/u/0?cid=d2ViZmxvdy5jb21fOGdmdnIzcGMwOXJtOWtpZ2I3cTA3cGVrdHNAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ',
        notes: 'Press the link and follow the steps.',
      },
      {
        label: 'Request access to tools & systems',
        kind: 'task',
        resourceLabel: 'Supporting Software Setup',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/134087310/Supporting+Software+Setup',
        notes:
          'You should have access to most tools within Okta. For additional access, you can request in @Flowbot for new permissions. There is a bot which will help you; just ask "Can I have access to {tool}?" and instructions will follow.\n\nDon\'t stress about getting access to all of these tools by the end of week 1. Aiming to get most access by week 3 is great!',
      },
      {
        label: 'Read through systems diagrams',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/623280258/System+Diagrams',
        notes:
          'Understand service interactions, database design, caching, and infrastructure.',
      },
      {
        label: 'Orient yourself with the engineering org chart',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/1071448164/Engineering+Org+Charts+by+Team+Pillar',
        notes: 'You can explore our org charts pillar by pillar on this page.',
      },
      {
        label: 'Explore and join 3 relevant Slack channels',
        kind: 'task',
        notes:
          'Explore your Slack setup and join a few new channels like #engineering, #epd, and #released.',
      },
    ],
  },
  {
    id: 'week2-workflows',
    title: 'Week 2: engineering workflows',
    goal: 'Learn the engineering workflows, development environment, and architecture context you need before a first contribution.',
    items: [
      {
        label: 'Continue Secure Code Warrior training',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/SEC/pages/1224933772/Secure+Code+Warrior+Training+-+New+Hire+FAQ',
        notes:
          'You have 30 days to complete this training. Find Secure Code Warrior in your Okta Dashboard. Once finished, mark the task as done in Workday.',
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
          'You should have access to most tools within Okta. For additional access, you can request in @Flowbot for new permissions. There is a bot which will help you; just ask "Can I have access to {tool}?" and instructions will follow.',
      },
      {
        label: 'Schedule meetings with additional team members',
        kind: 'task',
        notes:
          'Continue to get to know your partners and start learning about your focus area.',
      },
      {
        label: 'Explore and learn our feature & service team mapping structure',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/EPD/pages/440697869/Feature+Service+Team+Mapping',
        notes:
          "Our EPDI (Engineering, Product, Design, and Insight) teams are organized into pillars based on product surface areas. These pillars own different parts of our product, which you'll see in the table in the linked wiki.",
      },
      {
        label: 'Read the Webflow Codex and engineering best practices',
        kind: 'reading',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/1018331179/The+Webflow+Codex+v0.1',
        notes:
          'This is the architectural and workflow baseline that keeps engineers on the development golden path.',
      },
      {
        label: 'Read and follow the steps in our Webflow platform overview',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/140051185/Webflow+Platform+Overview',
        notes:
          'Following the steps in the platform overview will help you build a mental model of Webflow.',
      },
      {
        label: 'Set up your local development environment',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/139985579/Local+Development+Setup',
        notes:
          'Set up your local development environment. For questions, reference the troubleshooting guide or ask questions in #triage-build-loop.',
      },
      {
        label: 'Profile Webflow server & renderer performance locally',
        kind: 'reading',
        resourceUrl:
          'https://www.loom.com/share/b5798b46089647ffa800cbad626baac0',
        notes:
          "Step-by-step instructions to locally profile Webflow's server and renderer processes using Chrome DevTools. This guide helps you identify and analyze CPU hotspots, enabling performance investigations without needing Datadog access or special permissions.",
      },
      {
        label: 'Get started with Cursor & Augment, our AI codegen tools',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/DP/pages/1056212669/Cursor+and+Augment+Code+AI+Codegen+tools+Getting+Started',
        notes: 'Ask @Flowbot in Slack for an invite to both Cursor & Augment.',
      },
      {
        label: 'Learn how to write code and read about our monorepo',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/608109081/How+to+write+code+at+Webflow',
        notes:
          'This document aims to provide context and guidance in all aspects of coding within a single high-level entrypoint for new developers to onboard.',
      },
      {
        label: 'Read our intro to Webflow Design Language (WFDL)',
        kind: 'reading',
        resourceUrl: 'https://webflow.com/blog/webflow-design-language',
        notes:
          'Webflow Design Language (WFDL) is an extensible, integrated language powering no-code software with a visual-first authoring experience.',
      },
      {
        label: 'Here are more WFDL resources you can peruse',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/596803922/Webflow+Design+Language+WFDL',
        notes: 'Additional WFDL resources to get you started.',
      },
      {
        label: 'Learn how to contribute code in GitHub',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/140149407/Github+Development+Processes+i.e.+How+to+contribute+code',
        notes: 'Learn about our GitHub development processes.',
      },
      {
        label: 'Understand the build & deploy process',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/40140883/Build+Deploy+Process',
        notes:
          'Familiarize yourself with our CI/CD pipeline and deployment workflows.',
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
          "Engage in team processes and ceremonies. Learn about the team's current sprint goals and backlog.",
      },
    ],
  },
  {
    id: 'week3-contribution',
    title: 'Week 3: first contribution and scaling up',
    goal: 'Apply technical knowledge by contributing code and connecting your first scoped task to the bigger system.',
    items: [
      {
        label: 'Read the onboarding resources for your track',
        kind: 'task',
        notes: 'A startup guide and additional resources for your track.',
      },
      {
        label: 'Explore engineering career growth paths and promo processes',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/folder/1058799996',
        notes:
          'Plan your career goals with your manager to help structure growth discussions in week 4.',
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
        notes: 'Learn about our GitHub development processes.',
      },
      {
        label: 'Reference the build & deploy process again',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/40140883/Build+Deploy+Process',
        notes:
          'Familiarize yourself with our CI/CD pipeline and deployment workflows.',
      },
      {
        label: 'Re-read debugging guidance for unit & integration tests',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/DP/pages/744816814/Guide+run+watch+and+debug+Unit+and+Integration+tests',
        notes:
          'Use this as a refresher before your first change starts failing tests.',
      },
      {
        label: 'Make your first contribution from a small Jira ticket',
        kind: 'task',
        notes:
          'Fix a small bug or contribute to a minor enhancement. Your engineering manager will assign this task. Follow our feature development lifecycle (code, test, deploy). Collaborate with your onboarding buddy to work through the process.',
      },
      {
        label: 'Learn the feature development process',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/EPD/pages/700613064/Feature+Development+Rituals',
        notes:
          'Understand who owns which decisions in each phase of the work and where engineering expectations change.',
      },
      {
        label: 'Review the EPDI OKRs',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/EPD/pages/1140457967/FY26+Q1+OKR+Updates',
        notes:
          'Each pillar has a swimlane on the linked Jira board. Read more about company-wide OKR progress here.',
      },
      {
        label: 'Participate in a sprint retro',
        kind: 'task',
        notes:
          'Share onboarding feedback about your experience during a team retro. Discuss what worked well and what could be improved.',
      },
      {
        label: 'Document and improve an engineering process',
        kind: 'task',
        notes:
          'Update internal docs based on your onboarding experience. New hires often have the freshest perspective on gaps in onboarding documentation.',
      },
    ],
  },
  {
    id: 'week4-citizenship',
    title: 'Week 4: projects and engineering citizenship',
    goal: 'Operate more independently, participate in the surrounding engineering system, and start the milestone conversations that shape your long-term ramp.',
    items: [
      {
        label: 'Shadow 2-3 PR reviews with your onboarding buddy',
        kind: 'task',
        resourceUrl:
          'https://webflow.atlassian.net/wiki/spaces/ENG/pages/798425098/Pull+Requests+Code+Reviews',
        notes:
          'Focus on maintainability, security, and performance improvements.',
      },
      {
        label: 'Shadow an on-call engineer',
        kind: 'task',
        notes:
          'Expand your understanding of incident response by shadowing an on-call engineer and learning how we handle real-time issues.',
      },
      {
        label: 'Attend Spring Bootcamp if required for your role',
        kind: 'task',
        resourceLabel: 'Email Emily Hornberger',
        resourceUrl: 'mailto:emily.hornberger@webflow.com',
        notes:
          'Spring is our internal design system and is owned by the Spring Design System team on the Developer Productivity pillar. This mandatory 75-minute training teaches engineers to independently use Spring.\n\nEmily Hornberger will add you to this training around the 30-day mark.',
      },
      {
        label: 'Begin active work on your first project and workstreams',
        kind: 'task',
        notes:
          "Transition from onboarding to active project work by taking on engineering tasks that contribute meaningfully to the team's goals.",
      },
      {
        label: 'Have an onboarding milestone conversation with your manager',
        kind: 'task',
        notes:
          'Check in with your manager on how things are going in your onboarding process.',
      },
      {
        label: 'Reflect back on onboarding materials with new context',
        kind: 'task',
        notes:
          'Take a look back at any notes or areas you marked to revisit. Additional context can make documentation take on new meaning.',
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
    description: 'Where important announcements happen.',
  },
  {
    category: 'Webflow',
    channel: '#webflow-culture',
    description:
      'Culture-related content relevant to all Webflow team members.',
  },
  {
    category: 'Webflow',
    channel: '#webflow-company-events',
    description: 'Channel to follow and comment during our Webflow meetings.',
  },
  {
    category: 'Webflow',
    channel: '#announce-usa',
    description:
      'A channel to reach out to all US-based employees, usually reserved for official comms.',
  },
  {
    category: 'Webflow',
    channel: '#props',
    description: 'Say thank you to someone.',
  },
  {
    category: 'Webflow',
    channel: '#webflow-celebrations',
    description:
      'Where new folks get introduced and updates on team members are shared.',
  },
  {
    category: 'Webflow',
    channel: '#sales-wins',
    description:
      'A place where the Sales org shares the new customers joining or upgrading to Webflow Enterprise.',
  },
  {
    category: 'Webflow',
    channel: '#mentions',
    description: 'Mentions of Webflow from around the web.',
  },
  {
    category: 'Webflow',
    channel: '#made-in-webflow',
    description: 'Sites made in Webflow.',
  },
  {
    category: 'Webflow',
    channel: '#it-announcements',
    description: 'All IT-related comms are shared here.',
  },
  {
    category: 'Webflow',
    channel: '#random',
    description: 'A random channel for random things.',
  },
  {
    category: 'Webflow',
    channel: '#remote-life',
    description:
      'Talk about all the things that have to do with working remotely at Webflow, even if it is just venting.',
  },
  {
    category: 'Webflow',
    channel: '#marketing',
    description: 'Blog, landing pages, and general marketing topics.',
  },
  {
    category: 'Webflow',
    channel: '#community',
    description: 'Discussion of general community business or topics.',
  },
  {
    category: 'Webflow',
    channel: '#education',
    description: 'Public education team channel.',
  },
  {
    category: 'Webflow',
    channel: '#support',
    description:
      'A space for teams inside Webflow to get help from the Customer Support team.',
  },
  {
    category: 'Webflow',
    channel: '#support-team-update',
    description:
      'A place to update the Support team about changes, PRs, processes, and other items.',
  },
  {
    category: 'Webflow',
    channel: '#open-roles-announcements',
    description:
      'This channel is used to keep track of roles that are now open both internally and externally.',
  },
  {
    category: 'Webflow',
    channel: '#learning',
    description:
      'This channel is used to share Webflow learning resources, tools, and activities.',
  },
  {
    category: 'Assistance',
    channel: '#help',
    description: 'For misc questions when you are not sure where else to ask.',
  },
  {
    category: 'Assistance',
    channel: '@Flowbot',
    description:
      'The fastest way to reach out to IT. You can ask for access to tools here and Flowbot will automatically help you out.',
  },
  {
    category: 'Assistance',
    channel: '#benefits_q_and_a',
    description: 'Questions about your benefits? Ask here.',
  },
  {
    category: 'Assistance',
    channel: '#payroll_q_and_a',
    description: 'Questions about payroll? Ask here.',
  },
  {
    category: 'Assistance',
    channel: '#finance_q_and_a',
    description: 'Questions about finance? Ask here.',
  },
  {
    category: 'Assistance',
    channel: '#security',
    description:
      'Something weird with your equipment or a strange email from the CEO asking for help? This is the place to check things are alright.',
  },
  {
    category: 'Engineering',
    channel: '#engineering',
    description: 'All things engineering.',
  },
  {
    category: 'Engineering',
    channel: '#engineering-announcements',
    description: 'Engineering announcements.',
  },
  {
    category: 'Engineering',
    channel: '#production-events',
    description:
      'Channel for production coordination. If dev or merges are ever locked, this channel gets notified.',
  },
  {
    category: 'Engineering',
    channel: '#merge-queue-events',
    description:
      'Stay updated with all additions, removals, and essential notifications related to our merge queue.',
  },
  {
    category: 'Engineering',
    channel: '#secure-code-warriors',
    description:
      'Ask questions and get answers about Secure Code Warrior training.',
  },
  {
    category: 'Engineering',
    channel: '#frontend',
    description: 'Quick questions about our frontend code and patterns.',
  },
  {
    category: 'Engineering',
    channel: '#backend',
    description: 'The place for backend discussions.',
  },
  {
    category: 'Engineering',
    channel: '#tech-specs',
    description:
      'Share your tech spec for engineering-wide visibility and collaboration.',
  },
  {
    category: 'Engineering',
    channel: '#tech-noodles',
    description:
      'Brainstorm on technical questions, concepts, and more with engineering.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#epd',
    description: 'Engineering, Product, and Design announcements.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#released',
    description:
      'For all customer-facing feature launches. Check the bookmarks in-channel for how to use this space.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#small-wins',
    description:
      'Small win - massive impact. Share your small wins here. If it is a customer-facing feature, post it to #released.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#product-ideas',
    description: 'A place to share product ideas for Webflow.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#ux-paper-cuts',
    description: 'Submissions of small polish bugs.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#ok2-build-beta',
    description: 'Channel for OK2 build and beta recaps and feedback.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#ok2-deprecate',
    description: 'Channel for OK2 deprecate recaps.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#ok2-ga',
    description: 'Channel for OK2 GA recaps and feedback.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#help-tier4',
    description: 'Channel for questions on tier 4 launches.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#data',
    description: 'All things data science and metrics.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#insights',
    description:
      'General discussion and coordination around research initiatives. If you need user research help, you can submit a ticket here: https://webflow.atlassian.net/browse/UR-1',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#accessibility',
    description: 'Discuss anything related to accessibility at Webflow.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#design-system',
    description:
      'A place to discuss and ask questions about our internal design system, Spring.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#design',
    description:
      'A public channel to talk about design, share news, or cool stuff with the rest of the company.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#design-system-updates',
    description: 'Updates from the Design System team.',
  },
  {
    category: 'EPDI (Engineering, Product, Design)',
    channel: '#user-research',
    description:
      'Reach out to our user researchers or join the latest conversations around user research at Webflow.',
  },
  {
    category: 'Fun',
    channel: '#good-morning',
    description: 'A fun way to start the day.',
  },
  {
    category: 'Fun',
    channel: '#because-i-deserve-it',
    description: 'Treat-yourself moments.',
  },
  {
    category: 'Fun',
    channel: '#trash-pandas',
    description: 'Junk food enthusiasts.',
  },
  {
    category: 'Fun',
    channel: '#emoji',
    description: 'New Slack emojis.',
  },
  {
    category: 'Fun',
    channel: '#books',
    description: 'Discuss your latest reads.',
  },
  {
    category: 'Fun',
    channel: '#sci-fi-fantasy',
    description: 'For sci-fi lovers.',
  },
  {
    category: 'Fun',
    channel: '#food',
    description: 'Share your latest culinary accomplishments.',
  },
  {
    category: 'Fun',
    channel: '#dogs',
    description: 'Dog photos and dog appreciation.',
  },
  {
    category: 'Fun',
    channel: '#cats',
    description: 'Cat photos and cat appreciation.',
  },
  {
    category: 'Fun',
    channel: '#running',
    description: 'Running chat and motivation.',
  },
  {
    category: 'Fun',
    channel: '#skiing',
    description: 'Skiing chat.',
  },
  {
    category: 'Fun',
    channel: '#photography',
    description: 'Photography chat.',
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
  {
    id: 'onboarding-milestones',
    title: 'Onboarding milestone 1:1s',
    description:
      'What to expect at your 30-/60-/90-day milestone conversations.',
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
    {
      id: 'cicd-onboarding',
      title: 'CI/CD onboarding resources',
      description:
        'Build and deploy pipelines, merge queue, and delivery tooling onboarding.',
      source: 'static',
    },
  ],
  general: [
    {
      id: 'frontend-onboarding',
      title: 'Role library: Frontend',
      description:
        'Frontend-specific learning resources and architecture pointers.',
      source: 'static',
    },
    {
      id: 'backend-onboarding',
      title: 'Role library: Backend',
      description: 'Backend systems, services, and operational resources.',
      source: 'static',
    },
    {
      id: 'infrastructure-onboarding',
      title: 'Role library: Infrastructure',
      description:
        'Infrastructure, delivery, and platform-specific onboarding resources.',
      source: 'static',
    },
    {
      id: 'cicd-onboarding',
      title: 'Role library: CI/CD',
      description:
        'Build and deploy pipelines, merge queue, and delivery tooling onboarding.',
      source: 'static',
    },
  ],
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
  'cicd-onboarding': '1540391448',
  'onboarding-milestones': '1334510117',
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

export function buildChecklistForProfile(
  profile: TeamProfile,
  customChecklistItems: ChecklistItem[] = []
): ChecklistSection[] {
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

  if (customChecklistItems.length > 0) {
    for (const item of customChecklistItems) {
      if (!item.sectionId) {
        continue;
      }

      const targetSection = checklist.find(
        (section) => section.id === item.sectionId
      );
      if (!targetSection) {
        continue;
      }

      targetSection.items.push({...item});
    }
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

export function buildOnboardingPackageSections(params: {
  profile: TeamProfile;
  references?: OnboardingReferences;
  tasks?: ContributionTask[];
  people?: OnboardingPerson[];
  welcomeNote?: string;
  welcomeIntro?: string;
  customChecklistItems?: ChecklistItem[];
}): OnboardingPackage['sections'] {
  const {
    profile,
    references = {},
    tasks = [],
    people = [profile.manager, profile.buddy, ...profile.teammates],
    welcomeNote,
    welcomeIntro,
    customChecklistItems = [],
  } = params;
  const checklist = buildChecklistForProfile(profile, customChecklistItems);

  return {
    welcome: {
      title: 'Welcome',
      intro: welcomeIntro ?? buildWelcomeIntro(profile),
      personalizedNote: welcomeNote,
      onboardingPocs: [
        {
          label: 'Engineering Manager',
          owner: profile.manager,
          summary:
            "I'm here to provide clear structure, support, and guidance throughout the onboarding process.\n\nWe'll stay closely synced during your first few weeks.",
        },
        {
          label: 'Onboarding Buddy',
          owner: profile.buddy,
          summary:
            "I'm here to help you develop, learn, and build understanding. I'll provide answers, guidance, and support as you join our team.\n\nWe'll also stay closely connected during your first few weeks.",
        },
      ],
      journeyMilestones: WELCOME_JOURNEY_MILESTONES.map((milestone) => ({
        ...milestone,
      })),
    },
    onboardingChecklist: {
      title: 'Onboarding checklist',
      intro:
        'Use this week-by-week checklist to keep your ramp clear and manageable. It mirrors the onboarding workbook, so you can focus on what matters now without piecing everything together yourself.',
      sections: checklist,
    },
    peopleToMeet: {
      title: 'People to meet',
      intro:
        'These are the people most likely to help you get grounded early. Start with the teammates and partners closest to your role and team.',
      people: people.map((person) => ({...person})),
    },
    toolsAccess: {
      title: 'Tools access checklist',
      intro:
        'You do not need to set everything up in week one. Use this as a working checklist, and ask @Flowbot whenever something is missing.',
      tools: profile.tools.map((tool) => ({...tool})),
    },
    slack: {
      title: 'Slack',
      intro:
        "In a remote-first culture, Slack is our lifeline when it comes to communication. Have a look around some common company and EPDI-specific Slack channels below. You will also have pillar- and team-specific channels to join so you can communicate with key stakeholders for the projects you'll work on.\n\nDo not hesitate to reach out to your manager, onboarding buddy, or your new-hire cohort Slack channel as you begin to ramp up in your new role. Check out some Slack guidance from our CTO, Allan Leinwand.",
      channels: profile.recommendedChannels.map((channel) => ({...channel})),
    },
    initialEngineeringTasks: {
      title: 'Initial engineering tasks',
      intro:
        'Use this section to track the first scoped engineering work the new hire can take on with support from the manager and onboarding buddy.',
      managerPrompt:
        'Managers should add or confirm a few scoped Jira tickets before sharing the plan with the new hire.',
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
        'These are the recurring engineering, EPD, and company rituals that help work stay connected across Webflow.',
      rituals: profile.rituals.map((ritual) => ({...ritual})),
    },
    engineeringResourceLibrary: buildResourceLibrarySection(
      profile,
      references
    ),
  };
}

function buildWelcomeIntro(profile: TeamProfile): string {
  const hasDistinctPillar =
    typeof profile.pillarName === 'string' &&
    normalizeLabel(profile.pillarName) !== normalizeLabel(profile.teamName);
  const teamContext = hasDistinctPillar
    ? `the ${profile.teamName} team within ${profile.pillarName}`
    : `the ${profile.teamName} team`;

  return `*Hi ${profile.firstName},*\n\nI want to extend a warm welcome to the team. I am thrilled to have you join the Engineering org and ${teamContext}. Your skills and experience will greatly benefit both you and the team in this new role.\n\nThis guide and the associated resources are meant to help you through your first few weeks. As your manager, please consider me your official guide. I am here for any and all questions you may have. We'll stay in close sync during your first few weeks and then settle into a regular weekly cadence. You are also joining a team of wonderful humans whose virtual doors are open for your questions.\n\nPlease be sure to take care of yourself through this process. Learning a new role is hard and takes a lot of brain power. We have access to Modern Health for coaching and support, as well as your Health & Productivity stipends. Do what you need to do to access the support you need throughout this process.\n\nI am so looking forward to working with you.\n\n- ${profile.manager.name}`;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function buildResourceLibrarySection(
  profile: TeamProfile,
  references: OnboardingReferences
): EngineeringResourceLibrarySection {
  return {
    title: 'Engineering resource library',
    intro:
      'This is the central hub for the docs, workflows, and codebase entry points that matter most during ramp-up. It focuses on the core engineering docs, plus the team and pillar context that will help things click faster.',
    docs: profile.docs.map((doc) => ({...doc})),
    references: {
      ...references,
    },
    keyPaths: [...profile.keyPaths],
  };
}
