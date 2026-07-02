from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, replace
from typing import Any, cast

from nome.channel_subscribers import (
    channel_matches,
    format_channel_digest,
    format_count_drift_notification,
    format_member_change_notification,
    parse_chat_member_change,
)
from nome.config import Settings, normalize_username
from nome.storage import BusinessConnection, SQLiteStorage
from nome.telegram_api import TelegramAPIError, TelegramBotAPI
from nome.time import format_localish_timestamp, utc_timestamp

LOGGER = logging.getLogger(__name__)
STATUS_COMMANDS = {"/status", "/inbox", "/who_wrote"}


@dataclass(frozen=True)
class ChatIdentity:
    chat_id: int
    username: str | None
    display: str


class UpdateHandler:
    def __init__(
        self,
        *,
        settings: Settings,
        storage: SQLiteStorage,
        telegram: TelegramBotAPI,
    ) -> None:
        self.settings = settings
        self.storage = storage
        self.telegram = telegram

    async def handle_update(self, update: dict[str, Any], *, now: int | None = None) -> None:
        current_time = utc_timestamp() if now is None else now
        if business_connection := update.get("business_connection"):
            self._handle_business_connection(business_connection, now=current_time)

        if business_message := update.get("business_message"):
            await self._handle_business_message(business_message, now=current_time)

        if chat_member := update.get("chat_member"):
            await self._handle_chat_member_update(chat_member, now=current_time)

        if message := update.get("message"):
            await self._handle_owner_command(message, now=current_time)

    async def process_due_replies(self, *, now: int | None = None) -> int:
        current_time = utc_timestamp() if now is None else now
        sent_count = 0
        for pending in self.storage.due_replies(now=current_time):
            connection = self.storage.get_business_connection(pending.business_connection_id)
            if connection is None or not connection.is_enabled or not connection.can_reply:
                self.storage.cancel_pending_reply(
                    business_connection_id=pending.business_connection_id,
                    chat_id=pending.chat_id,
                )
                continue

            if not self._is_allowed_business_chat(
                ChatIdentity(
                    chat_id=pending.chat_id,
                    username=pending.chat_username,
                    display=pending.chat_display,
                )
            ):
                self.storage.cancel_pending_reply(
                    business_connection_id=pending.business_connection_id,
                    chat_id=pending.chat_id,
                )
                continue

            claimed = self.storage.claim_due_reply(pending=pending, now=current_time)
            if claimed is None:
                continue

            await asyncio.sleep(0)
            if not self.storage.claimed_reply_exists(pending=claimed):
                continue

            try:
                sent_message_id = await self.telegram.send_message(
                    chat_id=claimed.chat_id,
                    text=self.settings.auto_reply_text,
                    business_connection_id=claimed.business_connection_id,
                )
            except TelegramAPIError as error:
                LOGGER.warning(
                    "Failed to send away reply for business chat metadata: %s",
                    type(error).__name__,
                )
                if error.ambiguous:
                    if self.storage.mark_reply_sent(
                        pending=claimed,
                        sent_message_id=None,
                        now=current_time,
                    ):
                        sent_count += 1
                    continue
                self.storage.mark_reply_failed(
                    pending=claimed,
                    now=current_time,
                    retry_after_seconds=300,
                )
                continue
            except OSError as error:
                LOGGER.warning(
                    "Ambiguous away reply send failure for business chat metadata: %s",
                    type(error).__name__,
                )
                if self.storage.mark_reply_sent(
                    pending=claimed,
                    sent_message_id=None,
                    now=current_time,
                ):
                    sent_count += 1
                continue

            if not self.storage.mark_reply_sent(
                pending=claimed,
                sent_message_id=sent_message_id,
                now=current_time,
            ):
                continue
            sent_count += 1
        return sent_count

    async def process_due_channel_digest(self, *, now: int | None = None) -> int:
        if not self.settings.channel_tracking_enabled or self.settings.owner_chat_id is None:
            return 0
        channel_key = self.settings.tracked_channel_key
        if channel_key is None:
            return 0

        current_time = utc_timestamp() if now is None else now
        digest = self.storage.due_channel_digest(
            channel_key=channel_key,
            now=current_time,
            interval_seconds=self.settings.channel_digest_interval_seconds,
        )
        if digest is None:
            return 0

        text = format_channel_digest(
            channel_title=digest.channel_title,
            active_human_count=digest.active_human_count,
            joined_count=digest.joined_count,
            left_count=digest.left_count,
            profile_update_count=digest.profile_update_count,
            drift_count=digest.drift_count,
            period_started_at=digest.period_started_at,
            now=current_time,
        )
        try:
            await self.telegram.send_message(chat_id=self.settings.owner_chat_id, text=text)
        except (TelegramAPIError, OSError) as error:
            LOGGER.warning("Could not send channel digest: %s", type(error).__name__)
            return 0
        self.storage.mark_channel_digest_sent(digest=digest, now=current_time)
        return 1

    async def process_due_channel_notifications(self, *, now: int | None = None) -> int:
        current_time = utc_timestamp() if now is None else now
        sent_count = 0
        for notification in self.storage.due_channel_notifications(now=current_time):
            try:
                await self.telegram.send_message(
                    chat_id=notification.owner_chat_id,
                    text=notification.text,
                )
            except (TelegramAPIError, OSError) as error:
                LOGGER.warning(
                    "Could not send pending channel notification: %s",
                    type(error).__name__,
                )
                self.storage.mark_channel_notification_failed(
                    notification_id=notification.id,
                    now=current_time,
                )
                continue
            self.storage.mark_channel_notification_sent(notification_id=notification.id)
            sent_count += 1
        return sent_count

    async def process_due_channel_count_check(self, *, now: int | None = None) -> bool:
        if not self.settings.channel_tracking_enabled:
            return False
        channel_key = self.settings.tracked_channel_key
        chat_id = self.settings.tracked_channel_chat_id
        if channel_key is None or chat_id is None:
            return False

        current_time = utc_timestamp() if now is None else now
        if not self.storage.channel_count_check_due(
            channel_key=channel_key,
            now=current_time,
            interval_seconds=self.settings.channel_count_check_interval_seconds,
        ):
            return False

        try:
            raw_count = await self.telegram.get_chat_member_count(chat_id=chat_id)
        except (TelegramAPIError, OSError) as error:
            LOGGER.warning("Could not reconcile channel member count: %s", type(error).__name__)
            fallback_title = f"@{self.settings.tracked_channel_username or channel_key}"
            channel_title = self.storage.channel_title(
                channel_key=channel_key, default=fallback_title
            )
            self.storage.defer_channel_count_check(
                channel_key=channel_key,
                channel_id=self.settings.tracked_channel_id,
                channel_username=self.settings.tracked_channel_username,
                channel_title=channel_title,
                next_check_at=current_time + self.settings.channel_count_check_interval_seconds,
                now=current_time,
            )
            return False

        human_count = max(raw_count - self.settings.tracked_channel_count_offset, 0)
        fallback_title = f"@{self.settings.tracked_channel_username or channel_key}"
        channel_title = self.storage.channel_title(channel_key=channel_key, default=fallback_title)
        drift = self.storage.record_channel_count_check(
            channel_key=channel_key,
            channel_id=self.settings.tracked_channel_id,
            channel_username=self.settings.tracked_channel_username,
            channel_title=channel_title,
            telegram_member_count=raw_count,
            telegram_human_count=human_count,
            next_check_at=current_time + self.settings.channel_count_check_interval_seconds,
            now=current_time,
        )
        if drift is None:
            return True
        if self.settings.owner_chat_id is None:
            self.storage.mark_channel_drift_reported(
                channel_key=drift.channel_key,
                drift_delta=drift.delta,
                now=current_time,
            )
            return True

        text = format_count_drift_notification(
            channel_title=drift.channel_title,
            local_roster_count=drift.local_roster_count,
            active_human_count=drift.active_human_count,
            telegram_human_count=drift.telegram_human_count,
            telegram_raw_count=drift.telegram_raw_count,
        )
        try:
            await self.telegram.send_message(chat_id=self.settings.owner_chat_id, text=text)
        except (TelegramAPIError, OSError) as error:
            LOGGER.warning("Could not send channel drift notification: %s", type(error).__name__)
            return True
        self.storage.mark_channel_drift_reported(
            channel_key=drift.channel_key,
            drift_delta=drift.delta,
            now=current_time,
        )
        return True

    def _handle_business_connection(self, payload: dict[str, Any], *, now: int) -> None:
        user = _dict(payload.get("user"))
        username = normalize_username(_str_or_none(user.get("username")))
        if username != self.settings.normalized_owner_username:
            LOGGER.info("Ignoring business connection for non-allowlisted owner username.")
            return

        rights = _dict(payload.get("rights"))
        can_reply = _optional_flag(rights, "can_reply")
        if can_reply is None:
            can_reply = _optional_flag(rights, "reply")
        if can_reply is None:
            can_reply = _optional_flag(payload, "can_reply")
        can_reply = can_reply is True
        self.storage.upsert_business_connection(
            connection_id=str(payload["id"]),
            owner_user_id=int(user["id"]),
            owner_username=username,
            user_chat_id=_optional_int(payload.get("user_chat_id")),
            is_enabled=bool(payload.get("is_enabled", True)),
            can_reply=can_reply,
            now=now,
        )
        if not payload.get("is_enabled", True) or not can_reply:
            self.storage.cancel_pending_for_connection(business_connection_id=str(payload["id"]))

    async def _handle_chat_member_update(self, payload: dict[str, Any], *, now: int) -> None:
        if not self.settings.channel_tracking_enabled:
            return
        channel_key = self.settings.tracked_channel_key
        if channel_key is None:
            return

        change = parse_chat_member_change(payload)
        if change is None:
            return
        if not channel_matches(
            change,
            tracked_username=self.settings.tracked_channel_username,
            tracked_channel_id=self.settings.tracked_channel_id,
        ):
            return

        occurred_at = change.occurred_at or now
        result = self.storage.record_channel_member_change(
            channel_key=channel_key,
            channel_id=change.channel_id,
            channel_username=change.channel_username,
            channel_title=change.channel_title,
            kind=change.kind,
            user=change.user,
            now=occurred_at,
            threshold=self.settings.tracked_channel_threshold,
        )
        if result is None or not result.notify_immediately:
            return
        if self.settings.owner_chat_id is None:
            LOGGER.info("Channel member change recorded without owner chat configured.")
            return

        notified_change = replace(change, kind=result.kind, occurred_at=occurred_at)
        text = format_member_change_notification(
            change=notified_change,
            active_human_count=result.active_human_count,
            threshold=self.settings.tracked_channel_threshold,
            threshold_reached_now=result.threshold_reached_now,
            previous_user=result.previous_user,
        )
        try:
            await self.telegram.send_message(chat_id=self.settings.owner_chat_id, text=text)
        except (TelegramAPIError, OSError) as error:
            LOGGER.warning("Could not send channel member notification: %s", type(error).__name__)
            self.storage.enqueue_channel_notification(
                channel_key=channel_key,
                owner_chat_id=self.settings.owner_chat_id,
                text=text,
                now=now,
            )

    async def _handle_business_message(self, message: dict[str, Any], *, now: int) -> None:
        connection_id = _str_or_none(message.get("business_connection_id"))
        if connection_id is None:
            return

        connection = self.storage.get_business_connection(connection_id)
        if connection is None:
            connection = await self._fetch_allowed_business_connection(connection_id, now=now)
        if connection is None or not connection.is_enabled or not connection.can_reply:
            return

        chat = _dict(message.get("chat"))
        if chat.get("type") != "private":
            return

        chat_identity = _chat_identity(chat)
        if not self._is_allowed_business_chat(chat_identity):
            LOGGER.info("Ignoring business message for non-selected private chat.")
            return

        if message.get("sender_business_bot"):
            LOGGER.info("Ignoring business echo sent by the connected bot.")
            return

        message_time = _optional_int(message.get("date")) or now
        sender = _dict(message.get("from"))
        if self._is_owner_sender(sender, connection):
            self.storage.record_owner_reply(
                business_connection_id=connection.id,
                chat_id=chat_identity.chat_id,
                chat_username=chat_identity.username,
                chat_display=chat_identity.display,
                now=message_time,
                owner_active_window_seconds=self.settings.owner_active_window_seconds,
            )
            return

        self.storage.record_inbound(
            business_connection_id=connection.id,
            chat_id=chat_identity.chat_id,
            chat_username=chat_identity.username,
            chat_display=chat_identity.display,
            inbound_message_id=int(message["message_id"]),
            now=message_time,
            delay_seconds=self.settings.auto_reply_delay_seconds,
            cooldown_seconds=self.settings.auto_reply_cooldown_seconds,
            owner_active_window_seconds=self.settings.owner_active_window_seconds,
        )

    async def _fetch_allowed_business_connection(
        self,
        business_connection_id: str,
        *,
        now: int,
    ) -> BusinessConnection | None:
        try:
            payload = await self.telegram.get_business_connection(
                business_connection_id=business_connection_id
            )
        except (TelegramAPIError, OSError) as error:
            LOGGER.warning(
                "Could not hydrate business connection metadata: %s",
                type(error).__name__,
            )
            return None
        self._handle_business_connection(payload, now=now)
        return self.storage.get_business_connection(business_connection_id)

    async def _handle_owner_command(self, message: dict[str, Any], *, now: int) -> None:
        text = _str_or_none(message.get("text"))
        if not text:
            return

        command = text.split(maxsplit=1)[0].split("@", maxsplit=1)[0].lower()
        if command not in STATUS_COMMANDS:
            return

        sender = _dict(message.get("from"))
        chat = _dict(message.get("chat"))
        if chat.get("type") != "private":
            return

        chat_id = _optional_int(chat.get("id"))
        if chat_id is None:
            return

        if (
            normalize_username(_str_or_none(sender.get("username")))
            != self.settings.normalized_owner_username
        ):
            await self.telegram.send_message(chat_id=chat_id, text="Nome is private.")
            return

        await self.telegram.send_message(chat_id=chat_id, text=self.status_report(now=now))

    def status_report(self, *, now: int | None = None) -> str:
        current_time = utc_timestamp() if now is None else now
        since = current_time - self.settings.auto_reply_cooldown_seconds
        inbound = self.storage.recent_inbound_chats(since=since)
        replies = self.storage.recent_reply_events(since=since)
        unread = self.storage.unread_chats()

        sections = [
            "Nome status",
            "",
            "Кто писал:",
            *_format_chat_lines(inbound),
            "",
            "Кому Nome ответил:",
            *_format_reply_lines(replies),
            "",
            "Непрочитанные личные чаты:",
            *_format_chat_lines(unread),
        ]
        return "\n".join(sections)

    def _is_owner_sender(self, sender: dict[str, Any], connection: BusinessConnection) -> bool:
        sender_id = _optional_int(sender.get("id"))
        if sender_id == connection.owner_user_id:
            return True
        return (
            normalize_username(_str_or_none(sender.get("username")))
            == self.settings.normalized_owner_username
        )

    def _is_allowed_business_chat(self, chat: ChatIdentity) -> bool:
        if chat.username is None:
            return False
        return chat.username in self.settings.normalized_setup_chat_usernames


def _format_chat_lines(chats: list[Any]) -> list[str]:
    if not chats:
        return ["- нет"]
    lines = []
    for chat in chats:
        username = _username_suffix(chat.chat_username, chat.chat_display)
        inbound_at = format_localish_timestamp(chat.last_inbound_at)
        lines.append(
            f"- {chat.chat_display}{username}: {chat.unread_count} unread, last {inbound_at}"
        )
    return lines


def _format_reply_lines(replies: list[Any]) -> list[str]:
    if not replies:
        return ["- нет"]
    lines = []
    for reply in replies:
        username = _username_suffix(reply.chat_username, reply.chat_display)
        sent_at = format_localish_timestamp(reply.sent_at)
        lines.append(f"- {reply.chat_display}{username}: {sent_at}")
    return lines


def _chat_identity(chat: dict[str, Any]) -> ChatIdentity:
    chat_id = int(chat["id"])
    username = normalize_username(_str_or_none(chat.get("username"))) or None
    first_name = _str_or_none(chat.get("first_name"))
    last_name = _str_or_none(chat.get("last_name"))
    title = _str_or_none(chat.get("title"))
    if first_name or last_name:
        display = " ".join(part for part in [first_name, last_name] if part)
    elif title:
        display = title
    elif username:
        display = f"@{username}"
    else:
        display = "private chat"
    return ChatIdentity(chat_id=chat_id, username=username, display=display)


def _username_suffix(username: str | None, display: str) -> str:
    if not username or display == f"@{username}":
        return ""
    return f" @{username}"


def _dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _str_or_none(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _optional_int(value: object) -> int | None:
    return None if value is None else int(cast(Any, value))


def _optional_flag(payload: dict[str, Any], name: str) -> bool | None:
    if name not in payload:
        return None
    return bool(payload.get(name))
