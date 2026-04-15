# Future contribution task types

## Purpose and agent instructions

This file tracks contribution task types that Spark could surface to new hires but does not yet, because they lack a corresponding AgentFlow skill in the Webflow monorepo. Spark only surfaces tasks that an engineer can execute by running a `/flow:` skill command in Claude Code or Cursor. Suggesting tasks without that backing would leave the new hire with instructions but no tool to carry them out.

When a new AgentFlow skill is added to the monorepo, check this file for any task type that could now be backed by it. If one exists, move it to `src/services/taskScannerService.ts`, add a `skillCommand` value pointing to the new skill, and remove the entry from this file.

When a new contribution idea surfaces that does not yet have a skill, add it here with enough context for an engineer or agent to build the scanner and the skill later.

---

## Deferred task types

### CODEOWNERS gap filling

**What it is:** Files in the team's area that have no owner in `.github/CODEOWNERS`.

**Why it's useful for onboarding:** A new hire filling a CODEOWNERS gap learns review routing, ownership conventions, and their team's scope in one small, safe change.

**Detection approach:** Run `bin/co who -j <files>` on the team's key paths. Files with empty `owners` arrays are candidates. Suggest a new rule using `@webflow/<team-slug>`.

**Skill needed:** A `/flow:fix-codeowners-gap` skill that takes a file path and suggested owner, drafts the rule, and opens a PR.

---

### Stale TODO / FIXME cleanup

**What it is:** TODO or FIXME comments in team-owned files that are older than ~6 months based on `git blame`.

**Why it's useful for onboarding:** Low blast radius, teaches the new hire to read code history and ownership, and leaves the area genuinely cleaner.

**Detection approach:** `rg -n 'TODO|FIXME' <team-paths>`, then `git blame --porcelain` each match to get the author timestamp. Surface items older than 180 days.

**Skill needed:** A `/flow:resolve-stale-todo` skill (or extend an existing code quality skill) that opens the file, shows context, and helps the engineer decide whether to resolve, remove, or escalate.

---

### Unused import removal

**What it is:** Files with imports flagged by ESLint `no-unused-vars` / `@typescript-eslint/no-unused-vars`.

**Why it's useful for onboarding:** Gets the new hire running the lint toolchain and opening their first PR from an automated fix. Very low risk.

**Detection approach:** `npx eslint --format json <files>` and filter messages where `ruleId` contains `unused`. Pick files with clear auto-fixable violations.

**Skill needed:** No skill needed conceptually — `eslint --fix` handles it. What's missing is an AgentFlow skill that wraps the fix safely (pre-commit check, diff review, PR template). Until that exists, surfacing this task without guidance would leave the new hire stranded.

---

### Dead export detection

**What it is:** TypeScript symbols exported from a file but never imported elsewhere in the repo.

**Why it's useful for onboarding:** Teaches the new hire how the module graph works and reduces surface area that future engineers have to reason about.

**Detection approach:** `ts-prune` or a custom ripgrep approach: for each `export` in team files, search the rest of the repo for an import of that symbol. Zero results = dead export.

**Skill needed:** A `/flow:remove-dead-export` skill that validates the export is truly unused (not dynamic, not re-exported), removes it, and opens a PR.

---

### Broken Confluence link detection

**What it is:** Confluence URLs embedded in code comments, JSDoc, or inline docs that return 404 or redirect.

**Why it's useful for onboarding:** New hires click these links expecting context and hit dead ends. Fixing one is a quick, high-value contribution that improves the experience for every engineer who reads that code later.

**Detection approach:** `rg 'webflow.atlassian.net/wiki' <team-paths>`, then HEAD-request each unique URL with a timeout. Flag non-200 responses.

**Skill needed:** A `/flow:fix-broken-doc-link` skill that finds a replacement page (via Confluence search) or removes the stale reference.
