/**
 * Shared helper: enrich a package's people with cached insights.
 *
 * Ported from the `enrichPackageInsights` helper that used to live
 * in spark/src/server/api.ts. Keeping it here instead of on the
 * service so each handler can decide whether to enrich or not —
 * e.g. refresh-insights enriches after running the fetch; create
 * enriches with whatever is currently cached.
 */

import type { HandlerCtx } from "../../ctx";
import {
  getCachedInsight,
  personCacheKey,
} from "../../services/peopleInsights";
import type { OnboardingPackage } from "../../types";

export function enrichPackageInsights(
  ctx: HandlerCtx,
  pkg: OnboardingPackage,
): OnboardingPackage {
  const people = pkg.sections.peopleToMeet.people.map((person) => {
    const cached = getCachedInsight(ctx, person);
    if (!cached) {
      return { ...person, insightsStatus: "pending" as const };
    }
    const base = {
      ...person,
      insightsAttempts: cached.attempts,
      ...(cached.askMeAbout ? { askMeAbout: cached.askMeAbout } : {}),
    };
    if (cached.dataStarved) {
      return { ...base, insightsStatus: "data-starved" as const };
    }
    return { ...base, insightsStatus: "ready" as const };
  });
  return {
    ...pkg,
    sections: {
      ...pkg.sections,
      peopleToMeet: {
        ...pkg.sections.peopleToMeet,
        people,
      },
    },
  };
}

// Silence unused-import lint while personCacheKey is re-exported
// for potential consumers; kept exported intentionally.
export { personCacheKey };
