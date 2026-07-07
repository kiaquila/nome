# Tasks

- [x] T001 Create the active spec, plan, and tasks for GitHub deployment
  visibility.
- [x] T002 Grant the deploy workflow `deployments: write` permission.
- [x] T003 Add a "Start GitHub deployment" step that creates a `production`
  deployment and marks it `in_progress`.
- [x] T004 Add a "Finalize GitHub deployment" step that terminalizes the record
  as `success` or `failure` from the job status.
- [x] T005 Pin `actions/github-script` by commit SHA with an accurate version
  comment.
- [x] T006 Document the Deployments/Environments visibility in the deployment
  docs.
- [x] T007 Validate with `actionlint` and `uv run python scripts/preflight.py`.
- [ ] T008 Configure the production SSH deployment secrets in GitHub.
- [ ] T009 Commit, push, and open a PR.
