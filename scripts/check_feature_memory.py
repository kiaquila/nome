from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / ".unicorn-hub" / "config.json"
DEFAULT_PRODUCT_PREFIXES = (
    "src/",
    "tests/",
    "scripts/",
    ".github/",
    "pyproject.toml",
    ".env.example",
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
)
DEFAULT_EXEMPT_ACTORS = ("dependabot[bot]",)
# Only these pull_request actions create the revision under test. On the others
# GitHub names whoever performed the action as the sender, so a maintainer
# reopening an untouched bot pull request must not be read as its producer.
REVISION_PRODUCING_ACTIONS = ("opened", "synchronize")
WORKFLOW_DIR = ".github/workflows/"
WORKFLOW_USES_PATTERN = re.compile(r"^\s*uses:\s*(\S+)@\S+")
PYPROJECT_REQUIREMENT_PATTERN = re.compile(
    r'^\s*"([A-Za-z0-9][A-Za-z0-9._-]*(?:\[[^\]]*\])?)\s*[<>=!~][^"]*",?\s*$'
)
# File classes whose content is checked, not just their path. Each changed line
# must declare a version, and the identity it declares must be unchanged.
# Lockfiles are absent on purpose: they are generated artifacts, not authored.
VERSION_ONLY_RULES: tuple[tuple[Callable[[str], bool], re.Pattern[str]], ...] = (
    (lambda path: path.startswith(WORKFLOW_DIR), WORKFLOW_USES_PATTERN),
    (lambda path: path == "pyproject.toml", PYPROJECT_REQUIREMENT_PATTERN),
)
DEFAULT_DEPENDENCY_MANIFEST_PATHS = (
    "pyproject.toml",
    "uv.lock",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    ".github/workflows/",
)


def main() -> int:
    try:
        files = _changed_files()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    product_prefixes = _product_prefixes()
    if not any(path.startswith(product_prefixes) for path in files):
        print("No product paths changed; feature-memory check passed.")
        return 0

    if _is_exempt_dependency_update(files):
        print("Automated dependency-only update; feature-memory check passed.")
        return 0

    feature_ids = {
        parts[1]
        for path in files
        if (parts := path.split("/")) and len(parts) >= 3 and parts[0] == "specs"
    }
    for feature_id in feature_ids:
        feature_root = ROOT / "specs" / feature_id
        if all((feature_root / name).exists() for name in ["spec.md", "plan.md", "tasks.md"]):
            print(f"Feature-memory check passed via specs/{feature_id}.")
            return 0

    print("Product changes require specs/<feature-id>/{spec,plan,tasks}.md.", file=sys.stderr)
    return 1


def _is_exempt_dependency_update(files: list[str]) -> bool:
    """Allow automated dependency bumps to skip the feature-memory requirement.

    Every condition must hold, and each one fails closed:

    * the pull request is opened by a configured automation actor;
    * the event that produced this revision names that same actor as its
      sender, so a maintainer commit on a bot branch is not covered by the
      bot's exemption;
    * every commit in the range is authored by that actor;
    * every changed file is a dependency manifest or a workflow file, and every
      authored change only moves a version without changing which action or
      package it names.
    """
    if not files:
        return False
    exempt_actors = _exempt_actors()
    # The exemption applies only inside a pull_request event: provenance must be
    # established, never assumed, so an ambient GITHUB_ACTOR does not grant it.
    actor = _pull_request_actor()
    if not actor or actor not in exempt_actors:
        return False
    # Either a file's content is inspectable, or the event itself must establish
    # who produced the revision. Lockfiles are generated, so they carry no
    # authored line to check and cannot fall back on content.
    if _sender_produced_revision():
        if _revision_sender() != actor:
            return False
    elif any(not _is_content_validated(path) for path in files):
        return False
    authors = _revision_authors()
    if not authors or not all(author == actor for author in authors):
        return False
    manifest_paths = _dependency_manifest_paths()
    if not all(_path_matches(path, manifest_paths) for path in files):
        return False
    return _changes_only_move_versions(files)


def _is_content_validated(path: str) -> bool:
    return any(covers(path) for covers, _pattern in VERSION_ONLY_RULES)


def _changes_only_move_versions(files: list[str]) -> bool:
    """Whether every authored change in the range only moves a version.

    Commit author names are a user-controlled field, so identity alone must not
    decide whether arbitrary content clears the gate. Removed and added lines are
    paired positionally inside each hunk, so swapping two identities between
    steps does not cancel out the way a whole-patch comparison would.
    """
    for covers, pattern in VERSION_ONLY_RULES:
        targets = [path for path in files if covers(path)]
        if not targets:
            continue
        lines = _patch_lines(targets)
        if lines is None:
            return False
        hunks = _patch_hunks(lines)
        if not hunks:
            return False
        for removed, added in hunks:
            if not removed or len(removed) != len(added):
                return False
            for before, after in zip(removed, added, strict=True):
                before_match = pattern.match(before)
                after_match = pattern.match(after)
                if before_match is None or after_match is None:
                    return False
                if before_match.group(1) != after_match.group(1):
                    return False
    return True


def _patch_hunks(lines: list[str]) -> list[tuple[list[str], list[str]]]:
    hunks: list[tuple[list[str], list[str]]] = []
    for line in lines:
        if line.startswith("@@"):
            hunks.append(([], []))
            continue
        if not hunks or line.startswith(("+++", "---")):
            continue
        removed, added = hunks[-1]
        if line.startswith("-"):
            removed.append(line[1:])
        elif line.startswith("+"):
            added.append(line[1:])
    return hunks


def _patch_lines(paths: list[str]) -> list[str] | None:
    base_ref = os.getenv("GITHUB_BASE_REF") or "main"
    result = subprocess.run(
        ["git", "diff", "--unified=0", f"refs/remotes/origin/{base_ref}...HEAD", "--", *paths],
        cwd=ROOT,
        check=False,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout.splitlines()


def _revision_authors() -> list[str] | None:
    """Authors of the pull request's own commits, or None when undeterminable.

    Merge commits are skipped: on ``pull_request`` runs the checked-out revision
    is a merge commit that GitHub, not the contributor, creates.
    """
    base_ref = os.getenv("GITHUB_BASE_REF") or "main"
    result = subprocess.run(
        ["git", "log", "--no-merges", "--format=%an", f"refs/remotes/origin/{base_ref}..HEAD"],
        cwd=ROOT,
        check=False,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        return None
    return [line.strip().lower() for line in result.stdout.splitlines() if line.strip()]


def _revision_sender() -> str:
    """Who performed the event; empty outside a GitHub event."""
    login = _event_payload().get("sender", {}).get("login")
    return login.lower() if isinstance(login, str) else ""


def _path_matches(path: str, patterns: tuple[str, ...]) -> bool:
    for pattern in patterns:
        if pattern.endswith("/"):
            if path.startswith(pattern):
                return True
        elif path == pattern:
            return True
    return False


def _pull_request_actor() -> str:
    """The pull request's author, or empty outside a pull_request event."""
    login = _event_payload().get("pull_request", {}).get("user", {}).get("login")
    return login.lower() if isinstance(login, str) else ""


def _sender_produced_revision() -> bool:
    return _event_payload().get("action") in REVISION_PRODUCING_ACTIONS


def _event_payload() -> dict[str, Any]:
    event_path = os.getenv("GITHUB_EVENT_PATH")
    if not event_path:
        return {}
    try:
        payload = json.loads(Path(event_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _exempt_actors() -> frozenset[str]:
    values = _config_list("featureMemoryExemptActors", DEFAULT_EXEMPT_ACTORS)
    return frozenset(value.lower() for value in values)


def _dependency_manifest_paths() -> tuple[str, ...]:
    return _config_list("dependencyManifestPaths", DEFAULT_DEPENDENCY_MANIFEST_PATHS)


def _config_list(key: str, default: tuple[str, ...]) -> tuple[str, ...]:
    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default

    values = config.get(key)
    if not isinstance(values, list):
        return default

    return tuple(value for value in values if isinstance(value, str) and value)


def _changed_files() -> list[str]:
    files = set(_worktree_changed_files())
    files.update(_branch_changed_files())
    return sorted(files)


def _product_prefixes() -> tuple[str, ...]:
    return _config_list("productPaths", DEFAULT_PRODUCT_PREFIXES) or DEFAULT_PRODUCT_PREFIXES


def _worktree_changed_files() -> list[str]:
    result = subprocess.run(
        ["git", "status", "--short"],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    files: list[str] = []
    for line in result.stdout.splitlines():
        if not line:
            continue
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", maxsplit=1)[1]
        files.append(path)
    return files


def _branch_changed_files() -> list[str]:
    base_ref = os.getenv("GITHUB_BASE_REF") or "main"
    remote_ref = f"refs/remotes/origin/{base_ref}"
    result = _diff_from_base(remote_ref)
    if result.returncode != 0:
        _fetch_base_ref(base_ref, remote_ref)
        result = _diff_from_base(remote_ref)
    if result.returncode != 0 and not os.getenv("GITHUB_ACTIONS"):
        result = _first_successful_diff(("main", "HEAD~1"))
    if result.returncode != 0:
        details = result.stderr.strip() or result.stdout.strip() or "git diff failed"
        raise RuntimeError(f"Unable to determine branch changes: {details}")
    return [line for line in result.stdout.splitlines() if line]


def _diff_from_base(remote_ref: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "diff", "--name-only", f"{remote_ref}...HEAD"],
        cwd=ROOT,
        check=False,
        text=True,
        capture_output=True,
    )


def _first_successful_diff(base_refs: tuple[str, ...]) -> subprocess.CompletedProcess[str]:
    last_result: subprocess.CompletedProcess[str] | None = None
    for base_ref in base_refs:
        result = _diff_from_base(base_ref)
        if result.returncode == 0:
            return result
        last_result = result
    if last_result is not None:
        return last_result
    return _diff_from_base("HEAD~1")


def _fetch_base_ref(base_ref: str, remote_ref: str) -> None:
    subprocess.run(
        [
            "git",
            "fetch",
            "--no-tags",
            "origin",
            f"+refs/heads/{base_ref}:{remote_ref}",
        ],
        cwd=ROOT,
        check=False,
        text=True,
        capture_output=True,
    )


if __name__ == "__main__":
    raise SystemExit(main())
