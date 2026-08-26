# Tasks: Dependabot Feature-Memory Exemption

- [x] Add `featureMemoryExemptActors` and `dependencyManifestPaths` to `.unicorn-hub/config.json`.
- [x] Implement the exemption in `scripts/check_feature_memory.py`.
- [x] Mirror the exemption in `scripts/check-feature-memory.mjs`.
- [x] Resolve the pull request author from the GitHub event payload.
- [x] Read the exemption policy from the trusted checkout that owns the script.
- [x] Require the sender of a revision-producing event to equal the pull request
      author, and verify every commit author, failing closed on missing provenance.
- [x] Accept authored changes only when each hunk pairs version moves that keep
      the action or package identity unchanged.
- [x] Narrow `dependencyManifestPaths` to the configured Dependabot ecosystems.
- [x] Compute the exemption from the merge base in both gates.
- [x] Require event-established provenance for files whose content cannot be
      inspected.
- [x] Add regression tests for exempt, human, and mixed-diff cases.
- [x] Run `uv run python scripts/preflight.py`.
- [ ] Rebase the open Dependabot pull requests onto the updated `main`.
