from __future__ import annotations

from datetime import UTC, datetime


def utc_timestamp() -> int:
    return int(datetime.now(tz=UTC).timestamp())


def format_localish_timestamp(timestamp: int | None) -> str:
    if timestamp is None:
        return "n/a"
    return datetime.fromtimestamp(timestamp, tz=UTC).strftime("%Y-%m-%d %H:%M UTC")
