#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  extractClaudeOutcome,
  extractMarkerSha,
  classifyCodexSummaryComment,
  latestAiReviewRequestMarker,
  isAiReviewRequestMarkerComment,
  isCodexReviewSignal,
  reviewEvidenceTimestamp,
  isTrustedReviewLogin
} from "./ai-review-helpers.mjs";
import { readConfig } from "./shared.mjs";

const rerunnableConclusions = new Set(["failure", "cancelled", "timed_out", "action_required"]);
const activeStatuses = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

function normalizeAgent(agent) {
  return String(agent || "codex").trim().toLowerCase() || "codex";
}

export function shouldRouteAiReviewRerunEvent(event, selectedAgent = "codex", config = {}) {
  const agent = normalizeAgent(selectedAgent);
  if (event?.workflow_run) {
    return event.action === "completed" && event.workflow_run.event === "pull_request" &&
      /^\.github\/workflows\/ai-review\.yml(?:@[^\s]+)?$/.test(event.workflow_run.path || "") &&
      event.workflow_run.status === "completed";
  }

  if (event?.review && (!event.action || event.action === "submitted")) {
    return ["codex", "gemini"].includes(agent) &&
      isTrustedReviewLogin(event.review.user?.login, agent, config);
  }

  if (!event?.issue?.pull_request || !event?.comment ||
      (event.action && !["created", "edited"].includes(event.action))) return false;
  const body = String(event.comment.body || "");
  const login = event.comment.user?.login;

  if (agent === "codex") {
    return isCodexReviewSignal(body) && isTrustedReviewLogin(login, "codex", config);
  }

  if (agent === "claude") {
    return Boolean(extractClaudeOutcome(body)) && isTrustedReviewLogin(login, "claude", config);
  }

  return false;
}

export function selectAiReviewRun(runs = [], headSha, evidenceAt = null) {
  const run = runs.filter((item) => item.event === "pull_request" && item.head_sha === headSha)
    .sort((left, right) => Date.parse(right.created_at || "") - Date.parse(left.created_at || "") || right.id - left.id)[0];
  if (!run) return { action: "not_found", run: null };
  if (activeStatuses.has(run.status)) return { action: "already_running", run };
  const evidenceTime = Date.parse(evidenceAt || "");
  const startedTime = Date.parse(run.run_started_at || run.created_at || "");
  // A later attempt already saw this signal. Never revive an older failed run
  // behind a successful/newer run or loop on workflow completion events.
  if (Number.isFinite(evidenceTime) && Number.isFinite(startedTime) && startedTime > evidenceTime) {
    return { action: "already_evaluated", run };
  }
  if (run.status === "completed" && (rerunnableConclusions.has(run.conclusion) ||
      (run.conclusion === "success" && Number.isFinite(evidenceTime) && evidenceTime >= startedTime))) {
    return { action: "rerun", run };
  }
  return { action: run.conclusion === "success" ? "already_success" : "not_found", run };
}

async function defaultRequest(token, repository, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function listPaginated(request, token, repository, path) {
  const items = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; ; page += 1) {
    const data = await request(token, repository, `${path}${separator}per_page=100&page=${page}`);
    const batch = data.workflow_runs || data;
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

export async function rerunAiReviewForPrHead({
  token,
  repository,
  headSha,
  prNumber = null,
  evidenceAt = null,
  request = defaultRequest
}) {
  if (!token || !repository || !headSha) {
    throw new Error("token, repository, and headSha are required to rerun AI Review.");
  }

  const [owner, repo] = repository.split("/");
  if (prNumber) {
    const pull = await request(token, repository, `/repos/${owner}/${repo}/pulls/${prNumber}`);
    if (pull.head?.sha !== headSha) return { action: "stale", run: null, message: `PR head moved from ${headSha}; no rerun requested.` };
  }
  const runs = await listPaginated(request, token, repository,
    `/repos/${owner}/${repo}/actions/workflows/ai-review.yml/runs?event=pull_request&head_sha=${encodeURIComponent(headSha)}`);
  const selected = selectAiReviewRun(runs, headSha, evidenceAt);

  if (selected.action === "rerun") {
    if (prNumber) {
      const pull = await request(token, repository, `/repos/${owner}/${repo}/pulls/${prNumber}`);
      if (pull.head?.sha !== headSha) return { action: "stale", run: null, message: `PR head moved from ${headSha}; no rerun requested.` };
    }
    await request(
      token,
      repository,
      `/repos/${owner}/${repo}/actions/runs/${selected.run.id}/rerun`,
      { method: "POST" }
    );
    return {
      ...selected,
      message: `Requested AI Review rerun for ${headSha} from run ${selected.run.id}.`
    };
  }

  const runId = selected.run?.id ? ` run ${selected.run.id}` : "";
  const messages = {
    already_running: `AI Review is already running for ${headSha}${runId}.`,
    already_evaluated: `AI Review already evaluated this signal for ${headSha}${runId}.`,
    already_success: `AI Review already passed for ${headSha}${runId}.`,
    not_found: `No completed AI Review pull_request run found for ${headSha}.`
  };

  return {
    ...selected,
    message: messages[selected.action]
  };
}

export async function resolvePullContext({ token, repository, event, request = defaultRequest }) {
  let number = event?.pull_request?.number || (event?.issue?.pull_request && event.issue.number) ||
    event?.workflow_run?.pull_requests?.[0]?.number;
  const [owner, repo] = repository.split("/");
  if (!number && event?.workflow_run) {
    // Fork workflow_run payloads can omit pull_requests. Commit associations
    // are hints only: prove repository, branch and exact SHA before routing.
    const run = event.workflow_run;
    if (!/^[a-f0-9]{40}$/.test(run.head_sha || "") || !run.head_branch || !run.head_repository?.full_name) {
      throw new Error("Completed workflow is missing exact head provenance.");
    }
    const candidates = await listPaginated(request, token, repository,
      `/repos/${owner}/${repo}/commits/${run.head_sha}/pulls`);
    const matching = candidates.filter((pull) => pull.state === "open" &&
      pull.head?.sha === run.head_sha && pull.head?.ref === run.head_branch &&
      pull.head?.repo?.full_name === run.head_repository.full_name &&
      pull.base?.repo?.full_name === repository);
    if (matching.length !== 1) throw new Error("Could not uniquely resolve PR from completed workflow head provenance.");
    number = matching[0].number;
  }
  if (!number) throw new Error("Could not resolve pull request from event.");

  const pull = await request(token, repository, `/repos/${owner}/${repo}/pulls/${number}`);
  return {
    prNumber: pull.number,
    headSha: pull.head?.sha
  };
}

export function latestAiReviewSignalTimestamp(comments, reviews, agent, headSha, config = {}) {
  const timestamps = [];
  const marker = latestAiReviewRequestMarker(comments, agent, headSha);
  for (const comment of comments) {
    if (!isTrustedReviewLogin(comment.user?.login, agent, config)) continue;
    if (agent === "codex" && classifyCodexSummaryComment(comment, headSha, marker, config) !== null) {
      timestamps.push(reviewEvidenceTimestamp(comment));
    } else if (agent === "claude" && extractClaudeOutcome(comment.body) && extractMarkerSha(comment.body) === headSha) {
      timestamps.push(reviewEvidenceTimestamp(comment));
    }
  }
  for (const review of reviews) {
    if (review.commit_id === headSha && isTrustedReviewLogin(review.user?.login, agent, config)) timestamps.push(review.submitted_at);
  }
  return timestamps.filter((timestamp) => Number.isFinite(Date.parse(timestamp || "")))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || null;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const selectedAgent = normalizeAgent(process.env.AI_REVIEW_AGENT);
  const config = readConfig();

  if (!token || !repository || !eventPath) {
    console.error("GITHUB_TOKEN, GITHUB_REPOSITORY, and GITHUB_EVENT_PATH are required.");
    process.exit(1);
  }

  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  if (!shouldRouteAiReviewRerunEvent(event, selectedAgent, config)) {
    console.log("AI Review rerun skipped: event is not trusted review evidence for the selected agent.");
    return;
  }

  const context = await resolvePullContext({ token, repository, event });
  let evidenceAt;
  if (event.workflow_run) {
    if (event.workflow_run.head_sha !== context.headSha) {
      console.log("AI Review recovery skipped: completed run belongs to an old PR head.");
      return;
    }
    const prefix = `/repos/${repository}`;
    const comments = await listPaginated(defaultRequest, token, repository, `${prefix}/issues/${context.prNumber}/comments`);
    const reviews = await listPaginated(defaultRequest, token, repository, `${prefix}/pulls/${context.prNumber}/reviews`);
    evidenceAt = latestAiReviewSignalTimestamp(comments, reviews, selectedAgent, context.headSha, config);
    if (!evidenceAt) {
      console.log("AI Review recovery skipped: no current-head native review signal.");
      return;
    }
  } else {
    const comments = event.comment ? [event.comment] : [];
    if (event.comment && selectedAgent === "codex") {
      // SHA-less legacy signals need the trusted request marker. Do not mix
      // other review evidence into this event's head/timestamp validation.
      const allComments = await listPaginated(defaultRequest, token, repository,
        `/repos/${repository}/issues/${context.prNumber}/comments`);
      comments.push(...allComments.filter((comment) =>
        isAiReviewRequestMarkerComment(comment, selectedAgent, context.headSha)));
    }
    evidenceAt = latestAiReviewSignalTimestamp(comments, event.review ? [event.review] : [],
      selectedAgent, context.headSha, config);
    if (!evidenceAt) {
      console.log("AI Review rerun skipped: direct signal does not belong to the current PR head.");
      return;
    }
  }
  const result = await rerunAiReviewForPrHead({
    token,
    repository,
    headSha: context.headSha,
    prNumber: context.prNumber,
    evidenceAt
  });
  console.log(result.message);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`AI Review rerun failed: ${error.message}`);
    process.exit(1);
  }
}
