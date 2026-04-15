# Demo Script

## Goal

Show Spark as an onboarding system first and a contribution assistant second.

## Flow

1. Show the onboarding spreadsheet briefly and explain that Spark replaces a static nine-tab artifact with a guided Slack journey.
2. Show a new hire joining an onboarding cohort channel.
3. Spark DMs the new hire with:
   - team and pillar context
   - manager and buddy placeholders or live values
   - key codebase paths
   - docs to start with
4. Click into the next onboarding step and show:
   - tools and access guidance
   - rituals that matter
   - people to meet
5. Jump to the contribution milestone.
6. Spark presents a short list of real contribution tasks discovered from the monorepo:
   - stale flag cleanup
   - CODEOWNERS gap
   - stale TODO cleanup
   - unused imports
7. Select a task and show the preview.
8. Confirm the task and show the draft PR flow.
9. End on the celebration message and explain that the first contribution is one milestone in a larger onboarding journey.

## Talking points

- The spreadsheet content that should stay structured remains structured.
- Spark uses repo-aware discovery to replace the manually populated `Initial Eng Tasks` tab.
- Spark defaults to `dry-run` mode so it can safely demo the contribution flow without mutating the monorepo.
- If `GITHUB_MUTATION_MODE=apply` is enabled in a clean working tree, Spark can create a real draft contribution branch and PR.
