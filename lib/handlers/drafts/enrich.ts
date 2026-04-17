/**
 * Attach each person's cached insight (status + askMeAbout blurb) to an
 * OnboardingPackage before it's returned to the client. Kept separate
 * from the service so each handler decides whether to enrich or not —
 * e.g. refresh-insights enriches after running the fetch; create
 * enriches with whatever is currently cached.
 */

import type {HandlerCtx} from '../../ctx';
import {getCachedInsight, personCacheKey} from '../../services/peopleInsights';
import type {OnboardingPackage} from '../../types';

export function enrichPackageInsights(
  ctx: HandlerCtx,
  pkg: OnboardingPackage
): OnboardingPackage {
  const people = pkg.sections.peopleToMeet.people.map((person) => {
    const cached = getCachedInsight(ctx, person);
    if (!cached) {
      return {...person, insightsStatus: 'pending' as const};
    }
    const base = {
      ...person,
      insightsAttempts: cached.attempts,
      ...(cached.askMeAbout ? {askMeAbout: cached.askMeAbout} : {}),
    };
    if (cached.dataStarved) {
      return {...base, insightsStatus: 'data-starved' as const};
    }
    return {...base, insightsStatus: 'ready' as const};
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

export {personCacheKey};
