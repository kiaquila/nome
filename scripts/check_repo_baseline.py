from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_PATHS = [
    "README.md",
    "pyproject.toml",
    ".env.example",
    ".unicorn-hub/config.json",
    "AGENTS.md",
    "CLAUDE.md",
    "docs_project/project/product-brief.md",
    "docs_project/project/architecture.md",
    "specs",
    "src/nome",
    "tests",
    ".github/workflows/ci.yml",
    ".github/workflows/pr-guard.yml",
]
FORBIDDEN_SECRET_PATTERNS = [
    "TELEGRAM_BOT_TOKEN=123",
    ".session",
]


def main() -> int:
    missing = [path for path in REQUIRED_PATHS if not (ROOT / path).exists()]
    if missing:
        print("Missing required repository paths:", file=sys.stderr)
        for path in missing:
            print(f"- {path}", file=sys.stderr)
        return 1

    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")
    if 'name = "nome"' not in pyproject:
        print("pyproject.toml must define the nome project.", file=sys.stderr)
        return 1

    config = json.loads((ROOT / ".unicorn-hub/config.json").read_text(encoding="utf-8"))
    if config.get("commands", {}).get("preflight") != "uv run python scripts/preflight.py":
        print("Repository config must point preflight at the Python checker.", file=sys.stderr)
        return 1

    tracked_text = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in [
            ROOT / ".env.example",
            ROOT / "README.md",
            ROOT / "AGENTS.md",
            ROOT / "CLAUDE.md",
        ]
    )
    for pattern in FORBIDDEN_SECRET_PATTERNS:
        if pattern in tracked_text:
            print(f"Potential secret/session pattern found: {pattern}", file=sys.stderr)
            return 1

    print("Python repository baseline check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
