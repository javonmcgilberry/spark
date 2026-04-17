# Hackathon Security Guide — Agents of Possibility

**Read this before you start coding.** This template includes security guardrails so you can move fast without worrying about accidentally leaking secrets or credentials.

---

## What's Protected Automatically

You don't need to configure any of this — it's already set up:

- **GitGuardian** monitors every push for leaked secrets (org-level)
- **Socket.dev** scans your dependencies for vulnerabilities (org-level)
- **ggshield** is installed on your machine for local secret scanning
- **.gitignore** blocks common secret file patterns from being committed

---

## What NOT to Commit

Never commit any of the following. The `.gitignore` blocks most of these, but stay vigilant:

| Type              | Examples                                   |
| ----------------- | ------------------------------------------ |
| API keys          | `sk-...`, `AKIA...`, `ghp_...`, `xoxb-...` |
| Environment files | `.env`, `.env.local`, `.env.production`    |
| Private keys      | `*.pem`, `*.key`, `id_rsa`, `id_ed25519`   |
| Credential files  | `credentials.json`, `service-account.json` |
| Passwords         | Hardcoded in source code or config files   |
| Cloud configs     | `.aws/credentials`, `terraform.tfvars`     |

**Use environment variables instead.** See `.env.example` for the pattern.

---

## If You Accidentally Push a Secret

This happens. Here's what to do immediately:

1. **Rotate the credential NOW.** Don't wait. Go to the provider's dashboard and regenerate the key. The old key is compromised the moment it hits GitHub — even if you force-push to remove it, it's in the git history.

2. **Revoke the old credential.** Make sure the leaked key no longer works.

3. **Check for unauthorized usage.** Review the provider's usage logs for activity you don't recognize.

4. **Notify the security team.** Even during a hackathon, report it so we can help. Security Team can be reached at #triage-security

### Rotation Links for Common Providers

| Provider  | Where to rotate                                                                       |
| --------- | ------------------------------------------------------------------------------------- |
| OpenAI    | [platform.openai.com/api-keys](https://platform.openai.com/api-keys)                  |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)    |
| Google AI | [aistudio.google.com/apikey](https://aistudio.google.com/apikey)                      |
| AWS       | [console.aws.amazon.com/iam](https://console.aws.amazon.com/iam) — rotate access keys |
| GitHub    | [github.com/settings/tokens](https://github.com/settings/tokens)                      |

---

## AI & Agent Security

Since this hackathon focuses on building with agents and LLMs, keep these additional guidelines in mind:

### API Key Safety

- **Set spending limits** on every LLM provider account before you start coding. A runaway agent loop can burn through hundreds of dollars in minutes.
- **Use scoped keys** where providers support them (e.g., read-only, limited models).
- **Rotate all keys after the hackathon.** Treat hackathon keys as temporary.

### Agent Execution Safety

- **Sandbox tool execution.** If your agent can run code or shell commands, run them in a container or sandboxed environment — never directly on the host.
- **Implement timeouts.** Every LLM call should have a timeout. Every agent loop should have a maximum iteration count.
- **Add circuit breakers.** If an agent fails repeatedly, stop retrying. Exponential backoff is your friend.

### Prompt Injection

- **Never trust user input in prompts.** Sanitize or use structured inputs before passing user content to an LLM.
- **Separate system prompts from user content.** Use the LLM provider's system/user message roles — don't concatenate everything into a single string.
- **Don't expose raw LLM errors to end users.** Error messages can leak system prompt details or internal architecture.

### Data Handling

- **Don't send PII to third-party LLM APIs.** Strip names, emails, and other personal data before sending context to an LLM.
- **Be careful with conversation logging.** Full LLM conversations may contain sensitive context — log metadata (timestamps, token counts) rather than full content.
- **RAG access controls.** If you're building RAG, don't index sensitive documents unless you have access controls that match the original document's permissions.

### Cost Control

- **Set hard spending limits** on all LLM provider accounts.
- **Implement token budgets per request.** Use `max_tokens` parameters to cap response length.
- **Monitor usage during development.** Check your provider dashboard periodically — a bug in a loop can be expensive.

---

## Pre-Submission Checklist

Before submitting your hackathon project, verify:

- [ ] No API keys, passwords, or tokens in the codebase (run `ggshield secret scan repo .`)
- [ ] `.env.example` is updated with all required environment variables (without real values)
- [ ] No hardcoded URLs pointing to production or internal services
- [ ] Dependencies are from trusted, well-known packages
- [ ] Agent/LLM calls have timeouts and error handling
- [ ] Spending limits are set on all LLM provider accounts
- [ ] README explains how to set up the project (including which env vars are needed)
