/**
 * codeowners — heuristic team → github-slug + keyPaths lookup.
 *
 * This is the simplified port of the Node bot's CodeownersService.
 * On Workers we can't run `git ls-files` or shell out to the `co`
 * binary, so the team→paths helpers work on the raw CODEOWNERS text
 * fetched via ctx.github.fetchCodeowners(). The fetched text is
 * cached on ctx.scratch to avoid refetching across tool calls in one
 * agent turn.
 *
 * If the CODEOWNERS text is unavailable (no GITHUB_TOKEN, 404, etc)
 * all helpers fall back to the static TEAM_PATH_HINTS heuristics —
 * same "dumb but useful" path suggestions the Node bot used as a
 * secondary input.
 */

interface CodeownerEntry {
  pattern: string;
  owners: string[];
}

const TEAM_PATH_HINTS: Array<{ keywords: string[]; paths: string[] }> = [
  {
    keywords: ["design", "designer", "frontend", "spring", "ux"],
    paths: [
      "public/js/designer-flux",
      "packages/systems/spring",
      "packages/systems/permissions",
    ],
  },
  {
    keywords: ["backend", "server", "api", "cms", "billing", "auth"],
    paths: [
      "entrypoints/server",
      "packages/domains/billing",
      "packages/domains/collections",
      "packages/systems/feature-config/server",
    ],
  },
  {
    keywords: ["infra", "platform", "build", "delivery", "cloud"],
    paths: [
      "entrypoints/webflow-hud",
      "packages/tooling",
      "entrypoints/dashboard",
      "packages/systems/feature-config",
    ],
  },
];

export async function suggestPathsForTeam(
  codeownersText: string,
  teamName: string | undefined,
  githubTeamSlug?: string,
): Promise<string[]> {
  const entries = parseCodeowners(codeownersText);
  const candidates = new Set<string>();

  if (githubTeamSlug) {
    for (const entry of entries) {
      if (entry.owners.some((owner) => owner.includes(githubTeamSlug))) {
        candidates.add(patternToDirectory(entry.pattern));
      }
    }
  }

  if (teamName) {
    const keywords = tokenize(teamName);
    for (const entry of entries) {
      const haystack =
        `${entry.pattern} ${entry.owners.join(" ")}`.toLowerCase();
      if (keywords.some((keyword) => haystack.includes(keyword))) {
        candidates.add(patternToDirectory(entry.pattern));
      }
    }
    for (const hint of TEAM_PATH_HINTS) {
      if (hint.keywords.some((keyword) => keywords.includes(keyword))) {
        for (const hintPath of hint.paths) candidates.add(hintPath);
      }
    }
  }

  return [...candidates].filter(Boolean).slice(0, 6);
}

export async function findGitHubTeamSlug(
  codeownersText: string,
  teamName?: string,
): Promise<string | undefined> {
  if (!teamName) return undefined;
  const entries = parseCodeowners(codeownersText);
  const keywords = tokenize(teamName);
  const matches = new Map<string, number>();

  for (const entry of entries) {
    for (const owner of entry.owners) {
      if (!owner.startsWith("@webflow/")) continue;
      const slug = owner.replace("@webflow/", "");
      const haystack = slug.toLowerCase();
      const score = keywords.filter((keyword) =>
        haystack.includes(keyword),
      ).length;
      if (score > 0) {
        matches.set(slug, Math.max(matches.get(slug) ?? 0, score));
      }
    }
  }
  return [...matches.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function parseCodeowners(text: string): CodeownerEntry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      return { pattern, owners };
    });
}

function patternToDirectory(pattern: string): string {
  return pattern
    .replace(/^\//, "")
    .replace(/\/\*\*\/\*$/, "")
    .replace(/\/\*\*$/, "")
    .replace(/\/\*$/, "")
    .replace(/\*.*$/, "")
    .replace(/\/$/, "");
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}
