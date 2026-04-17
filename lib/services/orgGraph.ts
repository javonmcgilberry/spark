/**
 * orgGraph — the DX warehouse as the primary source of truth for
 * "who's on this team, who reports into whom, and which PM/designer/
 * director/people-partner should the new hire meet."
 *
 * Replaces the Slack-custom-field heuristics that lived in
 * identityResolver.ts. Slack stays for avatar/display-name hydration
 * (via listAllUsers) and as a degraded fallback when the DSN is missing
 * or the warehouse is unreachable.
 *
 * Runtime note: Cloudflare Workers does not support the node-postgres
 * `pg` driver (uses Node's `net` TCP APIs directly). We lazy-import
 * `postgres` (postgres.js v3), which speaks TCP via `cloudflare:sockets`
 * when `nodejs_compat` is on — which Spark's wrangler.jsonc already sets.
 * We load it dynamically so the stub and tests never pull the driver
 * into the bundle or try to resolve it on machines without `postgres`
 * installed.
 */

import type {Logger} from '../logger';
import {
  queryCrossFunctional,
  queryManagerChain,
  queryPersonByEmail,
  querySearchByName,
  queryTeammates,
  type SqlTag,
  type WarehouseRow,
} from './orgGraphQueries';

export interface OrgPerson {
  name: string;
  email: string;
  title?: string;
  teamName?: string;
  pillarName?: string;
  managerEmail?: string;
  /** Which data source filled this row; useful for logs and debug UI. */
  source: 'warehouse' | 'slack-fallback';
  /** Role tag for curated roster builders: 'teammate' for peers, etc. */
  role: OrgPersonRole;
}

export type OrgPersonRole =
  | 'teammate'
  | 'pm'
  | 'designer'
  | 'director'
  | 'people-partner'
  | 'manager-chain';

export interface CrossFunctionalResult {
  pm?: OrgPerson;
  designer?: OrgPerson;
  director?: OrgPerson;
  peoplePartner?: OrgPerson;
}

export interface OrgGraphClient {
  isConfigured(): boolean;
  lookupByEmail(email: string): Promise<OrgPerson | null>;
  lookupTeammates(
    teamName: string,
    excludeEmail?: string,
    limit?: number
  ): Promise<OrgPerson[]>;
  lookupCrossFunctional(
    teamName: string,
    pillarName?: string
  ): Promise<CrossFunctionalResult>;
  lookupManagerChain(email: string, depth?: number): Promise<OrgPerson[]>;
  /**
   * Search the directory by name or email substring. Powers the web
   * picker with a single SQL round-trip — massively faster than
   * paginating Slack's users.list.
   */
  searchByName(query: string, limit?: number): Promise<OrgPerson[]>;
}

export interface OrgGraphEnv {
  DX_WAREHOUSE_DSN?: string;
}

const QUERY_TIMEOUT_SECONDS = 1.5;
/**
 * Circuit-breaker window. When the warehouse throws (TCP timeout, DNS
 * failure, anything non-transient from postgres.js), skip the next N ms
 * of warehouse calls and route straight to the Slack fallback. Without
 * this, every picker keystroke and every create-draft pays another
 * full timeout before degrading — catastrophic for local dev and for
 * any prod window when the DX warehouse is unreachable.
 *
 * Module-scoped `globalThis` binding so the breaker survives across
 * request-scoped HandlerCtx instances within the same Worker isolate.
 */
const BREAKER_COOLDOWN_MS = 60_000;
const BREAKER_SYMBOL = Symbol.for('spark.orgGraph.breaker');
interface BreakerState {
  openUntil: number;
}
function getBreaker(): BreakerState {
  const host = globalThis as unknown as Record<symbol, BreakerState>;
  if (!host[BREAKER_SYMBOL]) {
    host[BREAKER_SYMBOL] = {openUntil: 0};
  }
  return host[BREAKER_SYMBOL];
}

/** Test-only: reset the circuit breaker between cases. */
export function resetBreakerForTests(): void {
  const host = globalThis as unknown as Record<symbol, BreakerState>;
  delete host[BREAKER_SYMBOL];
}

/**
 * Title patterns per role. Kept conservative so a misspelled or highly
 * creative title falls through to the empty-set path rather than
 * matching the wrong cohort. Callers get the top candidate; the ORDER
 * BY in the query handles seniority preference.
 */
const CROSS_FUNCTIONAL_PATTERNS: Record<
  Exclude<OrgPersonRole, 'teammate' | 'manager-chain'>,
  string[]
> = {
  pm: ['%product manager%', '%pm%'],
  designer: [
    '%product designer%',
    '%designer%',
    '%ux designer%',
    '%ui designer%',
  ],
  director: [
    '%director, engineering%',
    '%engineering director%',
    '%director of engineering%',
    '%director%',
  ],
  'people-partner': [
    '%people business partner%',
    '%people partner%',
    '%hr business partner%',
    '%hrbp%',
  ],
};

export function makeOrgGraphClient(
  env: OrgGraphEnv,
  logger: Logger
): OrgGraphClient {
  const dsn = env.DX_WAREHOUSE_DSN?.trim();
  const configured = Boolean(dsn);

  const empty: OrgGraphClient = {
    isConfigured: () => false,
    async lookupByEmail() {
      return null;
    },
    async lookupTeammates() {
      return [];
    },
    async lookupCrossFunctional() {
      return {};
    },
    async lookupManagerChain() {
      return [];
    },
    async searchByName() {
      return [];
    },
  };

  if (!configured || !dsn) return empty;

  /**
   * Run `work` against a freshly-opened postgres.js client and end the
   * connection in a finally. We intentionally do not pool across
   * requests: HandlerCtx is request-scoped per Workers invocation and
   * the scratch space is too. Each request pays one socket handshake,
   * which is cheap relative to the LLM calls that come after.
   */
  const withClient = async <T>(
    work: (sql: SqlTag) => Promise<T>
  ): Promise<T> => {
    const postgresModule = await import('postgres').catch((error) => {
      logger.warn(
        'postgres.js is not available in this runtime. Falling back.',
        error
      );
      return null;
    });
    if (!postgresModule) throw new Error('postgres.js unavailable');
    const postgres =
      (postgresModule as {default?: unknown}).default ?? postgresModule;
    type PostgresFactory = (
      connectionString: string,
      options: Record<string, unknown>
    ) => SqlTag & {end: (opts?: {timeout?: number}) => Promise<void>};
    const factory = postgres as unknown as PostgresFactory;
    const sql = factory(dsn, {
      ssl: 'require',
      max: 1,
      idle_timeout: 1,
      connect_timeout: QUERY_TIMEOUT_SECONDS,
      // postgres.js accepts `statement_timeout` as a query-shape option
      // via the connection URL; we repeat it here for drivers that use
      // the options map. Milliseconds.
      connection: {
        statement_timeout: QUERY_TIMEOUT_SECONDS * 1000,
      },
    });
    try {
      return await work(sql);
    } finally {
      await sql.end({timeout: 1}).catch(() => {});
    }
  };

  const runSafely = async <T>(
    label: string,
    work: (sql: SqlTag) => Promise<T>,
    fallback: T
  ): Promise<T> => {
    const breaker = getBreaker();
    const now = Date.now();
    if (breaker.openUntil > now) {
      // Breaker is open — skip the warehouse entirely, let the caller
      // fall back. Keeps picker latency at ~Slack-only instead of
      // ~Slack-plus-warehouse-timeout on every request.
      return fallback;
    }
    try {
      return await withClient(work);
    } catch (error) {
      breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      logger.warn(
        `DX warehouse ${label} failed; breaker open for ${BREAKER_COOLDOWN_MS / 1000}s.`,
        error
      );
      return fallback;
    }
  };

  return {
    isConfigured: () => true,
    async lookupByEmail(email) {
      if (!email.trim()) return null;
      return runSafely(
        `lookupByEmail(${email})`,
        async (sql) => {
          const row = await queryPersonByEmail(sql, email);
          return row ? toOrgPerson(row, 'teammate') : null;
        },
        null
      );
    },
    async lookupTeammates(teamName, excludeEmail, limit) {
      if (!teamName.trim()) return [];
      return runSafely(
        `lookupTeammates(${teamName})`,
        async (sql) => {
          const rows = await queryTeammates(sql, {
            teamName,
            excludeEmail,
            limit,
          });
          return rows
            .map((row) => toOrgPerson(row, 'teammate'))
            .filter((person): person is OrgPerson => Boolean(person));
        },
        []
      );
    },
    async lookupCrossFunctional(teamName, pillarName) {
      return runSafely(
        `lookupCrossFunctional(${teamName})`,
        async (sql) => {
          const result: CrossFunctionalResult = {};
          const roles: Array<
            Exclude<OrgPersonRole, 'teammate' | 'manager-chain'>
          > = ['pm', 'designer', 'director', 'people-partner'];
          for (const role of roles) {
            const rows = await queryCrossFunctional(sql, {
              pillarName,
              teamName,
              titlePatterns: CROSS_FUNCTIONAL_PATTERNS[role],
              limit: 5,
            });
            const hit = rows.find((row) => Boolean(row.email));
            const person = hit ? toOrgPerson(hit, role) : undefined;
            if (person) {
              if (role === 'pm') result.pm = person;
              else if (role === 'designer') result.designer = person;
              else if (role === 'director') result.director = person;
              else result.peoplePartner = person;
            }
          }
          return result;
        },
        {}
      );
    },
    async lookupManagerChain(email, depth = 4) {
      if (!email.trim()) return [];
      return runSafely(
        `lookupManagerChain(${email})`,
        async (sql) => {
          const rows = await queryManagerChain(sql, email, depth);
          return rows
            .map((row) => toOrgPerson(row, 'manager-chain'))
            .filter((person): person is OrgPerson => Boolean(person));
        },
        []
      );
    },
    async searchByName(query, limit = 10) {
      if (!query.trim()) return [];
      return runSafely(
        `searchByName(${query})`,
        async (sql) => {
          const rows = await querySearchByName(sql, query, limit);
          return rows
            .map((row) => toOrgPerson(row, 'teammate'))
            .filter((person): person is OrgPerson => Boolean(person));
        },
        []
      );
    },
  };
}

function toOrgPerson(row: WarehouseRow, role: OrgPersonRole): OrgPerson | null {
  if (!row.email || !row.name) return null;
  return {
    name: row.name,
    email: row.email,
    title: row.title ?? undefined,
    teamName: row.team_name ?? undefined,
    pillarName: row.pillar_name ?? undefined,
    managerEmail: row.manager_email ?? undefined,
    source: 'warehouse',
    role,
  };
}

export interface OrgGraphStubOverrides {
  configured?: boolean;
  byEmail?: Record<string, OrgPerson>;
  teammates?: Record<string, OrgPerson[]>;
  crossFunctional?: Record<string, CrossFunctionalResult>;
  managerChain?: Record<string, OrgPerson[]>;
  /**
   * Pool of people for searchByName stubbing. When set, searchByName
   * filters this list by substring against name and email.
   */
  searchPool?: OrgPerson[];
}

/**
 * Deterministic stub for unit tests. Keys into `byEmail`, `teammates`,
 * `crossFunctional`, and `managerChain` are normalized lower-case to
 * match the real client's case-insensitive semantics.
 */
export function makeStubOrgGraph(
  overrides: OrgGraphStubOverrides = {}
): OrgGraphClient {
  const configured = overrides.configured ?? true;
  const normalize = (value: string) => value.trim().toLowerCase();
  const byEmail = Object.fromEntries(
    Object.entries(overrides.byEmail ?? {}).map(([key, value]) => [
      normalize(key),
      value,
    ])
  );
  const teammates = Object.fromEntries(
    Object.entries(overrides.teammates ?? {}).map(([key, value]) => [
      normalize(key),
      value,
    ])
  );
  const crossFunctional = Object.fromEntries(
    Object.entries(overrides.crossFunctional ?? {}).map(([key, value]) => [
      normalize(key),
      value,
    ])
  );
  const managerChain = Object.fromEntries(
    Object.entries(overrides.managerChain ?? {}).map(([key, value]) => [
      normalize(key),
      value,
    ])
  );

  return {
    isConfigured: () => configured,
    async lookupByEmail(email) {
      return byEmail[normalize(email)] ?? null;
    },
    async lookupTeammates(teamName, excludeEmail, limit) {
      const rows = teammates[normalize(teamName)] ?? [];
      const excluded = excludeEmail ? normalize(excludeEmail) : null;
      const filtered = excluded
        ? rows.filter((row) => normalize(row.email) !== excluded)
        : rows;
      return limit ? filtered.slice(0, limit) : filtered;
    },
    async lookupCrossFunctional(teamName) {
      return crossFunctional[normalize(teamName)] ?? {};
    },
    async lookupManagerChain(email, depth = 4) {
      const chain = managerChain[normalize(email)] ?? [];
      return chain.slice(0, depth);
    },
    async searchByName(query, limit = 10) {
      const needle = normalize(query);
      if (!needle) return [];
      const pool = overrides.searchPool ?? [];
      return pool
        .filter(
          (person) =>
            normalize(person.name).includes(needle) ||
            normalize(person.email).includes(needle)
        )
        .slice(0, limit);
    },
  };
}
