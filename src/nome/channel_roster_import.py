from __future__ import annotations

import argparse
import json
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
    args = parser.parse_args()

    settings = Settings.from_env(require_bot_token=False)
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    snapshot_username = normalize_username(_str_or_none(payload.get("channel_username")))
    channel_username = normalize_username(args.channel_username) or snapshot_username or None
    explicit_channel_key = normalize_username(args.channel_key)
    channel_key = explicit_channel_key or settings.tracked_channel_key or channel_username
    if channel_key is None:
        raise SystemExit("Provide --channel-key or configure NOME_TRACKED_CHANNEL_USERNAME.")

    channel_id = (
        args.channel_id if args.channel_id is not None else _optional_int(payload.get("channel_id"))
    )
    channel_title = args.channel_title or (
        f"@{channel_username}" if channel_username else "Telegram channel"
    )
    members = [
        ChannelMemberIdentity(
            user_id=int(member["user_id"]),
            username=normalize_username(_str_or_none(member.get("username"))) or None,
            first_name=_str_or_none(member.get("first_name")),
            last_name=_str_or_none(member.get("last_name")),
            is_bot=bool(member.get("is_bot")),
        )
        for member in _list(payload.get("members"))
        if isinstance(member, dict) and member.get("user_id") is not None
    ]

    storage = SQLiteStorage(settings.database_path)
    storage.initialize()
    imported_count = storage.import_channel_roster(
        channel_key=channel_key,
        channel_id=channel_id,
        channel_username=channel_username,
        channel_title=channel_title,
        members=members,
        now=utc_timestamp(),
        threshold=settings.tracked_channel_threshold,
    )
    print(f"Imported {imported_count} channel members into {settings.database_path}.")


def _list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _str_or_none(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _optional_int(value: object) -> int | None:
    return None if value is None else int(cast(Any, value))


if __name__ == "__main__":
    main()
