# Hackathon Template — Agents of Possibility

A security-first template for hackathon projects. Clone it, start coding — security scanning is automatic.

## Quick Start

1. Create a new repo from this template (click **"Use this template"** on GitHub)
2. Clone your new repo
3. Copy the environment file and fill in your keys:
   ```bash
   cp .env.example .env
   ```
4. Start building

## What's Included

| File | Purpose |
|------|---------|
| `.gitignore` | Blocks secrets, credentials, and build artifacts from being committed |
| `.env.example` | Template for environment variables — copy to `.env` and fill in your values |
| `HACKATHON.md` | **Read this first** — security guide, what not to commit, AI/agent safety |
| `SECURITY.md` | How to report security issues |
| `AGENTS.md` | Security rules for AI coding agents (Claude Code, Windsurf, etc.) |
| `.cursor/rules/security.mdc` | Security rules for Cursor's AI agent |
| `.editorconfig` | Consistent formatting across editors |
| `.gitattributes` | Line ending consistency and binary file handling |
| `LICENSE` | MIT license |

## What's Protected Automatically

These are configured at the org level — you don't need to do anything:

- **GitGuardian** scans every push for leaked secrets
- **Socket.dev** scans dependencies for vulnerabilities
- **ggshield** is available locally for on-demand secret scanning

## Local Security Scanning

If you want to scan your repo for secrets locally, ggshield is available on your machine:

```bash
ggshield secret scan repo .
```

## Important Links

- [Hackathon Security Guide](HACKATHON.md) — read before you start coding
- [Security Policy](SECURITY.md) — how to report security issues
