import {describe, expect, it} from 'vitest';
import {
  USER_GUIDE_SECTIONS,
  buildUserGuideMarkdown,
  isUserGuideSectionId,
} from '../../src/onboarding/userGuide.js';

describe('buildUserGuideMarkdown', () => {
  it('omits sections that have no answer so a partial preview stays coherent', () => {
    const markdown = buildUserGuideMarkdown('Ada', {
      schedule: '9-5 Pacific, most responsive on Slack.',
      values: 'Transparency and kind candor.',
    });

    expect(markdown).toContain(`# ✨ Ada's User Guide ✨`);
    expect(markdown).toContain('📝 My schedule / When and how to reach me');
    expect(markdown).toContain('9-5 Pacific, most responsive on Slack.');
    expect(markdown).toContain('💌 What I value');
    expect(markdown).toContain('Transparency and kind candor.');
    // Unanswered sections are gone entirely (heading and emoji both absent).
    expect(markdown).not.toContain('📲');
    expect(markdown).not.toContain('🗣️');
  });

  it('trims answers before rendering and treats whitespace-only as missing', () => {
    const markdown = buildUserGuideMarkdown('Lin', {
      schedule: '   afternoons   ',
      style: '   ',
    });

    expect(markdown).toContain('afternoons');
    expect(markdown).not.toMatch(/schedule[\s\S]+afternoons\s{3,}/);
    // style has only whitespace → treated as missing
    expect(markdown).not.toContain('⭐️');
  });

  it('renders every section in the declared order when fully answered', () => {
    const answers = Object.fromEntries(
      USER_GUIDE_SECTIONS.map((section, i) => [section.id, `answer ${i}`])
    );
    const markdown = buildUserGuideMarkdown('Grace', answers);

    const headingPositions = USER_GUIDE_SECTIONS.map((section) =>
      markdown.indexOf(section.heading)
    );

    for (const pos of headingPositions) {
      expect(pos).toBeGreaterThan(-1);
    }
    const sorted = [...headingPositions].sort((a, b) => a - b);
    expect(headingPositions).toEqual(sorted);
  });

  it('falls back to "Teammate" when firstName is blank', () => {
    const markdown = buildUserGuideMarkdown('   ', {
      schedule: '9-5',
    });
    expect(markdown).toContain("# ✨ Teammate's User Guide ✨");
  });
});

describe('isUserGuideSectionId', () => {
  it('narrows the type for known ids and rejects unknown strings', () => {
    expect(isUserGuideSectionId('schedule')).toBe(true);
    expect(isUserGuideSectionId('feedback')).toBe(true);
    expect(isUserGuideSectionId('unknown')).toBe(false);
    expect(isUserGuideSectionId('')).toBe(false);
  });
});
