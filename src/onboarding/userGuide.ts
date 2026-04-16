/**
 * Canonical 8-section template for a Webflow User Guide.
 *
 * Mirrors the order, emojis, and headings from the internal Webflow
 * template so that the generated markdown drops cleanly into the existing
 * Google Doc format. The `prompt` strings are conversational — they are
 * the text the LLM uses to invite the user to speak to each section.
 */

export const USER_GUIDE_SECTION_IDS = [
  'schedule',
  'style',
  'values',
  'pet-peeves',
  'communication',
  'help-me',
  'feedback',
  'decisions',
] as const;

export type UserGuideSectionId = (typeof USER_GUIDE_SECTION_IDS)[number];

export interface UserGuideSection {
  id: UserGuideSectionId;
  emoji: string;
  heading: string;
  prompt: string;
}

export const USER_GUIDE_SECTIONS: ReadonlyArray<UserGuideSection> = [
  {
    id: 'schedule',
    emoji: '📝',
    heading: 'My schedule / When and how to reach me',
    prompt:
      'When are you usually on, and how should people reach you? Walk me through a normal day — time zone, core hours, when you go heads-down.',
  },
  {
    id: 'style',
    emoji: '⭐️',
    heading: 'My style / About Me',
    prompt:
      'How would you describe your working style in a couple of sentences? Feel free to bring in a bit of who you are outside work if that helps people connect.',
  },
  {
    id: 'values',
    emoji: '💌',
    heading: 'What I value',
    prompt:
      'What do you value most in the people you work with? Examples: transparency, kind candor, pragmatism, curiosity — use your own words.',
  },
  {
    id: 'pet-peeves',
    emoji: '💢',
    heading: "What I don't have patience for",
    prompt:
      "What drains you or frustrates you at work? Name one or two specific things you'd rather avoid.",
  },
  {
    id: 'communication',
    emoji: '📲',
    heading: 'How to best communicate with me',
    prompt:
      'How do you prefer to communicate? Slack vs. meetings, async vs. real-time, quick pings vs. organized threads — whatever is true for you.',
  },
  {
    id: 'help-me',
    emoji: '🙌',
    heading: 'How to help me',
    prompt:
      "What's the best way someone can help you when you're stuck or ramping? Think about what a great teammate would do for you.",
  },
  {
    id: 'feedback',
    emoji: '🗣️',
    heading: 'How do I receive feedback',
    prompt:
      'How do you like to receive feedback — in the moment, in 1:1s, in writing? Any prep that helps you land it well?',
  },
  {
    id: 'decisions',
    emoji: '🙌',
    heading: 'How I make decisions',
    prompt:
      'How do you approach decisions? Data-first, gut, collaborate-then-decide, decide-then-validate — share your default.',
  },
];

const SECTION_BY_ID: Record<UserGuideSectionId, UserGuideSection> =
  Object.fromEntries(
    USER_GUIDE_SECTIONS.map((section) => [section.id, section])
  ) as Record<UserGuideSectionId, UserGuideSection>;

export function getUserGuideSection(id: UserGuideSectionId): UserGuideSection {
  return SECTION_BY_ID[id];
}

export function isUserGuideSectionId(
  value: string
): value is UserGuideSectionId {
  return USER_GUIDE_SECTION_IDS.some((id) => id === value);
}

/**
 * Renders the user guide markdown in the same shape as the Webflow Google
 * Doc template. Sections with no answer are omitted so a partial preview
 * still looks coherent.
 */
export function buildUserGuideMarkdown(
  firstName: string,
  answers: Partial<Record<UserGuideSectionId, string>>
): string {
  const name = firstName.trim() || 'Teammate';
  const lines: string[] = [`# ✨ ${name}'s User Guide ✨`];

  for (const section of USER_GUIDE_SECTIONS) {
    const answer = answers[section.id]?.trim();
    if (!answer) {
      continue;
    }
    lines.push('', `## ${section.emoji} ${section.heading}`, '', answer);
  }

  return lines.join('\n');
}
