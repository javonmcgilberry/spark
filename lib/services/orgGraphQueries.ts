/**
 * SQL templates + row shape for the DX warehouse org-graph queries.
 *
 * Kept separate from orgGraph.ts so the query strings are easy to read
 * and easy to unit-test without pulling in postgres.js. `sql` is the
 * tagged-template builder from postgres.js passed in at call time — this
 * file never imports the driver directly.
 *
 * The column names mirror the legacy IdentityResolver query pattern (see
 * the deleted spark/src/services/identityResolver.ts prior to cd04fc6):
 * dx_users + dx_versioned_team_members + dx_versioned_teams +
 * dx_versioned_team_dates, with MAX(date) per user to pin to the most
 * recent team assignment.
 */

export interface WarehouseRow {
  name: string | null;
  email: string | null;
  title: string | null;
  team_name: string | null;
  pillar_name: string | null;
  manager_email: string | null;
}

/**
 * Tagged-template builder that postgres.js exposes as the default export
 * of the `sql` instance. Accepting this as a parameter keeps the query
 * helpers driver-agnostic and trivially mockable.
 */
export interface SqlTag {
  <T = WarehouseRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  /** postgres.js unsafe escape helper, only used for LIKE pattern builders. */
  unsafe?: (value: string) => string;
}

export interface TeammateQueryOptions {
  teamName: string;
  excludeEmail?: string;
  limit?: number;
}

/**
 * Return up to N peers on the same team, ordered by name. Excludes the
 * hire themselves (by email when provided) so the caller gets "everyone
 * but me."
 */
export async function queryTeammates(
  sql: SqlTag,
  options: TeammateQueryOptions
): Promise<WarehouseRow[]> {
  const limit = options.limit ?? 15;
  const exclude = options.excludeEmail?.trim().toLowerCase() ?? null;
  return sql`
    SELECT
      u.name AS name,
      u.email AS email,
      u.title AS title,
      vt.name AS team_name,
      vp.name AS pillar_name,
      mu.email AS manager_email
    FROM public.dx_users u
    JOIN (
      SELECT vtm.user_id, MAX(vd.date) AS latest_date
      FROM public.dx_versioned_team_members vtm
      JOIN public.dx_versioned_teams vt ON vtm.versioned_team_id = vt.id
      JOIN public.dx_versioned_team_dates vd
        ON vt.versioned_team_date_id = vd.id
      GROUP BY vtm.user_id
    ) lpu ON lpu.user_id = u.id
    JOIN public.dx_versioned_team_members vtm ON vtm.user_id = u.id
    JOIN public.dx_versioned_teams vt ON vtm.versioned_team_id = vt.id
    JOIN public.dx_versioned_team_dates vd
      ON vt.versioned_team_date_id = vd.id AND vd.date = lpu.latest_date
    LEFT JOIN public.dx_versioned_pillars vp ON vt.versioned_pillar_id = vp.id
    LEFT JOIN public.dx_users mu ON u.manager_id = mu.id
    WHERE u.deleted_at IS NULL
      AND vt.name ILIKE ${options.teamName}
      AND (${exclude}::text IS NULL OR LOWER(u.email) <> ${exclude})
    ORDER BY u.name
    LIMIT ${limit}
  `;
}

/**
 * Resolve a single person by email. Used to bootstrap the hire's own
 * metadata (team, pillar, manager email) when Slack custom fields are
 * missing or ambiguous.
 */
export async function queryPersonByEmail(
  sql: SqlTag,
  email: string
): Promise<WarehouseRow | null> {
  const rows = await sql`
    SELECT
      u.name AS name,
      u.email AS email,
      u.title AS title,
      vt.name AS team_name,
      vp.name AS pillar_name,
      mu.email AS manager_email
    FROM public.dx_users u
    LEFT JOIN (
      SELECT vtm.user_id, MAX(vd.date) AS latest_date
      FROM public.dx_versioned_team_members vtm
      JOIN public.dx_versioned_teams vt ON vtm.versioned_team_id = vt.id
      JOIN public.dx_versioned_team_dates vd
        ON vt.versioned_team_date_id = vd.id
      GROUP BY vtm.user_id
    ) lpu ON lpu.user_id = u.id
    LEFT JOIN public.dx_versioned_team_members vtm ON vtm.user_id = u.id
    LEFT JOIN public.dx_versioned_teams vt
      ON vtm.versioned_team_id = vt.id
     AND vt.versioned_team_date_id IN (
       SELECT id FROM public.dx_versioned_team_dates
       WHERE date = lpu.latest_date
     )
    LEFT JOIN public.dx_versioned_pillars vp ON vt.versioned_pillar_id = vp.id
    LEFT JOIN public.dx_users mu ON u.manager_id = mu.id
    WHERE u.deleted_at IS NULL
      AND LOWER(u.email) = ${email.trim().toLowerCase()}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export interface CrossFunctionalQueryOptions {
  pillarName?: string;
  teamName?: string;
  titlePatterns: string[];
  limit?: number;
}

/**
 * Find candidates whose title matches one of the supplied ILIKE
 * patterns, scoped to a pillar (preferred) or team when pillar is
 * unavailable. Results are ordered by title seniority heuristics (the
 * `Senior` / `Staff` / `Lead` / `Principal` / `Director` forms bubble
 * up) then by name. Callers pick the first row that fits.
 */
export async function queryCrossFunctional(
  sql: SqlTag,
  options: CrossFunctionalQueryOptions
): Promise<WarehouseRow[]> {
  const limit = options.limit ?? 5;
  const pillar = options.pillarName?.trim() ?? null;
  const team = options.teamName?.trim() ?? null;
  const patterns = options.titlePatterns.filter(
    (pattern) => pattern.trim().length > 0
  );
  if (patterns.length === 0) return [];
  return sql`
    SELECT
      u.name AS name,
      u.email AS email,
      u.title AS title,
      vt.name AS team_name,
      vp.name AS pillar_name,
      mu.email AS manager_email
    FROM public.dx_users u
    LEFT JOIN (
      SELECT vtm.user_id, MAX(vd.date) AS latest_date
      FROM public.dx_versioned_team_members vtm
      JOIN public.dx_versioned_teams vt ON vtm.versioned_team_id = vt.id
      JOIN public.dx_versioned_team_dates vd
        ON vt.versioned_team_date_id = vd.id
      GROUP BY vtm.user_id
    ) lpu ON lpu.user_id = u.id
    LEFT JOIN public.dx_versioned_team_members vtm ON vtm.user_id = u.id
    LEFT JOIN public.dx_versioned_teams vt
      ON vtm.versioned_team_id = vt.id
     AND vt.versioned_team_date_id IN (
       SELECT id FROM public.dx_versioned_team_dates
       WHERE date = lpu.latest_date
     )
    LEFT JOIN public.dx_versioned_pillars vp ON vt.versioned_pillar_id = vp.id
    LEFT JOIN public.dx_users mu ON u.manager_id = mu.id
    WHERE u.deleted_at IS NULL
      AND u.title IS NOT NULL
      AND (
        SELECT bool_or(u.title ILIKE p)
        FROM unnest(${patterns}::text[]) AS p
      )
      AND (
        (${pillar}::text IS NOT NULL AND vp.name ILIKE ${pillar})
        OR (${pillar}::text IS NULL AND ${team}::text IS NOT NULL AND vt.name ILIKE ${team})
        OR (${pillar}::text IS NULL AND ${team}::text IS NULL)
      )
    ORDER BY
      CASE
        WHEN u.title ILIKE '%director%' THEN 0
        WHEN u.title ILIKE '%principal%' THEN 1
        WHEN u.title ILIKE '%staff%' THEN 2
        WHEN u.title ILIKE '%lead%' THEN 3
        WHEN u.title ILIKE '%senior%' THEN 4
        ELSE 5
      END,
      u.name
    LIMIT ${limit}
  `;
}

/**
 * Name / email prefix search. Drives the web picker on a single round
 * trip — warehouse can answer "find anyone in the org whose name or
 * email starts with these characters" in milliseconds, whereas Slack's
 * users.list forces a full-workspace paginated crawl at 20 req/min.
 *
 * Matches are ranked so prefix hits beat contains hits, and short
 * names win ties (so a two-char query doesn't drown you in long-name
 * matches).
 */
export async function querySearchByName(
  sql: SqlTag,
  query: string,
  limit: number
): Promise<WarehouseRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const prefix = `${trimmed.toLowerCase()}%`;
  const contains = `%${trimmed.toLowerCase()}%`;
  return sql`
    SELECT
      u.name AS name,
      u.email AS email,
      u.title AS title,
      NULL::text AS team_name,
      NULL::text AS pillar_name,
      NULL::text AS manager_email
    FROM public.dx_users u
    WHERE u.deleted_at IS NULL
      AND (
        LOWER(u.name) LIKE ${contains}
        OR LOWER(u.email) LIKE ${contains}
      )
    ORDER BY
      CASE
        WHEN LOWER(u.name) LIKE ${prefix} THEN 0
        WHEN LOWER(u.email) LIKE ${prefix} THEN 1
        ELSE 2
      END,
      LENGTH(u.name),
      u.name
    LIMIT ${limit}
  `;
}

/**
 * Walk the manager edge upward from a starting email until we hit a row
 * with no manager_email or we exhaust `depth`. Used to find the first
 * director-level person above the hire for the people-to-meet roster.
 */
export async function queryManagerChain(
  sql: SqlTag,
  startEmail: string,
  depth: number
): Promise<WarehouseRow[]> {
  const rows = await sql`
    WITH RECURSIVE chain AS (
      SELECT
        u.id,
        u.name,
        u.email,
        u.title,
        u.manager_id,
        1 AS depth
      FROM public.dx_users u
      WHERE u.deleted_at IS NULL
        AND LOWER(u.email) = ${startEmail.trim().toLowerCase()}
      UNION ALL
      SELECT
        m.id,
        m.name,
        m.email,
        m.title,
        m.manager_id,
        c.depth + 1
      FROM chain c
      JOIN public.dx_users m ON m.id = c.manager_id
      WHERE m.deleted_at IS NULL
        AND c.depth < ${depth}
    )
    SELECT
      c.name AS name,
      c.email AS email,
      c.title AS title,
      NULL::text AS team_name,
      NULL::text AS pillar_name,
      NULL::text AS manager_email
    FROM chain c
    WHERE c.depth > 1
    ORDER BY c.depth
  `;
  return rows;
}
