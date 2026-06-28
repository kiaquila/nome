from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

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


def _changed_files() -> list[str]:
    files = set(_worktree_changed_files())
    files.update(_branch_changed_files())
    return sorted(files)


def _product_prefixes() -> tuple[str, ...]:
    try:
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return DEFAULT_PRODUCT_PREFIXES

    product_paths = config.get("productPaths")
    if not isinstance(product_paths, list):
        return DEFAULT_PRODUCT_PREFIXES

    prefixes = tuple(path for path in product_paths if isinstance(path, str) and path)
    return prefixes or DEFAULT_PRODUCT_PREFIXES


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
    remote_ref = f"origin/{base_ref}"
    result = _diff_from_base(remote_ref)
    if result.returncode != 0:
        _fetch_base_ref(base_ref, remote_ref)
        result = _diff_from_base(remote_ref)
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


def _fetch_base_ref(base_ref: str, remote_ref: str) -> None:
    subprocess.run(
        [
            "git",
            "fetch",
            "--no-tags",
            "--depth=1",
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
