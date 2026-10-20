import {
  isAcceptableClaudeComment,
  classifyCodexNativeReview,
  classifyCodexSummaryComment,
  isAcceptableNativeReview,
  latestAiReviewRequestMarker,
  latestCodexNativeReviewResult,
  latestCodexSummaryResult
} from "./ai-review-helpers.mjs";

export async function listReviewPages(request, path, key = null) {
  const items = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; ; page += 1) {
    const data = await request(`${path}${separator}per_page=100&page=${page}`);
    const batch = key ? data[key] : data;
    if (!Array.isArray(batch)) throw new Error("Invalid paginated review response.");
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

async function hasUnresolvedThreads(request, owner, repo, prNumber) {
  let cursor = null;
  do {
    const data = await request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query($owner:String!,$repo:String!,$number:Int!,$cursor:String) {
          repository(owner:$owner,name:$repo) { pullRequest(number:$number) {
            reviewThreads(first:100,after:$cursor) {
              nodes { isResolved }
              pageInfo { hasNextPage endCursor }
            }
          } }
        }`,
        variables: { owner, repo, number: Number(prNumber), cursor }
      })
    });
    const threads = data?.data?.repository?.pullRequest?.reviewThreads;
    if (data.errors || !Array.isArray(threads?.nodes) ||
        typeof threads?.pageInfo?.hasNextPage !== "boolean" ||
        threads.nodes.some((thread) => typeof thread.isResolved !== "boolean")) {
      throw new Error("Could not verify review thread resolution.");
    }
    if (threads.nodes.some((thread) => !thread.isResolved)) return true;
    if (!threads.pageInfo.hasNextPage) return false;
    if (!threads.pageInfo.endCursor || threads.pageInfo.endCursor === cursor) {
      throw new Error("Invalid review thread pagination.");
    }
    cursor = threads.pageInfo.endCursor;
  } while (cursor);
  return false;
}

export async function evaluateAiReviewEvidence({ request, repository, prNumber, headSha, agent, config = {} }) {
  const [owner, repo] = repository.split("/");
  const prefix = `/repos/${owner}/${repo}`;
  const pullPath = `${prefix}/pulls/${prNumber}`;
  if ((await request(pullPath)).head?.sha !== headSha) return "stale";
  const comments = await listReviewPages(request, `${prefix}/issues/${prNumber}/comments`);
  const marker = latestAiReviewRequestMarker(comments, agent, headSha);
  if (!marker) return "missing_marker";
  const requestedAt = Date.parse(marker.sourceCommentCreatedAt || marker.requestedAt || marker.commentCreatedAt || "");
  const afterRequest = (timestamp) => Number.isFinite(requestedAt) && Date.parse(timestamp || "") >= requestedAt;
  let result = "pending";
  if (agent === "claude") {
    if (comments.some((comment) => afterRequest(comment.created_at) && isAcceptableClaudeComment(comment, headSha, config))) result = "pass";
  } else {
    const reviews = await listReviewPages(request, `${pullPath}/reviews`);
    if (agent === "codex") {
      const reviewComments = await listReviewPages(request, `${pullPath}/comments`);
      const timeline = await listReviewPages(request, `${prefix}/issues/${prNumber}/timeline`);
      // Do not filter formal findings by the latest request marker. A new
      // request never resolves a finding or dismisses a current-head failure.
      const hasNegativeEvidence = reviews.some((review) =>
        classifyCodexNativeReview(review, reviewComments, headSha, config) === "fail") ||
        comments.some((comment) => (/^<!-- (?:codex-pull-request-review-summary -->|codex-review-state:)/.test(String(comment.body || "").trim()) ||
          (afterRequest(comment.updated_at) || afterRequest(comment.created_at))) &&
          classifyCodexSummaryComment(comment, headSha, marker, config) === "fail");
      const freshNative = latestCodexNativeReviewResult(reviews.filter((review) => afterRequest(review.submitted_at)), reviewComments, headSha, config);
      const summary = latestCodexSummaryResult(comments, headSha, marker, config, timeline);
      if (hasNegativeEvidence || summary === "fail") result = "fail";
      else if (summary === "pending") result = "pending";
      else if (freshNative === "pass" || summary === "pass") result = "pass";
    } else if (reviews.some((review) => afterRequest(review.submitted_at) && isAcceptableNativeReview(review, agent, headSha, config))) result = "pass";
  }
  if (result === "pass" && await hasUnresolvedThreads(request, owner, repo, prNumber)) result = "fail";
  // A synchronize event can arrive while REST/GraphQL evidence is in flight.
  // Never publish success for the old SHA against a newly resolved PR context.
  if ((await request(pullPath)).head?.sha !== headSha) return "stale";
  return result;
}
