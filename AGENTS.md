# Agent Instructions

These security rules apply to all AI-assisted code generation in this project. This file is read by Claude Code, Windsurf, and other agent-based development tools.

## Secrets and Credentials

- NEVER hardcode API keys, passwords, tokens, or secrets in source code. Always use environment variables.
- When introducing a new environment variable, add a placeholder entry to `.env.example` with a descriptive comment.
- NEVER write secrets to any logging output (console.log, print, logger, etc.).
- NEVER include real credentials in code comments, README files, or documentation.

## Dependencies

- Only use well-known, actively maintained packages from official registries.
- Prefer packages with high download counts and recent updates.
- Do not add dependencies for trivial functionality that can be written in a few lines.

## General

- Do not log sensitive data (user emails, passwords, API responses containing credentials).
- Do not hardcode URLs pointing to production or internal services — use environment variables.
- When creating files that may contain sensitive data, ensure the file pattern is covered by `.gitignore`.
- Refer to `HACKATHON.md` for the full security guide and pre-submission checklist.
