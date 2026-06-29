#!/usr/bin/env bash

set -euo pipefail

TARGET_DIR="${TARGET_DIR:?TARGET_DIR is required}"
while [[ "$TARGET_DIR" != "/" && "$TARGET_DIR" == */ ]]; do
  TARGET_DIR="${TARGET_DIR%/}"
done
RELEASE_SHA="${RELEASE_SHA:?RELEASE_SHA is required}"
RELEASE_SOURCE_DIR="${RELEASE_SOURCE_DIR:-$(pwd)}"
SERVICE_NAME="${SERVICE_NAME:-nome}"
SKIP_SERVICE_UPDATE="${SKIP_SERVICE_UPDATE:-0}"
DEPLOY_METADATA_DIR="${TARGET_DIR}/.deploy"
UV_TOOL_DIR="${DEPLOY_METADATA_DIR}/uv"
UV_VERSION="0.10.11"
LOCK_FILE="/tmp/nome-deploy.lock"

if [[ "$TARGET_DIR" != /* ]]; then
  echo "TARGET_DIR must be an absolute path." >&2
  exit 1
fi

if [[ "${TARGET_DIR##*/}" != "nome" ]]; then
  echo "TARGET_DIR must point to a dedicated Nome directory named 'nome'." >&2
  exit 1
fi

if [[ -L "$TARGET_DIR" ]]; then
  echo "TARGET_DIR must not be a symlink." >&2
  exit 1
fi

if [[ ! "$SERVICE_NAME" =~ ^[a-zA-Z0-9@_.-]+$ ]]; then
  echo "SERVICE_NAME contains unsupported characters." >&2
  exit 1
fi

if [[ ! -d "$RELEASE_SOURCE_DIR" ]]; then
  echo "RELEASE_SOURCE_DIR does not exist: $RELEASE_SOURCE_DIR" >&2
  exit 1
fi

exec 9>"${LOCK_FILE}"
flock 9

mkdir -p "$TARGET_DIR"

if [[ ! -f "$TARGET_DIR/.env" ]]; then
  echo "Runtime environment file is missing: $TARGET_DIR/.env" >&2
  exit 1
fi

rsync -a --delete \
  --exclude ".env" \
  --exclude ".env.*" \
  --exclude ".venv/" \
  --exclude ".deploy/" \
  --exclude ".git/" \
  --exclude "data/" \
  --exclude "logs/" \
  --exclude "*.session" \
  --exclude "*.session-journal" \
  --exclude "*.sqlite3" \
  --exclude "*.sqlite3-shm" \
  --exclude "*.sqlite3-wal" \
  "$RELEASE_SOURCE_DIR/" "$TARGET_DIR/"

chmod 600 "$TARGET_DIR/.env"
mkdir -p "$TARGET_DIR/data" "$DEPLOY_METADATA_DIR"
chmod 700 "$TARGET_DIR/data" "$DEPLOY_METADATA_DIR"

if [[ ! -x "$UV_TOOL_DIR/bin/uv" ]] || ! "$UV_TOOL_DIR/bin/uv" --version | grep -Fq "uv ${UV_VERSION}"; then
  rm -rf "$UV_TOOL_DIR"
  python3 -m venv "$UV_TOOL_DIR"
  "$UV_TOOL_DIR/bin/python" -m pip install \
    --disable-pip-version-check \
    "uv==${UV_VERSION}"
fi

UV_PROJECT_ENVIRONMENT="$TARGET_DIR/.venv" "$UV_TOOL_DIR/bin/uv" sync \
  --project "$TARGET_DIR" \
  --frozen \
  --no-dev \
  --no-editable \
  --reinstall-package nome
"$TARGET_DIR/.venv/bin/python" -m compileall -q "$TARGET_DIR/src/nome"

if [[ "$SKIP_SERVICE_UPDATE" != "1" ]]; then
  unit_template="$TARGET_DIR/deploy/nome.service"
  rendered_unit=$(mktemp)
  trap 'rm -f "$rendered_unit"' EXIT

  TARGET_DIR="$TARGET_DIR" UNIT_TEMPLATE="$unit_template" RENDERED_UNIT="$rendered_unit" python3 - <<'PY'
import os
from pathlib import Path

template_path = Path(os.environ["UNIT_TEMPLATE"])
rendered_path = Path(os.environ["RENDERED_UNIT"])
target_dir = os.environ["TARGET_DIR"]
template = template_path.read_text(encoding="utf-8")

if "__TARGET_DIR__" not in template:
    raise SystemExit("Systemd unit template does not contain __TARGET_DIR__.")

rendered_path.write_text(template.replace("__TARGET_DIR__", target_dir), encoding="utf-8")
PY

  sudo install -m 0644 "$rendered_unit" "/etc/systemd/system/${SERVICE_NAME}.service"
  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
  sudo systemctl restart "$SERVICE_NAME"

  service_healthy=0
  for _ in {1..60}; do
    if sudo systemctl is-active --quiet "$SERVICE_NAME" && python3 - <<'PY'
import sys
import urllib.request

try:
    with urllib.request.urlopen("http://127.0.0.1:8000/healthz", timeout=2) as response:
        if response.status != 200:
            raise RuntimeError(f"Unexpected health status: {response.status}")
except Exception:
    sys.exit(1)
PY
    then
      service_healthy=1
      break
    fi
    sleep 1
  done

  if [[ "$service_healthy" != "1" ]]; then
    echo "Nome failed its post-deploy health check; service logs remain on the host." >&2
    sudo systemctl show "$SERVICE_NAME" \
      --property=ActiveState,SubState,Result,ExecMainStatus \
      --no-pager >&2 || true
    exit 1
  fi
fi

DEPLOY_METADATA_DIR="$DEPLOY_METADATA_DIR" RELEASE_SHA="$RELEASE_SHA" TARGET_DIR="$TARGET_DIR" python3 - <<'PY'
import json
import os
from datetime import datetime, timezone
from pathlib import Path

metadata_path = Path(os.environ["DEPLOY_METADATA_DIR"]) / "current_release.json"
metadata = {
    "release_sha": os.environ["RELEASE_SHA"],
    "deployed_at_utc": datetime.now(timezone.utc).isoformat(),
    "target_dir": os.environ["TARGET_DIR"],
}
metadata_path.write_text(json.dumps(metadata, ensure_ascii=True, indent=2) + "\n")
PY

echo "Deployed ${RELEASE_SHA} to ${TARGET_DIR}"
