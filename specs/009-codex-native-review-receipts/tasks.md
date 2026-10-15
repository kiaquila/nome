# Tasks

- [x] Reproduce legacy=true, receipt=false and receipt rerun=false on main.
- [x] Parse native receipts and closed structured summary state.
- [x] Wire workflow filters and runtime router for created/edited signals.
- [x] Preserve failures across requests and inspect unresolved threads.
- [x] Pin event head and recheck after evidence reads/before rerun.
- [x] Serialize and deduplicate completed/active run wakeups.
- [x] Add and run regressions through mandatory preflight (105 Python tests and 18 Node test groups).
- [x] Publish ready PR #38 and request native review as the repository owner.
- [ ] Resolve actionable findings and validate the exact final head.
- [ ] Verify safe rollout, all gates, the 120-second stable window and merge.
