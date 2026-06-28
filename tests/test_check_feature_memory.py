from __future__ import annotations

import importlib.util
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
