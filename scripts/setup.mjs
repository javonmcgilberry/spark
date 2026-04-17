#!/usr/bin/env node
/**
 * One-shot setup for local + remote D1. Idempotent — safe to re-run.
 *
 *   1. Verifies `wrangler whoami` (prompts `wrangler login` if not authed).
 *   2. Reads `wrangler.jsonc` for the current d1_databases[DRAFTS_DB] entry.
 *   3. Looks for an existing `spark-drafts` database in the account. If
 *      found, reuses its uuid. If not, creates it.
 *   4. Patches `wrangler.jsonc` with the uuid (replacing the placeholder
 *      or any outdated value).
 *   5. Applies migrations to local D1 (the SQLite file wrangler uses for
 *      `npm run preview`).
 *   6. Offers to apply migrations to remote D1 (the production database
 *      Webflow Cloud talks to).
 *
 * Exits non-zero on any hard failure. Re-running after a partial failure
 * picks up where the previous run left off.
 */

import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';

const DB_NAME = 'spark-drafts';
const CONFIG_PATH = 'wrangler.jsonc';
const PLACEHOLDER = 'REPLACE_WITH_D1_DATABASE_ID';

const log = (msg) => console.log(msg);
const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const ok = (msg) => console.log(`    ✓ ${msg}`);
const fail = (msg) => {
  console.error(`    ✗ ${msg}`);
  process.exit(1);
};

function run(args, {capture = false} = {}) {
  const result = spawnSync('npx', ['--no-install', 'wrangler', ...args], {
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function ensureLoggedIn() {
  const check = run(['whoami', '--json'], {capture: true});
  if (check.status === 0) {
    try {
      const info = JSON.parse(check.stdout);
      const email = info.email ?? info.user?.email ?? 'unknown';
      ok(`wrangler authed as ${email}`);
      return;
    } catch {
      ok('wrangler authed');
      return;
    }
  }
  log('    not logged in to Cloudflare — opening browser…');
  const login = run(['login']);
  if (login.status !== 0) fail('wrangler login failed');
  ok('logged in');
}

function findExistingDatabase(name) {
  const list = run(['d1', 'list', '--json'], {capture: true});
  if (list.status !== 0) {
    fail('could not list D1 databases (are you authed? try `wrangler login`)');
  }
  let rows;
  try {
    rows = JSON.parse(list.stdout);
  } catch {
    fail('could not parse `wrangler d1 list --json` output');
  }
  const match = rows.find((r) => r.name === name);
  return match?.uuid ?? null;
}

function createDatabase(name) {
  const result = run(['d1', 'create', name], {capture: true});
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    fail(`wrangler d1 create ${name} failed`);
  }
  const match = result.stdout.match(/database_id\s*=\s*"([0-9a-f-]{36})"/i);
  if (!match) {
    console.error(result.stdout);
    fail('could not parse database_id from wrangler d1 create output');
  }
  return match[1];
}

function patchConfig(databaseId) {
  if (!existsSync(CONFIG_PATH)) fail(`${CONFIG_PATH} not found`);
  const config = readFileSync(CONFIG_PATH, 'utf8');

  if (config.includes(`"database_id": "${databaseId}"`)) {
    ok(`${CONFIG_PATH} already points at ${databaseId.slice(0, 8)}…`);
    return;
  }

  const updated = config.replace(
    /"database_id":\s*"[^"]*"/,
    `"database_id": "${databaseId}"`
  );
  if (updated === config) {
    fail(`could not find database_id field in ${CONFIG_PATH} — patch manually`);
  }
  writeFileSync(CONFIG_PATH, updated);
  ok(`patched ${CONFIG_PATH} with database_id=${databaseId.slice(0, 8)}…`);
}

function applyMigrations(flag) {
  const result = run(['d1', 'migrations', 'apply', DB_NAME, flag]);
  if (result.status !== 0) {
    fail(`wrangler d1 migrations apply ${flag} failed`);
  }
}

async function confirm(message) {
  const rl = createInterface({input, output});
  const answer = await rl.question(`${message} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  log('Spark setup — provisioning D1 for local and (optionally) remote.\n');

  step(1, 'Cloudflare auth');
  ensureLoggedIn();

  step(2, `D1 database (${DB_NAME})`);
  let databaseId = findExistingDatabase(DB_NAME);
  if (databaseId) {
    ok(`found existing database: ${databaseId.slice(0, 8)}…`);
  } else {
    log('    no existing database found — creating one…');
    databaseId = createDatabase(DB_NAME);
    ok(`created ${DB_NAME}: ${databaseId.slice(0, 8)}…`);
  }

  step(3, `patching ${CONFIG_PATH}`);
  patchConfig(databaseId);

  step(4, 'applying migrations to local D1');
  applyMigrations('--local');
  ok('local D1 ready (for `npm run preview`)');

  step(5, 'remote D1');
  const remote = await confirm(
    '    Apply migrations to remote D1 now? (needed for deployed Webflow Cloud app)'
  );
  if (remote) {
    applyMigrations('--remote');
    ok('remote D1 ready (for spark.wf.app and preview deploys)');
  } else {
    log(
      '    skipped. Run `npm run db:migrate:remote` before your first deploy.'
    );
  }

  log('\n✓ Setup complete.');
  log('  Next: `npm run dev` (in-memory) or `npm run preview` (D1-backed).');
}

main().catch((e) => {
  console.error('\n✗ setup failed:', e.message ?? e);
  process.exit(1);
});
