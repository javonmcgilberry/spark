/**
 * confluenceSearch — higher-level "find onboarding references" +
 * "find user guides for people" helpers on top of the raw
 * ConfluenceClient. Free-function shape with HandlerCtx threading.
 */

import type {HandlerCtx} from '../ctx';
import type {
  ConfluenceLink,
  OnboardingPerson,
  OnboardingReferences,
  TeamProfile,
} from '../types';

export async function findOnboardingReferences(
  ctx: HandlerCtx,
  profile: TeamProfile
): Promise<OnboardingReferences> {
  if (!ctx.confluence.isConfigured() || !profile.email) return {};

  const [teamPage, pillarPage, newHireGuide] = await Promise.all([
    ctx.confluence.searchFirst(
      `${profile.teamName} team home`,
      `Canonical team home for ${profile.teamName}.`,
      profile.email,
      {
        excludeTitlePrefixes: ['tech spec', 'rfc', 'pia', 'post-mortem'],
      }
    ),
    profile.pillarName
      ? ctx.confluence.searchFirst(
          `${profile.pillarName} pillar home`,
          `Canonical pillar home for ${profile.pillarName}.`,
          profile.email,
          {
            excludeTitlePrefixes: ['tech spec', 'rfc', 'pia', 'post-mortem'],
          }
        )
      : Promise.resolve(undefined),
    ctx.confluence.searchFirst(
      `${profile.displayName} user guide`,
      `User guide for ${profile.displayName}.`,
      profile.email
    ),
  ]);

  return {teamPage, pillarPage, newHireGuide};
}

export async function findPeopleGuides(
  ctx: HandlerCtx,
  profile: TeamProfile,
  people: OnboardingPerson[]
): Promise<Record<string, ConfluenceLink>> {
  if (!ctx.confluence.isConfigured() || !profile.email) return {};

  const relevantPeople = people
    .filter((person) => person.name && !person.name.startsWith('Your '))
    .slice(0, 8);

  const entries = await Promise.all(
    relevantPeople.map(async (person) => {
      const guide = await ctx.confluence.searchFirst(
        `${person.name} user guide`,
        `User guide for ${person.name}.`,
        profile.email!
      );
      return guide ? [personKey(person), guide] : undefined;
    })
  );

  return Object.fromEntries(
    entries.filter((entry): entry is [string, ConfluenceLink] =>
      Array.isArray(entry)
    )
  );
}

function personKey(person: OnboardingPerson): string {
  return (person.slackUserId || person.email || person.name).toLowerCase();
}
