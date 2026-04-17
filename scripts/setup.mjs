#!/usr/bin/env node
/**
 * Local dev bootstrap: applies migrations to the local D1 SQLite file
 * used by `npm run preview`. Safe to re-run — wrangler's migration runner
 * tracks applied migrations and is a no-op when nothing's new.
 *
 * You don't need this for `npm run dev` (in-memory draft store) or for
 * deployed Webflow Cloud environments (Webflow Cloud provisions D1 and
 * applies the same `migrations/*.sql` files on every deploy).
 */

import {spawnSync} from 'node:child_process';

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
