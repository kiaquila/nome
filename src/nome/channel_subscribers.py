from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, cast

from nome.config import normalize_username
from nome.time import format_localish_timestamp

ACTIVE_MEMBER_STATUSES = frozenset({"creator", "administrator", "member"})
ChangeKind = Literal["joined", "left", "profile_updated"]


@dataclass(frozen=True)
class ChannelMemberIdentity:
    user_id: int
    username: str | None
    first_name: str | None
    last_name: str | None
    is_bot: bool = False

    @property
    def display_name(self) -> str:
        name = " ".join(part for part in [self.first_name, self.last_name] if part)
        if name:
            return name
        if self.username:
            return f"@{self.username}"
        return f"user_id {self.user_id}"

    @property
    def username_suffix(self) -> str:
        if not self.username or self.display_name == f"@{self.username}":
            return ""
        return f" @{self.username}"

    def same_public_profile(self, other: ChannelMemberIdentity | None) -> bool:
        if other is None:
            return False
        return (
            self.username == other.username
            and self.first_name == other.first_name
            and self.last_name == other.last_name
        )


@dataclass(frozen=True)
class ChannelMemberChange:
    kind: ChangeKind
    channel_id: int
    channel_username: str | None
    channel_title: str
    user: ChannelMemberIdentity
    occurred_at: int


@dataclass(frozen=True)
class ChannelNotification:
    text: str
    should_send: bool


def parse_chat_member_change(payload: dict[str, Any]) -> ChannelMemberChange | None:
    chat = _dict(payload.get("chat"))
    old_member = _dict(payload.get("old_chat_member"))
    new_member = _dict(payload.get("new_chat_member"))
    user_payload = _dict(new_member.get("user") or old_member.get("user"))
    user_id = _optional_int(user_payload.get("id"))
    chat_id = _optional_int(chat.get("id"))
    if user_id is None or chat_id is None:
        return None

    old_active = _is_active_member(old_member)
    new_active = _is_active_member(new_member)
    if old_active == new_active:
        if not new_active:
            return None
        kind: ChangeKind = "profile_updated"
    elif new_active:
        kind = "joined"
    else:
        kind = "left"

    return ChannelMemberChange(
        kind=kind,
        channel_id=chat_id,
        channel_username=normalize_username(_str_or_none(chat.get("username"))) or None,
        channel_title=_str_or_none(chat.get("title")) or "Telegram channel",
        user=ChannelMemberIdentity(
            user_id=user_id,
            username=normalize_username(_str_or_none(user_payload.get("username"))) or None,
            first_name=_str_or_none(user_payload.get("first_name")),
            last_name=_str_or_none(user_payload.get("last_name")),
            is_bot=bool(user_payload.get("is_bot")),
        ),
        occurred_at=_optional_int(payload.get("date")) or 0,
    )


def channel_matches(
    change: ChannelMemberChange,
    *,
    tracked_username: str | None,
    tracked_channel_id: int | None,
) -> bool:
    if tracked_username and change.channel_username == normalize_username(tracked_username):
        return True
    return tracked_channel_id is not None and change.channel_id == tracked_channel_id


def format_member_change_notification(
    *,
    change: ChannelMemberChange,
    active_human_count: int,
    threshold: int,
    threshold_reached_now: bool,
    previous_user: ChannelMemberIdentity | None = None,
) -> str:
    if change.kind == "joined":
        headline = "подписался"
        sign = "+"
    elif change.kind == "left":
        headline = "отписался"
        sign = "-"
    else:
        headline = "обновился профиль"
        sign = "~"

    lines = [
        f"{change.channel_title}: {headline}",
        f"{sign} {change.user.display_name}{change.user.username_suffix}",
        f"Сейчас: {active_human_count}/{threshold}",
    ]
    if change.kind == "profile_updated" and previous_user is not None:
        old_profile = f"{previous_user.display_name}{previous_user.username_suffix}"
        new_profile = f"{change.user.display_name}{change.user.username_suffix}"
        lines[1] = f"~ user_id {change.user.user_id}: {old_profile} -> {new_profile}"
    if threshold_reached_now:
        lines.append("Порог достигнут, дальше буду присылать ежедневную статистику.")
    return "\n".join(lines)


def format_channel_digest(
    *,
    channel_title: str,
    active_human_count: int,
    joined_count: int,
    left_count: int,
    profile_update_count: int,
    drift_count: int,
    period_started_at: int | None,
    now: int,
) -> str:
    period = "период"
    if period_started_at is not None:
        period = (
            f"{format_localish_timestamp(period_started_at)} - {format_localish_timestamp(now)}"
        )
    lines = [
        f"{channel_title}: ежедневная статистика",
        f"Период: {period}",
        f"Сейчас подписчиков: {active_human_count}",
        f"+ подписались: {joined_count}",
        f"- отписались: {left_count}",
        f"~ обновили профиль: {profile_update_count}",
    ]
    if drift_count:
        lines.append(f"! расхождений счетчика: {drift_count}")
    return "\n".join(lines)


def format_count_drift_notification(
    *,
    channel_title: str,
    local_roster_count: int,
    active_human_count: int,
    telegram_human_count: int,
    telegram_raw_count: int,
) -> str:
    return "\n".join(
        [
            f"{channel_title}: расхождение roster и счетчика",
            f"Локально в roster: {local_roster_count}",
            f"Локально людей: {active_human_count}",
            f"Telegram после поправки: {telegram_human_count}",
            f"Telegram raw: {telegram_raw_count}",
            "Кто именно изменился, восстановить нельзя без события от Telegram.",
        ]
    )


def _is_active_member(member: dict[str, Any]) -> bool:
    status = _str_or_none(member.get("status"))
    if status in ACTIVE_MEMBER_STATUSES:
        return True
    if status == "restricted":
        return bool(member.get("is_member"))
    return False


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _str_or_none(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _optional_int(value: object) -> int | None:
    return None if value is None else int(cast(Any, value))
