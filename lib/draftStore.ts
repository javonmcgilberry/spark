/**
 * DraftStore — persistence for onboarding packages.
 *
 * Two implementations share the same interface:
 *   - `makeMemoryDraftStore()` — in-memory Map, used by tests and the
 *     sandbox. Deterministic, sub-second, zero infra.
 *   - `makeD1DraftStore(db)` — Cloudflare D1 wrapper, used in prod.
 *
 * Shape of the D1 row mirrors the in-memory Map: one row per package
 * keyed by userId (the hire's Slack id). The full package JSON lives in
 * `data` so schema drift in `OnboardingPackage` never requires a
 * migration. `manager_id`/`status` are denormalized for index lookups.
 */

import type {
  ChecklistItem,
  DraftFieldPatch,
  OnboardingPackage,
  OnboardingPerson,
} from './types';

export interface DraftStore {
  get(userId: string): Promise<OnboardingPackage | undefined>;
  listDraftsForManager(managerUserId: string): Promise<OnboardingPackage[]>;
  listPackagesManagedBy(managerUserId: string): Promise<OnboardingPackage[]>;
  create(pkg: OnboardingPackage): Promise<OnboardingPackage>;
  update(pkg: OnboardingPackage): Promise<OnboardingPackage>;
  applyFieldPatch(
    userId: string,
    patch: DraftFieldPatch
  ): Promise<OnboardingPackage | undefined>;
  publish(
    userId: string,
    publishedByUserId: string
  ): Promise<
    | {ok: true; pkg: OnboardingPackage}
    | {ok: false; reason: 'not_found' | 'not_manager'}
  >;
}

/** Minimal D1 surface — we only use the exec + prepare/bind/all/first APIs. */
export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  exec(query: string): Promise<unknown>;
}
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{results: T[]}>;
  run(): Promise<unknown>;
}

interface DraftRow {
  user_id: string;
  manager_id: string;
  created_by: string;
  status: string;
  data: string;
  created_at: string;
  updated_at: string;
}

export function makeMemoryDraftStore(): DraftStore {
  const packages = new Map<string, OnboardingPackage>();
  return {
    async get(userId) {
      const pkg = packages.get(userId);
      return pkg ? clone(pkg) : undefined;
    },
    async listDraftsForManager(managerUserId) {
      return Array.from(packages.values())
        .filter(
          (pkg) =>
            pkg.status === 'draft' &&
            (pkg.managerUserId === managerUserId ||
              pkg.createdByUserId === managerUserId ||
              pkg.reviewerUserIds.includes(managerUserId))
        )
        .map(clone);
    },
    async listPackagesManagedBy(managerUserId) {
      return Array.from(packages.values())
        .filter(
          (pkg) =>
            pkg.createdByUserId === managerUserId ||
            pkg.managerUserId === managerUserId
        )
        .map(clone);
    },
    async create(pkg) {
      packages.set(pkg.userId, clone(pkg));
      return clone(pkg);
    },
    async update(pkg) {
      packages.set(pkg.userId, clone(pkg));
      return clone(pkg);
    },
    async applyFieldPatch(userId, patch) {
      const existing = packages.get(userId);
      if (!existing || existing.status !== 'draft') return undefined;
      const next = applyPatchInPlace(clone(existing), patch);
      packages.set(userId, next);
      return clone(next);
    },
    async publish(userId, publishedByUserId) {
      const pkg = packages.get(userId);
      if (!pkg) return {ok: false, reason: 'not_found'};
      const isManager =
        !pkg.managerUserId || pkg.managerUserId === publishedByUserId;
      const isCreator = pkg.createdByUserId === publishedByUserId;
      if (!isManager && !isCreator) return {ok: false, reason: 'not_manager'};
      pkg.status = 'published';
      pkg.publishedAt = new Date().toISOString();
      pkg.publishedByUserId = publishedByUserId;
      pkg.updatedAt = pkg.publishedAt;
      packages.set(userId, pkg);
      return {ok: true, pkg: clone(pkg)};
    },
  };
}

export function makeD1DraftStore(db: D1DatabaseLike): DraftStore {
  const parseRow = (row: DraftRow | null): OnboardingPackage | undefined => {
    if (!row) return undefined;
    try {
      return JSON.parse(row.data) as OnboardingPackage;
    } catch {
      return undefined;
    }
  };

  const writeRow = async (pkg: OnboardingPackage): Promise<void> => {
    const data = JSON.stringify(pkg);
    await db
      .prepare(
        `INSERT INTO drafts (user_id, manager_id, created_by, status, data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           manager_id = excluded.manager_id,
           created_by = excluded.created_by,
           status = excluded.status,
           data = excluded.data,
           updated_at = excluded.updated_at`
      )
      .bind(
        pkg.userId,
        pkg.managerUserId ?? pkg.createdByUserId,
        pkg.createdByUserId,
        pkg.status,
        data,
        pkg.createdAt,
        pkg.updatedAt
      )
      .run();
  };

  return {
    async get(userId) {
      const row = await db
        .prepare('SELECT * FROM drafts WHERE user_id = ?')
        .bind(userId)
        .first<DraftRow>();
      return parseRow(row);
    },
    async listDraftsForManager(managerUserId) {
      const {results} = await db
        .prepare(
          `SELECT * FROM drafts WHERE status = 'draft' AND manager_id = ?
           ORDER BY updated_at DESC`
        )
        .bind(managerUserId)
        .all<DraftRow>();
      const out: OnboardingPackage[] = [];
      for (const row of results) {
        const pkg = parseRow(row);
        if (
          pkg &&
          (pkg.managerUserId === managerUserId ||
            pkg.createdByUserId === managerUserId ||
            pkg.reviewerUserIds.includes(managerUserId))
        ) {
          out.push(pkg);
        }
      }
      return out;
    },
    async listPackagesManagedBy(managerUserId) {
      const {results} = await db
        .prepare(
          `SELECT * FROM drafts WHERE manager_id = ? OR created_by = ?
           ORDER BY updated_at DESC`
        )
        .bind(managerUserId, managerUserId)
        .all<DraftRow>();
      return results
        .map(parseRow)
        .filter((pkg): pkg is OnboardingPackage => Boolean(pkg));
    },
    async create(pkg) {
      await writeRow(pkg);
      return pkg;
    },
    async update(pkg) {
      await writeRow(pkg);
      return pkg;
    },
    async applyFieldPatch(userId, patch) {
      const row = await db
        .prepare('SELECT * FROM drafts WHERE user_id = ?')
        .bind(userId)
        .first<DraftRow>();
      const existing = parseRow(row);
      if (!existing || existing.status !== 'draft') return undefined;
      const next = applyPatchInPlace(existing, patch);
      await writeRow(next);
      return next;
    },
    async publish(userId, publishedByUserId) {
      const row = await db
        .prepare('SELECT * FROM drafts WHERE user_id = ?')
        .bind(userId)
        .first<DraftRow>();
      const pkg = parseRow(row);
      if (!pkg) return {ok: false, reason: 'not_found'};
      const isManager =
        !pkg.managerUserId || pkg.managerUserId === publishedByUserId;
      const isCreator = pkg.createdByUserId === publishedByUserId;
      if (!isManager && !isCreator) return {ok: false, reason: 'not_manager'};
      pkg.status = 'published';
      pkg.publishedAt = new Date().toISOString();
      pkg.publishedByUserId = publishedByUserId;
      pkg.updatedAt = pkg.publishedAt;
      await writeRow(pkg);
      return {ok: true, pkg};
    },
  };
}

/**
 * In-place field patch shared by both store implementations. Returns the
 * mutated package for convenience (callers typically re-write it).
 */
export function applyPatchInPlace(
  existing: OnboardingPackage,
  patch: DraftFieldPatch
): OnboardingPackage {
  if (patch.welcomeNote !== undefined) {
    const next = patch.welcomeNote ?? undefined;
    existing.welcomeNote = next;
    existing.sections.welcome.personalizedNote = next;
  }
  if (patch.welcomeIntro !== undefined) {
    const next = patch.welcomeIntro ?? undefined;
    existing.welcomeIntro = next;
    existing.sections.welcome.intro = next ?? existing.sections.welcome.intro;
  }
  if (patch.customChecklistItems) {
    existing.customChecklistItems = patch.customChecklistItems.map(cloneItem);
  }
  if (patch.peopleToMeet) {
    existing.sections.peopleToMeet.people = mergePeopleRows(
      existing.sections.peopleToMeet.people,
      patch.peopleToMeet
    );
    const assignedBuddy = existing.sections.peopleToMeet.people.find(
      (person) => person.kind === 'buddy' && person.slackUserId
    )?.slackUserId;
    existing.buddyUserId = assignedBuddy ?? undefined;
    if (assignedBuddy) {
      existing.reviewerUserIds = Array.from(
        new Set(
          [
            ...existing.reviewerUserIds,
            existing.createdByUserId,
            existing.managerUserId,
            assignedBuddy,
          ].filter((value): value is string => Boolean(value))
        )
      );
    }
  }
  if (patch.checklistRows) {
    existing.checklistRows = {
      ...(existing.checklistRows ?? {}),
      ...Object.fromEntries(
        Object.entries(patch.checklistRows).map(([key, items]) => [
          key,
          items.map(cloneItem),
        ])
      ),
    };
    // Mirror overrides into the rendered section items so canvas publish
    // and Block Kit render see manager edits. checklistRows is the
    // source of truth once touched.
    for (const section of existing.sections.onboardingChecklist.sections) {
      const override = existing.checklistRows[section.id];
      if (override) {
        section.items = override.map(cloneItem);
      }
    }
  }
  existing.updatedAt = new Date().toISOString();
  return existing;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneItem(item: ChecklistItem): ChecklistItem {
  return {...item};
}

function clonePerson(person: OnboardingPerson): OnboardingPerson {
  return {...person};
}

/**
 * Merge patched people into the existing roster, keyed by canonical
 * identity (slackUserId → email → name, lowercased). Preserves
 * server-owned fields on each existing row (`userGuide`, `avatarUrl`,
 * `insightsAttempts`, etc.) while letting the patch supply editable
 * fields. New rows from the patch are appended. Removed rows (in
 * existing but absent from the patch) are dropped — this matches the
 * editor's "send the whole list" shape while still preserving metadata
 * on rows that survive.
 *
 * De-dupes on insert: if two patch rows collide on canonical identity
 * (e.g. the manager promoted an existing teammate into the buddy slot)
 * the last one wins and the earlier entry is dropped.
 */
function mergePeopleRows(
  existing: OnboardingPerson[],
  patchRows: OnboardingPerson[]
): OnboardingPerson[] {
  const existingByKey = new Map<string, OnboardingPerson>();
  for (const row of existing) {
    existingByKey.set(canonicalKey(row), row);
  }
  const merged: OnboardingPerson[] = [];
  const seen = new Set<string>();
  for (const row of patchRows) {
    const key = canonicalKey(row);
    if (seen.has(key)) {
      // Later patch entry takes precedence over earlier ones.
      const index = merged.findIndex(
        (candidate) => canonicalKey(candidate) === key
      );
      if (index >= 0) {
        const prior = existingByKey.get(key);
        merged[index] = mergePerson(prior, row);
      }
      continue;
    }
    seen.add(key);
    const prior = existingByKey.get(key);
    merged.push(mergePerson(prior, row));
  }
  return merged;
}

function canonicalKey(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name)
    .trim()
    .toLowerCase();
}

/**
 * Merge rule: patch fields win over existing fields for anything the
 * manager can edit in the UI (name, role, discussionPoints, weekBucket,
 * kind, title, notes, askMeAbout, insightsStatus). Server-owned fields
 * (userGuide, insightsAttempts) are preserved when the patch omits
 * them. Identity fields (slackUserId, email, avatarUrl) are preserved
 * from the existing row when the patch omits them so a "text-only edit"
 * never clears avatar/email.
 */
function mergePerson(
  prior: OnboardingPerson | undefined,
  patch: OnboardingPerson
): OnboardingPerson {
  if (!prior) return {...patch};
  return {
    ...prior,
    ...patch,
    slackUserId: patch.slackUserId ?? prior.slackUserId,
    email: patch.email ?? prior.email,
    avatarUrl: patch.avatarUrl ?? prior.avatarUrl,
    userGuide: patch.userGuide ?? prior.userGuide,
    insightsAttempts: patch.insightsAttempts ?? prior.insightsAttempts,
  };
}
