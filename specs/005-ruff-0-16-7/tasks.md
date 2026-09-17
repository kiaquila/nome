# Tasks: Ruff 0.16.7 Toolchain Update

- [x] Raise the Ruff development dependency floor to 0.16.7.
- [x] Refresh the Ruff entries in `uv.lock` without changing other packages.
- [x] Verify every locked Ruff 0.16.7 artifact against published metadata.
- [x] Run `uv lock --check`.
- [x] Run Ruff format/check, mypy, and the full pytest suite.
- [x] Record the update's scope, acceptance criteria, risks, and rollback plan.
- [x] Iterate on Codex review until no blocking findings or unresolved threads
      remain.
