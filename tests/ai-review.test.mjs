import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  classifyCodexSummaryComment, isAcceptableCodexSummaryComment,
  latestCodexSummaryResult, classifyCodexNativeReview,
  createAiReviewRequestMarkerBody
} from "../scripts/ai-review-helpers.mjs";
import { evaluateAiReviewEvidence } from "../scripts/ai-review-evidence.mjs";
import { shouldRouteAiReviewRerunEvent, selectAiReviewRun, rerunAiReviewForPrHead } from "../scripts/ai-review-rerun.mjs";

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
const summary = (code = {}, security = absent, rendered = "") => `<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { ...completed, ...code }, security_review: security })} -->\n\n## Codex Review Summary\n${rendered}`;
const classify = (body, extra = {}) => classifyCodexSummaryComment(comment(body, extra), head, marker);

test("real receipt, legacy, curly apostrophe and official footer pass", () => {
  assert.equal(classify(receipt), "pass");
  assert.equal(classify(legacy), "pass");
  assert.equal(classify(receipt.replace("Didn't", "Didn’t")), "pass");
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
  assert.equal(classify(summary({}, completed)), "pass");
  for (const code of [ { commit_sha: other }, { commit_sha: head.slice(0, 10) }, { commit_sha: null }, { status: "in_progress" }, { status: "Completed" }, { has_any_findings: null }, { has_unresolved_findings: null }, { has_any_findings: "false" }, { has_any_findings: true }, { has_unresolved_findings: true }, { unexpected: false } ]) {
    assert.notEqual(classify(summary(code)), "pass", JSON.stringify(code));
  }
  assert.notEqual(classify(summary({}, { ...completed, has_any_findings: true })), "pass");
  assert.notEqual(classify(summary({}, { ...absent, status: "in_progress" })), "pass");
  assert.notEqual(classify(summary({}, absent, "P2 issue remains")), "pass");
  assert.notEqual(classify(summary({}, absent, "Completed 👍")), "pass");
  assert.notEqual(classify(summary({}, absent, "There are unresolved findings")), "pass");
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
  assert.equal(latestCodexSummaryResult([comment(summary(), { created_at: before, updated_at: before })], head, marker), null);
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
const evaluate = (api) => evaluateAiReviewEvidence({ request: api.request, repository: "o/r", prNumber: 1, headSha: head, agent: "codex" });
test("actual gate evaluator accepts receipts and updated state, requires request and resolved threads", async () => {
  assert.equal(await evaluate(evidenceApi()), "pass");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment, comment(summary(), { created_at: before, updated_at: after })] })), "pass");
  assert.equal(await evaluate(evidenceApi({ comments: [comment(receipt)] })), "missing_marker");
  assert.equal(await evaluate(evidenceApi({ threads: [{ isResolved: false }] })), "fail");
  assert.equal(await evaluate(evidenceApi({ threads: [{ isResolved: true }] })), "pass");
  assert.equal(await evaluate(evidenceApi({ reviews: [formal({ state: "CHANGES_REQUESTED", submitted_at: before })] })), "fail");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment], reviews: [formal()] })), "pass");
  assert.equal(await evaluate(evidenceApi({ comments: [markerComment], reviews: [formal({ submitted_at: before })] })), "pending");
  await assert.rejects(evaluate(evidenceApi({ graphError: true })), /thread resolution/);
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
  let polls = 0;
  let time = 0;
  const request = async (_token, _repo, path, options) => {
    calls.push({ path, method: options?.method });
    if (path.endsWith("/pulls/1")) return { head: { sha: head } };
    if (path.includes("/runs?")) return { workflow_runs: [run({ status: ++polls === 1 ? "in_progress" : "completed" })] };
    if (path.endsWith("/rerun")) return null;
    throw new Error(path);
  };
  const args = { token: "test", repository: "o/r", headSha: head, prNumber: 1, evidenceAt: after, waitForActive: true, request, now: () => time, sleep: async (ms) => { time += ms; } };
  assert.equal((await rerunAiReviewForPrHead(args)).action, "rerun");
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
  const duplicate = async (_token, _repo, path) => path.endsWith("/pulls/1") ? { head: { sha: head } } : { workflow_runs: [run({ run_started_at: later })] };
  assert.equal((await rerunAiReviewForPrHead({ ...args, request: duplicate })).action, "already_evaluated");
  let pullCount = 0;
  const moved = async (_token, _repo, path) => path.endsWith("/pulls/1") ? { head: { sha: ++pullCount === 1 ? head : other } } : { workflow_runs: [run()] };
  assert.equal((await rerunAiReviewForPrHead({ ...args, request: moved })).action, "stale");
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
    assert.equal(gate({ TEST_MOVE: "1" }).status, 1);
    const context = spawnSync(process.execPath, ["--import", preload, "scripts/resolve-pr-context.mjs"], { encoding: "utf8", env: { ...env, TEST_MOVE: "1" } });
    assert.equal(context.status, 0, context.stderr);
    assert.equal(JSON.parse(context.stdout).head_sha, head);
    for (const name of ["ai-review.yml", "ai-review-rerun.yml"]) assert.match(readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8"), /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
