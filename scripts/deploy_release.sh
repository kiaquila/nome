#!/usr/bin/env bash

set -euo pipefail

TARGET_DIR="${TARGET_DIR:?TARGET_DIR is required}"
while [[ "$TARGET_DIR" != "/" && "$TARGET_DIR" == */ ]]; do
  TARGET_DIR="${TARGET_DIR%/}"
done
RELEASE_SHA="${RELEASE_SHA:?RELEASE_SHA is required}"
IMAGE_ARCHIVE="${IMAGE_ARCHIVE:?IMAGE_ARCHIVE is required}"
SERVICE_NAME="${SERVICE_NAME:-nome}"
SERVICE_USER="${SERVICE_USER:-ubuntu}"
SERVICE_GROUP="${SERVICE_GROUP:-$SERVICE_USER}"
CONTAINER_NAME="nome"
IMAGE_REPOSITORY="nome"
DEPLOY_METADATA_DIR="${TARGET_DIR}/.deploy"
LOCK_FILE="/tmp/nome-deploy.lock"
LEGACY_UNIT_PATH="${LEGACY_UNIT_PATH:-/etc/systemd/system/${SERVICE_NAME}.service}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-60}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-1}"

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

if [[ "$TARGET_DIR" == *$'\n'* || "$TARGET_DIR" == *,* ]]; then
  echo "TARGET_DIR contains unsupported characters." >&2
  exit 1
fi

if [[ ! "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "RELEASE_SHA must be a full lowercase Git commit SHA." >&2
  exit 1
fi

if [[ ! -f "$IMAGE_ARCHIVE" || ! -r "$IMAGE_ARCHIVE" || -L "$IMAGE_ARCHIVE" ]]; then
  echo "IMAGE_ARCHIVE must be a readable regular file, not a symlink." >&2
  exit 1
fi

if [[ ! "$SERVICE_NAME" =~ ^[a-zA-Z0-9@_.-]+$ ]]; then
  echo "SERVICE_NAME contains unsupported characters." >&2
  exit 1
fi

if [[ ! "$SERVICE_USER" =~ ^[a-z_][a-z0-9_.-]*[$]?$ ]]; then
  echo "SERVICE_USER contains unsupported characters." >&2
  exit 1
fi

if [[ ! "$SERVICE_GROUP" =~ ^[a-z_][a-z0-9_.-]*[$]?$ ]]; then
  echo "SERVICE_GROUP contains unsupported characters." >&2
  exit 1
fi

if [[ ! "$HEALTH_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "HEALTH_ATTEMPTS must be a positive integer." >&2
  exit 1
fi

if [[ ! "$HEALTH_INTERVAL_SECONDS" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "HEALTH_INTERVAL_SECONDS must be a non-negative number." >&2
  exit 1
fi

if [[ "$(id -un)" != "$SERVICE_USER" ]]; then
  echo "The deploy script must run as SERVICE_USER." >&2
  exit 1
fi

runtime_uid="$(id -u "$SERVICE_USER")"
runtime_gid=""
if command -v getent >/dev/null 2>&1; then
  runtime_gid="$(getent group "$SERVICE_GROUP" | cut -d: -f3)"
elif [[ "$(id -gn "$SERVICE_USER")" == "$SERVICE_GROUP" ]]; then
  runtime_gid="$(id -g "$SERVICE_USER")"
fi
if [[ ! "$runtime_uid" =~ ^[0-9]+$ || ! "$runtime_gid" =~ ^[0-9]+$ ]]; then
  echo "Unable to resolve the service UID/GID." >&2
  exit 1
fi

metadata_tmp=""
cleanup() {
  if [[ -n "$metadata_tmp" ]]; then
    rm -f "$metadata_tmp"
  fi
}
trap cleanup EXIT

exec 9>"$LOCK_FILE"
flock 9

mkdir -p "$TARGET_DIR"
if [[ ! -f "$TARGET_DIR/.env" ]]; then
  echo "Runtime environment file is missing in the target directory." >&2
  exit 1
fi

chmod 600 "$TARGET_DIR/.env"
mkdir -p "$TARGET_DIR/data" "$DEPLOY_METADATA_DIR"
chmod 700 "$TARGET_DIR/data" "$DEPLOY_METADATA_DIR"

if [[ ! -w "$TARGET_DIR/data" || ! -w "$DEPLOY_METADATA_DIR" ]]; then
  echo "Runtime data and deploy metadata directories must be writable by SERVICE_USER." >&2
  exit 1
fi

DEPLOY_LOG="${DEPLOY_METADATA_DIR}/last_deploy.log"
: > "$DEPLOY_LOG"
chmod 600 "$DEPLOY_LOG"

run_private() {
  if ! "$@" >>"$DEPLOY_LOG" 2>&1; then
    echo "Deploy command failed; command output remains in host-local deploy logs." >&2
    return 1
  fi
}

if ! run_private docker info; then
  echo "SERVICE_USER cannot access the Docker daemon." >&2
  exit 1
fi

candidate_ref="${IMAGE_REPOSITORY}:${RELEASE_SHA}"
run_private docker image load --input "$IMAGE_ARCHIVE"

if ! docker image inspect "$candidate_ref" >/dev/null 2>&1; then
  echo "The image archive did not contain the expected release tag." >&2
  exit 1
fi

candidate_managed="$(
  docker image inspect --format '{{ index .Config.Labels "io.nome.managed" }}' "$candidate_ref"
)"
candidate_revision="$(
  docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
    "$candidate_ref"
)"
candidate_image_id="$(docker image inspect --format '{{.Id}}' "$candidate_ref")"

if [[ "$candidate_managed" != "true" || "$candidate_revision" != "$RELEASE_SHA" ]]; then
  echo "The candidate image is missing the expected Nome release labels." >&2
  exit 1
fi

if [[ ! "$candidate_image_id" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "The candidate image id has an unexpected format." >&2
  exit 1
fi

metadata_previous_image_id=""
metadata_previous_image_ref=""
metadata_previous_release_sha=""
if [[ -f "$DEPLOY_METADATA_DIR/current_release.json" ]]; then
  previous_metadata=()
  while IFS= read -r metadata_value; do
    previous_metadata+=("$metadata_value")
  done < <(
    METADATA_PATH="$DEPLOY_METADATA_DIR/current_release.json" python3 - <<'PY'
import json
import os
from pathlib import Path

try:
    metadata = json.loads(Path(os.environ["METADATA_PATH"]).read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError):
    metadata = {}

for key in ("previous_image_id", "previous_image_ref", "previous_release_sha"):
    value = metadata.get(key)
    print(value if isinstance(value, str) else "")
PY
  )
  metadata_previous_image_id="${previous_metadata[0]:-}"
  metadata_previous_image_ref="${previous_metadata[1]:-}"
  metadata_previous_release_sha="${previous_metadata[2]:-}"
fi

if [[ -n "$metadata_previous_image_id" && \
  ! "$metadata_previous_image_id" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  metadata_previous_image_id=""
  metadata_previous_image_ref=""
  metadata_previous_release_sha=""
fi

had_container=0
previous_image_id=""
previous_image_ref=""
previous_release_sha=""
if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  container_managed="$(
    docker container inspect --format '{{ index .Config.Labels "io.nome.managed" }}' \
      "$CONTAINER_NAME"
  )"
  if [[ "$container_managed" != "true" ]]; then
    echo "A container named nome exists but is not managed by this deployment." >&2
    exit 1
  fi
  had_container=1
  previous_image_id="$(
    docker container inspect --format '{{.Image}}' "$CONTAINER_NAME"
  )"
  previous_image_ref="$(
    docker container inspect --format '{{.Config.Image}}' "$CONTAINER_NAME"
  )"
  previous_release_sha="$(
    docker container inspect --format \
      '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$CONTAINER_NAME"
  )"
fi

if [[ -n "$previous_image_id" && ! "$previous_image_id" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "The existing Nome container has an unexpected image id." >&2
  exit 1
fi

legacy_load_state="$(
  sudo systemctl show "$SERVICE_NAME.service" --property=LoadState --value 2>/dev/null || true
)"
legacy_unit_present=0
legacy_was_active=0
if [[ "$legacy_load_state" == "loaded" ]]; then
  legacy_unit_present=1
  if sudo systemctl is-active --quiet "$SERVICE_NAME.service"; then
    legacy_was_active=1
  fi
fi

if [[ "$had_container" == "1" && "$legacy_was_active" == "1" ]]; then
  echo "Both the legacy service and Nome container are present; refusing ambiguous migration." >&2
  exit 1
fi

start_nome_container() {
  local image="$1"
  local image_release
  image_release="$(
    docker image inspect --format \
      '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image"
  )"
  if [[ ! "$image_release" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Refusing to start an image without a valid release label." >&2
    return 1
  fi

  run_private docker run --detach \
    --name "$CONTAINER_NAME" \
    --hostname "$CONTAINER_NAME" \
    --restart unless-stopped \
    --stop-timeout 30 \
    --user "${runtime_uid}:${runtime_gid}" \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
    --cap-drop ALL \
    --security-opt no-new-privileges=true \
    --pids-limit 256 \
    --log-driver json-file \
    --log-opt max-size=10m \
    --log-opt max-file=3 \
    --env-file "$TARGET_DIR/.env" \
    --env NOME_DATABASE_PATH=/app/data/nome.sqlite3 \
    --mount "type=bind,source=${TARGET_DIR}/data,target=/app/data" \
    --publish 127.0.0.1:8000:8000 \
    --label io.nome.managed=true \
    --label "org.opencontainers.image.revision=${image_release}" \
    "$image"
}

wait_for_container_health() {
  local state health
  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt++)); do
    if ! docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
      return 1
    fi
    state="$(
      docker container inspect --format '{{.State.Status}}' "$CONTAINER_NAME"
    )"
    health="$(
      docker container inspect --format \
        '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER_NAME"
    )"
    if [[ "$state" == "running" && "$health" == "healthy" ]]; then
      return 0
    fi
    if [[ "$state" == "exited" || "$state" == "dead" || "$health" == "unhealthy" ]]; then
      return 1
    fi
    sleep "$HEALTH_INTERVAL_SECONDS"
  done
  return 1
}

show_safe_container_state() {
  docker container inspect --format \
    'Nome container state: {{.State.Status}}; health: {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$CONTAINER_NAME" >&2 2>/dev/null || true
}

if [[ "$had_container" == "1" ]]; then
  run_private docker container rm --force "$CONTAINER_NAME"
fi

if [[ "$legacy_was_active" == "1" ]]; then
  run_private sudo systemctl stop "$SERVICE_NAME.service"
fi

candidate_healthy=0
if start_nome_container "$candidate_ref" && wait_for_container_health; then
  candidate_healthy=1
fi

if [[ "$candidate_healthy" != "1" ]]; then
  echo "Nome candidate failed its container health check; private logs remain on the host." >&2
  show_safe_container_state
  run_private docker container rm --force "$CONTAINER_NAME" || true

  restored=0
  if [[ -n "$previous_image_id" ]] && docker image inspect "$previous_image_id" >/dev/null 2>&1; then
    if start_nome_container "$previous_image_id" && wait_for_container_health; then
      restored=1
      echo "Restored the previous healthy Nome container image." >&2
    else
      echo "Failed to restore the previous Nome container image." >&2
      show_safe_container_state
    fi
  elif [[ "$legacy_was_active" == "1" ]]; then
    if run_private sudo systemctl start "$SERVICE_NAME.service" && \
      sudo systemctl is-active --quiet "$SERVICE_NAME.service"; then
      restored=1
      echo "Restored the legacy Nome service after the failed first container release." >&2
    else
      echo "Failed to restore the legacy Nome service." >&2
    fi
  fi

  if [[ "$candidate_image_id" != "$previous_image_id" ]]; then
    run_private docker image rm "$candidate_image_id" || true
  fi
  if [[ "$restored" != "1" ]]; then
    echo "No healthy previous Nome runtime could be restored." >&2
  fi
  exit 1
fi

if [[ "$legacy_unit_present" == "1" ]]; then
  run_private sudo systemctl disable "$SERVICE_NAME.service"
  legacy_fragment="$(
    sudo systemctl show "$SERVICE_NAME.service" --property=FragmentPath --value 2>/dev/null || true
  )"
  if [[ "$legacy_fragment" == "$LEGACY_UNIT_PATH" && -e "$LEGACY_UNIT_PATH" ]]; then
    run_private sudo rm -f "$LEGACY_UNIT_PATH"
    run_private sudo systemctl daemon-reload
  fi
fi

retained_previous_image_id="$previous_image_id"
retained_previous_image_ref="$previous_image_ref"
retained_previous_release_sha="$previous_release_sha"
if [[ "$candidate_image_id" == "$previous_image_id" ]]; then
  retained_previous_image_id="$metadata_previous_image_id"
  retained_previous_image_ref="$metadata_previous_image_ref"
  retained_previous_release_sha="$metadata_previous_release_sha"
fi

if [[ -n "$retained_previous_image_id" ]]; then
  if ! docker image inspect "$retained_previous_image_id" >/dev/null 2>&1 || \
    [[ "$(docker image inspect --format '{{ index .Config.Labels "io.nome.managed" }}' \
      "$retained_previous_image_id")" != "true" ]]; then
    retained_previous_image_id=""
    retained_previous_image_ref=""
    retained_previous_release_sha=""
  fi
fi

managed_image_ids=()
while IFS= read -r managed_image_id; do
  managed_image_ids+=("$managed_image_id")
done < <(docker image ls --filter label=io.nome.managed=true --quiet --no-trunc | sort -u)
for image_id in "${managed_image_ids[@]}"; do
  if [[ "$image_id" == "$candidate_image_id" || \
    "$image_id" == "$retained_previous_image_id" ]]; then
    continue
  fi
  run_private docker image rm "$image_id"
done

run_private rm -rf \
  "$TARGET_DIR/.venv" \
  "$DEPLOY_METADATA_DIR/uv" \
  "$DEPLOY_METADATA_DIR/staging-venv"

metadata_tmp="$(mktemp "${DEPLOY_METADATA_DIR}/current_release.json.tmp.XXXXXX")"
chmod 600 "$metadata_tmp"
METADATA_TMP="$metadata_tmp" \
  METADATA_PATH="$DEPLOY_METADATA_DIR/current_release.json" \
  RELEASE_SHA="$RELEASE_SHA" \
  TARGET_DIR="$TARGET_DIR" \
  CONTAINER_NAME="$CONTAINER_NAME" \
  IMAGE_REF="$candidate_ref" \
  IMAGE_ID="$candidate_image_id" \
  PREVIOUS_IMAGE_REF="$retained_previous_image_ref" \
  PREVIOUS_IMAGE_ID="$retained_previous_image_id" \
  PREVIOUS_RELEASE_SHA="$retained_previous_release_sha" \
  python3 - <<'PY'
import json
import os
from datetime import datetime, timezone
from pathlib import Path

metadata = {
    "release_sha": os.environ["RELEASE_SHA"],
    "deployed_at_utc": datetime.now(timezone.utc).isoformat(),
    "target_dir": os.environ["TARGET_DIR"],
    "container_name": os.environ["CONTAINER_NAME"],
    "image_ref": os.environ["IMAGE_REF"],
    "image_id": os.environ["IMAGE_ID"],
    "previous_image_ref": os.environ["PREVIOUS_IMAGE_REF"] or None,
    "previous_image_id": os.environ["PREVIOUS_IMAGE_ID"] or None,
    "previous_release_sha": os.environ["PREVIOUS_RELEASE_SHA"] or None,
}

temporary_path = Path(os.environ["METADATA_TMP"])
metadata_path = Path(os.environ["METADATA_PATH"])
temporary_path.write_text(json.dumps(metadata, ensure_ascii=True, indent=2) + "\n")
temporary_path.replace(metadata_path)
PY
metadata_tmp=""

echo "Deployed ${RELEASE_SHA} in container ${CONTAINER_NAME}."
