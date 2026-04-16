import { describe, expect, it } from "vitest";
import type { EnvConfig } from "../../src/config/env.js";
import {
  DOC_PAGE_IDS,
  getDocDefinitions,
} from "../../src/onboarding/catalog.js";
import { ConfluenceDocsService } from "../../src/services/confluenceDocsService.js";
import type { RoleTrack } from "../../src/onboarding/types.js";

const BASE_ENV: EnvConfig = {
  port: 31337,
  anthropicModel: "claude-3-5-haiku-latest",
  webflowMonorepoPath: "/tmp/webflow",
  confluenceBaseUrl: "https://webflow.atlassian.net/wiki",
};

describe("getDocDefinitions", () => {
  it("gives the frontend track the shared docs plus the frontend role library and milestone 1:1s", () => {
    const ids = getDocDefinitions("frontend").map((doc) => doc.id);
    expect(ids).toContain("frontend-onboarding");
    expect(ids).toContain("onboarding-milestones");
    expect(ids).not.toContain("backend-onboarding");
    expect(ids).not.toContain("cicd-onboarding");
  });

  it("exposes both Infrastructure and CI/CD libraries on the infrastructure track", () => {
    const ids = getDocDefinitions("infrastructure").map((doc) => doc.id);
    expect(ids).toContain("infrastructure-onboarding");
    expect(ids).toContain("cicd-onboarding");
    // CI/CD should appear exactly once so infra folks don't see a duplicate card.
    const cicdCount = ids.filter((id) => id === "cicd-onboarding").length;
    expect(cicdCount).toBe(1);
  });

  it("gives generalists every role library plus the shared docs so they can choose their own path", () => {
    const definitions = getDocDefinitions("general");
    const ids = definitions.map((doc) => doc.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        "developer-onboarding",
        "eng-onboarding-buddy",
        "onboarding-milestones",
        "frontend-onboarding",
        "backend-onboarding",
        "infrastructure-onboarding",
        "cicd-onboarding",
      ]),
    );

    // Generalist role-library titles must be prefixed so they read as a menu, not the track's main doc.
    const roleLibraryTitles = definitions
      .filter((doc) =>
        [
          "frontend-onboarding",
          "backend-onboarding",
          "infrastructure-onboarding",
          "cicd-onboarding",
        ].includes(doc.id),
      )
      .map((doc) => doc.title);

    expect(roleLibraryTitles).toHaveLength(4);
    for (const title of roleLibraryTitles) {
      expect(title.startsWith("Role library:")).toBe(true);
    }
  });
});

describe("ConfluenceDocsService.getDocsForTrack", () => {
  const ROLE_TRACKS: RoleTrack[] = [
    "frontend",
    "backend",
    "infrastructure",
    "general",
  ];

  it.each(ROLE_TRACKS)(
    "produces a non-null Confluence URL for every doc surfaced to the %s track",
    (track) => {
      const service = new ConfluenceDocsService(BASE_ENV);
      const docs = service.getDocsForTrack(track);

      expect(docs.length).toBeGreaterThan(0);

      for (const doc of docs) {
        // This guards drift: any new doc added to TRACK_DOCS/SHARED_DOCS without a matching
        // DOC_PAGE_IDS entry would produce a URL containing "undefined".
        expect(
          doc.url,
          `missing URL for doc "${doc.id}" on track "${track}"`,
        ).not.toBeNull();
        expect(doc.url).toContain("/spaces/ENG/pages/");
        expect(doc.url).not.toContain("undefined");
        expect(DOC_PAGE_IDS[doc.id]).toBeDefined();
      }
    },
  );

  it("returns null URLs when confluenceBaseUrl is not configured so callers can render disabled links", () => {
    const service = new ConfluenceDocsService({
      ...BASE_ENV,
      confluenceBaseUrl: undefined,
    });
    const docs = service.getDocsForTrack("infrastructure");

    expect(docs.length).toBeGreaterThan(0);
    for (const doc of docs) {
      expect(doc.url).toBeNull();
    }
  });
});
