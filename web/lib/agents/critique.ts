import type {DraftFieldPatch, OnboardingPackage} from '../types';

export type FindingSeverity = 'critical' | 'warn' | 'info';

export interface Finding {
  id: string;
  severity: FindingSeverity;
  field: string;
  issue: string;
  proposedFix?: DraftFieldPatch;
}

export interface CritiqueOptions {
  /**
   * HEAD fetcher for URL checks. Injectable for tests so we don't hit
   * the network. Defaults to global fetch.
   */
  fetchHead?: (url: string) => Promise<{ok: boolean}>;
  signal?: AbortSignal;
}

const WELCOME_MIN = 140;
const WELCOME_MAX = 600;
const HEAD_TIMEOUT_MS = 3000;

/**
 * Deterministic Critique agent. Seven rules, no LLM call — we can run
 * fast on every edit without burning tokens.
 */
export async function runCritique(
  pkg: OnboardingPackage,
  options: CritiqueOptions = {}
): Promise<{findings: Finding[]}> {
  const findings: Finding[] = [];

  const note = pkg.welcomeNote?.trim() ?? '';
  if (note.length > 0 && note.length < WELCOME_MIN) {
    findings.push({
      id: 'welcome-short',
      severity: 'warn',
      field: 'welcomeNote',
      issue: `Welcome note is ${note.length} characters; aim for at least ${WELCOME_MIN}.`,
    });
  } else if (note.length > WELCOME_MAX) {
    findings.push({
      id: 'welcome-long',
      severity: 'warn',
      field: 'welcomeNote',
      issue: `Welcome note is ${note.length} characters; aim for at most ${WELCOME_MAX}.`,
    });
  }

  if (!pkg.buddyUserId) {
    findings.push({
      id: 'no-buddy',
      severity: 'critical',
      field: 'buddyUserId',
      issue:
        'No onboarding buddy assigned. The guide requires this before publish.',
    });
  } else {
    const roster = pkg.sections.peopleToMeet.people.map((p) => p.slackUserId);
    if (!roster.includes(pkg.buddyUserId)) {
      findings.push({
        id: 'buddy-missing-from-people',
        severity: 'warn',
        field: 'buddyUserId',
        issue:
          'Assigned buddy is not in the People to Meet list. Confirm they are on the team.',
      });
    }
  }

  const peopleCount = pkg.sections.peopleToMeet.people.length;
  if (peopleCount < 3) {
    findings.push({
      id: 'few-people',
      severity: 'warn',
      field: 'peopleToMeet',
      issue: `Only ${peopleCount} people to meet. Aim for at least 3 (manager, buddy, teammate).`,
    });
  }

  const customItems = pkg.customChecklistItems ?? [];
  const hasWeek3Contribution = customItems.some(
    (item) =>
      item.kind === 'task' &&
      (item.sectionId === 'week-3' ||
        /week 3|first contribution|first pr/i.test(item.label))
  );
  if (!hasWeek3Contribution) {
    findings.push({
      id: 'no-week3-contribution',
      severity: 'warn',
      field: 'customChecklistItems',
      issue:
        'No week-3 contribution task. Add one so the new hire has a clear first PR target.',
    });
  }

  const tasks = pkg.sections.initialEngineeringTasks.tasks;
  if (tasks.length > 1) {
    const difficulties = new Set(tasks.map((task) => task.difficulty));
    if (difficulties.size === 1) {
      findings.push({
        id: 'uniform-task-difficulty',
        severity: 'info',
        field: 'initialEngineeringTasks',
        issue: `All ${tasks.length} contribution tasks have the same difficulty. Consider mixing.`,
      });
    }
  }

  // Rule 7: HEAD check on resourceUrls (fail-open)
  const urls = collectResourceUrls(pkg);
  if (urls.length > 0) {
    const headCheck = options.fetchHead ?? defaultHeadCheck;
    const results = await Promise.all(
      urls.map(async ({url, label}) => {
        try {
          const res = await headCheck(url);
          return {url, label, ok: res.ok};
        } catch {
          // Fail-open on network / CORS / DNS — do not false-positive.
          return {url, label, ok: true};
        }
      })
    );
    for (const {url, ok, label} of results) {
      if (!ok) {
        findings.push({
          id: `dead-link-${hash(url)}`,
          severity: 'warn',
          field: 'customChecklistItems',
          issue: `Link returned non-OK: ${label ?? url}`,
        });
      }
    }
  }

  return {findings};
}

function collectResourceUrls(
  pkg: OnboardingPackage
): Array<{url: string; label?: string}> {
  const urls: Array<{url: string; label?: string}> = [];
  for (const item of pkg.customChecklistItems ?? []) {
    if (item.resourceUrl?.startsWith('https://')) {
      urls.push({
        url: item.resourceUrl,
        label: item.resourceLabel ?? item.label,
      });
    }
  }
  for (const section of pkg.sections.onboardingChecklist.sections) {
    for (const item of section.items) {
      if (item.resourceUrl?.startsWith('https://')) {
        urls.push({
          url: item.resourceUrl,
          label: item.resourceLabel ?? item.label,
        });
      }
    }
  }
  return urls;
}

async function defaultHeadCheck(url: string): Promise<{ok: boolean}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    return {ok: res.ok};
  } finally {
    clearTimeout(timer);
  }
}

function hash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
