require("dotenv").config();
const express = require("express");
const { Webhooks, createNodeMiddleware } = require("@octokit/webhooks");
const fs = require("fs");

const app = express();

const webhooks = new Webhooks({
  secret: process.env.WEBHOOK_SECRET,
});

async function getInstallationOctokit(installationId) {
  const { App } = await import("@octokit/app");
  const privateKey = process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, "\n");

  const app = new App({
    appId: process.env.GITHUB_APP_ID,
    privateKey: privateKey,
  });

  return app.getInstallationOctokit(installationId);
}

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
async function reviewWithOllama(diffText) {
  const reviewPrompt = `
You are a senior software engineer doing a code review.
Review the following code diff, which may contain multiple files.
Respond ONLY with a JSON array. No explanation, no markdown, just raw JSON.

Each item in the array must have exactly these fields:
- "file": the filename this issue belongs to
- "line": the approximate line number of the issue (a number)
- "severity": one of "low", "medium", "high"
- "comment": a specific explanation of the issue and suggested fix

Only flag genuine issues. If there are no issues, return an empty array [].

Diff:
${diffText}
`;

  const response = await fetch("http://host.docker.internal:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
    model: "qwen2.5-coder:7b",
      prompt: reviewPrompt,
      stream: false,
      format: "json",
    }),
  });

  const data = await response.json();

  try {
    const parsed = JSON.parse(data.response);
    if (Array.isArray(parsed)) return parsed;
    if (Object.keys(parsed).length === 0) return [];
    return [parsed];
  } catch (err) {
    console.error("Failed to parse AI response:", err.message);
    return [];
  }
}

webhooks.on("pull_request", async ({ payload }) => {
  console.log("PR Event:", payload.action);

  if (payload.action === "opened" || payload.action === "synchronize") {
    const installationId = payload.installation.id;
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const pull_number = payload.pull_request.number;

    const octokit = await getInstallationOctokit(installationId);

    const { data: files } = await octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
      { owner, repo, pull_number }
    );

    let combinedDiff = "";
    files.forEach((file) => {
      combinedDiff += `\nFile: ${file.filename}\n${file.patch}\n`;
    });

    console.log("\n🤖 Sending diff to Ollama for review...");
    const issues = await reviewWithOllama(combinedDiff);

    console.log(`\nAI found ${issues.length} issue(s):`);
    console.log(`\nAI found ${issues.length} issue(s):`);
for (const issue of issues) {
  console.log(`- [${issue.severity}] ${issue.file}:${issue.line} — ${issue.comment}`);
  await postReviewComment(octokit, owner, repo, pull_number, issue);
}
  }
});

const middleware = createNodeMiddleware(webhooks, {
  path: "/webhook",
});

app.use(middleware);

app.listen(3000, () => {
  console.log("Listening on 3000");
});

async function postReviewComment(octokit, owner, repo, pull_number, issue) {
  try {
    await octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
      {
        owner,
        repo,
        issue_number: pull_number, // PRs share issue numbering in GitHub's API
        body: `🤖 **AI Review** [${issue.severity.toUpperCase()}] — \`${issue.file}\` (line ${issue.line})\n\n${issue.comment}`,
      }
    );
    console.log(`✅ Posted comment on ${issue.file}`);
  } catch (err) {
    console.error("Failed to post comment:", err.message);
  }
}