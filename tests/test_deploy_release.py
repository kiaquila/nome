from __future__ import annotations

import grp
import json
import os
import pwd
import subprocess
import textwrap
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEPLOY_SCRIPT = ROOT / "scripts" / "deploy_release.sh"

FAKE_DOCKER = r"""
#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

state_path = Path(os.environ["FAKE_DOCKER_STATE"])
state = json.loads(state_path.read_text())
args = sys.argv[1:]


def save():
    state_path.write_text(json.dumps(state))


def fail(message="not found"):
    print(message, file=sys.stderr)
    raise SystemExit(1)


def resolve_image(target):
    for image_id, image in state["images"].items():
        if target == image_id or target in image["tags"]:
            return image_id, image
    fail()


def option_value(name):
    index = args.index(name)
    return args[index + 1]


if args[0] == "info" and "--format" not in args:
    raise SystemExit(0)

if args[0] == "info" and "--format" in args:
    template = option_value("--format")
    if template == "{{.Architecture}}":
        print(state.get("host_architecture", "aarch64"))
    elif template == "{{.OSType}}":
        print("linux")
    else:
        fail(f"unsupported info template: {template}")
    raise SystemExit(0)

if args[:2] == ["image", "load"]:
    candidate = state["candidate"]
    state["images"][candidate["id"]] = {
        "tags": [candidate["ref"]],
        "revision": candidate["revision"],
        "managed": True,
        "health": candidate["health"],
        "architecture": candidate.get("architecture", "arm64"),
        "os": "linux",
    }
    state["events"].append(f"load:{candidate['id']}")
    save()
    raise SystemExit(0)

if args[:2] == ["image", "inspect"]:
    image_id, image = resolve_image(args[-1])
    if "--format" not in args:
        raise SystemExit(0)
    template = option_value("--format")
    if "io.nome.managed" in template:
        print("true" if image["managed"] else "false")
    elif "org.opencontainers.image.revision" in template:
        print(image["revision"])
    elif template == "{{.Id}}":
        print(image_id)
    elif template == "{{.Architecture}}":
        print(image.get("architecture", "arm64"))
    elif template == "{{.Os}}":
        print(image.get("os", "linux"))
    else:
        fail(f"unsupported image template: {template}")
    raise SystemExit(0)

if args[:2] == ["image", "ls"]:
    for image_id, image in state["images"].items():
        if image["managed"]:
            print(image_id)
    raise SystemExit(0)

if args[:2] == ["image", "rm"]:
    image_id, _image = resolve_image(args[-1])
    container = state.get("container")
    if container and container["image_id"] == image_id:
        fail("image is in use")
    del state["images"][image_id]
    state["events"].append(f"image-rm:{image_id}")
    save()
    raise SystemExit(0)

if args[:2] == ["container", "inspect"]:
    container = state.get("container")
    if not container:
        fail()
    if "--format" not in args:
        raise SystemExit(0)
    template = option_value("--format")
    if "io.nome.managed" in template:
        print("true" if container["managed"] else "false")
    elif "org.opencontainers.image.revision" in template:
        print(container["revision"])
    elif template == "{{.Config.Image}}":
        print(container["image_ref"])
    elif template == "{{.Image}}":
        print(container["image_id"])
    elif template == "{{.State.Status}}":
        print(container["status"])
    elif template.startswith("{{if .State.Health}}"):
        print(container["health"])
    elif template.startswith("Nome container state:"):
        print(
            f"Nome container state: {container['status']}; "
            f"health: {container['health']}"
        )
    else:
        fail(f"unsupported container template: {template}")
    raise SystemExit(0)

if args[:2] == ["container", "rm"]:
    if state.get("container"):
        state["events"].append(f"container-rm:{state['container']['image_id']}")
    state["container"] = None
    save()
    raise SystemExit(0)

if args[0] == "run":
    image_id, image = resolve_image(args[-1])
    state["last_run_args"] = args
    state["container"] = {
        "image_id": image_id,
        "image_ref": args[-1],
        "revision": image["revision"],
        "managed": True,
        "status": "running",
        "health": image["health"],
    }
    state["events"].append(f"run:{image_id}")
    save()
    raise SystemExit(0)

fail(f"unsupported docker command: {args}")
"""

FAKE_SUDO = r"""
#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

state_path = Path(os.environ["FAKE_SYSTEMD_STATE"])
state = json.loads(state_path.read_text())
args = sys.argv[1:]


def save():
    state_path.write_text(json.dumps(state))


if args[0] == "systemctl":
    command = args[1]
    if command == "show":
        if "--property=LoadState" in args:
            print("loaded" if state["loaded"] else "not-found")
        elif "--property=FragmentPath" in args:
            print(state["fragment"] if state["loaded"] else "")
        else:
            raise SystemExit(1)
    elif command == "is-active":
        raise SystemExit(0 if state["active"] else 3)
    elif command == "stop":
        state["active"] = False
        state["events"].append("stop")
    elif command == "start":
        state["active"] = True
        state["events"].append("start")
    elif command == "disable":
        state["enabled"] = False
        state["events"].append("disable")
    elif command == "daemon-reload":
        if not Path(state["fragment"]).exists():
            state["loaded"] = False
        state["events"].append("daemon-reload")
    else:
        raise SystemExit(f"unsupported systemctl command: {args}")
    save()
    raise SystemExit(0)

if args[:2] == ["rm", "-f"]:
    Path(args[2]).unlink(missing_ok=True)
    state["events"].append("unit-rm")
    save()
    raise SystemExit(0)

raise SystemExit(f"unsupported sudo command: {args}")
"""


def _image(image_id: str, release_sha: str) -> dict[str, Any]:
    return {
        "tags": [f"nome:{release_sha}"],
        "revision": release_sha,
        "managed": True,
        "health": "healthy",
        "architecture": "arm64",
        "os": "linux",
    }


def _container(image_id: str, release_sha: str) -> dict[str, Any]:
    return {
        "image_id": image_id,
        "image_ref": f"nome:{release_sha}",
        "revision": release_sha,
        "managed": True,
        "status": "running",
        "health": "healthy",
    }


def _run_deploy(
    tmp_path: Path,
    *,
    docker_state: dict[str, Any],
    systemd_active: bool,
    systemd_loaded: bool,
) -> tuple[subprocess.CompletedProcess[str], Path, Path, Path]:
    fake_bin = tmp_path / "fake-bin"
    fake_bin.mkdir(exist_ok=True)
    docker_path = fake_bin / "docker"
    flock_path = fake_bin / "flock"
    sudo_path = fake_bin / "sudo"
    docker_path.write_text(textwrap.dedent(FAKE_DOCKER).lstrip())
    flock_path.write_text("#!/bin/sh\nexit 0\n")
    sudo_path.write_text(textwrap.dedent(FAKE_SUDO).lstrip())
    docker_path.chmod(0o755)
    flock_path.chmod(0o755)
    sudo_path.chmod(0o755)

    target_dir = tmp_path / "nome"
    target_dir.mkdir(exist_ok=True)
    (target_dir / ".env").write_text("EXAMPLE_PRIVATE_VALUE=never-print-this\n")
    image_archive = tmp_path / "image.tar.gz"
    image_archive.write_bytes(b"fake image archive")

    docker_state_path = tmp_path / "docker-state.json"
    docker_state_path.write_text(json.dumps(docker_state))
    legacy_unit = tmp_path / "nome.service"
    if systemd_loaded:
        legacy_unit.write_text("legacy")
    systemd_state_path = tmp_path / "systemd-state.json"
    systemd_state_path.write_text(
        json.dumps(
            {
                "loaded": systemd_loaded,
                "active": systemd_active,
                "enabled": systemd_loaded,
                "fragment": str(legacy_unit),
                "events": [],
            }
        )
    )

    user = pwd.getpwuid(os.getuid()).pw_name
    group = grp.getgrgid(os.getgid()).gr_name
    env = os.environ.copy()
    env.update(
        {
            "FAKE_DOCKER_STATE": str(docker_state_path),
            "FAKE_SYSTEMD_STATE": str(systemd_state_path),
            "HEALTH_ATTEMPTS": "2",
            "HEALTH_INTERVAL_SECONDS": "0",
            "IMAGE_ARCHIVE": str(image_archive),
            "LEGACY_UNIT_PATH": str(legacy_unit),
            "PATH": f"{fake_bin}:{env['PATH']}",
            "RELEASE_SHA": docker_state["candidate"]["revision"],
            "SERVICE_GROUP": group,
            "SERVICE_USER": user,
            "TARGET_DIR": str(target_dir),
        }
    )
    result = subprocess.run(  # noqa: S603
        ["/bin/bash", str(DEPLOY_SCRIPT)],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    return result, target_dir, docker_state_path, systemd_state_path


def test_first_container_release_retires_legacy_service(tmp_path: Path) -> None:
    release_sha = "1" * 40
    candidate_id = f"sha256:{'a' * 64}"
    result, target_dir, docker_path, systemd_path = _run_deploy(
        tmp_path,
        docker_state={
            "images": {},
            "container": None,
            "candidate": {
                "id": candidate_id,
                "ref": f"nome:{release_sha}",
                "revision": release_sha,
                "health": "healthy",
            },
            "events": [],
        },
        systemd_active=True,
        systemd_loaded=True,
    )

    assert result.returncode == 0, result.stderr
    docker_state = json.loads(docker_path.read_text())
    systemd_state = json.loads(systemd_path.read_text())
    metadata = json.loads((target_dir / ".deploy/current_release.json").read_text())
    assert docker_state["container"]["image_id"] == candidate_id
    assert set(docker_state["images"]) == {candidate_id}
    assert systemd_state["active"] is False
    assert systemd_state["enabled"] is False
    assert systemd_state["loaded"] is False
    assert metadata["image_id"] == candidate_id
    assert metadata["previous_image_id"] is None
    assert "--read-only" in docker_state["last_run_args"]
    assert "unless-stopped" in docker_state["last_run_args"]
    assert "127.0.0.1:8000:8000" in docker_state["last_run_args"]
    assert "never-print-this" not in result.stdout + result.stderr


def test_failed_first_release_restores_legacy_service(tmp_path: Path) -> None:
    release_sha = "1" * 40
    candidate_id = f"sha256:{'a' * 64}"
    result, target_dir, docker_path, systemd_path = _run_deploy(
        tmp_path,
        docker_state={
            "images": {},
            "container": None,
            "candidate": {
                "id": candidate_id,
                "ref": f"nome:{release_sha}",
                "revision": release_sha,
                "health": "unhealthy",
            },
            "events": [],
        },
        systemd_active=True,
        systemd_loaded=True,
    )

    assert result.returncode == 1
    docker_state = json.loads(docker_path.read_text())
    systemd_state = json.loads(systemd_path.read_text())
    assert docker_state["container"] is None
    assert docker_state["images"] == {}
    assert systemd_state["active"] is True
    assert systemd_state["enabled"] is True
    assert not (target_dir / ".deploy/current_release.json").exists()
    assert "Restored the legacy Nome service" in result.stderr


def test_wrong_architecture_is_rejected_before_stopping_service(tmp_path: Path) -> None:
    release_sha = "1" * 40
    candidate_id = f"sha256:{'a' * 64}"
    result, _target_dir, docker_path, systemd_path = _run_deploy(
        tmp_path,
        docker_state={
            "images": {},
            "container": None,
            "candidate": {
                "id": candidate_id,
                "ref": f"nome:{release_sha}",
                "revision": release_sha,
                "health": "healthy",
                "architecture": "amd64",
            },
            "host_architecture": "aarch64",
            "events": [],
        },
        systemd_active=True,
        systemd_loaded=True,
    )

    assert result.returncode == 1
    docker_state = json.loads(docker_path.read_text())
    systemd_state = json.loads(systemd_path.read_text())
    assert docker_state["container"] is None
    assert docker_state["images"] == {}
    assert systemd_state["active"] is True
    assert "stop" not in systemd_state["events"]
    assert "platform does not match" in result.stderr


def test_later_release_keeps_only_current_and_previous_images(tmp_path: Path) -> None:
    oldest_sha = "1" * 40
    current_sha = "2" * 40
    candidate_sha = "3" * 40
    oldest_id = f"sha256:{'a' * 64}"
    current_id = f"sha256:{'b' * 64}"
    candidate_id = f"sha256:{'c' * 64}"
    target_dir = tmp_path / "nome"
    (target_dir / ".deploy").mkdir(parents=True)
    (target_dir / ".deploy/current_release.json").write_text(
        json.dumps(
            {
                "release_sha": current_sha,
                "image_id": current_id,
                "previous_image_id": oldest_id,
                "previous_image_ref": f"nome:{oldest_sha}",
                "previous_release_sha": oldest_sha,
            }
        )
    )
    result, target_dir, docker_path, _systemd_path = _run_deploy(
        tmp_path,
        docker_state={
            "images": {
                oldest_id: _image(oldest_id, oldest_sha),
                current_id: _image(current_id, current_sha),
            },
            "container": _container(current_id, current_sha),
            "candidate": {
                "id": candidate_id,
                "ref": f"nome:{candidate_sha}",
                "revision": candidate_sha,
                "health": "healthy",
            },
            "events": [],
        },
        systemd_active=False,
        systemd_loaded=False,
    )

    assert result.returncode == 0, result.stderr
    docker_state = json.loads(docker_path.read_text())
    metadata = json.loads((target_dir / ".deploy/current_release.json").read_text())
    assert docker_state["container"]["image_id"] == candidate_id
    assert set(docker_state["images"]) == {current_id, candidate_id}
    assert f"image-rm:{oldest_id}" in docker_state["events"]
    assert metadata["image_id"] == candidate_id
    assert metadata["previous_image_id"] == current_id
    assert metadata["previous_release_sha"] == current_sha


def test_failed_candidate_restores_previous_container(tmp_path: Path) -> None:
    older_sha = "1" * 40
    current_sha = "2" * 40
    candidate_sha = "3" * 40
    older_id = f"sha256:{'a' * 64}"
    current_id = f"sha256:{'b' * 64}"
    candidate_id = f"sha256:{'c' * 64}"
    target_dir = tmp_path / "nome"
    (target_dir / ".deploy").mkdir(parents=True)
    original_metadata = {
        "release_sha": current_sha,
        "image_id": current_id,
        "previous_image_id": older_id,
        "previous_image_ref": f"nome:{older_sha}",
        "previous_release_sha": older_sha,
    }
    (target_dir / ".deploy/current_release.json").write_text(json.dumps(original_metadata))
    result, target_dir, docker_path, _systemd_path = _run_deploy(
        tmp_path,
        docker_state={
            "images": {
                older_id: _image(older_id, older_sha),
                current_id: _image(current_id, current_sha),
            },
            "container": _container(current_id, current_sha),
            "candidate": {
                "id": candidate_id,
                "ref": f"nome:{candidate_sha}",
                "revision": candidate_sha,
                "health": "unhealthy",
            },
            "events": [],
        },
        systemd_active=False,
        systemd_loaded=False,
    )

    assert result.returncode == 1
    docker_state = json.loads(docker_path.read_text())
    metadata = json.loads((target_dir / ".deploy/current_release.json").read_text())
    assert docker_state["container"]["image_id"] == current_id
    assert set(docker_state["images"]) == {older_id, current_id}
    assert metadata == original_metadata
    assert "Restored the previous healthy Nome container image." in result.stderr
    assert "never-print-this" not in result.stdout + result.stderr
