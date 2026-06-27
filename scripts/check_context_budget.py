from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_ALWAYS_ON_LINES = 60
ALWAYS_ON_FILES = ["AGENTS.md", "CLAUDE.md"]


def main() -> int:
    failures: list[str] = []
    for relative_path in ALWAYS_ON_FILES:
        path = ROOT / relative_path
        if not path.exists():
            failures.append(f"{relative_path} is missing.")
            continue
        lines = path.read_text(encoding="utf-8").splitlines()
        if len(lines) > MAX_ALWAYS_ON_LINES:
            failures.append(
                f"{relative_path} has {len(lines)} lines; keep it <= {MAX_ALWAYS_ON_LINES}."
            )

    if failures:
        print("Context budget check failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print("Context budget check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
