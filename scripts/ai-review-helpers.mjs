export const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function isTrustedAssociation(value) {
  return trustedAssociations.has(String(value || "").toUpperCase());
}

export function extractClaudeOutcome(body) {
  const match = String(body || "").match(/^AI_REVIEW_OUTCOME:\s*(pass|advisory|block)\s*$/im);
  return match?.[1]?.toLowerCase() || null;
}

export function extractMarkerSha(body) {
  const match = String(body || "").match(/^AI_REVIEW_SHA:\s*([a-f0-9]{7,40})\s*$/im);
  return match?.[1] || null;
}

export function createAiReviewRequestMarkerBody({
  agent,
  headSha,
  requestId,
  sourceCommentId,
  sourceCommentCreatedAt,
  requestedAt
}) {
  const recordedAt = requestedAt || new Date().toISOString();
  return [
    `AI review request recorded for \`${String(headSha || "").slice(0, 10)}\`.`,
    "",
    "<!-- nome:ai-review-request",
    `AI_REVIEW_REQUEST_ID: ${requestId}`,
    `AI_REVIEW_AGENT: ${String(agent || "").trim().toLowerCase()}`,
    `AI_REVIEW_SHA: ${headSha}`,
    `AI_REVIEW_SOURCE_COMMENT_ID: ${sourceCommentId}`,
    `AI_REVIEW_SOURCE_COMMENT_CREATED_AT: ${sourceCommentCreatedAt || recordedAt}`,
    `AI_REVIEW_REQUESTED_AT: ${recordedAt}`,
    "-->"
  ].join("\n");
}

export function extractAiReviewRequestMarker(body) {
  const text = String(body || "");
  if (!text.includes("nome:ai-review-request")) return null;

  const field = (name) => text.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, "im"))?.[1]?.trim() || null;
  const requestId = field("AI_REVIEW_REQUEST_ID");
  const agent = field("AI_REVIEW_AGENT")?.toLowerCase();
  const sha = field("AI_REVIEW_SHA");
  const sourceCommentId = field("AI_REVIEW_SOURCE_COMMENT_ID");
  const sourceCommentCreatedAt = field("AI_REVIEW_SOURCE_COMMENT_CREATED_AT");
  const requestedAt = field("AI_REVIEW_REQUESTED_AT");

  if (!requestId || !agent || !sha || !sourceCommentId || !requestedAt) return null;
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) return null;

  return {
    requestId,
    agent,
    sha,
    sourceCommentId,
    sourceCommentCreatedAt,
    requestedAt
  };
}

export function normalizeLogin(login) {
  return String(login || "").toLowerCase();
}

const defaultTrustedReviewLogins = {
  codex: ["chatgpt-codex-connector[bot]"],
  claude: ["claude[bot]"],
  gemini: ["gemini-code-assist[bot]"]
};

export function trustedReviewLoginsForAgent(agent, config = {}) {
  return new Set([
    ...(defaultTrustedReviewLogins[agent] || []),
    ...(config.trustedReviewLogins || []),
    ...(config.trustedReviewLoginsByAgent?.[agent] || [])
  ].map(normalizeLogin));
}

export function isTrustedReviewLogin(login, agent, config = {}) {
  return trustedReviewLoginsForAgent(agent, config).has(normalizeLogin(login));
}

export function isAiReviewRequestMarkerComment(comment, agent, headSha) {
  const login = normalizeLogin(comment?.user?.login);
  if (login !== "github-actions[bot]") return false;
  const marker = extractAiReviewRequestMarker(comment?.body);
  if (!marker) return false;
  return marker.agent === String(agent || "").toLowerCase() && marker.sha === headSha;
}

export function latestAiReviewRequestMarker(comments = [], agent, headSha) {
  return comments
    .map((comment) => {
      const marker = extractAiReviewRequestMarker(comment?.body);
      if (!marker) return null;
      return {
        ...marker,
        commentId: String(comment.id || ""),
        commentCreatedAt: comment.created_at || null,
        author: comment.user?.login || null
      };
    })
    .filter((marker) =>
      marker &&
      normalizeLogin(marker.author) === "github-actions[bot]" &&
      marker.agent === String(agent || "").toLowerCase() &&
      marker.sha === headSha
    )
    .sort((left, right) =>
      Date.parse(right.commentCreatedAt || right.requestedAt || "") -
      Date.parse(left.commentCreatedAt || left.requestedAt || "")
    )[0] || null;
}

export function containsBlockingSeverity(body, agent) {
  const text = String(body || "");
  if (agent === "codex") {
    return /\bP[0-2]\b/.test(text);
  }
  if (agent === "gemini") {
    return /\b(critical|high)\b/i.test(text);
  }
  return false;
}

export function extractCodexPriority(body) {
  const priorities = [...String(body || "").matchAll(/\bP([0-3])\b/gi)].map((match) => Number(match[1]));
  return priorities.length ? Math.min(...priorities) : null;
}

const receiptMarker = "<!-- codex-review-receipt:v1 -->";
const summaryMarker = "<!-- codex-pull-request-review-summary -->";

export function isCodexReviewSignal(body) {
  const text = String(body || "").trim();
  return /^Codex Review:/i.test(text) ||
    text.startsWith("<!-- codex-review-receipt:") ||
    text.startsWith(summaryMarker) || text.startsWith("<!-- codex-review-state:");
}

export function reviewEvidenceTimestamp(comment) {
  return comment?.updated_at || comment?.created_at;
}

function isAfterRequest(comment, requestMarker) {
  const requestedAt = Date.parse(requestMarker?.sourceCommentCreatedAt ||
    requestMarker?.requestedAt || requestMarker?.commentCreatedAt || "");
  const updatedAt = Date.parse(reviewEvidenceTimestamp(comment) || "");
  return Number.isFinite(requestedAt) && Number.isFinite(updatedAt) && updatedAt >= requestedAt;
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function reviewStateIsValid(state) {
  return exactKeys(state, ["commit_sha", "has_any_findings", "has_unresolved_findings", "status"]) &&
    (state.commit_sha === null || (typeof state.commit_sha === "string" && /^[a-f0-9]{40}$/.test(state.commit_sha))) &&
    [null, true, false].includes(state.has_any_findings) &&
    [null, true, false].includes(state.has_unresolved_findings) &&
    [null, "queued", "running", "in_progress", "completed"].includes(state.status) &&
    !(state.has_any_findings === false && state.has_unresolved_findings === true);
}

function withoutCodexFooter(body) {
  if ((body.match(/<details>/g) || []).length > 1 || containsBlockingSeverity(body, "codex") ||
      /unresolved (?:issues|findings)|found (?:some |major )?(?:issues|findings)/i.test(body)) return null;
  return body.replace(/\s*<details>\s*<summary>ℹ️ About Codex in GitHub<\/summary>[\s\S]*<\/details>\s*$/, "").trim();
}

function renderedSummaryAgrees(rendered, state, headSha) {
  const text = withoutCodexFooter(rendered);
  if (text === null) return false;
  if (!text || /^(?:Code review\s*)?(?:Completed\s*)?(?:No (?:major issues|findings)(?: found)?[.!]?|Codex Review: Didn['’]t find any major issues[.!]?)$/i.test(text)) return true;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const introduction = "This comment shows the latest Codex review activity on this pull request.";
  if (lines.shift() !== introduction || lines.shift() !== "| Review | Status | Commit | Review trigger |" ||
      lines.shift() !== "| --- | --- | --- | --- |") return false;
  const expectedReviews = state.security_review.status === null ? ["Code Review"] : ["Code Review", "Security Review"];
  if (lines.length !== expectedReviews.length) return false;
  return lines.every((line, index) => {
    const row = line.match(/^\| (📝|🛡️|🔒) \*\*(Code Review|Security Review)\*\* \| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time> \| `([a-f0-9]{7})` \| (?:Manual request|Automatic review) \|$/);
    return row && row[2] === expectedReviews[index] && (row[2] !== "Code Review" || row[1] === "📝") &&
      row[3] === row[4] && Number.isFinite(Date.parse(row[3])) && row[5] === headSha.slice(0, 7);
  });
}

// Parse a closed schema. Unknown versions, duplicate JSON keys/markers and prose
// cannot silently become a positive verdict. The native summary is mutable.
export function classifyCodexSummaryComment(comment, headSha, requestMarker = null, config = {}) {
  if (!/^[a-f0-9]{40}$/.test(headSha || "") ||
      !isTrustedReviewLogin(comment?.user?.login, "codex", config)) return null;
  const body = String(comment?.body || "").trim();
  if (!isCodexReviewSignal(body)) return null;

  if (body.startsWith(summaryMarker) || body.startsWith("<!-- codex-review-state:")) {
    const match = body.match(/^<!-- codex-pull-request-review-summary -->\s*<!-- codex-review-state:v1 (\{[^\n]+\}) -->\s*## Codex Review Summary(?:\s|$)/);
    if (!match || (body.match(/<!-- codex-/g) || []).length !== 2) return "fail";
    if (match[1].includes("\\")) return "fail";
    let state;
    try { state = JSON.parse(match[1]); } catch { return "fail"; }
    // JSON.parse accepts duplicate keys; count every schema key before parsing
    // can discard an earlier conflicting verdict.
    for (const [key, count] of [["code_review", 1], ["security_review", 1],
      ["commit_sha", 2], ["has_any_findings", 2], ["has_unresolved_findings", 2], ["status", 2]]) {
      if ((match[1].match(new RegExp(`"${key}"\\s*:`, "g")) || []).length !== count) return "fail";
    }
    if (!exactKeys(state, ["code_review", "security_review"]) ||
        !reviewStateIsValid(state.code_review) || !reviewStateIsValid(state.security_review)) return "fail";
    const code = state.code_review;
    if (code.commit_sha !== headSha) return null;
    if (containsBlockingSeverity(body, "codex") || code.has_any_findings === true ||
        code.has_unresolved_findings === true) return "fail";
    if (code.status !== "completed" || code.has_any_findings !== false ||
        code.has_unresolved_findings !== false) return "pending";
    const security = state.security_review;
    const absent = Object.values(security).every((value) => value === null);
    if (!absent && (security.commit_sha !== headSha || security.status !== "completed" ||
        security.has_any_findings !== false || security.has_unresolved_findings !== false)) return "fail";
    // Additional native rendered content may contain findings; require its
    // explicit verdict to agree, rather than trusting a heading or Completed.
    const rendered = body.slice(match[0].length).trim();
    if (!renderedSummaryAgrees(rendered, state, headSha)) return "pending";
    return "pass";
  }

  const reviewedCommits = [...body.matchAll(/^\*\*Reviewed commit:\*\* `([a-f0-9]{10}|[a-f0-9]{40})`$/gm)];
  if (reviewedCommits.length === 1 && ![headSha, headSha.slice(0, 10)].includes(reviewedCommits[0][1])) return null;
  if (reviewedCommits.length > 1) return "fail";
  const receipt = body.startsWith("<!-- codex-review-receipt:");
  let text = body;
  if (receipt) {
    if (!text.startsWith(receiptMarker)) return "fail";
    text = text.slice(receiptMarker.length).trim();
  }
  if (/<!-- codex-/.test(text)) return "fail";
  // Ignore only the official informational footer, never arbitrary details.
  text = withoutCodexFooter(text);
  if (text === null) return "fail";
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (reviewedCommits.length && /(?:here are[\s\S]*suggestions|found (?:some |major |any )?(?:issues|findings)|changes requested|unresolved findings)/i.test(text)) return "fail";
  if (!/^Codex Review: Did(?: not|n['’]t) find any major issues\.(?:\s*(?::rocket:|🚀|Keep it up!))*$/i.test(lines[0] || "")) return "pending";
  const commitLine = lines[1]?.match(/^\*\*Reviewed commit:\*\* `([a-f0-9]{10}|[a-f0-9]{40})`$/);
  if (lines.length > (commitLine ? 2 : 1)) return "fail";
  if (commitLine) return [headSha, headSha.slice(0, 10)].includes(commitLine[1]) ? "pass" : null;
  // New receipts must carry an explicit reviewed commit. Legacy text can use
  // a trusted request plus the caller's no-intervening-push timeline check.
  return !receipt && requestMarker?.agent === "codex" && requestMarker.sha === headSha &&
    isAfterRequest(comment, requestMarker) ? "pass" : null;
}

export function isAcceptableCodexSummaryComment(comment, headSha, requestMarker = null, config = {}) {
  return classifyCodexSummaryComment(comment, headSha, requestMarker, config) === "pass";
}

export function latestCodexSummaryResult(comments, headSha, requestMarker, config = {}, timeline = []) {
  return comments.map((comment) => {
    let result = classifyCodexSummaryComment(comment, headSha, requestMarker, config);
    if (result === "pass" && !isAfterRequest(comment, requestMarker)) result = null;
    const triggerAt = requestMarker?.sourceCommentCreatedAt || requestMarker?.requestedAt || requestMarker?.commentCreatedAt;
    if (result === "pass" && hasHeadUpdateBetweenTimestamps(timeline, triggerAt, reviewEvidenceTimestamp(comment))) result = null;
    return { comment, result };
  }).filter((entry) => entry.result !== null)
    .sort((left, right) => Date.parse(reviewEvidenceTimestamp(right.comment)) - Date.parse(reviewEvidenceTimestamp(left.comment)))[0]?.result || null;
}

export function hasHeadUpdateBetweenTimestamps(timeline = [], startCreatedAt, endCreatedAt) {
  const startTime = Date.parse(startCreatedAt || "");
  const endTime = Date.parse(endCreatedAt || "");
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) return true;
  return timeline.some((event) => {
    if (event.event !== "committed" && event.event !== "head_ref_force_pushed") return false;
    const eventTime = Date.parse(event.created_at || event.committer?.date || "");
    return Number.isFinite(eventTime) && eventTime > startTime && eventTime <= endTime;
  });
}

export function classifyCodexNativeReview(review, reviewComments = [], headSha, config = {}) {
  if (!review) return null;
  if (!headSha || review.commit_id !== headSha) return null;
  const login = normalizeLogin(review.user?.login);
  if (!isTrustedReviewLogin(login, "codex", config)) return null;
  if (containsBlockingSeverity(review.body, "codex")) return "fail";

  if (review.state === "CHANGES_REQUESTED") return "fail";
  if (!["APPROVED", "COMMENTED"].includes(review.state)) return null;

  const commentsForReview = reviewComments.filter((comment) =>
    comment.pull_request_review_id === review.id &&
    isTrustedReviewLogin(comment.user?.login, "codex", config)
  );
  if (commentsForReview.length === 0) return "pass";

  const priorities = commentsForReview.map((comment) => extractCodexPriority(comment.body));
  if (priorities.some((priority) => priority === null)) return "fail";
  return Math.min(...priorities) <= 2 ? "fail" : "pass";
}

export function latestCodexNativeReviewResult(reviews = [], reviewComments = [], headSha, config = {}) {
  return reviews
    .map((review) => ({
      review,
      result: classifyCodexNativeReview(review, reviewComments, headSha, config)
    }))
    .filter((entry) => entry.result !== null)
    .sort((left, right) =>
      Date.parse(right.review.submitted_at || "") - Date.parse(left.review.submitted_at || "")
    )[0]?.result || null;
}

export function isAcceptableNativeReview(review, agent, headSha, config = {}) {
  if (!review) return false;
  if (review.commit_id && headSha && review.commit_id !== headSha) return false;
  const login = normalizeLogin(review.user?.login);
  const body = review.body || "";

  if (agent === "codex") {
    return isTrustedReviewLogin(login, agent, config) &&
      review.state === "APPROVED" &&
      !containsBlockingSeverity(body, agent);
  }

  if (agent === "gemini") {
    return isTrustedReviewLogin(login, agent, config) && !containsBlockingSeverity(body, agent);
  }

  return false;
}

export function isAcceptableClaudeComment(comment, headSha, config = {}) {
  const body = comment?.body || "";
  const login = normalizeLogin(comment?.user?.login);
  if (!isTrustedReviewLogin(login, "claude", config)) return false;
  if (extractMarkerSha(body) !== headSha) return false;
  return extractClaudeOutcome(body) === "pass";
}
