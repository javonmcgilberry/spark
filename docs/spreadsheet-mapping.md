# Spreadsheet Mapping

Spark is grounded in `[MAKE A COPY] Engineering Onboarding Guide.xlsx`, but it does not blindly reproduce every tab as generated copy. The implementation splits content into three buckets:

- `Static structured content`: content that should stay stable, reviewable, and easy to maintain in code.
- `Dynamic deterministic content`: content assembled from live inputs like Slack identity, DX lookup, CODEOWNERS, and code scanning.
- `LLM-assisted content`: content that benefits from reasoning or summarization, with sanitized inputs and no personal data sent to the model.

## Sheet-by-sheet strategy

| Spreadsheet tab                                   | Spark strategy                                 | Why                                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Welcome`                                         | Dynamic deterministic                          | The structure is stable, but the team, manager, buddy, and timing should come from live context or templates, not freeform LLM copy. |
| `Onboarding Checklist`                            | Static structured                              | These are recurring onboarding tasks and phase goals. They should be easy to audit and not drift with model output.                  |
| `30-60-90 Plan`                                   | Static structured                              | This is a durable framework, not something that should vary per prompt.                                                              |
| `People to Meet`                                  | Hybrid: dynamic deterministic + static prompts | The roles and discussion prompts are stable, while actual names and team context are dynamic.                                        |
| `Tools`                                           | Static structured                              | Tool inventory and access guidance should be consistent and predictable.                                                             |
| `Slack`                                           | Static structured                              | Core channels and their descriptions should be curated, not improvised.                                                              |
| `Initial Eng Tasks`                               | Dynamic deterministic + optional LLM framing   | This is where live repo scanning matters. Spark should discover real work instead of relying on a manually curated spreadsheet cell. |
| `Rituals`                                         | Static structured                              | Ritual descriptions, cadences, and attendance expectations should remain stable.                                                     |
| `Engineering Resource Library`                    | Static structured with dynamic routing         | The library is a stable hub, but which docs surface first depends on the new hire's area.                                            |
| Legacy tabs (`old_checklist`, `OLD Reading List`) | Ignore for primary UX                          | They are retained as historical references, not as the product source of truth.                                                      |

## What stays out of the LLM

Spark should not send personal data like names, emails, or Slack identifiers to a third-party model. That means these flows stay deterministic:

- welcome card assembly
- people-to-meet roster structure
- tool inventory
- rituals and channel guidance
- docs list construction
- checklist and progress state

## Where the LLM helps

Spark uses the model where reasoning or tone adds real value:

- blocker triage in DMs
- concise explanation of why a contribution task is a good onboarding task
- PR description drafting for contribution milestones

This matches the spreadsheet intent: structured onboarding content stays structured, and the model helps with ambiguity, not with replacing the baseline curriculum.
