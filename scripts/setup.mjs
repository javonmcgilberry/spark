#!/usr/bin/env node
/**
 * Local dev bootstrap: applies migrations to the local D1 SQLite file
 * used by `npm run preview`. Safe to re-run — wrangler's migration runner
 * tracks applied migrations and is a no-op when nothing's new.
 * It also keeps `.dev.vars` pointed at the preferred local env file:
 * `.env.dev` when present, otherwise `.env`.
 *
 * You don't need this for `npm run dev` (in-memory draft store) or for
 * deployed Webflow Cloud environments (Webflow Cloud provisions D1 and
 * applies the same `migrations/*.sql` files on every deploy).
 */

import {
  existsSync,
  lstatSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

ensureDevVarsLink();

const result = spawnSync(
  'npx',
  [
    '--no-install',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'spark-drafts',
    '--local',
  ],
  {stdio: 'inherit'}
);

process.exit(result.status ?? 1);

function ensureDevVarsLink() {
  const root = process.cwd();
  const envDev = path.join(root, '.env.dev');
  const env = path.join(root, '.env');
  const devVars = path.join(root, '.dev.vars');
  const preferred = existsSync(envDev) ? '.env.dev' : '.env';
  const preferredPath = preferred === '.env.dev' ? envDev : env;

  if (!existsSync(preferredPath)) return;

  if (existsSync(devVars)) {
    const stat = lstatSync(devVars);
    if (stat.isSymbolicLink()) {
      if (readlinkSync(devVars) === preferred) return;
      unlinkSync(devVars);
    } else {
      return;
    }
  }

  symlinkSync(preferred, devVars);
  console.log(`Linked .dev.vars -> ${preferred}`);
}
