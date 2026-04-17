import {describe, expect, it} from 'vitest';
import {runCritique} from '../../lib/agents/critique';
import {fixturePackage} from '../fixtures/package';

const OK_WELCOME =
  'Welcome to the team! We are excited for you to jump in on the Commerce Sprint. Your first two weeks will focus on meeting the team and learning the checkout flow.';

describe('runCritique', () => {
  it('returns no findings for a well-formed draft with a week-3 task', async () => {
    const pkg = fixturePackage({
      welcomeNote: OK_WELCOME,
      customChecklistItems: [
        {
          label: 'First contribution PR',
          kind: 'task',
          notes: 'Pair with buddy on week 3',
          sectionId: 'week-3',
        },
      ],
    });
    // need 3+ people to meet for a clean pass
    pkg.sections.peopleToMeet.people.push({
      name: 'Riley Chen',
      role: 'Product Manager',
      discussionPoints: 'Roadmap.',
      weekBucket: 'week2-3',
      slackUserId: 'U_FIXTURE_PM',
      kind: 'pm',
    });
    // add buddy to the people list
    pkg.sections.peopleToMeet.people[1].slackUserId = pkg.buddyUserId;

    const {findings} = await runCritique(pkg);
    // difficulty variance not fixable from fixture, check only critical/warn
    const blocking = findings.filter((f) => f.severity !== 'info');
    expect(blocking).toEqual([]);
  });

  it('flags an empty welcome note', async () => {
    const pkg = fixturePackage({welcomeNote: ''});
    const {findings} = await runCritique(pkg);
    expect(findings.find((f) => f.id === 'welcome-empty')).toBeDefined();
  });

  it('does not flag a short or long welcome note (no char caps)', async () => {
    const shortPkg = fixturePackage({welcomeNote: 'Hi!'});
    const longPkg = fixturePackage({welcomeNote: 'x'.repeat(2000)});
    const shortRun = await runCritique(shortPkg);
    const longRun = await runCritique(longPkg);
    expect(
      shortRun.findings.find((f) => f.field === 'welcomeNote')
    ).toBeUndefined();
    expect(
      longRun.findings.find((f) => f.field === 'welcomeNote')
    ).toBeUndefined();
  });

  it('flags missing buddy as critical', async () => {
    const pkg = fixturePackage({
      welcomeNote: OK_WELCOME,
      buddyUserId: undefined,
    });
    const {findings} = await runCritique(pkg);
    const critical = findings.find((f) => f.id === 'no-buddy');
    expect(critical?.severity).toBe('critical');
  });

  it('flags buddy missing from people list', async () => {
    const pkg = fixturePackage({
      welcomeNote: OK_WELCOME,
      buddyUserId: 'U_STRANGER',
    });
    const {findings} = await runCritique(pkg);
    expect(
      findings.find((f) => f.id === 'buddy-missing-from-people')
    ).toBeDefined();
  });

  it('flags fewer than 3 people to meet', async () => {
    const pkg = fixturePackage({welcomeNote: OK_WELCOME});
    const {findings} = await runCritique(pkg);
    expect(findings.find((f) => f.id === 'few-people')).toBeDefined();
  });

  it('flags missing week-3 contribution', async () => {
    const pkg = fixturePackage({
      welcomeNote: OK_WELCOME,
      customChecklistItems: [],
    });
    const {findings} = await runCritique(pkg);
    expect(
      findings.find((f) => f.id === 'no-week3-contribution')
    ).toBeDefined();
  });

  it('flags uniform task difficulty as info', async () => {
    const pkg = fixturePackage({welcomeNote: OK_WELCOME});
    // add a second easy task
    pkg.sections.initialEngineeringTasks.tasks.push({
      ...pkg.sections.initialEngineeringTasks.tasks[0],
      id: 'task-2',
      title: 'Another easy task',
    });
    const {findings} = await runCritique(pkg);
    const finding = findings.find((f) => f.id === 'uniform-task-difficulty');
    expect(finding?.severity).toBe('info');
  });

  it('flags dead resource links', async () => {
    const pkg = fixturePackage({
      welcomeNote: OK_WELCOME,
      customChecklistItems: [
        {
          label: 'Read this doc',
          kind: 'reading',
          notes: 'x',
          resourceUrl: 'https://example.com/dead-link',
          resourceLabel: 'Dead doc',
        },
      ],
    });
    const {findings} = await runCritique(pkg, {
      fetchHead: async () => ({ok: false}),
    });
    expect(findings.some((f) => f.issue.includes('Dead doc'))).toBe(true);
  });

  it('does not false-positive on network errors (fail open)', async () => {
    const pkg = fixturePackage({
      welcomeNote: OK_WELCOME,
      customChecklistItems: [
        {
          label: 'Read this doc',
          kind: 'reading',
          notes: 'x',
          resourceUrl: 'https://example.com/doc',
          resourceLabel: 'Safe doc',
        },
      ],
    });
    const {findings} = await runCritique(pkg, {
      fetchHead: async () => {
        throw new Error('cors blocked');
      },
    });
    expect(findings.find((f) => f.issue.includes('Safe doc'))).toBeUndefined();
  });
});
