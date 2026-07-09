
# GitHub-PR-Automation
# AI-Powered PR Review Bot

An AI-powered GitHub App that automatically reviews Pull Requests — the moment a PR is opened or updated, it fetches the actual code diff, analyzes it using an LLM, and posts structured review comments directly on the PR, flagging bugs, security issues, and bad practices before a human reviewer even looks.

## Why this exists

Code review is slow, inconsistent, and easy to rush under deadline pressure — which is exactly how bugs and security issues slip into production. This bot acts as an automated first-pass reviewer, catching common, well-defined issues (SQL injection patterns, missing null/zero checks, hardcoded secrets, etc.) so human reviewers can focus their time on design and logic decisions instead of routine checks.

## How it works

```
GitHub PR opened/updated
        │
        ▼
GitHub Webhook fires ──────► Express server (verifies webhook signature)
        │
        ▼
Authenticate as GitHub App (JWT → installation token)
        │
        ▼
Fetch PR diff via GitHub REST API
        │
        ▼
Send diff to LLM with a structured review prompt
        │
        ▼
Parse LLM response into structured JSON
  { file, line, severity, comment }
        │
        ▼
Post each issue back to the PR as a comment via GitHub API
```

## Tech stack

- **Node.js + Express** — webhook receiver and orchestration server
- **GitHub Apps API** (`@octokit/app`, `@octokit/webhooks`) — secure, installable GitHub integration with JWT-based authentication (not a personal access token — this is the same auth model real production GitHub integrations use)
- **LLM integration** (Ollama, local — swappable with a hosted API) — code review reasoning with structured JSON output via prompt engineering and schema enforcement
- **Docker + Docker Compose** — containerized for consistent, portable deployment
- **ngrok** — local webhook tunneling during development

## Key engineering details

- **GitHub App authentication**, not a simple token — uses a private-key-signed JWT exchanged for a short-lived installation access token, the same flow used by production GitHub integrations (Copilot, Renovate, etc.)
- **Structured output enforcement** — the LLM is prompted to return a strict JSON schema (`file`, `line`, `severity`, `comment`), with defensive parsing to handle model inconsistencies (e.g., empty object vs. empty array when no issues are found)
- **Diff-based analysis** — reviews the actual changed lines (with surrounding context) fetched via GitHub's Pull Request Files API, not the full repository — the same approach used by most production review bots for speed and relevance
- **Environment-based secrets management** — private key and API credentials are injected via environment variables (not files) so the app can run safely in any containerized environment, including cloud hosts

## Example output

When this PR was opened containing a SQL injection vulnerability, a hardcoded credential, and a missing zero-check:

```javascript
function login(username, password) {
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  db.execute(query);

  const apiKey = "sk-live-abc123xyz789";

  if (password == "admin123") {
    return { success: true };
  }
}

function divide(a, b) {
  return a / b;
}
```

The bot automatically posted:

> 🤖 **AI Review** [HIGH] — `sample-review-test.js` (line 2)
> Use prepared statements to prevent SQL injection. Replace the string concatenation with a parameterized query.

*(screenshot of the real PR comment goes here)*

## Running locally

```bash
git clone https://github.com/yourusername/pr-review-bot.git
cd pr-review-bot
npm install
```

Create a `.env` file:
```
WEBHOOK_SECRET=your_webhook_secret
GITHUB_APP_ID=your_app_id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

s over time
4. AI-suggested fixes (actual corrected code, not just flagged issues) alongside each comment
