import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import {
  classifyCodexSummaryComment as classifyReceipt, latestCodexSummaryResult as selectSummary,
  classifyCodexSummaryComment, isAcceptableCodexSummaryComment,
  latestCodexSummaryResult, classifyCodexNativeReview,
  createAiReviewRequestMarkerBody
} from "../scripts/ai-review-helpers.mjs";
import { evaluateAiReviewEvidence } from "../scripts/ai-review-evidence.mjs";
import { shouldRouteAiReviewRerunEvent, selectAiReviewRun, rerunAiReviewForPrHead, latestAiReviewSignalTimestamp, resolvePullContext } from "../scripts/ai-review-rerun.mjs";

const head = "2667f79cd7676ff331730cabf661d38dbbcddb0d";
const other = "a".repeat(40);
const before = "2026-10-15T00:00:00Z";
const requested = "2026-10-15T01:00:00Z";
const after = "2026-10-15T02:00:00Z";
const later = "2026-10-15T03:00:00Z";
const user = { login: "chatgpt-codex-connector[bot]", type: "Bot" };
const marker = { agent: "codex", sha: head, sourceCommentCreatedAt: requested };
const legacy = "Codex Review: Didn't find any major issues. :rocket:";
const receipt = `<!-- codex-review-receipt:v1 -->\n\n${legacy}\n\n**Reviewed commit:** \`${head.slice(0, 10)}\``;
const comment = (body, extra = {}) => ({ id: 7, body, user, created_at: after, updated_at: after, ...extra });
const absent = { commit_sha: null, has_any_findings: null, has_unresolved_findings: null, status: null };
const completed = { commit_sha: head, has_any_findings: false, has_unresolved_findings: false, status: "completed" };
const summary = (code = {}, security = absent, rendered = `This comment shows the latest Codex review activity on this pull request.

| Review | Status | Commit | Review trigger |
| --- | --- | --- | --- |
| 📝 **Code Review** | ✅ **Completed** <relative-time datetime="2026-10-15T02:00:00Z">2026-10-15T02:00:00Z</relative-time> | \`${head.slice(0, 7)}\` | Manual request |`) => `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { ...completed, ...code }, security_review: security })} -->\n\n## Codex Review Summary\n${rendered}`;
const classify = (body, extra = {}) => classifyCodexSummaryComment(comment(body, extra), head, marker);

test("real receipt, legacy, curly apostrophe and official footer pass", () => {
  assert.equal(classify(receipt), "pass");
  assert.equal(classify(legacy), "pass");
  assert.equal(classify(receipt.replace("Didn't", "Didn’t")), "pass");
  for (const closing of [":+1:", "👍", "Breezy!", "Already looking forward to the next diff."]) {
    assert.equal(classify(receipt.replace(":rocket:", closing)), "pass", closing);
    assert.notEqual(classify(receipt.replace(":rocket:", `${closing} P2 remains`)), "pass");
  }
  assert.equal(classify(receipt.replace(":rocket:", "Keep it up!") + '\n\n<details> <summary>ℹ️ About Codex in GitHub</summary>\n<br/>\nReviews are triggered when you comment "@codex review".\n</details>'), "pass");
  assert.equal(isAcceptableCodexSummaryComment(comment(legacy), head), false);
});

test("receipts require an unambiguous explicit reviewed SHA and trusted identity", () => {
  for (const body of [receipt.replace(head.slice(0, 10), other), receipt.replace(head.slice(0, 10), head.slice(0, 7)), receipt.replace(/\*\*Reviewed commit:[\s\S]*/, ""), receipt + `\n${head}`]) {
    assert.notEqual(classify(body), "pass", body);
  }
  assert.equal(classify(receipt.replace(head.slice(0, 10), head)), "pass");
  assert.equal(classify(receipt, { user: { login: "codex[bot]", type: "Bot" } }), null);
  assert.equal(classifyCodexSummaryComment(comment(receipt), "", marker), null);
  assert.notEqual(classify(receipt.replace(head.slice(0, 10), other), { created_at: later }), "pass");
});

test("malformed/duplicate receipt markers and contradictory prose fail closed", () => {
  for (const body of [receipt.replace(":v1", ":v2"), receipt + "\n<!-- codex-review-receipt:v1 -->", receipt + "\nP2: a bug remains", receipt + "\nFound an issue", receipt + "\n<details>Findings remain</details>", receipt + "\n<details><summary>ℹ️ About Codex in GitHub</summary>P2 finding</details>", receipt.replace("Didn't find any", "Found")]) {
    assert.notEqual(classify(body), "pass", body);
  }
});

test("structured state requires a typed complete full-head explicit verdict", () => {
  assert.equal(classify(summary()), "pass");
  assert.equal(classify(summary({}, completed)), "pending"); // Both completed review rows are required.
  for (const code of [ { commit_sha: other }, { commit_sha: head.slice(0, 10) }, { commit_sha: null }, { status: "in_progress" }, { status: "Completed" }, { has_any_findings: null }, { has_unresolved_findings: null }, { has_any_findings: "false" }, { has_any_findings: true }, { has_unresolved_findings: true }, { unexpected: false } ]) {
    assert.notEqual(classify(summary(code)), "pass", JSON.stringify(code));
  }
  assert.notEqual(classify(summary({}, { ...completed, has_any_findings: true })), "pass");
  assert.notEqual(classify(summary({}, { ...absent, status: "in_progress" })), "pass");
  assert.notEqual(classify(summary({}, absent, "P2 issue remains")), "pass");
  assert.notEqual(classify(summary({}, absent, "Completed 👍")), "pass");
  assert.notEqual(classify(summary({}, absent, "There are unresolved findings")), "pass");
});

test("observed native summary table agrees with the structured verdict, including edits", () => {
  const rendered = `This comment shows the latest Codex review activity on this pull request.

| Review | Status | Commit | Review trigger |
| --- | --- | --- | --- |
| 📝 **Code Review** | ✅ **Completed** <relative-time datetime="2026-10-15T01:49:22.023292Z">2026-10-15T01:49:22.023292Z</relative-time> | \`${head.slice(0, 7)}\` | Manual request |

<details> <summary>ℹ️ About Codex in GitHub</summary>
<br/>
[Your team has set up Codex to review pull requests in this repo](https://chatgpt.com/codex/cloud/settings/general). Reviews are triggered when you
- Open a pull request for review
- Mark a draft as ready
- Comment "@codex review" or "@codex security review".

Codex reacts with 👀 while any review is running, comments if it has suggestions, and reacts with 👍 once all reviews finish with no findings.
</details>`;
  assert.equal(classify(summary({}, absent, rendered)), "pass");
  assert.equal(classify(summary({ has_any_findings: null, has_unresolved_findings: null }, absent, rendered)), "neutral");
  assert.equal(latestCodexSummaryResult([comment(summary({}, absent, rendered), { created_at: before, updated_at: after })], head, marker), "pass");
  assert.notEqual(classify(summary({}, absent, rendered.replace("**Completed**", "**Running**"))), "pass");
  assert.notEqual(classify(summary({}, absent, rendered.replace("📝 **Code Review**", "Unresolved findings **Code Review**"))), "pass");
  assert.notEqual(classify(summary({}, absent, rendered.replace(head.slice(0, 7), other.slice(0, 7)))), "pass");
  assert.notEqual(classify(summary({ status: "running", has_any_findings: null, has_unresolved_findings: null }, absent, rendered)), "pass");
  assert.notEqual(classify(summary({ has_any_findings: true }, absent, rendered)), "pass");
});

test("duplicate/malformed/escaped JSON keys and state markers cannot conceal conflicts", () => {
  for (const body of [summary().replace('"has_any_findings":false', '"has_any_findings":true,"has_any_findings":false'), summary().replace('"status":"completed"', '"status":"in_progress","statu\\u0073":"completed"'), summary().replace('"code_review":', '"code_review":null,"code_review":'), summary().replace(':v1', ':v2'), summary().replace('"status":', '"status"'), summary() + "\n<!-- codex-review-state:v1 {} -->", summary().replace("<!-- codex-pull-request-review-summary -->", "")]) {
    assert.notEqual(classify(body), "pass", body);
  }
});

test("latest mutable summary uses updated_at and retains negative evidence across requests", () => {
  const updated = comment(summary(), { created_at: before, updated_at: later });
  assert.equal(latestCodexSummaryResult([updated], head, marker), "pass");
  assert.equal(latestCodexSummaryResult([comment(receipt), comment(summary({ has_any_findings: true }), { created_at: before, updated_at: later })], head, marker), "fail");
  assert.equal(latestCodexSummaryResult([comment(summary({ has_any_findings: true }), { updated_at: before })], head, marker), "fail");
  assert.equal(latestCodexSummaryResult([comment(summary(), { created_at: before, updated_at: before })], head, marker), "pending");
  assert.equal(latestCodexSummaryResult([updated], head, marker, {}, [{ event: "committed", created_at: after }]), null);
});

const formal = (extra = {}) => ({ id: 99, user, commit_id: head, state: "COMMENTED", submitted_at: after, body: "", ...extra });
test("native formal reviews retain priorities, require exact SHA and trusted identity", () => {
  assert.equal(classifyCodexNativeReview(formal(), [], head), "pass");
  assert.equal(classifyCodexNativeReview(formal({ state: "APPROVED" }), [], head), "pass");
  for (const priority of [0, 1, 2, 3, null]) {
    const comments = [{ user, pull_request_review_id: 99, body: priority === null ? "unclassified finding" : `[P${priority}] finding` }];
    assert.equal(classifyCodexNativeReview(formal(), comments, head), priority === 3 ? "pass" : "fail");
  }
  for (const commit_id of [other, undefined, ""]) assert.equal(classifyCodexNativeReview(formal({ commit_id }), [], head), null);
  assert.equal(classifyCodexNativeReview(formal({ user: { login: "attacker" } }), [], head), null);
  assert.equal(classifyCodexNativeReview(formal({ state: "CHANGES_REQUESTED" }), [], head), "fail");
  assert.equal(classifyCodexNativeReview(formal({ state: "APPROVED" }), [{ user, pull_request_review_id: 99, body: "P3 and P1 findings" }], head), "fail");
});

const markerComment = comment(createAiReviewRequestMarkerBody({ agent: "codex", headSha: head, requestId: "test", sourceCommentId: "1", sourceCommentCreatedAt: requested, requestedAt: requested }), { user: { login: "github-actions[bot]" }, created_at: requested });
function evidenceApi({ comments = [markerComment, comment(receipt)], reviews = [], inline = [], threads = [], moveAt = Infinity, graphError = false, timeline = [] } = {}) {
  let pulls = 0;
  const paths = [];
  const request = async (path) => {
    paths.push(path);
    if (path === "/graphql") return graphError ? { errors: [{ message: "denied" }] } : { data: { repository: { pullRequest: { reviewThreads: { nodes: threads, pageInfo: { hasNextPage: false } } } } } };
    if (path === "/repos/o/r/pulls/1") return { head: { sha: ++pulls >= moveAt ? other : head } };
    if (path.includes("/issues/1/comments?")) return comments;
    if (path.includes("/pulls/1/reviews?")) return reviews;
    if (path.includes("/pulls/1/comments?")) return inline;
    if (path.includes("/timeline?")) return timeline;
    throw new Error(`Unexpected path ${path}`);
  };
  return { request, paths };
}
const evaluate = (api, agent = "codex") => evaluateAiReviewEvidence({ request: api.request, repository: "o/r", prNumber: 1, headSha: head, agent });
test("actual gate evaluator accepts receipts and updated state, requires request and resolved threads", async () => {
  assert.equal(await evaluate(evidenceApi()), "pass");
  const nativeReceipt = comment(receipt.replace(":rocket:", "Already looking forward to the next diff."));
  const indeterminateCompletion = comment(summary({ has_any_findings: null, has_unresolved_findings: null }), { updated_at: later });
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, nativeReceipt, indeterminateCompletion] })), "pass");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, indeterminateCompletion] })), "pending");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, nativeReceipt, comment(summary({ status: "running", has_any_findings: null, has_unresolved_findings: null }), { updated_at: later })] })), "pending");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, comment(summary(), { created_at: before, updated_at: after })] })), "pass");
  assert.equal(await evaluate(evidenceApi({ comments: [comment(receipt)] })), "missing_marker");
  assert.equal(await evaluate(evidenceApi({ threads: [{ isResolved: false }] })), "fail");
  assert.equal(await evaluate(evidenceApi({ threads: [{ isResolved: true }] })), "pass");
  assert.equal(await evaluate(evidenceApi({ reviews: [formal({ state: "CHANGES_REQUESTED", submitted_at: before })] })), "fail");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment], reviews: [formal()] })), "pass");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment], reviews: [formal({ submitted_at: before })] })), "pending");
  await assert.rejects(evaluate(evidenceApi({ graphError: true })), /thread resolution/);
});

test("native failures persist while newer explicit typed completion clears typed history", async () => {
  assert.equal(await evaluate(evidenceApi({ reviews: [formal({ state: "CHANGES_REQUESTED", submitted_at: before }), formal({ id: 100, submitted_at: later })] })), "fail");
  assert.equal(await evaluate(evidenceApi({ reviews: [formal({ body: "P1 issue", submitted_at: before }), formal({ id: 100, state: "APPROVED", submitted_at: later })] })), "fail");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, comment(summary({ has_any_findings: true }), { created_at: before, updated_at: before }), comment(summary(), { updated_at: later })] })), "pass");
  assert.equal(await evaluate(evidenceApi({ reviews: [formal({ state: "CHANGES_REQUESTED", commit_id: other, submitted_at: before })] })), "pass");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, comment(summary({ commit_sha: other, has_any_findings: true })), comment(receipt)] })), "pending");
  const negativeReceipt = receipt.replace(legacy, "Codex Review: Found major issues.");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, comment(negativeReceipt, { updated_at: before }), comment(receipt)] })), "fail");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, comment(negativeReceipt.replace(head.slice(0, 10), other.slice(0, 10))), comment(receipt)] })), "pending");
});

test("unresolved threads and GraphQL failures block every selected review agent", async () => {
  for (const agent of ["claude", "gemini"]) {
    const requestComment = comment(createAiReviewRequestMarkerBody({ agent, headSha: head, requestId: "alternate", sourceCommentId: "1", sourceCommentCreatedAt: requested, requestedAt: requested }), { user: { login: "github-actions[bot]" }, created_at: requested });
    const comments = [requestComment];
    const reviews = [];
    if (agent === "claude") comments.push(comment(`AI_REVIEW_SHA: ${head}\nAI_REVIEW_OUTCOME: pass`, { user: { login: "claude[bot]" } }));
    else reviews.push(formal({ user: { login: "gemini-code-assist[bot]" } }));
    assert.equal(await evaluate(evidenceApi({ comments, reviews }), agent), "pass");
    assert.equal(await evaluate(evidenceApi({ comments, reviews, threads: [{ isResolved: false }] }), agent), "fail");
    await assert.rejects(evaluate(evidenceApi({ comments, reviews, graphError: true }), agent), /thread resolution/);
  }
});

test("push during evidence retrieval fails the old exact-head gate", async () => {
  assert.equal(await evaluate(evidenceApi({ moveAt: 1 })), "stale");
  assert.equal(await evaluate(evidenceApi({ moveAt: 2 })), "stale");
  assert.equal(await evaluate(evidenceApi({ timeline: [{ event: "head_ref_force_pushed", created_at: after }] })), "pending");
});

test("unresolved threads on a later GraphQL page and API errors fail closed", async () => {
  const api = evidenceApi();
  let count = 0;
  const baseRequest = api.request;
  api.request = async (path, options) => {
    if (path !== "/graphql") return baseRequest(path, options);
    const variables = JSON.parse(options.body).variables;
    const second = ++count === 2;
    assert.equal(variables.cursor, second ? "page2" : null);
    return { data: { repository: { pullRequest: { reviewThreads: { nodes: [{ isResolved: !second }], pageInfo: { hasNextPage: !second, endCursor: "page2" } } } } } };
  };
  assert.equal(await evaluate(api), "fail");
});

// Exercise the workflow's actual if expression; checking text fragments alone
// would miss a new marker added to a branch the workflow never evaluates.
const workflow = readFileSync(new URL("../.github/workflows/ai-review-rerun.yml", import.meta.url), "utf8");
const expression = workflow.match(/    if: \|\n([\s\S]*?)    runs-on:/)[1].trim();
const workflowRoutes = (eventName, event) => Function("github", "startsWith", "contains", `return (${expression});`)({ event_name: eventName, event }, (a, b) => String(a || "").startsWith(b), (a, b) => String(a || "").includes(b));
test("actual workflow filter and router handle created/edited legacy, receipt and summary", () => {
  assert.match(workflow, /types: \[created, edited\]/);
  for (const content of [workflow, readFileSync(new URL("../.github/workflows/ai-command-policy.yml", import.meta.url), "utf8")]) {
    assert.match(content, /group: ai-review-requeue-\$\{\{ github.repository \}\}/);
    assert.match(content, /cancel-in-progress: false\n      queue: max/);
  }
  for (const action of ["created", "edited"]) for (const body of [legacy, receipt, summary()]) {
    const event = { action, issue: { number: 1, pull_request: {} }, comment: comment(body) };
    assert.equal(Boolean(workflowRoutes("issue_comment", event)), true);
    assert.equal(shouldRouteAiReviewRerunEvent(event), true);
    assert.equal(shouldRouteAiReviewRerunEvent({ ...event, comment: comment(body, { user: { login: "attacker", type: "Bot" } }) }), false);
  }
  assert.equal(shouldRouteAiReviewRerunEvent({ action: "deleted", issue: { pull_request: {} }, comment: comment(receipt) }), false);
  assert.equal(shouldRouteAiReviewRerunEvent({ issue: {}, comment: comment(receipt) }), false);
  assert.equal(shouldRouteAiReviewRerunEvent({ issue: { pull_request: {} }, comment: comment("👍 Completed") }), false);
  const event = { action: "submitted", pull_request: { number: 1 }, review: formal() };
  assert.equal(Boolean(workflowRoutes("pull_request_review", event)), true);
  assert.equal(shouldRouteAiReviewRerunEvent(event), true);
});

const run = (extra = {}) => ({ id: 1, event: "pull_request", head_sha: head, status: "completed", conclusion: "failure", created_at: before, run_started_at: requested, ...extra });
test("run selection uses newest matching run, signals and attempt start for deduplication", () => {
  assert.equal(selectAiReviewRun([run()], head, after).action, "rerun");
  assert.equal(selectAiReviewRun([run({ status: "in_progress" })], head, after).action, "already_running");
  const success = run({ id: 2, created_at: after, run_started_at: later, conclusion: "success" });
  assert.equal(selectAiReviewRun([run(), success], head, after).action, "already_evaluated");
  assert.equal(selectAiReviewRun([run({ head_sha: other })], head, after).action, "not_found");
  assert.equal(selectAiReviewRun([run({ conclusion: "success" })], head, after).action, "rerun");
  assert.equal(selectAiReviewRun([run({ conclusion: "success" })], head).action, "already_success");
  assert.equal(selectAiReviewRun([run({ run_started_at: later })], head, after).action, "already_evaluated");
});

test("active run completion requeues once; a duplicate signal and a new push never requeue", async () => {
  const calls = [];
  let active = true;
  const request = async (_token, _repo, path, options) => {
    calls.push({ path, method: options?.method });
    if (path.endsWith("/pulls/1")) return { head: { sha: head } };
    if (path.includes("/runs?")) return { workflow_runs: [run({ status: active ? "in_progress" : "completed" })] };
    if (path.endsWith("/rerun")) return null;
    throw new Error(path);
  };
  const args = { token: "test", repository: "o/r", headSha: head, prNumber: 1, evidenceAt: after, request };
  assert.equal((await rerunAiReviewForPrHead(args)).action, "already_running");
  active = false;
  assert.equal((await rerunAiReviewForPrHead(args)).action, "rerun");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  const duplicate = async (_token, _repo, path) => path.endsWith("/pulls/1") ? { head: { sha: head } } : { workflow_runs: [run({ run_started_at: later })] };
  assert.equal((await rerunAiReviewForPrHead({ ...args, request: duplicate })).action, "already_evaluated");
  let pullCount = 0;
  const moved = async (_token, _repo, path) => path.endsWith("/pulls/1") ? { head: { sha: ++pullCount === 1 ? head : other } } : { workflow_runs: [run()] };
  assert.equal((await rerunAiReviewForPrHead({ ...args, request: moved })).action, "stale");
});

test("completion events recover active-window signals once and keep the workflow filter aligned", () => {
  assert.match(workflow, /workflow_run:\n    workflows: \[AI Review\]\n    types: \[completed\]/);
  const event = { action: "completed", workflow_run: { id: 1, event: "pull_request", path: ".github/workflows/ai-review.yml", status: "completed", head_sha: head, pull_requests: [{ number: 1 }] } };
  assert.equal(Boolean(workflowRoutes("workflow_run", event)), true);
  assert.equal(shouldRouteAiReviewRerunEvent(event), true);
  const qualified = { ...event, workflow_run: { ...event.workflow_run, path: ".github/workflows/ai-review.yml@main" } };
  assert.equal(Boolean(workflowRoutes("workflow_run", qualified)), true);
  assert.equal(shouldRouteAiReviewRerunEvent(qualified), true);
  assert.equal(shouldRouteAiReviewRerunEvent({ ...event, workflow_run: { ...event.workflow_run, path: ".github/workflows/attacker.yml" } }), false);
  assert.equal(shouldRouteAiReviewRerunEvent({ ...event, workflow_run: { ...event.workflow_run, event: "workflow_dispatch" } }), false);
  const signal = latestAiReviewSignalTimestamp([markerComment, comment(receipt)], [], "codex", head);
  assert.equal(signal, after);
  assert.equal(selectAiReviewRun([run()], head, signal).action, "rerun");
  assert.equal(selectAiReviewRun([run({ run_started_at: later })], head, signal).action, "already_evaluated");
  assert.equal(latestAiReviewSignalTimestamp([comment(summary({ commit_sha: other }))], [], "codex", head), after);
  assert.equal(latestAiReviewSignalTimestamp([comment(receipt, { user: { login: "attacker" } })], [], "codex", head), null);
  assert.equal(latestAiReviewSignalTimestamp([markerComment, comment(legacy)], [], "codex", head), after);
  const neutralCompletion = comment(summary({ has_any_findings: null, has_unresolved_findings: null }), { created_at: before, updated_at: later });
  const completionSignal = latestAiReviewSignalTimestamp([markerComment, comment(receipt, { updated_at: requested }), neutralCompletion], [], "codex", head);
  assert.equal(completionSignal, later);
  assert.equal(selectAiReviewRun([run({ run_started_at: after })], head, completionSignal).action, "rerun");
  assert.equal(selectAiReviewRun([run({ run_started_at: "2026-10-15T04:00:00Z" })], head, completionSignal).action, "already_evaluated");
});

test("fork completion with missing associations resolves through exact commit/repository/branch provenance", async () => {
  const event = { action: "completed", workflow_run: { head_sha: head, head_branch: "fix/native-review", head_repository: { full_name: "fork/r" }, pull_requests: [] } };
  const candidate = { number: 1, state: "open", head: { sha: head, ref: "fix/native-review", repo: { full_name: "fork/r" } }, base: { repo: { full_name: "o/r" } } };
  let candidates = [candidate];
  const paths = [];
  const request = async (_token, _repository, path) => {
    paths.push(path);
    if (path.includes("/commits/")) return candidates;
    assert.equal(path, "/repos/o/r/pulls/1");
    return { number: 1, head: { sha: head } };
  };
  const args = { token: "test", repository: "o/r", event, request };
  assert.deepEqual(await resolvePullContext(args), { prNumber: 1, headSha: head });
  assert.match(paths[0], new RegExp(`/commits/${head}/pulls`));
  for (const headPatch of [{ sha: other }, { ref: "other-branch" }, { repo: { full_name: "attacker/r" } }]) {
    candidates = [{ ...candidate, head: { ...candidate.head, ...headPatch } }];
    await assert.rejects(resolvePullContext(args), /uniquely resolve/);
  }
  candidates = [candidate, { ...candidate, number: 2 }];
  await assert.rejects(resolvePullContext(args), /uniquely resolve/);
  candidates = [{ ...candidate, state: "closed" }];
  await assert.rejects(resolvePullContext(args), /uniquely resolve/);
  await assert.rejects(resolvePullContext({ ...args, event: { workflow_run: { head_sha: head, pull_requests: [] } } }), /provenance/);
});

test("runtime gate publishes real success/failure and context retains the event SHA", () => {
  const dir = mkdtempSync(join(tmpdir(), "nome-review-test-"));
  try {
    const preload = join(dir, "fetch.mjs");
    const event = join(dir, "event.json");
    writeFileSync(event, JSON.stringify({ pull_request: { number: 1, head: { sha: head } } }));
    writeFileSync(preload, `const head=${JSON.stringify(head)}; const other=${JSON.stringify(other)};\nconst marker=${JSON.stringify(markerComment)}; const receipt=${JSON.stringify(comment(receipt))};\nglobalThis.fetch=async (url)=>{let value; const p=new URL(url).pathname;\nif(p.endsWith('/pulls/1')) value={number:1,head:{sha:process.env.TEST_MOVE ? other:head,ref:'test'},base:{ref:'main'}};\nelse if(p==='/graphql') value={data:{repository:{pullRequest:{reviewThreads:{nodes:[],pageInfo:{hasNextPage:false}}}}}};\nelse if(p.endsWith('/issues/1/comments')) value=[marker,receipt]; else value=[];\nreturn {ok:true,status:200,json:async()=>value};};`);
    const env = { ...process.env, GITHUB_TOKEN: "test", GITHUB_REPOSITORY: "o/r", AI_REVIEW_PR_NUMBER: "1", AI_REVIEW_HEAD_SHA: head, AI_REVIEW_AGENT: "codex", AI_REVIEW_TRIGGER_MODE: "skip", AI_REVIEW_WAIT_MS: "1", AI_REVIEW_DEBOUNCE_MS: "0", GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: "pull_request", GITHUB_OUTPUT: "", GITHUB_STEP_SUMMARY: "" };
    const gate = (extra = {}) => spawnSync(process.execPath, ["--import", preload, "scripts/ai-review-gate.mjs"], { encoding: "utf8", env: { ...env, ...extra } });
    assert.equal(gate().status, 0);
    assert.match(gate().stdout, /gate passed/);
    const writableTrigger = gate({ AI_REVIEW_TRIGGER_MODE: "comment" });
    assert.equal(writableTrigger.status, 1);
    assert.match(writableTrigger.stderr, /validation is read-only/);
    assert.equal(gate({ TEST_MOVE: "1" }).status, 1);
    const context = spawnSync(process.execPath, ["--import", preload, "scripts/resolve-pr-context.mjs"], { encoding: "utf8", env: { ...env, TEST_MOVE: "1" } });
    assert.equal(context.status, 0, context.stderr);
    assert.equal(JSON.parse(context.stdout).head_sha, head);
    const recoveryEvent = { action: "completed", workflow_run: { id: 1, event: "pull_request", path: ".github/workflows/ai-review.yml@main", status: "completed", head_sha: head, head_branch: "fix/native-review", head_repository: { full_name: "fork/r" }, pull_requests: [] } };
    writeFileSync(event, JSON.stringify(recoveryEvent));
    const neutralCompletion = comment(summary({ has_any_findings: null, has_unresolved_findings: null }), { created_at: before, updated_at: later });
    writeFileSync(preload, `const head=${JSON.stringify(head)}, marker=${JSON.stringify(markerComment)}, receipt=${JSON.stringify(comment(receipt, { created_at: requested, updated_at: requested }))}, neutral=${JSON.stringify(neutralCompletion)};
      globalThis.fetch=async(url,options)=>{const p=new URL(url).pathname;let value;
      if(options?.method==='POST'){console.log('RERUN_POST');value=null;}
      else if(p.endsWith('/pulls/1'))value={number:1,head:{sha:head}};
      else if(p.includes('/commits/'))value=[{number:1,state:'open',head:{sha:head,ref:'fix/native-review',repo:{full_name:'fork/r'}},base:{repo:{full_name:'o/r'}}}];
      else if(p.includes('/actions/workflows/'))value={workflow_runs:[${JSON.stringify(run({ run_started_at: after }))}]};
      else if(p.endsWith('/issues/1/comments'))value=[marker,receipt,neutral];else value=[];
      return {ok:true,status:200,text:async()=>value===null?'':JSON.stringify(value)};};`);
    const recovery = spawnSync(process.execPath, ["--import", preload, "scripts/ai-review-rerun.mjs"], { encoding: "utf8", env });
    assert.equal(recovery.status, 0, recovery.stderr);
    assert.equal((recovery.stdout.match(/RERUN_POST/g) || []).length, 1);
    assert.match(recovery.stdout, /Requested AI Review rerun/);
    const direct = (nextEvent) => {
      writeFileSync(event, JSON.stringify(nextEvent));
      return spawnSync(process.execPath, ["--import", preload, "scripts/ai-review-rerun.mjs"], { encoding: "utf8", env });
    };
    for (const nextEvent of [
      { action: "submitted", pull_request: { number: 1 }, review: formal({ commit_id: other, submitted_at: later }) },
      { action: "submitted", pull_request: { number: 1 }, review: formal({ commit_id: undefined, submitted_at: later }) },
      { action: "edited", issue: { number: 1, pull_request: {} }, comment: comment(summary({ commit_sha: other }), { updated_at: later }) },
      { action: "created", issue: { number: 1, pull_request: {} }, comment: comment(receipt.replace(head.slice(0, 10), other.slice(0, 10)), { updated_at: later }) }
    ]) {
      const stale = direct(nextEvent);
      assert.equal(stale.status, 0, stale.stderr);
      if (nextEvent.comment) assert.match(stale.stdout, /RERUN_POST/);
      else assert.doesNotMatch(stale.stdout, /RERUN_POST/);
    }
    const current = direct({ action: "edited", issue: { number: 1, pull_request: {} }, comment: comment(receipt, { updated_at: later }) });
    assert.equal(current.status, 0, current.stderr);
    assert.match(current.stdout, /RERUN_POST/);
    for (const name of ["ai-review.yml", "ai-review-rerun.yml"]) assert.match(readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8"), /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


const gateWorkflow = readFileSync(".github/workflows/ai-review.yml", "utf8");
const selectSource = gateWorkflow.match(/- name: Select trusted gate source[\s\S]*?        run: \|\n([\s\S]*?)\n      - name:/)[1]
  .replace(/^          /gm, "");
const reviewedSha = "0123456789abcdef0123456789abcdef01234567";

function withRepository(check) {
  const dir = mkdtempSync(join(tmpdir(), "review-gate-source-"));
  try {
    const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git(["init", "--initial-branch=main"]);
    git(["-c", "user.name=Synthetic Reviewer", "-c", "user.email=reviewer@example.invalid", "commit", "--allow-empty", "-m", "Synthetic trusted base"]);
    const defaultSha = git(["rev-parse", "HEAD"]);
    const run = (pin) => {
      const output = join(dir, "outputs");
      rmSync(output, { force: true });
      const result = spawnSync("bash", ["-c", selectSource], {
        cwd: dir, encoding: "utf8",
        env: { ...process.env, REVIEW_GATE_PIN: pin, GITHUB_OUTPUT: output }
      });
      return { ...result, output: result.status === 0 ? readFileSync(output, "utf8") : "" };
    };
    check({ run, defaultSha });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("review gate defaults to an immutable checkout of the trusted default branch", () => {
  withRepository(({ run, defaultSha }) => {
    const result = run("");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.output, `gate_sha=${defaultSha}\n`);
  });
});

test("repository-owned gate promotion is full-SHA pinned and bound to the trusted base", () => {
  withRepository(({ run, defaultSha }) => {
    const result = run(`${defaultSha}:${reviewedSha}`);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.output, `gate_sha=${reviewedSha}\n`);
    for (const pin of [reviewedSha, `main:${reviewedSha}`, `${defaultSha}:refs/pull/1/head`,
      `${defaultSha}:${reviewedSha.slice(0, 10)}`, `${defaultSha}:${reviewedSha}:extra`,
      `${"f".repeat(40)}:${reviewedSha}`, `${defaultSha}:$(touch unsafe-source)`]) {
      const rejected = run(pin);
      assert.notEqual(rejected.status, 0, pin);
      assert.equal(rejected.output, "", pin);
    }
  });
});

test("only the isolated default-branch request job can write; validation fails after request failure", () => {
  const [requestJob, validationJob] = gateWorkflow.split("jobs:\n")[1].split("\n  ai-review:\n");
  assert.match(gateWorkflow, /permissions:\n  contents: read\n  pull-requests: read\n  issues: read/);
  assert.match(requestJob, /permissions:\n      contents: read\n      pull-requests: write\n      issues: write/);
  assert.match(requestJob, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.match(requestJob, /github.ref == format\('refs\/heads\/\{0\}', github.event.repository.default_branch\)/);
  assert.doesNotMatch(requestJob, /AI_REVIEW_GATE_PIN|steps.source|pull_request.head|secrets\./);
  assert.doesNotMatch(validationJob, /: write|continue-on-error|secrets\./);
  assert.match(validationJob, /needs: request-review\n    if: \|\n      always\(\)/);
  assert.match(validationJob, /AI_REVIEW_TRIGGER_MODE: skip/);
  assert.match(validationJob, /AI_REVIEW_HEAD_SHA: \$\{\{ github.event.pull_request.head.sha \|\| steps.pr.outputs.head_sha \}\}/);
  assert.match(validationJob, /REVIEW_GATE_PIN: \$\{\{ vars.AI_REVIEW_GATE_PIN \}\}/);
  assert.equal((gateWorkflow.match(/persist-credentials: false/g) || []).length, 3);
  const verifyRequest = validationJob.match(/- name: Verify request job[\s\S]*?        run: \|\n([\s\S]*?)\n      - name:/)[1].replace(/^          /gm, "");
  for (const result of ["success", "skipped", "failure", "cancelled", ""]) {
    for (const mode of ["skip", "comment"]) {
      const execution = spawnSync("bash", ["-c", verifyRequest], {
        env: { ...process.env, REQUEST_RESULT: result, EVENT_NAME: "workflow_dispatch", REQUESTED_TRIGGER_MODE: mode }
      });
      assert.equal(execution.status === 0, result === "success" || (result === "skipped" && mode === "skip"), `${result}/${mode}`);
    }
  }
});


test("unseen closings require an authoritative later structured verdict", () => {
  const head = '2667f79cd7676ff331730cabf661d38dbbcddb0d';
  const trusted = { login: 'chatgpt-codex-connector[bot]' };
  const request = { agent: 'codex', sha: head, requestedAt: '2026-10-15T01:00:00Z' };
  const make = (body, timestamp = '2026-10-15T02:00:00Z') => ({ id: 7, user: trusted, body, created_at: timestamp, updated_at: timestamp });
  for (const closing of ['Swish!', "You're on a roll.", 'Another round soon, please!', "Chef's kiss.",
    'May your coffee stay warm.', 'Authentication leaks credentials.', 'The deployment deletes all customer data.']) {
    const unknown = make(`<!-- codex-review-receipt:v1 -->\nCodex Review: Didn't find any major issues. ${closing}\n\n**Reviewed commit:** \`${head}\``);
    assert.notEqual(classifyReceipt(unknown, head, request), 'pass', closing);
    const clean = make(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T03:00:00Z').replaceAll('2026-10-15T02:00:00Z', '2026-10-15T03:00:00Z'), '2026-10-15T03:00:00Z');
    assert.equal(selectSummary([unknown, clean], head, request), 'pass');
    assert.notEqual(selectSummary([clean, { ...unknown, updated_at: '2026-10-15T04:00:00Z' }], head, request), 'pass');
  }
  const clean = make(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T03:00:00Z').replaceAll('2026-10-15T02:00:00Z', '2026-10-15T03:00:00Z'), '2026-10-15T03:00:00Z');
  for (const invalid of [
    summary({ status: 'in_progress' }), summary({ has_any_findings: true }),
    summary({ has_unresolved_findings: true }), summary({ commit_sha: 'a'.repeat(40) }),
    summary().replace('"has_any_findings":false', '"has_any_findings":true,"has_any_findings":false'),
    summary() + '\n<!-- codex-review-state:v1 {} -->', summary().replace('state:v1', 'state:v2'),
    summary() + '\nFound unresolved issues.'
  ]) assert.notEqual(selectSummary([clean, make(invalid.replaceAll('2026-10-15T02:00:00Z', '2026-10-15T04:00:00Z'), '2026-10-15T04:00:00Z')], head, request), 'pass', invalid);
});


test("actual gate requires newer structured authority and pending wins equal time", async () => {
  const unknown = comment(receipt.replace(':rocket:', 'Swish!'));
  const clean = comment(summary());
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, unknown, { ...clean, body: clean.body.replaceAll(after, later), updated_at: later }] })), 'pass');
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, clean, { ...unknown, updated_at: later }] })), 'pending');
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, unknown, clean] })), 'pending');
  for (const pair of [[clean, comment(summary({ status: 'running' }))], [comment(summary({ status: 'running' })), clean]]) {
    assert.equal(await evaluate(evidenceApi({ comments: [markerComment, ...pair] })), 'pending');
  }
  const negative = comment(unknown.body + '\n<details><summary>ℹ️ About Codex in GitHub</summary>P1 leak</details>');
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, clean, negative] })), 'fail');
});


test("trusted signals promoted to pending still wake a previously green gate", () => {
  for (const body of [summary({ commit_sha: other }), receipt.replace(head.slice(0, 10), other.slice(0, 10)), "Codex Review: unknown new native format"]) {
    const signal = comment(body, { updated_at: later });
    assert.equal(shouldRouteAiReviewRerunEvent({ action: 'edited', issue: { pull_request: {} }, comment: signal }, 'codex'), true);
    assert.equal(latestAiReviewSignalTimestamp([markerComment, signal], [], 'codex', head), later);
    assert.equal(selectAiReviewRun([run({ conclusion: 'success', run_started_at: after })], head, later).action, 'rerun');
  }
});


test("security-only edits cannot refresh or reorder old code completion", () => {
  const head = '2667f79cd7676ff331730cabf661d38dbbcddb0d';
  const user = { login: 'chatgpt-codex-connector[bot]' };
  const request = { agent: 'codex', sha: head, requestedAt: '2026-10-15T01:00:00Z' };
  const dated = (body, updated_at) => ({ user, body, created_at: '2026-10-15T00:00:00Z', updated_at });
  const codeAt = (time) => summary().replace(/datetime="[^"]+">[^<]+<\/relative-time>/g, `datetime="${time}">${time}</relative-time>`);
  const unknown = dated(`<!-- codex-review-receipt:v1 -->\nCodex Review: Didn't find any major issues. Needs work.\n\n**Reviewed commit:** \`${head}\``, '2026-10-15T02:30:00Z');
  const edited = dated(codeAt('2026-10-15T02:00:00Z'), '2026-10-15T03:00:00Z');
  assert.equal(selectSummary([unknown, edited], head, request), 'pending');
  const sameSecond = dated(codeAt('2026-10-15T02:30:00.070Z'), '2026-10-15T03:00:00Z');
  assert.equal(selectSummary([unknown, sameSecond], head, request), 'pending');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T01:00:00.070Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T01:00:00Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T00:30:00Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T04:00:00Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.equal(selectSummary([unknown, dated(codeAt('2026-10-15T02:45:00Z'), '2026-10-15T03:00:00Z')], head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T02:00:00Z').replace(/<relative-time[^>]+>[^<]+<\/relative-time>/, ''), '2026-10-15T03:00:00Z'), head, request), 'pass');
});


test('editing static receipt text cannot renew positive evidence', async () => {
  const edited = comment(receipt, { created_at: after, updated_at: later });
  const pending = comment(summary({ status: 'running' }), { created_at: '2026-10-15T02:30:00Z', updated_at: '2026-10-15T02:30:00Z' });
  assert.equal(latestCodexSummaryResult([edited, pending], head, marker), 'pending');
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, edited, pending] })), 'pending');
  const old = comment(receipt, { created_at: before, updated_at: later });
  assert.notEqual(latestCodexSummaryResult([old], head, marker), 'pass');
  assert.notEqual(await evaluate(evidenceApi({ comments: [markerComment, old] })), 'pass');
  const legacyEdited = comment(legacy, { created_at: before, updated_at: later });
  assert.notEqual(classifyCodexSummaryComment(legacyEdited, head, marker), 'pass');
});

test('fresh approval supersedes old request prose failure and stale positive edit', async () => {
  const oldFailure = comment('Codex Review: Found issues.', { created_at: before, updated_at: before });
  const oldPositive = comment(receipt, { created_at: before, updated_at: later });
  const fresh = comment(receipt, { created_at: after, updated_at: after });
  for (const old of [oldFailure, oldPositive]) {
    assert.equal(latestCodexSummaryResult([old, fresh], head, marker), 'pass');
    assert.equal(await evaluate(evidenceApi({ comments: [markerComment, old, fresh] })), 'pass');
  }
});


test('normalized historical typed findings retain their veto', async () => {
  for (const prefix of ['  \n', '\ufeff']) {
    const finding = comment(prefix + summary({ has_any_findings: true }), { created_at: before, updated_at: before });
    assert.equal(await evaluate(evidenceApi({ comments: [markerComment, finding, comment(receipt)] })), 'fail');
  }
});


test('direct structured-state failures remain vetoes across requests', async () => {
  const direct = summary({ has_any_findings: true }).replace('<!-- codex-pull-request-review-summary -->\n', '');
  for (const prefix of ['', ' \n', '\ufeff']) {
    const finding = comment(prefix + direct, { created_at: before, updated_at: before });
    assert.equal(await evaluate(evidenceApi({ comments: [markerComment, finding, comment(receipt)] })), 'fail');
  }
});


test('historical foreign-head direct state does not veto current approval', async () => {
  const direct = summary({ commit_sha: other, has_any_findings: true }).replace('<!-- codex-pull-request-review-summary -->\n', '');
  const finding = comment(direct, { created_at: before, updated_at: before });
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, finding, comment(receipt)] })), 'pass');
});


test('strictly newer formal approval supersedes pending prose conservatively', async () => {
  const unknown = comment(receipt.replace(legacy, "Codex Review: Didn't find any major issues. Needs work."), { created_at: after, updated_at: after });
  const oldCode = comment(summary(), { created_at: before, updated_at: later });
  for (const extras of [[], [oldCode]]) {
    assert.equal(await evaluate(evidenceApi({ comments: [markerComment, ...extras, unknown], reviews: [formal({ submitted_at: later, state: 'APPROVED' })] })), 'pass');
    assert.equal(await evaluate(evidenceApi({ comments: [markerComment, ...extras, unknown], reviews: [formal({ submitted_at: after, state: 'APPROVED' })] })), 'pending');
  }
});


test('historical malformed or foreign outer state does not veto fresh proof', async () => {
  for (const body of ['<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 broken -->', summary({ commit_sha: other, has_any_findings: true })]) {
    const old = comment(body, { created_at: before, updated_at: before });
    assert.equal(await evaluate(evidenceApi({ comments: [markerComment, old, comment(receipt)] })), 'pass');
  }
});


test('historical schema-invalid typed payload cannot veto fresh approval permanently', async () => {
  const missing = summary().replace('"has_any_findings":false,', '');
  const duplicate = summary().replace('"has_any_findings":false', '"has_any_findings":true,"has_any_findings":false');
  for (const outer of [missing, duplicate]) for (const direct of [outer, outer.replace('<!-- codex-pull-request-review-summary -->\n', '')]) {
    const old = comment(direct, { created_at: before, updated_at: before });
    assert.equal(await evaluate(evidenceApi({ comments: [markerComment, old, comment(receipt)] })), 'pass');
  }
});


test('duplicate state markers are malformed rather than permanent historical findings', async () => {
  const valid = summary({ has_any_findings: true });
  const payload = valid.split('\n')[1];
  for (const body of [valid + '\n' + payload, valid.replace('<!-- codex-pull-request-review-summary -->\n', '') + '\n' + payload]) {
    const old = comment(body, { created_at: before, updated_at: before });
    assert.equal(await evaluate(evidenceApi({ comments: [markerComment, old, comment(receipt)] })), 'pass');
    assert.notEqual(await evaluate(evidenceApi({ comments: [markerComment, comment(receipt), comment(body, { created_at: later, updated_at: later })] })), 'pass');
  }
});


test('newer canonical security completion explicitly clears typed security history', async () => {
  const security = { ...completed, has_any_findings: true, has_unresolved_findings: true };
  const old = comment(summary({}, security), { created_at: before, updated_at: before });
  const row = `\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="2026-10-15T02:00:00Z">2026-10-15T02:00:00Z</relative-time> | \`${head.slice(0, 7)}\` | Manual request |`;
  const clean = comment(summary({}, completed) + row);
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, old, clean] })), 'pass');
  const staleSecurity = { ...clean, body: clean.body.split('\n').map((line) => line.includes('**Security Review**') ? line.replaceAll(after, before) : line).join('\n') };
  assert.notEqual(await evaluate(evidenceApi({ comments: [markerComment, old, staleSecurity] })), 'pass');
  const missingTime = { ...clean, body: clean.body.split('\n').map((line) => line.includes('**Security Review**') ? line.replace(/ <relative-time[^>]+>[^<]+<\/relative-time>/, '') : line).join('\n') };
  assert.notEqual(await evaluate(evidenceApi({ comments: [markerComment, old, missingTime] })), 'pass');
  assert.notEqual(await evaluate(evidenceApi({ comments: [markerComment, old, comment(summary())] })), 'pass');
});


test('canonical finding completion is not refreshed by later comment edits', async () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll(after, before), { created_at: before, updated_at: later });
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, old, comment(summary())] })), 'pass');
});


test('security finding clock ignores unrelated newer code completion edits', async () => {
  const securityRow = (time) => '\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="' + time + '">' + time + '</relative-time> | `2667f79` | Manual request |';
  const old = comment(summary({}, { ...completed, has_any_findings: true, has_unresolved_findings: true }).replaceAll(after, later) + securityRow(before), { created_at: before, updated_at: later });
  const clean = comment(summary({}, completed) + securityRow(after));
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, old, clean] })), 'pass');
});


test('security clearance is independent of stale code completion and orders its own finding', async () => {
  const row = (time) => '\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="' + time + '">' + time + '</relative-time> | `2667f79` | Manual request |';
  const findingAt = '2026-10-15T02:30:00Z';
  const old = comment(summary({}, { ...completed, has_any_findings: true, has_unresolved_findings: true }) + row(findingAt), { updated_at: findingAt });
  const clean = comment(summary({}, completed) + row(later), { updated_at: later });
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, old, clean] })), 'pass');
  const staleCode = { ...clean, body: clean.body.replaceAll(after, before) };
  const historical = { ...old, body: old.body.replaceAll(after, before) };
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, historical, staleCode, comment(receipt, { created_at: '2026-10-15T02:45:00Z', updated_at: '2026-10-15T02:45:00Z' })] })), 'pass');
});


test('historical canonical resolution survives a repeated request', async () => {
  const oldTime = '2026-10-14T23:00:00Z', clearTime = '2026-10-15T00:30:00Z';
  const old = comment(summary({ has_any_findings: true }).replaceAll(after, oldTime), { created_at: oldTime, updated_at: oldTime });
  const clean = comment(summary().replaceAll(after, clearTime), { created_at: clearTime, updated_at: clearTime });
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, old, clean], reviews: [formal({ state: 'APPROVED' })] })), 'pass');
});
