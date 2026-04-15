# Web dashboard

Slack is the primary surface for Spark. The web dashboard is a read-only companion for browsing onboarding progress, docs, and contribution tasks in one place.

## Scope

- Onboarding progress timeline
- Docs and channels browser
- Contribution task browser
- Team map (manager, buddy, teammates, ownership paths)

## Implementation

- Lives in `web/` as a separate Next.js app.
- Reuses the same structured onboarding data sources as the Slack flow.
- Read-only for the MVP — no action duplication.
