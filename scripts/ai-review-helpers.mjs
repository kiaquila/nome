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

// Project formatting only for visible contradiction checks. Protocol evidence
// continues to use its original bytes and strict grammar.
// HTML5 named whitespace/format entities (standard HTML entity names).
const htmlSpacingEntities = {"ApplyFunction": "\u2061", "InvisibleComma": "\u2063", "InvisibleTimes": "\u2062", "MediumSpace": "\u205f", "NegativeMediumSpace": "\u200b", "NegativeThickSpace": "\u200b", "NegativeThinSpace": "\u200b", "NegativeVeryThinSpace": "\u200b", "NewLine": "\n", "NoBreak": "\u2060", "NonBreakingSpace": "\u00a0", "Tab": "\t", "ThickSpace": "\u205f\u200a", "ThinSpace": "\u2009", "VeryThinSpace": "\u200a", "ZeroWidthSpace": "\u200b", "af": "\u2061", "emsp": "\u2003", "emsp13": "\u2004", "emsp14": "\u2005", "ensp": "\u2002", "hairsp": "\u200a", "ic": "\u2063", "it": "\u2062", "lrm": "\u200e", "nbsp": "\u00a0", "numsp": "\u2007", "puncsp": "\u2008", "rlm": "\u200f", "shy": "\u00ad", "thinsp": "\u2009", "zwj": "\u200d", "zwnj": "\u200c"};
// Only presentation is projected here; machine evidence keeps its original bytes.
function markdownLinkLabels(text) {
  const references = new Set([...text.matchAll(/^ {0,3}\[([^\]\n]+)\]:[ \t]*(?:<[^<>\s]+>|[^\s]+)(?:[ \t]+.*)?$/gm)].map((match) => match[1].trim().replace(/\s+/g, " ").toLowerCase()));
  let result = "";
  for (let index = 0; index < text.length;) {
    if (text[index] !== "[") { result += text[index++]; continue; }
    let labelEnd = index + 1, brackets = 1;
    for (; labelEnd < text.length && brackets; labelEnd++) {
      if (text[labelEnd] === "\\") { labelEnd++; continue; }
      if (text[labelEnd] === "[") brackets++;
      if (text[labelEnd] === "]") brackets--;
    }
    const label = text.slice(index + 1, labelEnd - 1);
    const labelReference = label.trim().replace(/\s+/g, " ").toLowerCase();
    if (!brackets && text[labelEnd] !== "[" && text[labelEnd] !== "(" && references.has(labelReference)) {
      result += label;
      index = labelEnd;
      continue;
    }
    if (!brackets && text[labelEnd] === "[") {
      const referenceEnd = text.indexOf("]", labelEnd + 1);
      const reference = text.slice(labelEnd + 1, referenceEnd).trim().replace(/\s+/g, " ").toLowerCase() || labelReference;
      if (referenceEnd >= 0 && references.has(reference)) {
        result += text.slice(index + 1, labelEnd - 1);
        index = referenceEnd + 1;
        continue;
      }
    }
    if (brackets || text[labelEnd] !== "(") { result += text[index++]; continue; }
    let destinationEnd = labelEnd + 1, parentheses = 1, titleQuote = null;
    for (; destinationEnd < text.length && parentheses; destinationEnd++) {
      if (text[destinationEnd] === "\\") { destinationEnd++; continue; }
      const character = text[destinationEnd];
      if (titleQuote) { if (character === titleQuote) titleQuote = null; continue; }
      if ((character === '"' || character === "'") && /\s/.test(text[destinationEnd - 1])) { titleQuote = character; continue; }
      if (text[destinationEnd] === "(") parentheses++;
      if (text[destinationEnd] === ")") parentheses--;
    }
    const destination = text.slice(labelEnd + 1, destinationEnd - 1);
    if (parentheses || /\\([^\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e])/.test(destination) || !/^(?:<[^<>\s]*>|(?:\\.|[^\s<>])+)(?:\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?\s*$/.test(destination)) { result += text[index++]; continue; }
    result += text.slice(index + 1, labelEnd - 1);
    index = destinationEnd;
  }
  return result;
}

const reviewBlockTags = new Set(["address", "article", "aside", "blockquote", "br", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul"]);
function htmlVisibleText(text, inlineBoundary) {
  let result = "";
  for (let index = 0; index < text.length;) {
    if (text[index] !== "<") { result += text[index++]; continue; }
    if (text.startsWith("<!--", index)) {
      const end = text.indexOf("-->", index + 4);
      index = end < 0 ? text.length : end + 3;
      continue;
    }
    const tag = text.slice(index).match(/^<\/?([a-z][a-z0-9-]*)(?=[\s/>])/i);
    if (!tag) { result += text[index++]; continue; }
    let end = index + tag[0].length, quote = null;
    for (; end < text.length; end++) {
      const character = text[end];
      if (quote) { if (character === quote) quote = null; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (end === text.length) { result += text.slice(index); break; }
    if (tag[1].toLowerCase() === "img") {
      const attributes = text.slice(index + tag[0].length, end);
      const alt = [...attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].find((attribute) => attribute[1].toLowerCase() === "alt");
      if (alt) result += " " + (alt[2] ?? alt[3] ?? alt[4] ?? "") + " ";
    }
    result += reviewBlockTags.has(tag[1].toLowerCase()) ? " " : inlineBoundary;
    index = end + 1;
  }
  return result;
}

function visibleReviewText(body, inlineBoundary = "") {
  // Structural parsing uses raw bytes: entities cannot create quotes, tags or links.
  const commentsRemoved = String(body || "").replace(/<!--[\s\S]*?(?:-->|$)/g,
    (comment) => comment.replace(/[^\r\n]/g, ""));
  const rendered = markdownLinkLabels(htmlVisibleText(commentsRemoved, inlineBoundary));
  return rendered.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (entity, value) => {
    const point = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  }).replace(/&([A-Za-z][A-Za-z0-9]*);/g, (entity, name) => htmlSpacingEntities[name] ?? entity)
    .replace(/\bdo[\s\p{Default_Ignorable_Code_Point}]+not[\s\p{Default_Ignorable_Code_Point}]+merge\b/giu, "Do not merge").replace(/\p{Default_Ignorable_Code_Point}/gu, "").replace(/[*_~`]/g, "").replace(/\s+/g, " ");
}

export function containsBlockingSeverity(body, agent) {
  const text = agent === "codex" ? visibleReviewText(body) : String(body || "");
  if (agent === "codex") {
    return /\bP[0-2]\b|\bdo not merge\b|\bfound (?:some |major |any )?(?:issues|findings)\b|\bsecurity review failed\b|\breview pending\b|\bchanges requested\b/i.test(text) || /\bdo not merge\b/i.test(visibleReviewText(body, " "));
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



function codeCompletionTime(comment) {
  const rows = String(comment?.body || "").split(/\r?\n/).filter((line) => line.startsWith("|") && line.includes("**Code Review**"));
  if (rows.length !== 1) return null;
  const match = rows[0].match(/\| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time> \|/);
  const value = match && match[1] === match[2] ? Date.parse(match[1]) : NaN;
  const edited = Date.parse(comment?.updated_at || comment?.created_at || "");
  return Number.isFinite(value) && Number.isFinite(edited) && value <= edited + 999 ? match[1] : null;
}

export function verdictTime(comment, result, headSha = null, config = {}) {
  {
    const state = validatedTypedState(comment);
    if (state && validFindingCompanions(comment, state, headSha, config)) {
      const clocks = ["code_review", "security_review"].filter((kind) =>
        (headSha === null || state[kind].commit_sha === headSha) &&
        (state[kind].has_any_findings === true || state[kind].has_unresolved_findings === true)
      ).map((kind) => state[kind].status === "completed" && canonicalSectionClear(comment,
        { ...state, [kind]: { ...state[kind], has_any_findings: false, has_unresolved_findings: false } },
        kind, state[kind].commit_sha, config) ? sectionCompletionBucket(comment, kind, state[kind].commit_sha) : NaN);
      if (clocks.length && clocks.every(Number.isFinite)) return new Date(Math.max(...clocks) * 1000).toISOString();
    }
  }

  return ["pass", "neutral"].includes(result) && String(comment?.body || "").trim().startsWith(summaryMarker)
    ? codeCompletionTime(comment) : result === "pass" ? comment?.created_at : comment?.updated_at || comment?.created_at;
}

const receiptMarker = "<!-- codex-review-receipt:v1 -->";
const summaryMarker = "<!-- codex-pull-request-review-summary -->";

export function isCodexReviewSignal(body) {
  const text = String(body || "").trim().replace(/^(?:<!--(?! codex-)[\s\S]*?-->\s*)+/gi, "");
  return /^Codex Review:/i.test(text) ||
    /^<!-- (?:codex-review-receipt:|codex-pull-request-review-summary(?: |-->)|codex-review-state:)/i.test(text);
}

export function reviewEvidenceTimestamp(comment) {
  return comment?.updated_at || comment?.created_at;
}

function isAfterRequest(comment, requestMarker, timestamp = reviewEvidenceTimestamp(comment)) {
  const requestedAt = Date.parse(requestMarker?.sourceCommentCreatedAt ||
    requestMarker?.requestedAt || requestMarker?.commentCreatedAt || "");
  const updatedAt = Date.parse(timestamp || "");
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

function renderedSummaryAgrees(rendered, state, headSha, requestMarker) {
  const text = withoutCodexFooter(rendered);
  if (text === null) return false;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const introduction = "This comment shows the latest Codex review activity on this pull request.";
  if (lines.shift() !== introduction || lines.shift() !== "| Review | Status | Commit | Review trigger |" ||
      lines.shift() !== "| --- | --- | --- | --- |") return false;
  const expectedReviews = state.security_review.status === null ? ["Code Review"] : ["Code Review", "Security Review"];
  if (lines.length !== expectedReviews.length) return false;
  return lines.every((line, index) => {
    const row = line.match(/^\| (📝|🛡️|🔒) \*\*(Code Review|Security Review)\*\* \| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time> \| `([a-f0-9]{7})` \| (?:Manual request|Automatic review) \|$/);
    return row && row[2] === expectedReviews[index] && (row[2] !== "Code Review" || row[1] === "📝") &&
      row[3] === row[4] && Number.isFinite(Date.parse(row[3])) &&
      (row[2] !== "Code Review" || (Number.isFinite(Date.parse(requestMarker?.sourceCommentCreatedAt || requestMarker?.requestedAt || requestMarker?.commentCreatedAt || "")) &&
        Math.floor(Date.parse(row[3]) / 1000) > Math.floor(Date.parse(requestMarker.sourceCommentCreatedAt || requestMarker.requestedAt || requestMarker.commentCreatedAt) / 1000))) && row[5] === headSha.slice(0, 7);
  });
}

// Parse a closed schema. Unknown versions, duplicate JSON keys/markers and prose
// cannot silently become a positive verdict. The native summary is mutable.
export function classifyCodexSummaryComment(comment, headSha, requestMarker = null, config = {}) {
  if (hasIndentedCodexEnvelope(comment?.body)) return null;
  if (!/^[a-f0-9]{40}$/.test(headSha || "") ||
      !isTrustedReviewLogin(comment?.user?.login, "codex", config)) return null;
  const body = String(comment?.body || "").trim();
  if (!isCodexReviewSignal(body)) return null;

  if (body.startsWith(summaryMarker) || body.startsWith("<!-- codex-review-state:")) {
    const match = body.match(/^<!-- codex-pull-request-review-summary -->\s*<!-- codex-review-state:v1 (\{[^\n]+\}) -->\s*## Codex Review Summary(?:\s|$)/);
    if (!match || codexProtocolMarkerCount(body) !== 2) return "fail";
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
    const security = state.security_review;
    const absent = Object.values(security).every((value) => value === null);
    const rendered = body.slice(match[0].length).trim();
    if (code.status !== "completed") return "pending";
    if (code.has_any_findings !== false || code.has_unresolved_findings !== false) {
      // Native non-review replies can set Completed with null findings flags.
      // This is no verdict: it cannot pass alone or erase a valid receipt.
      // Keep a distinct signal so completion recovery retains its edit time.
      return absent && renderedSummaryAgrees(rendered, state, headSha, requestMarker) ? "neutral" : "pending";
    }
    if (!absent && (security.commit_sha !== headSha || security.status !== "completed" ||
        security.has_any_findings !== false || security.has_unresolved_findings !== false)) return "fail";
    // Additional native rendered content may contain findings; require its
    // explicit verdict to agree, rather than trusting a heading or Completed.
    if (!renderedSummaryAgrees(rendered, state, headSha, requestMarker)) return canonicalTypedRowsAgree(comment, state, headSha) ? "neutral" : "pending";
    return codeCompletionTime(comment) ? "pass" : "pending";
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
  if (!/^Codex Review: Did(?: not|n['’]t) find any major issues\.(?:\s*(?::rocket:|🚀|:\+1:|👍|Keep it up!|Breezy!|Already looking forward to the next diff\.))*$/i.test(lines[0] || "")) return "pending";
  const commitLine = lines[1]?.match(/^\*\*Reviewed commit:\*\* `([a-f0-9]{10}|[a-f0-9]{40})`$/);
  if (lines.length > (commitLine ? 2 : 1)) return "fail";
  if (commitLine) return [headSha, headSha.slice(0, 10)].includes(commitLine[1]) ? "pass" : null;
  // New receipts must carry an explicit reviewed commit. Legacy text can use
  // a trusted request plus the caller's no-intervening-push timeline check.
  return !receipt && requestMarker?.agent === "codex" && requestMarker.sha === headSha &&
    isAfterRequest(comment, requestMarker, comment?.created_at) ? "pass" : null;
}

export function isAcceptableCodexSummaryComment(comment, headSha, requestMarker = null, config = {}) {
  return classifyCodexSummaryComment(comment, headSha, requestMarker, config) === "pass";
}

export function latestCodexSummaryResult(comments, headSha, requestMarker, config = {}, timeline = []) {
  return comments.map((comment) => {
    let result = classifyCodexSummaryComment(comment, headSha, requestMarker, config);
    const unrecognized = result === null;
    // Historical observations cannot veto a new request; validated finding
    // history is retained independently until its own section is cleared.
    if (result !== "pass" && !isAfterRequest(comment, requestMarker) &&
        !(result === "fail" && hasCurrentHeadTypedFinding(comment, headSha) &&
          hasUnclearedTypedFindings(comments, headSha, requestMarker, config))) result = null;
    if (result === "fail" && hasCurrentHeadTypedFinding(comment, headSha) &&
        validFindingCompanions(comment, validatedTypedState(comment), headSha, config, true) &&
        !hasUnclearedTypedFindings(comments, headSha, requestMarker, config)) result = "neutral";
    if (result === "pass" && !isAfterRequest(comment, requestMarker, verdictTime(comment, result, headSha, config))) result = null;
    const triggerAt = requestMarker?.sourceCommentCreatedAt || requestMarker?.requestedAt || requestMarker?.commentCreatedAt;
    if (result === "pass" && hasHeadUpdateBetweenTimestamps(timeline, triggerAt, reviewEvidenceTimestamp(comment))) result = null;
    if (unrecognized && isTrustedReviewLogin(comment?.user?.login, "codex", config) &&
        isCodexReviewSignal(comment?.body) && isAfterRequest(comment, requestMarker)) result = "pending";
    return { comment, result, time: verdictTime(comment, result, headSha, config) };
  }).filter((entry) => entry.result !== null && entry.result !== "neutral")
    .sort((left, right) => Math.floor(Date.parse(right.time) / 1000) - Math.floor(Date.parse(left.time) / 1000) ||
      ({ fail: 3, pending: 2, pass: 1 }[right.result] || 0) - ({ fail: 3, pending: 2, pass: 1 }[left.result] || 0))[0]?.result || null;
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


function validatedTypedState(comment) {
  if (hasIndentedCodexEnvelope(comment?.body)) return null;
  const body = String(comment?.body || "").trim().replace(/<!--(?! codex-)[\s\S]*?-->/gi, "").trim().replace(/^<!-- codex-pull-request-review-summary -->\s*/, "");
  if (codexProtocolMarkerCount(body) !== 1) return null;
  const match = body.match(/^<!-- codex-review-state:v1 (\{[\s\S]*?\}) -->/);
  if (!match || match[1].includes("\\")) return null;
  for (const [key, count] of [["code_review", 1], ["security_review", 1],
    ["commit_sha", 2], ["has_any_findings", 2], ["has_unresolved_findings", 2], ["status", 2]]) {
    if ((match[1].match(new RegExp(`"${key}"\\s*:`, "g")) || []).length !== count) return null;
  }
  let state;
  try { state = JSON.parse(match[1]); } catch { return null; }
  if (!exactKeys(state, ["code_review", "security_review"]) ||
      !reviewStateIsValid(state.code_review) || !reviewStateIsValid(state.security_review)) return null;
  return state;
}


export function hasCurrentHeadTypedFinding(comment, headSha) {
  const state = leadingNegativeState(comment);
  return !!state && Object.values(state).some((review) => review.commit_sha === headSha &&
    (review.has_any_findings === true || review.has_unresolved_findings === true));
}

// Negative facts belong to the canonical leading envelope. Later finding
// presentation cannot erase them; approval and resolution still parse the full body.
function leadingNegativeState(comment) {
  if (hasIndentedCodexEnvelope(comment?.body)) return null;
  const body = String(comment?.body || "").trim().replace(/<!--(?! codex-)[\s\S]*?-->/gi, "").trim();
  const match = body.match(/^(?:<!-- codex-pull-request-review-summary -->\s*)?<!-- codex-review-state:v1 .*? -->\s*## Codex Review Summary(?:\r?\n|$)/s);
  return match ? validatedTypedState({ ...comment, body: match[0] }) : null;
}

export function hasUnclearedTypedFindings(comments, headSha, requestMarker, config = {}) {
  const evidence = comments.filter((comment) => isTrustedReviewLogin(comment.user?.login, "codex", config))
    .map((comment) => ({ comment, state: leadingNegativeState(comment) })).filter((entry) => entry.state);
  return evidence.some(({ comment, state }) => ["code_review", "security_review"].some((kind) => {
    const finding = state[kind];
    if (finding.commit_sha !== headSha || !(finding.has_any_findings || finding.has_unresolved_findings)) return false;
    const sectionTime = state[kind].status === "completed" && canonicalSectionClear(comment,
      { ...state, [kind]: { ...state[kind], has_any_findings: false, has_unresolved_findings: false } },
      kind, headSha, config, false) ? sectionCompletionBucket(comment, kind, headSha) : NaN;
    const findingAt = Number.isFinite(sectionTime) ? sectionTime : Math.floor(Date.parse(comment.updated_at || comment.created_at || "") / 1000);
    return !evidence.some((clean) => {
      const next = clean.state[kind];
      return next.commit_sha === headSha && next.status === "completed" && next.has_any_findings === false &&
        next.has_unresolved_findings === false && canonicalSectionClear(clean.comment, clean.state, kind, headSha, config) && sectionCompletionBucket(clean.comment, kind, headSha) > findingAt;
    });
  }));
}


// Ambiguous rendered table rows invalidate clocks; they never grant evidence.
function isReviewRowCandidate(line, title) {
  return line.includes("|") && visibleReviewText(line).toLowerCase().includes(title.replaceAll("*", "").toLowerCase());
}

function sectionCompletionBucket(comment, kind, headSha = null) {
  const title = kind === "security_review" ? "**Security Review**" : "**Code Review**";
  const rows = String(comment.body || "").split(/\r?\n/).filter((line) => isReviewRowCandidate(line, title));
  if (rows.length !== 1) return NaN;
  const cells = rows[0].split("|").map((cell) => cell.trim());
  const label = kind === "security_review" ? /^(?:🛡️|🔒) \*\*Security Review\*\*$/ : /^📝 \*\*Code Review\*\*$/;
  if (cells.length !== 6 || !label.test(cells[1]) || cells[5] !== "" ||
      !["Manual request", "Automatic review"].includes(cells[4]) ||
      (headSha && cells[3] !== "`" + headSha.slice(0, 7) + "`")) return NaN;
  const match = rows[0].match(/\| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time> \|/);
  const value = match && match[1] === match[2] ? Date.parse(match[1]) : NaN;
  const updated = Date.parse(comment.updated_at || comment.created_at || "");
  return Number.isFinite(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(match[1]) &&
    new Date(value).toISOString().slice(0, 19) === match[1].slice(0, 19) &&
    value <= updated + 999 ? Math.floor(value / 1000) : NaN;
}


function canonicalTypedRowsAgree(comment, state, headSha) {
  if (!state || Object.values(state).some((review) => review.status !== null &&
      (review.status !== "completed" || review.commit_sha !== headSha))) return false;
  const body = String(comment.body || "").trim();
  const match = body.match(/^<!-- codex-pull-request-review-summary -->\s*<!-- codex-review-state:v1 (\{[^\n]+\}) -->\s*## Codex Review Summary(?:\s|$)/);
  return !!match && renderedSummaryAgrees(body.slice(match[0].length).trim(), state, headSha,
    { requestedAt: "1970-01-01T00:00:00Z" });
}


function canonicalSectionClear(comment, state, kind, headSha, config, validateCompanion = true) {
  const other = kind === "code_review" ? "security_review" : "code_review";
  const otherTitle = other === "security_review" ? "**Security Review**" : "**Code Review**";
  const otherRows = String(comment.body || "").split(/\r?\n/).filter((line) => isReviewRowCandidate(line, otherTitle));
  if (validateCompanion && (otherRows.length > 1 || (otherRows.length === 1 && !removableCompanionRow(comment, state[other], other, otherRows[0])))) return false;
  const target = kind === "security_review" ? "**Security Review**" : "**Code Review**";
  const absent = { commit_sha: null, has_any_findings: null, has_unresolved_findings: null, status: null };
  const body = String(comment.body || "").trim();
  const projected = body.replace(/<!-- codex-review-state:v1 .*? -->/s,
    "<!-- codex-review-state:v1 " + JSON.stringify({ code_review: state[kind], security_review: absent }) + " -->")
    .split(/\r?\n/).filter((line) => !line.startsWith("|") ||
      (!line.includes("**Code Review**") && !line.includes("**Security Review**")) || line.includes(target))
    .map((line) => line.includes(target) && kind === "security_review"
      ? line.replace(/(?:🛡️|🔒) \*\*Security Review\*\*/, "📝 **Code Review**") : line).join("\n");
  return classifyCodexSummaryComment({ ...comment, body: projected }, headSha,
    { requestedAt: "1970-01-01T00:00:00Z" }, config) === "pass";
}


// A resolved own-section finding cannot erase a newer invalid companion.
function validFindingCompanions(comment, state, headSha, config = {}, allowResolvedOwn = false) {
  if (!state) return false;
  return Object.entries(state).every(([kind, review]) => {
    const title = kind === "security_review" ? "**Security Review**" : "**Code Review**";
    if (Object.values(review).every((value) => value === null)) return !String(comment.body || "").split(/\r?\n/).some((line) => isReviewRowCandidate(line, title));
    if (review.status !== "completed") return false;
    if (allowResolvedOwn && review.commit_sha === headSha && (review.has_any_findings || review.has_unresolved_findings)) return true;
    return canonicalSectionClear(comment, { ...state, [kind]: { ...review, has_any_findings: false, has_unresolved_findings: false } }, kind, review.commit_sha, config, false);
  });
}


function hasIndentedCodexEnvelope(body) {
  const leading = String(body || "").replace(/[^\S \t\r\n]/g, "").match(/^(?:[ \t\r\n]*<!--[\s\S]*?-->)*[ \t\r\n]*/)?.[0] || "";
  const heading = String(body || "").replace(/[^\S \t\r\n]/g, "").replace(/<!--(?! codex-)[^\r\n]*?-->/gi, "").split(/\r?\n/).find((line) => /^[ \t]*## Codex Review Summary(?:\s|$)/.test(line));
  return /^(?: {4,}|[ \t]*\t[ \t]*)<!-- codex-/im.test(leading) ||
    /^(?: {4,}|[ \t]*\t)/.test(heading || "");
}

function removableCompanionRow(comment, review, kind, row) {
  if (!review?.commit_sha) return false;
  const cells = row.split("|").map((cell) => cell.trim());
  const label = kind === "security_review" ? /^(?:🛡️|🔒) \*\*Security Review\*\*$/ : /^📝 \*\*Code Review\*\*$/;
  if (cells.length !== 6 || !label.test(cells[1]) || cells[3] !== "`" + review.commit_sha.slice(0, 7) + "`" ||
      !["Manual request", "Automatic review"].includes(cells[4])) return false;
  if (review.status === "completed") return /^✅ \*\*Completed\*\* /.test(cells[2]) &&
    Number.isFinite(sectionCompletionBucket(comment, kind, review.commit_sha));
  if (!["running", "in_progress"].includes(review.status)) return false;
  const match = cells[2].match(/^🔄 \*\*Running\*\* since <relative-time datetime="([^"]+)">([^<]+)<\/relative-time>$/);
  const time = match && match[1] === match[2] ? Date.parse(match[1]) : NaN;
  return Number.isFinite(time) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(match[1]) &&
    new Date(time).toISOString().slice(0, 19) === match[1].slice(0, 19) &&
    time <= Date.parse(comment.updated_at || comment.created_at || "") + 999;
}


function codexProtocolMarkerCount(body) {
  return (String(body || "").split(/\r?\n/).filter((line) =>
    !/^(?: {4,}|[ \t]*\t)/.test(line)).join("\n").match(/<!-- codex-/gi) || []).length;
}
