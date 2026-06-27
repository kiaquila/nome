from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    commands = [
        (["uv", "run", "ruff", "format", "--check", "."], "ruff format"),
        (["uv", "run", "ruff", "check", "."], "ruff check"),
        (["uv", "run", "mypy", "src/nome"], "mypy"),
        (["uv", "run", "pytest"], "pytest"),
        ([sys.executable, "scripts/check_feature_memory.py"], "feature memory"),
        ([sys.executable, "scripts/check_repo_baseline.py"], "repository baseline"),
        ([sys.executable, "scripts/check_context_budget.py"], "context budget"),
    ]
    for command, label in commands:
        result = subprocess.run(command, cwd=ROOT, check=False)
        if result.returncode != 0:
            print(f"{label} failed.", file=sys.stderr)
            return result.returncode
    print("Preflight passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
