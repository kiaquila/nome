from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest


def _load_check_feature_memory() -> ModuleType:
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "check_feature_memory.py"
    spec = importlib.util.spec_from_file_location("check_feature_memory", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load check_feature_memory.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


check_feature_memory = _load_check_feature_memory()


def test_branch_changed_files_fails_closed_when_diff_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(*_args: Any, **_kwargs: Any) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            args=["git", "diff"],
            returncode=128,
            stdout="",
            stderr="fatal: bad revision 'origin/main...HEAD'",
        )

    monkeypatch.setattr(check_feature_memory.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="Unable to determine branch changes"):
        check_feature_memory._branch_changed_files()


def test_branch_changed_files_uses_local_fallback_when_remote_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.delenv("GITHUB_BASE_REF", raising=False)
    calls: list[str] = []

    def fake_diff_from_base(base_ref: str) -> subprocess.CompletedProcess[str]:
        calls.append(base_ref)
        if base_ref == "main":
            return subprocess.CompletedProcess(
                args=["git", "diff"],
                returncode=0,
                stdout="src/nome/app.py\n",
                stderr="",
            )
        return subprocess.CompletedProcess(
            args=["git", "diff"],
            returncode=128,
            stdout="",
            stderr=f"fatal: bad revision '{base_ref}...HEAD'",
        )

    monkeypatch.setattr(check_feature_memory, "_diff_from_base", fake_diff_from_base)
    monkeypatch.setattr(check_feature_memory, "_fetch_base_ref", lambda *_args: None)

    assert check_feature_memory._branch_changed_files() == ["src/nome/app.py"]
    assert calls == ["refs/remotes/origin/main", "refs/remotes/origin/main", "main"]


def _write_event(tmp_path: Path, *, author: str, sender: str, action: str = "synchronize") -> Path:
    event_path = tmp_path / "event.json"
    event_path.write_text(
        json.dumps(
            {
                "action": action,
                "pull_request": {"user": {"login": author}},
                "sender": {"login": sender},
            }
        ),
        encoding="utf-8",
    )
    return event_path


@pytest.fixture
def bot_revision(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """A revision opened, pushed, and authored entirely by Dependabot, whose
    patch is a plain version bump for whichever file class is asked about."""
    event_path = _write_event(tmp_path, author="dependabot[bot]", sender="dependabot[bot]")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(check_feature_memory, "_revision_authors", lambda: ["dependabot[bot]"])

    def stub_patch(paths: list[str]) -> list[str]:
        if any(path.startswith(".github/workflows/") for path in paths):
            return [
                "@@ -1 +1 @@",
                "-        uses: actions/checkout@aaaa # v4",
                "+        uses: actions/checkout@bbbb # v7",
            ]
        return ["@@ -1 +1 @@", '-  "fastapi>=0.128.0,<1.0.0",', '+  "fastapi>=0.141.1,<1.0.0",']

    monkeypatch.setattr(check_feature_memory, "_patch_lines", stub_patch)


def test_dependency_only_update_from_dependabot_is_exempt(bot_revision: None) -> None:
    assert check_feature_memory._is_exempt_dependency_update(["pyproject.toml", "uv.lock"])
    assert check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])


def test_dependency_exemption_reads_pull_request_author_from_event(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    event_path = _write_event(tmp_path, author="dependabot[bot]", sender="dependabot[bot]")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setenv("GITHUB_ACTOR", "some-human")
    monkeypatch.setattr(check_feature_memory, "_revision_authors", lambda: ["dependabot[bot]"])

    assert check_feature_memory._is_exempt_dependency_update(["uv.lock"])


def test_dependency_exemption_requires_a_pull_request_event(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Outside a pull_request event the revision's provenance is unknown, and an
    ambient GITHUB_ACTOR must not stand in for it."""
    monkeypatch.delenv("GITHUB_EVENT_PATH", raising=False)
    monkeypatch.setenv("GITHUB_ACTOR", "dependabot[bot]")
    monkeypatch.setattr(check_feature_memory, "_revision_authors", lambda: ["dependabot[bot]"])

    assert not check_feature_memory._is_exempt_dependency_update(["uv.lock"])


def test_dependency_exemption_survives_a_maintainer_reopen(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Reopening produces no revision, so the maintainer who reopened an
    untouched bot pull request is not its producer. Content carries provenance."""
    event_path = _write_event(
        tmp_path, author="dependabot[bot]", sender="kiaquila", action="reopened"
    )
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(check_feature_memory, "_revision_authors", lambda: ["dependabot[bot]"])
    monkeypatch.setattr(
        check_feature_memory,
        "_patch_lines",
        lambda _paths: [
            "@@ -1 +1 @@",
            "-        uses: actions/checkout@aaaa # v4",
            "+        uses: actions/checkout@bbbb # v7",
        ],
    )

    assert check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])


def test_reopen_denies_the_exemption_for_uninspectable_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """A lockfile has no authored line to check, so provenance must come from the
    event — and a reopen does not establish it."""
    event_path = _write_event(
        tmp_path, author="dependabot[bot]", sender="kiaquila", action="reopened"
    )
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(check_feature_memory, "_revision_authors", lambda: ["dependabot[bot]"])

    assert not check_feature_memory._is_exempt_dependency_update(["uv.lock"])


def test_reopen_does_not_excuse_a_maintainer_commit(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Commit authorship still carries provenance when the sender check does not."""
    event_path = _write_event(
        tmp_path, author="dependabot[bot]", sender="kiaquila", action="reopened"
    )
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(
        check_feature_memory, "_revision_authors", lambda: ["dependabot[bot]", "kiaquila"]
    )

    assert not check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])


def test_dependency_exemption_requires_sender_to_match_the_pull_request_author(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    event_path = _write_event(
        tmp_path, author="dependabot[bot]", sender="renovate[bot]", action="synchronize"
    )
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(check_feature_memory, "_revision_authors", lambda: ["dependabot[bot]"])

    assert not check_feature_memory._is_exempt_dependency_update(["uv.lock"])


def test_dependency_exemption_rejects_human_authors(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    event_path = _write_event(tmp_path, author="kiaquila", sender="kiaquila")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(check_feature_memory, "_revision_authors", lambda: ["kiaquila"])

    assert not check_feature_memory._is_exempt_dependency_update(["pyproject.toml"])


def test_dependency_exemption_rejects_non_manifest_changes(bot_revision: None) -> None:
    assert not check_feature_memory._is_exempt_dependency_update(
        ["pyproject.toml", "src/nome/app.py"]
    )
    assert not check_feature_memory._is_exempt_dependency_update([".github/dependabot.yml"])
    assert not check_feature_memory._is_exempt_dependency_update([])


def test_dependency_exemption_rejects_maintainer_commit_on_bot_branch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """A maintainer pushing onto a Dependabot branch is not covered by the bot."""
    event_path = _write_event(tmp_path, author="dependabot[bot]", sender="kiaquila")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(
        check_feature_memory, "_revision_authors", lambda: ["dependabot[bot]", "kiaquila"]
    )

    assert not check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])


def test_workflow_exemption_requires_pin_bumps_only(
    bot_revision: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Author names are user-controlled, so workflow content is judged by patch."""
    monkeypatch.setattr(
        check_feature_memory,
        "_patch_lines",
        lambda _files: [
            "@@ -1 +1 @@",
            "-        uses: actions/checkout@aaaa # v4",
            "+        uses: actions/checkout@bbbb # v7",
        ],
    )
    assert check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])

    monkeypatch.setattr(
        check_feature_memory,
        "_patch_lines",
        lambda _files: [
            "@@ -1 +1 @@",
            "+        uses: actions/checkout@bbbb # v7",
            "+        run: curl -s https://example.invalid",
        ],
    )
    assert not check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])


def test_workflow_exemption_rejects_swapping_the_action_itself(
    bot_revision: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A pin bump may move a ref; it may never swap in different code."""
    monkeypatch.setattr(
        check_feature_memory,
        "_patch_lines",
        lambda _files: [
            "@@ -1 +1 @@",
            "-        uses: actions/setup-python@aaaa # v5",
            "+        uses: attacker/action@main",
        ],
    )
    assert not check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])


def test_workflow_exemption_rejects_an_unbalanced_patch(
    bot_revision: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An added `uses:` line with no counterpart is a new step, not a bump."""
    monkeypatch.setattr(
        check_feature_memory,
        "_patch_lines",
        lambda _files: [
            "@@ -1 +1 @@",
            "-        uses: actions/checkout@aaaa # v4",
            "+        uses: actions/checkout@bbbb # v7",
            "+        uses: attacker/action@main",
        ],
    )
    assert not check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])


def test_workflow_pin_check_fails_closed_when_the_patch_is_unreadable(
    bot_revision: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(check_feature_memory, "_patch_lines", lambda _files: None)
    assert not check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])


def test_lockfile_only_changes_skip_content_validation(
    bot_revision: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Lockfiles are generated artifacts, so there is no authored line to check."""

    def fail(_paths: list[str]) -> list[str]:
        raise AssertionError("must not inspect a patch for lockfile-only changes")

    monkeypatch.setattr(check_feature_memory, "_patch_lines", fail)
    assert check_feature_memory._is_exempt_dependency_update(["uv.lock"])


def test_pyproject_exemption_requires_dependency_lines(
    bot_revision: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A manifest edit that is not a dependency bump is a product change."""
    monkeypatch.setattr(
        check_feature_memory,
        "_patch_lines",
        lambda _paths: [
            "@@ -1 +1 @@",
            '-build-backend = "hatchling.build"',
            '+build-backend = "attacker.build"',
        ],
    )
    assert not check_feature_memory._is_exempt_dependency_update(["pyproject.toml"])


def test_pyproject_exemption_requires_the_package_name_to_be_unchanged(
    bot_revision: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        check_feature_memory,
        "_patch_lines",
        lambda _paths: [
            "@@ -1 +1 @@",
            '-  "fastapi>=0.128.0,<1.0.0",',
            '+  "attacker-pkg>=1.0.0",',
        ],
    )
    assert not check_feature_memory._is_exempt_dependency_update(["pyproject.toml"])


def test_identity_swap_across_two_hunks_is_rejected(
    bot_revision: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two steps exchanging actions is not a bump, even though the whole patch
    mentions the same coordinates on both sides."""
    monkeypatch.setattr(
        check_feature_memory,
        "_patch_lines",
        lambda _paths: [
            "@@ -1 +1 @@",
            "-        uses: actions/setup-python@aaaa # v5",
            "+        uses: astral-sh/setup-uv@cccc # v6",
            "@@ -9 +9 @@",
            "-        uses: astral-sh/setup-uv@bbbb # v6",
            "+        uses: actions/setup-python@dddd # v5",
        ],
    )
    assert not check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])


def test_patch_lines_returns_none_when_git_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(*_args: Any, **_kwargs: Any) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            args=["git", "diff"], returncode=128, stdout="", stderr=""
        )

    monkeypatch.setattr(check_feature_memory.subprocess, "run", fake_run)
    assert check_feature_memory._patch_lines([".github/workflows/ci.yml"]) is None


def test_dependency_exemption_rejects_commits_from_another_exempt_actor(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Every commit must come from the pull request's own actor, not merely from
    some actor on the exemption list."""
    event_path = _write_event(tmp_path, author="dependabot[bot]", sender="dependabot[bot]")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(
        check_feature_memory,
        "_exempt_actors",
        lambda: frozenset({"dependabot[bot]", "renovate[bot]"}),
    )
    monkeypatch.setattr(
        check_feature_memory, "_revision_authors", lambda: ["dependabot[bot]", "renovate[bot]"]
    )

    assert not check_feature_memory._is_exempt_dependency_update(["uv.lock"])


def test_dependency_exemption_rejects_human_authored_commit_when_sender_is_bot(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    event_path = _write_event(tmp_path, author="dependabot[bot]", sender="dependabot[bot]")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(
        check_feature_memory, "_revision_authors", lambda: ["dependabot[bot]", "kiaquila"]
    )

    assert not check_feature_memory._is_exempt_dependency_update([".github/workflows/ci.yml"])


def test_dependency_exemption_fails_closed_without_revision_authors(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    event_path = _write_event(tmp_path, author="dependabot[bot]", sender="dependabot[bot]")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(check_feature_memory, "_revision_authors", lambda: None)
    assert not check_feature_memory._is_exempt_dependency_update(["uv.lock"])

    monkeypatch.setattr(check_feature_memory, "_revision_authors", lambda: [])
    assert not check_feature_memory._is_exempt_dependency_update(["uv.lock"])


def test_revision_authors_returns_none_when_git_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_run(*_args: Any, **_kwargs: Any) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            args=["git", "log"], returncode=128, stdout="", stderr=""
        )

    monkeypatch.setattr(check_feature_memory.subprocess, "run", fake_run)
    assert check_feature_memory._revision_authors() is None


def test_main_passes_for_dependabot_dependency_bump(
    bot_revision: None,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(
        check_feature_memory, "_changed_files", lambda: ["pyproject.toml", "uv.lock"]
    )

    assert check_feature_memory.main() == 0
    assert "Automated dependency-only update" in capsys.readouterr().out


def test_main_still_requires_feature_memory_for_human_dependency_edits(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    event_path = _write_event(tmp_path, author="kiaquila", sender="kiaquila")
    monkeypatch.setenv("GITHUB_EVENT_PATH", str(event_path))
    monkeypatch.setattr(check_feature_memory, "_revision_authors", lambda: ["kiaquila"])
    monkeypatch.setattr(
        check_feature_memory, "_changed_files", lambda: ["pyproject.toml", "uv.lock"]
    )

    assert check_feature_memory.main() == 1
