# Plan

## Design

Keep trusted default-branch checkout in all write-capable jobs. Parse the two
observed native formats in the shared helper. Recognize markers in the rerun
workflow and router without treating a wakeup signal as positive evidence.
Use updated_at for mutable comments and a complete current SHA for structured
state. Allow only the official About Codex informational footer on receipts.
Recognize the observed rocket/thumbs-up and friendly closing variants, including
the exact `Breezy!` suffix in native receipt 6204061212 on this PR. A
completed summary with null findings flags carries no verdict and cannot pass
alone or supersede a positive explicit receipt. A running review or any
negative finding still blocks success.
Keep that neutral completion as a timestamped wakeup signal, distinct from its
absence as a verdict, so workflow-run recovery can re-evaluate an older receipt.

Extract the gate's actual REST/GraphQL evidence evaluation into an injectable
module. Preserve the request marker requirement, check all unresolved threads
with pagination, retain negative formal evidence across requests, and recheck
PR head after evidence reads. Resolve pull_request context from the event SHA.

Serialize command and evidence requeues in one repository concurrency group
with queue: max. This also covers fork completions without a PR number in their
payload and prevents a newer pending wakeup from evicting an earlier one.
GitHub added larger queues on [2026-05-07](https://github.blog/changelog/2026-05-07-github-actions-concurrency-groups-now-allow-larger-queues/).
The current [job concurrency syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idconcurrency)
supports up to 100 pending jobs with queue: max and cancel-in-progress: false.
GitHub accepted this PR's configuration in
[AI Review Rerun run 38817982655](https://github.com/kiaquila/nome/actions/runs/38817982655).
Recover signals through workflow_run completion events after active attempts
finish, then requeue once if the attempt began before the signal. Inspect only
the newest run and its attempt start time. Re-fetch PR head before requeueing.
Validate each direct event against that live head before selecting a run;
its timestamp alone cannot authorize requeueing a newer commit. Use the shared
classifier, with only trusted request markers added for SHA-less legacy text.
Recover omitted fork PR associations through
the commit-to-pulls API, requiring an unambiguous open PR with matching head
repository, branch, full SHA and base repository. The switch
helper requests the full head SHA; command policy rejects an obsolete explicit SHA.

## Verification

Use node:test for classifier, event filter/router, API evaluator, pagination,
runtime exit codes, exact-head context and rerun state transitions. Run these
through the required Python preflight as well as directly. Check GitHub rules,
native review author/SHA, check suites and review thread resolution before merge.

## Safe initial rollout

The original trusted parser rejected genuine final-head native evidence in
AI Review run 38820671131, attempt 2. Native review supplied receipts and an
updated summary, without a current-head formal review the old gate understands.

Use the read-only source-promotion design merged in unicorn-hub PR #27.
Validation receives only contents/pull-requests/issues read permission and
never persists checkout credentials. Administrative comment-mode requests run
in a separate job, with default-branch scripts and the default workflow ref;
request failure or a non-default write dispatch fails validation. The gate
entry point itself rejects comment mode and performs no administrative writes.

A maintainer may set AI_REVIEW_GATE_PIN to
<default-full-sha>:<independently-reviewed-gate-full-sha>. Both values must be
full lowercase SHAs. The first must equal the actual trusted checkout; a changed
default branch invalidates the pin. Only read-only validation consumes it.
Inspect the candidate, its imports/configuration, preflight results and genuine
native review directly before promotion; its own evaluation cannot establish
trust. Obtain native review of the final workflow/head too. The actual PR
workflow must validate live current-head evidence and all unresolved threads.
Keep all checks green for 120 seconds, merge normally with an expected-head
guard, remove the temporary pin and verify default-branch operation. Never
fabricate success, weaken checks, rewrite review evidence or use admin merge.

Regression tests execute the actual workflow shell with valid, malformed,
stale-base and injection pins, and every request-job outcome. Runtime coverage
also verifies that validation rejects administrative trigger mode.
