from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from nome.channel_subscribers import ChannelMemberIdentity
from nome.config import Settings, normalize_username
from nome.storage import SQLiteStorage
from nome.time import utc_timestamp


def main() -> None:
    parser = argparse.ArgumentParser(description="Import a local Telegram channel roster JSON.")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--channel-key")
    parser.add_argument("--channel-username")
    parser.add_argument("--channel-id", type=int)
    parser.add_argument("--channel-title")
    parser.add_argument("--snapshot-captured-at")
    args = parser.parse_args()

    settings = Settings.from_env(require_bot_token=False)
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    snapshot_captured_at = _timestamp_or_none(
        args.snapshot_captured_at or payload.get("captured_at")
    )
    if snapshot_captured_at is None:
        raise SystemExit("Snapshot JSON must include captured_at or pass --snapshot-captured-at.")

    snapshot_username = normalize_username(_str_or_none(payload.get("channel_username")))
    channel_username = normalize_username(args.channel_username) or snapshot_username or None
    channel_id = (
        args.channel_id if args.channel_id is not None else _optional_int(payload.get("channel_id"))
    )
    explicit_channel_key = normalize_username(args.channel_key)
    channel_id_key = str(channel_id) if channel_id is not None else None
    channel_key = (
        explicit_channel_key or settings.tracked_channel_key or channel_id_key or channel_username
    )
    if channel_key is None:
        raise SystemExit(
            "Provide --channel-key, --channel-id, or configure NOME_TRACKED_CHANNEL_USERNAME."
        )

    channel_title = args.channel_title or (
        f"@{channel_username}" if channel_username else "Telegram channel"
    )
    excluded_bot_username = normalize_username(settings.business_bot_username)
    members: list[ChannelMemberIdentity] = []
    for member in _list(payload.get("members")):
        if not isinstance(member, dict) or member.get("user_id") is None:
            continue
        username = normalize_username(_str_or_none(member.get("username"))) or None
        is_bot = bool(member.get("is_bot"))
        if is_bot and username == excluded_bot_username:
            continue
        members.append(
            ChannelMemberIdentity(
                user_id=int(member["user_id"]),
                username=username,
                first_name=_str_or_none(member.get("first_name")),
                last_name=_str_or_none(member.get("last_name")),
                is_bot=is_bot,
            )
        )

    storage = SQLiteStorage(settings.database_path)
    storage.initialize()
    imported_at = utc_timestamp()
    imported_count = storage.import_channel_roster(
        channel_key=channel_key,
        channel_id=channel_id,
        channel_username=channel_username,
        channel_title=channel_title,
        members=members,
        now=imported_at,
        snapshot_at=snapshot_captured_at,
        threshold=settings.tracked_channel_threshold,
    )
    print(f"Imported {imported_count} channel members into {settings.database_path}.")


def _list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _str_or_none(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _optional_int(value: object) -> int | None:
    return None if value is None else int(cast(Any, value))


def _timestamp_or_none(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return int(value)
    if not isinstance(value, str):
        raise SystemExit("Snapshot captured timestamp must be a Unix timestamp or ISO datetime.")

    stripped = value.strip()
    if not stripped:
        return None
    if stripped.lstrip("-").isdigit():
        return int(stripped)

    normalized = stripped.removesuffix("Z") + "+00:00" if stripped.endswith("Z") else stripped
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as error:
        raise SystemExit(
            "Snapshot captured timestamp must be a Unix timestamp or ISO datetime."
        ) from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return int(parsed.timestamp())


if __name__ == "__main__":
    main()
