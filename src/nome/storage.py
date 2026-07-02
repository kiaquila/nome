from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

from nome.channel_subscribers import (
    ChangeKind,
    ChannelMemberChange,
    ChannelMemberIdentity,
    format_member_change_notification,
)


@dataclass(frozen=True)
class BusinessConnection:
    id: str
    owner_user_id: int
    owner_username: str
    user_chat_id: int | None
    is_enabled: bool
    can_reply: bool


@dataclass(frozen=True)
class PendingReply:
    business_connection_id: str
    chat_id: int
    chat_username: str | None
    chat_display: str
    inbound_message_id: int
    inbound_at: int
    due_at: int
    claim_token: str | None = None


@dataclass(frozen=True)
class ChatSummary:
    business_connection_id: str
    chat_id: int
    chat_username: str | None
    chat_display: str
    last_inbound_at: int | None
    last_owner_reply_at: int | None
    last_auto_reply_at: int | None
    unread_count: int


@dataclass(frozen=True)
class ReplyEvent:
    business_connection_id: str
    chat_id: int
    chat_username: str | None
    chat_display: str
    inbound_message_id: int
    sent_message_id: int | None
    sent_at: int


@dataclass(frozen=True)
class ScheduleResult:
    scheduled: bool
    due_at: int | None
    cooldown_until: int | None = None


@dataclass(frozen=True)
class ChannelMemberChangeResult:
    kind: ChangeKind
    user: ChannelMemberIdentity
    previous_user: ChannelMemberIdentity | None
    active_human_count: int
    notify_immediately: bool
    threshold_reached_now: bool
    pending_notification_id: int | None = None
    notification_text: str | None = None


@dataclass(frozen=True)
class ChannelDigest:
    channel_key: str
    channel_title: str
    active_human_count: int
    joined_count: int
    left_count: int
    profile_update_count: int
    drift_count: int
    period_started_at: int | None


@dataclass(frozen=True)
class PendingChannelNotification:
    id: int
    channel_key: str
    owner_chat_id: int
    text: str
    due_at: int


@dataclass(frozen=True)
class _ChannelMemberRecord:
    identity: ChannelMemberIdentity
    updated_at: int


@dataclass(frozen=True)
class ChannelDrift:
    channel_key: str
    channel_title: str
    local_roster_count: int
    active_human_count: int
    telegram_human_count: int
    telegram_raw_count: int
    delta: int


class SQLiteStorage:
    def __init__(self, path: Path) -> None:
        self.path = path

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.executescript(
                """
                PRAGMA journal_mode = WAL;

                CREATE TABLE IF NOT EXISTS business_connections (
                  id TEXT PRIMARY KEY,
                  owner_user_id INTEGER NOT NULL,
                  owner_username TEXT NOT NULL,
                  user_chat_id INTEGER,
                  is_enabled INTEGER NOT NULL,
                  can_reply INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS chat_states (
                  business_connection_id TEXT NOT NULL,
                  chat_id INTEGER NOT NULL,
                  chat_username TEXT,
                  chat_display TEXT NOT NULL,
                  last_inbound_at INTEGER,
                  last_owner_reply_at INTEGER,
                  last_auto_reply_at INTEGER,
                  unread_count INTEGER NOT NULL DEFAULT 0,
                  updated_at INTEGER NOT NULL,
                  PRIMARY KEY (business_connection_id, chat_id)
                );

                CREATE TABLE IF NOT EXISTS pending_replies (
                  business_connection_id TEXT NOT NULL,
                  chat_id INTEGER NOT NULL,
                  chat_username TEXT,
                  chat_display TEXT NOT NULL,
                  inbound_message_id INTEGER NOT NULL,
                  inbound_at INTEGER NOT NULL,
                  due_at INTEGER NOT NULL,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  failure_count INTEGER NOT NULL DEFAULT 0,
                  last_error TEXT,
                  PRIMARY KEY (business_connection_id, chat_id)
                );

                CREATE TABLE IF NOT EXISTS processed_inbound_messages (
                  business_connection_id TEXT NOT NULL,
                  chat_id INTEGER NOT NULL,
                  inbound_message_id INTEGER NOT NULL,
                  processed_at INTEGER NOT NULL,
                  PRIMARY KEY (business_connection_id, chat_id, inbound_message_id)
                );

                CREATE TABLE IF NOT EXISTS reply_events (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  business_connection_id TEXT NOT NULL,
                  chat_id INTEGER NOT NULL,
                  chat_username TEXT,
                  chat_display TEXT NOT NULL,
                  inbound_message_id INTEGER NOT NULL,
                  sent_message_id INTEGER,
                  sent_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS channel_members (
                  channel_key TEXT NOT NULL,
                  user_id INTEGER NOT NULL,
                  username TEXT,
                  first_name TEXT,
                  last_name TEXT,
                  is_bot INTEGER NOT NULL DEFAULT 0,
                  joined_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  PRIMARY KEY (channel_key, user_id)
                );

                CREATE TABLE IF NOT EXISTS channel_tracking_state (
                  channel_key TEXT PRIMARY KEY,
                  channel_id INTEGER,
                  channel_username TEXT,
                  channel_title TEXT NOT NULL,
                  active_human_count INTEGER NOT NULL DEFAULT 0,
                  telegram_member_count INTEGER,
                  telegram_human_count INTEGER,
                  telegram_count_checked_at INTEGER,
                  joined_count INTEGER NOT NULL DEFAULT 0,
                  left_count INTEGER NOT NULL DEFAULT 0,
                  profile_update_count INTEGER NOT NULL DEFAULT 0,
                  drift_count INTEGER NOT NULL DEFAULT 0,
                  digest_period_started_at INTEGER,
                  last_digest_at INTEGER,
                  next_count_check_at INTEGER,
                  last_drift_delta INTEGER NOT NULL DEFAULT 0,
                  last_drift_reported_at INTEGER,
                  threshold_reached_at INTEGER,
                  roster_imported_at INTEGER,
                  updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS channel_pending_notifications (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  channel_key TEXT NOT NULL,
                  owner_chat_id INTEGER NOT NULL,
                  text TEXT NOT NULL,
                  created_at INTEGER NOT NULL,
                  due_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  failure_count INTEGER NOT NULL DEFAULT 0
                );
                """
            )
            self._ensure_pending_reply_claim_columns(connection)
            self._ensure_channel_tracking_columns(connection)

    def _ensure_pending_reply_claim_columns(self, connection: sqlite3.Connection) -> None:
        rows = connection.execute("PRAGMA table_info(pending_replies)").fetchall()
        columns = {str(row["name"]) for row in rows}
        if "inbound_at" not in columns:
            connection.execute("ALTER TABLE pending_replies ADD COLUMN inbound_at INTEGER")
            connection.execute(
                """
                UPDATE pending_replies
                SET inbound_at = created_at
                WHERE inbound_at IS NULL
                """
            )
        if "claim_token" not in columns:
            connection.execute("ALTER TABLE pending_replies ADD COLUMN claim_token TEXT")
        if "claim_expires_at" not in columns:
            connection.execute("ALTER TABLE pending_replies ADD COLUMN claim_expires_at INTEGER")

    def _ensure_channel_tracking_columns(self, connection: sqlite3.Connection) -> None:
        rows = connection.execute("PRAGMA table_info(channel_tracking_state)").fetchall()
        columns = {str(row["name"]) for row in rows}
        if "roster_imported_at" not in columns:
            connection.execute(
                "ALTER TABLE channel_tracking_state ADD COLUMN roster_imported_at INTEGER"
            )

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def upsert_business_connection(
        self,
        *,
        connection_id: str,
        owner_user_id: int,
        owner_username: str,
        user_chat_id: int | None,
        is_enabled: bool,
        can_reply: bool,
        now: int,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO business_connections (
                  id, owner_user_id, owner_username, user_chat_id, is_enabled,
                  can_reply, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  owner_user_id = excluded.owner_user_id,
                  owner_username = excluded.owner_username,
                  user_chat_id = excluded.user_chat_id,
                  is_enabled = excluded.is_enabled,
                  can_reply = excluded.can_reply,
                  updated_at = excluded.updated_at
                """,
                (
                    connection_id,
                    owner_user_id,
                    owner_username,
                    user_chat_id,
                    int(is_enabled),
                    int(can_reply),
                    now,
                ),
            )

    def get_business_connection(self, connection_id: str) -> BusinessConnection | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM business_connections WHERE id = ?",
                (connection_id,),
            ).fetchone()
        if row is None:
            return None
        return BusinessConnection(
            id=str(row["id"]),
            owner_user_id=int(row["owner_user_id"]),
            owner_username=str(row["owner_username"]),
            user_chat_id=_optional_int(row["user_chat_id"]),
            is_enabled=bool(row["is_enabled"]),
            can_reply=bool(row["can_reply"]),
        )

    def record_inbound(
        self,
        *,
        business_connection_id: str,
        chat_id: int,
        chat_username: str | None,
        chat_display: str,
        inbound_message_id: int,
        now: int,
        delay_seconds: int,
        cooldown_seconds: int,
        owner_active_window_seconds: int = 0,
    ) -> ScheduleResult:
        due_at = now + delay_seconds
        with self._connect() as connection:
            existing = connection.execute(
                """
                SELECT last_auto_reply_at, last_owner_reply_at, unread_count
                FROM chat_states
                WHERE business_connection_id = ? AND chat_id = ?
                """,
                (business_connection_id, chat_id),
            ).fetchone()
            unread_count = int(existing["unread_count"]) + 1 if existing else 1
            last_auto_reply_at = _optional_int(existing["last_auto_reply_at"]) if existing else None
            last_owner_reply_at = (
                _optional_int(existing["last_owner_reply_at"]) if existing else None
            )

            if last_owner_reply_at is not None and now < last_owner_reply_at:
                return ScheduleResult(scheduled=False, due_at=None)

            inbound_cursor = connection.execute(
                """
                INSERT OR IGNORE INTO processed_inbound_messages (
                  business_connection_id, chat_id, inbound_message_id, processed_at
                )
                VALUES (?, ?, ?, ?)
                """,
                (business_connection_id, chat_id, inbound_message_id, now),
            )
            if inbound_cursor.rowcount == 0:
                return ScheduleResult(scheduled=False, due_at=None)

            connection.execute(
                """
                INSERT INTO chat_states (
                  business_connection_id, chat_id, chat_username, chat_display,
                  last_inbound_at, unread_count, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(business_connection_id, chat_id) DO UPDATE SET
                  chat_username = excluded.chat_username,
                  chat_display = excluded.chat_display,
                  last_inbound_at = CASE
                    WHEN chat_states.last_inbound_at IS NULL
                      OR excluded.last_inbound_at > chat_states.last_inbound_at
                    THEN excluded.last_inbound_at
                    ELSE chat_states.last_inbound_at
                  END,
                  unread_count = excluded.unread_count,
                  updated_at = CASE
                    WHEN excluded.updated_at > chat_states.updated_at
                    THEN excluded.updated_at
                    ELSE chat_states.updated_at
                  END
                """,
                (
                    business_connection_id,
                    chat_id,
                    chat_username,
                    chat_display,
                    now,
                    unread_count,
                    now,
                ),
            )

            if last_auto_reply_at is not None and now - last_auto_reply_at < cooldown_seconds:
                return ScheduleResult(
                    scheduled=False,
                    due_at=None,
                    cooldown_until=last_auto_reply_at + cooldown_seconds,
                )

            # When the owner has messaged this chat within the active window, the
            # owner is already engaged; Nome stays silent so it only auto-replies
            # to genuinely new conversations the owner has not started. The inbound
            # is still recorded above so it surfaces in the owner status report.
            if (
                last_owner_reply_at is not None
                and now - last_owner_reply_at < owner_active_window_seconds
            ):
                return ScheduleResult(scheduled=False, due_at=None)

            pending_cursor = connection.execute(
                """
                INSERT INTO pending_replies (
                  business_connection_id, chat_id, chat_username, chat_display,
                  inbound_message_id, inbound_at, due_at, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(business_connection_id, chat_id) DO UPDATE SET
                  chat_username = excluded.chat_username,
                  chat_display = excluded.chat_display,
                  inbound_message_id = excluded.inbound_message_id,
                  inbound_at = excluded.inbound_at,
                  due_at = excluded.due_at,
                  updated_at = excluded.updated_at,
                  claim_token = NULL,
                  claim_expires_at = NULL,
                  last_error = NULL
                WHERE (
                    pending_replies.claim_expires_at IS NULL
                    OR pending_replies.claim_expires_at <= ?
                  )
                  AND excluded.due_at >= pending_replies.due_at
                """,
                (
                    business_connection_id,
                    chat_id,
                    chat_username,
                    chat_display,
                    inbound_message_id,
                    now,
                    due_at,
                    now,
                    now,
                    now,
                ),
            )
        if pending_cursor.rowcount == 0:
            return ScheduleResult(scheduled=False, due_at=None)
        return ScheduleResult(scheduled=True, due_at=due_at)

    def record_owner_reply(
        self,
        *,
        business_connection_id: str,
        chat_id: int,
        chat_username: str | None,
        chat_display: str,
        now: int,
        owner_active_window_seconds: int = 0,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO chat_states (
                  business_connection_id, chat_id, chat_username, chat_display,
                  last_owner_reply_at, unread_count, updated_at
                )
                VALUES (?, ?, ?, ?, ?, 0, ?)
                ON CONFLICT(business_connection_id, chat_id) DO UPDATE SET
                  chat_username = excluded.chat_username,
                  chat_display = excluded.chat_display,
                  last_owner_reply_at = CASE
                    WHEN chat_states.last_owner_reply_at IS NULL
                      OR excluded.last_owner_reply_at > chat_states.last_owner_reply_at
                    THEN excluded.last_owner_reply_at
                    ELSE chat_states.last_owner_reply_at
                  END,
                  unread_count = CASE
                    WHEN chat_states.last_inbound_at IS NULL
                      OR excluded.last_owner_reply_at >= chat_states.last_inbound_at
                    THEN 0
                    ELSE chat_states.unread_count
                  END,
                  updated_at = CASE
                    WHEN excluded.updated_at > chat_states.updated_at
                    THEN excluded.updated_at
                    ELSE chat_states.updated_at
                  END
                """,
                (business_connection_id, chat_id, chat_username, chat_display, now, now),
            )
            connection.execute(
                """
                DELETE FROM pending_replies
                WHERE business_connection_id = ? AND chat_id = ?
                  AND EXISTS (
                    SELECT 1
                    FROM chat_states
                    WHERE business_connection_id = ?
                      AND chat_id = ?
                      AND (
                        last_inbound_at IS NULL
                        OR last_inbound_at <= ?
                      )
                  )
                """,
                (business_connection_id, chat_id, business_connection_id, chat_id, now),
            )
            if owner_active_window_seconds > 0:
                connection.execute(
                    """
                    DELETE FROM pending_replies
                    WHERE business_connection_id = ? AND chat_id = ?
                      AND inbound_at >= ?
                      AND inbound_at - ? < ?
                    """,
                    (
                        business_connection_id,
                        chat_id,
                        now,
                        now,
                        owner_active_window_seconds,
                    ),
                )

    def cancel_pending_reply(self, *, business_connection_id: str, chat_id: int) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                DELETE FROM pending_replies
                WHERE business_connection_id = ? AND chat_id = ?
                """,
                (business_connection_id, chat_id),
            )

    def cancel_pending_for_connection(self, *, business_connection_id: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM pending_replies WHERE business_connection_id = ?",
                (business_connection_id,),
            )

    def due_replies(self, *, now: int, limit: int = 25) -> list[PendingReply]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM pending_replies
                WHERE due_at <= ?
                  AND (claim_expires_at IS NULL OR claim_expires_at <= ?)
                ORDER BY due_at ASC
                LIMIT ?
                """,
                (now, now, limit),
            ).fetchall()
        return [
            PendingReply(
                business_connection_id=str(row["business_connection_id"]),
                chat_id=int(row["chat_id"]),
                chat_username=_optional_str(row["chat_username"]),
                chat_display=str(row["chat_display"]),
                inbound_message_id=int(row["inbound_message_id"]),
                inbound_at=int(row["inbound_at"]),
                due_at=int(row["due_at"]),
                claim_token=_optional_str(row["claim_token"]),
            )
            for row in rows
        ]

    def claim_due_reply(
        self, *, pending: PendingReply, now: int, lease_seconds: int = 300
    ) -> PendingReply | None:
        claim_token = uuid4().hex
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE pending_replies
                SET claim_token = ?,
                    claim_expires_at = ?,
                    updated_at = ?
                WHERE business_connection_id = ?
                  AND chat_id = ?
                  AND inbound_message_id = ?
                  AND due_at = ?
                  AND due_at <= ?
                  AND (claim_expires_at IS NULL OR claim_expires_at <= ?)
                """,
                (
                    claim_token,
                    now + lease_seconds,
                    now,
                    pending.business_connection_id,
                    pending.chat_id,
                    pending.inbound_message_id,
                    pending.due_at,
                    now,
                    now,
                ),
            )
        if cursor.rowcount != 1:
            return None
        return PendingReply(
            business_connection_id=pending.business_connection_id,
            chat_id=pending.chat_id,
            chat_username=pending.chat_username,
            chat_display=pending.chat_display,
            inbound_message_id=pending.inbound_message_id,
            inbound_at=pending.inbound_at,
            due_at=pending.due_at,
            claim_token=claim_token,
        )

    def claimed_reply_exists(self, *, pending: PendingReply) -> bool:
        if pending.claim_token is None:
            return False
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT 1
                FROM pending_replies
                WHERE business_connection_id = ?
                  AND chat_id = ?
                  AND inbound_message_id = ?
                  AND due_at = ?
                  AND claim_token = ?
                LIMIT 1
                """,
                (
                    pending.business_connection_id,
                    pending.chat_id,
                    pending.inbound_message_id,
                    pending.due_at,
                    pending.claim_token,
                ),
            ).fetchone()
        return row is not None

    def mark_reply_sent(
        self,
        *,
        pending: PendingReply,
        sent_message_id: int | None,
        now: int,
    ) -> bool:
        if pending.claim_token is None:
            return False
        with self._connect() as connection:
            connection.execute(
                """
                DELETE FROM pending_replies
                WHERE business_connection_id = ?
                  AND chat_id = ?
                  AND inbound_message_id = ?
                  AND due_at = ?
                  AND claim_token = ?
                """,
                (
                    pending.business_connection_id,
                    pending.chat_id,
                    pending.inbound_message_id,
                    pending.due_at,
                    pending.claim_token,
                ),
            )
            connection.execute(
                """
                UPDATE chat_states
                SET last_auto_reply_at = ?, updated_at = ?
                WHERE business_connection_id = ? AND chat_id = ?
                """,
                (now, now, pending.business_connection_id, pending.chat_id),
            )
            connection.execute(
                """
                INSERT INTO reply_events (
                  business_connection_id, chat_id, chat_username, chat_display,
                  inbound_message_id, sent_message_id, sent_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pending.business_connection_id,
                    pending.chat_id,
                    pending.chat_username,
                    pending.chat_display,
                    pending.inbound_message_id,
                    sent_message_id,
                    now,
                ),
            )
        return True

    def mark_reply_failed(
        self, *, pending: PendingReply, now: int, retry_after_seconds: int
    ) -> None:
        if pending.claim_token is None:
            return
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE pending_replies
                SET due_at = ?,
                    updated_at = ?,
                    failure_count = failure_count + 1,
                    last_error = ?,
                    claim_token = NULL,
                    claim_expires_at = NULL
                WHERE business_connection_id = ?
                  AND chat_id = ?
                  AND inbound_message_id = ?
                  AND due_at = ?
                  AND claim_token = ?
                """,
                (
                    now + retry_after_seconds,
                    now,
                    "telegram_send_failed",
                    pending.business_connection_id,
                    pending.chat_id,
                    pending.inbound_message_id,
                    pending.due_at,
                    pending.claim_token,
                ),
            )

    def import_channel_roster(
        self,
        *,
        channel_key: str,
        channel_id: int | None,
        channel_username: str | None,
        channel_title: str,
        members: list[ChannelMemberIdentity],
        now: int,
        threshold: int,
    ) -> int:
        active_human_count = sum(1 for member in members if not member.is_bot)
        threshold_reached_at = now if active_human_count >= threshold else None
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM channel_members WHERE channel_key = ?",
                (channel_key,),
            )
            connection.executemany(
                """
                INSERT INTO channel_members (
                  channel_key, user_id, username, first_name, last_name, is_bot,
                  joined_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        channel_key,
                        member.user_id,
                        member.username,
                        member.first_name,
                        member.last_name,
                        int(member.is_bot),
                        now,
                        now,
                    )
                    for member in members
                ],
            )
            self._ensure_channel_tracking_state(
                connection,
                channel_key=channel_key,
                channel_id=channel_id,
                channel_username=channel_username,
                channel_title=channel_title,
                active_human_count=active_human_count,
                threshold_reached_at=threshold_reached_at,
                now=now,
            )
            connection.execute(
                """
                UPDATE channel_tracking_state
                SET roster_imported_at = ?,
                    updated_at = ?
                WHERE channel_key = ?
                """,
                (now, now, channel_key),
            )
        return len(members)

    def record_channel_member_change(
        self,
        *,
        channel_key: str,
        channel_id: int,
        channel_username: str | None,
        channel_title: str,
        kind: ChangeKind,
        user: ChannelMemberIdentity,
        now: int,
        threshold: int,
        owner_chat_id: int | None = None,
        notification_change: ChannelMemberChange | None = None,
        notification_now: int | None = None,
    ) -> ChannelMemberChangeResult | None:
        pending_notification_id: int | None = None
        notification_text: str | None = None
        with self._connect() as connection:
            previous_member = self._get_channel_member_record(
                connection,
                channel_key=channel_key,
                user_id=user.user_id,
            )
            previous_user = previous_member.identity if previous_member is not None else None
            before_count = self._channel_human_count(connection, channel_key=channel_key)
            human_increment = 0 if user.is_bot else 1
            state = connection.execute(
                """
                SELECT threshold_reached_at, roster_imported_at
                FROM channel_tracking_state
                WHERE channel_key = ?
                """,
                (channel_key,),
            ).fetchone()
            threshold_was_reached = (
                state is not None and _optional_int(state["threshold_reached_at"]) is not None
            )
            roster_imported_at = (
                _optional_int(state["roster_imported_at"]) if state is not None else None
            )
            if previous_member is not None and now < previous_member.updated_at:
                return None
            if (
                previous_member is None
                and roster_imported_at is not None
                and now < roster_imported_at
            ):
                return None

            result_kind = kind
            if kind == "joined":
                if previous_user is None:
                    self._upsert_channel_member(
                        connection,
                        channel_key=channel_key,
                        user=user,
                        joined_at=now,
                        updated_at=now,
                    )
                    after_count = before_count + human_increment
                elif not user.same_public_profile(previous_user):
                    self._upsert_channel_member(
                        connection,
                        channel_key=channel_key,
                        user=user,
                        joined_at=now,
                        updated_at=now,
                    )
                    result_kind = "profile_updated"
                    after_count = before_count
                else:
                    return None
            elif kind == "left":
                if previous_user is None:
                    self._ensure_channel_tracking_state(
                        connection,
                        channel_key=channel_key,
                        channel_id=channel_id,
                        channel_username=channel_username,
                        channel_title=channel_title,
                        active_human_count=before_count,
                        threshold_reached_at=None,
                        now=now,
                    )
                    return None
                connection.execute(
                    """
                    DELETE FROM channel_members
                    WHERE channel_key = ? AND user_id = ?
                    """,
                    (channel_key, user.user_id),
                )
                after_count = max(before_count - human_increment, 0)
            else:
                if previous_user is None:
                    self._upsert_channel_member(
                        connection,
                        channel_key=channel_key,
                        user=user,
                        joined_at=now,
                        updated_at=now,
                    )
                    after_count = before_count + human_increment
                    self._ensure_channel_tracking_state(
                        connection,
                        channel_key=channel_key,
                        channel_id=channel_id,
                        channel_username=channel_username,
                        channel_title=channel_title,
                        active_human_count=after_count,
                        threshold_reached_at=now if after_count >= threshold else None,
                        now=now,
                    )
                    return None
                if user.same_public_profile(previous_user):
                    return None
                self._upsert_channel_member(
                    connection,
                    channel_key=channel_key,
                    user=user,
                    joined_at=now,
                    updated_at=now,
                )
                after_count = before_count

            if user.is_bot:
                self._ensure_channel_tracking_state(
                    connection,
                    channel_key=channel_key,
                    channel_id=channel_id,
                    channel_username=channel_username,
                    channel_title=channel_title,
                    active_human_count=after_count,
                    threshold_reached_at=None,
                    now=now,
                )
                return None

            threshold_reached_now = not threshold_was_reached and after_count >= threshold
            notify_immediately = not threshold_was_reached
            aggregate = not notify_immediately
            joined_increment = int(aggregate and result_kind == "joined")
            left_increment = int(aggregate and result_kind == "left")
            profile_increment = int(aggregate and result_kind == "profile_updated")
            self._ensure_channel_tracking_state(
                connection,
                channel_key=channel_key,
                channel_id=channel_id,
                channel_username=channel_username,
                channel_title=channel_title,
                active_human_count=after_count,
                threshold_reached_at=now if threshold_reached_now else None,
                now=now,
            )
            if aggregate:
                connection.execute(
                    """
                    UPDATE channel_tracking_state
                    SET joined_count = joined_count + ?,
                        left_count = left_count + ?,
                        profile_update_count = profile_update_count + ?,
                        digest_period_started_at = CASE
                          WHEN digest_period_started_at IS NULL THEN ?
                          ELSE digest_period_started_at
                        END,
                        updated_at = ?
                    WHERE channel_key = ?
                    """,
                    (
                        joined_increment,
                        left_increment,
                        profile_increment,
                        now,
                        now,
                        channel_key,
                    ),
                )

            if notify_immediately and owner_chat_id is not None and notification_change is not None:
                notified_change = replace(notification_change, kind=result_kind, occurred_at=now)
                notification_text = format_member_change_notification(
                    change=notified_change,
                    active_human_count=after_count,
                    threshold=threshold,
                    threshold_reached_now=threshold_reached_now,
                    previous_user=previous_user,
                )
                pending_notification_id = self._enqueue_channel_notification(
                    connection,
                    channel_key=channel_key,
                    owner_chat_id=owner_chat_id,
                    text=notification_text,
                    now=notification_now if notification_now is not None else now,
                )

        return ChannelMemberChangeResult(
            kind=result_kind,
            user=user,
            previous_user=previous_user,
            active_human_count=after_count,
            notify_immediately=notify_immediately,
            threshold_reached_now=threshold_reached_now,
            pending_notification_id=pending_notification_id,
            notification_text=notification_text,
        )

    def enqueue_channel_notification(
        self,
        *,
        channel_key: str,
        owner_chat_id: int,
        text: str,
        now: int,
        retry_after_seconds: int = 300,
    ) -> None:
        with self._connect() as connection:
            self._enqueue_channel_notification(
                connection,
                channel_key=channel_key,
                owner_chat_id=owner_chat_id,
                text=text,
                now=now,
                retry_after_seconds=retry_after_seconds,
            )

    def due_channel_notifications(
        self,
        *,
        now: int,
        limit: int = 20,
    ) -> list[PendingChannelNotification]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM channel_pending_notifications
                WHERE due_at <= ?
                ORDER BY due_at ASC, id ASC
                LIMIT ?
                """,
                (now, limit),
            ).fetchall()
        return [
            PendingChannelNotification(
                id=int(row["id"]),
                channel_key=str(row["channel_key"]),
                owner_chat_id=int(row["owner_chat_id"]),
                text=str(row["text"]),
                due_at=int(row["due_at"]),
            )
            for row in rows
        ]

    def mark_channel_notification_sent(self, *, notification_id: int) -> None:
        self.delete_channel_notification(notification_id=notification_id)

    def delete_channel_notification(self, *, notification_id: int) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                DELETE FROM channel_pending_notifications
                WHERE id = ?
                """,
                (notification_id,),
            )

    def mark_channel_notification_failed(
        self,
        *,
        notification_id: int,
        now: int,
        retry_after_seconds: int = 300,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE channel_pending_notifications
                SET due_at = ?,
                    updated_at = ?,
                    failure_count = failure_count + 1
                WHERE id = ?
                """,
                (now + retry_after_seconds, now, notification_id),
            )

    def _enqueue_channel_notification(
        self,
        connection: sqlite3.Connection,
        *,
        channel_key: str,
        owner_chat_id: int,
        text: str,
        now: int,
        retry_after_seconds: int = 300,
    ) -> int:
        cursor = connection.execute(
            """
            INSERT INTO channel_pending_notifications (
              channel_key, owner_chat_id, text, created_at, due_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                channel_key,
                owner_chat_id,
                text,
                now,
                now + retry_after_seconds,
                now,
            ),
        )
        notification_id = cursor.lastrowid
        if notification_id is None:
            raise RuntimeError("Could not create channel notification.")
        return notification_id

    def due_channel_digest(
        self,
        *,
        channel_key: str,
        now: int,
        interval_seconds: int,
    ) -> ChannelDigest | None:
        if interval_seconds <= 0:
            return None
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT *
                FROM channel_tracking_state
                WHERE channel_key = ?
                  AND threshold_reached_at IS NOT NULL
                """,
                (channel_key,),
            ).fetchone()
        if row is None:
            return None
        last_digest_at = _optional_int(row["last_digest_at"])
        period_started_at = _optional_int(row["digest_period_started_at"])
        due_after = last_digest_at if last_digest_at is not None else period_started_at
        if due_after is None:
            due_after = int(row["threshold_reached_at"])
        if now - due_after < interval_seconds:
            return None
        return ChannelDigest(
            channel_key=channel_key,
            channel_title=str(row["channel_title"]),
            active_human_count=int(row["active_human_count"]),
            joined_count=int(row["joined_count"]),
            left_count=int(row["left_count"]),
            profile_update_count=int(row["profile_update_count"]),
            drift_count=int(row["drift_count"]),
            period_started_at=period_started_at,
        )

    def mark_channel_digest_sent(self, *, digest: ChannelDigest, now: int) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT joined_count, left_count, profile_update_count, drift_count
                FROM channel_tracking_state
                WHERE channel_key = ?
                """,
                (digest.channel_key,),
            ).fetchone()
            if row is None:
                return
            joined_count = max(int(row["joined_count"]) - digest.joined_count, 0)
            left_count = max(int(row["left_count"]) - digest.left_count, 0)
            profile_update_count = max(
                int(row["profile_update_count"]) - digest.profile_update_count,
                0,
            )
            drift_count = max(int(row["drift_count"]) - digest.drift_count, 0)
            connection.execute(
                """
                UPDATE channel_tracking_state
                SET joined_count = ?,
                    left_count = ?,
                    profile_update_count = ?,
                    drift_count = ?,
                    digest_period_started_at = ?,
                    last_digest_at = ?,
                    updated_at = ?
                WHERE channel_key = ?
                """,
                (
                    joined_count,
                    left_count,
                    profile_update_count,
                    drift_count,
                    now,
                    now,
                    now,
                    digest.channel_key,
                ),
            )

    def channel_count_check_due(
        self,
        *,
        channel_key: str,
        now: int,
        interval_seconds: int,
    ) -> bool:
        if interval_seconds <= 0:
            return False
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT next_count_check_at
                FROM channel_tracking_state
                WHERE channel_key = ?
                """,
                (channel_key,),
            ).fetchone()
        next_check_at = _optional_int(row["next_count_check_at"]) if row is not None else None
        return next_check_at is None or next_check_at <= now

    def channel_title(self, *, channel_key: str, default: str) -> str:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT channel_title
                FROM channel_tracking_state
                WHERE channel_key = ?
                """,
                (channel_key,),
            ).fetchone()
        if row is None:
            return default
        return str(row["channel_title"])

    def record_channel_count_check(
        self,
        *,
        channel_key: str,
        channel_id: int | None,
        channel_username: str | None,
        channel_title: str,
        telegram_member_count: int,
        telegram_human_count: int,
        next_check_at: int,
        now: int,
    ) -> ChannelDrift | None:
        with self._connect() as connection:
            active_human_count = self._channel_human_count(connection, channel_key=channel_key)
            local_roster_count = self._channel_member_count(connection, channel_key=channel_key)
            row = connection.execute(
                """
                SELECT last_drift_delta, threshold_reached_at
                FROM channel_tracking_state
                WHERE channel_key = ?
                """,
                (channel_key,),
            ).fetchone()
            last_delta = int(row["last_drift_delta"]) if row is not None else 0
            delta = telegram_human_count - local_roster_count
            new_drift = delta != 0 and delta != last_delta
            self._ensure_channel_tracking_state(
                connection,
                channel_key=channel_key,
                channel_id=channel_id,
                channel_username=channel_username,
                channel_title=channel_title,
                active_human_count=active_human_count,
                threshold_reached_at=None,
                now=now,
            )
            connection.execute(
                """
                UPDATE channel_tracking_state
                SET telegram_member_count = ?,
                    telegram_human_count = ?,
                    telegram_count_checked_at = ?,
                    next_count_check_at = ?,
                    last_drift_delta = CASE
                      WHEN ? = 0 THEN 0
                      ELSE last_drift_delta
                    END,
                    updated_at = ?
                WHERE channel_key = ?
                """,
                (
                    telegram_member_count,
                    telegram_human_count,
                    now,
                    next_check_at,
                    delta,
                    now,
                    channel_key,
                ),
            )
        if not new_drift:
            return None
        return ChannelDrift(
            channel_key=channel_key,
            channel_title=channel_title,
            local_roster_count=local_roster_count,
            active_human_count=active_human_count,
            telegram_human_count=telegram_human_count,
            telegram_raw_count=telegram_member_count,
            delta=delta,
        )

    def mark_channel_drift_reported(
        self,
        *,
        channel_key: str,
        drift_delta: int,
        now: int,
    ) -> None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT last_drift_delta, threshold_reached_at
                FROM channel_tracking_state
                WHERE channel_key = ?
                """,
                (channel_key,),
            ).fetchone()
            if row is None:
                return

            last_delta = int(row["last_drift_delta"])
            threshold_reached = _optional_int(row["threshold_reached_at"]) is not None
            aggregate_drift = drift_delta != 0 and drift_delta != last_delta and threshold_reached
            connection.execute(
                """
                UPDATE channel_tracking_state
                SET drift_count = drift_count + ?,
                    last_drift_delta = ?,
                    last_drift_reported_at = CASE
                      WHEN ? != 0 THEN ?
                      ELSE last_drift_reported_at
                    END,
                    digest_period_started_at = CASE
                      WHEN ? != 0 AND digest_period_started_at IS NULL THEN ?
                      ELSE digest_period_started_at
                    END,
                    updated_at = ?
                WHERE channel_key = ?
                """,
                (
                    int(aggregate_drift),
                    drift_delta,
                    drift_delta,
                    now,
                    drift_delta,
                    now,
                    now,
                    channel_key,
                ),
            )

    def defer_channel_count_check(
        self,
        *,
        channel_key: str,
        channel_id: int | None,
        channel_username: str | None,
        channel_title: str,
        next_check_at: int,
        now: int,
    ) -> None:
        with self._connect() as connection:
            active_human_count = self._channel_human_count(connection, channel_key=channel_key)
            self._ensure_channel_tracking_state(
                connection,
                channel_key=channel_key,
                channel_id=channel_id,
                channel_username=channel_username,
                channel_title=channel_title,
                active_human_count=active_human_count,
                threshold_reached_at=None,
                now=now,
            )
            connection.execute(
                """
                UPDATE channel_tracking_state
                SET next_count_check_at = ?,
                    updated_at = ?
                WHERE channel_key = ?
                """,
                (next_check_at, now, channel_key),
            )

    def recent_inbound_chats(self, *, since: int, limit: int = 20) -> list[ChatSummary]:
        return self._chat_summaries(
            """
            SELECT *
            FROM chat_states
            WHERE last_inbound_at IS NOT NULL AND last_inbound_at >= ?
            ORDER BY last_inbound_at DESC
            LIMIT ?
            """,
            (since, limit),
        )

    def unread_chats(self, *, limit: int = 20) -> list[ChatSummary]:
        return self._chat_summaries(
            """
            SELECT *
            FROM chat_states
            WHERE unread_count > 0
            ORDER BY last_inbound_at DESC
            LIMIT ?
            """,
            (limit,),
        )

    def recent_reply_events(self, *, since: int, limit: int = 20) -> list[ReplyEvent]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM reply_events
                WHERE sent_at >= ?
                ORDER BY sent_at DESC
                LIMIT ?
                """,
                (since, limit),
            ).fetchall()
        return [
            ReplyEvent(
                business_connection_id=str(row["business_connection_id"]),
                chat_id=int(row["chat_id"]),
                chat_username=_optional_str(row["chat_username"]),
                chat_display=str(row["chat_display"]),
                inbound_message_id=int(row["inbound_message_id"]),
                sent_message_id=_optional_int(row["sent_message_id"]),
                sent_at=int(row["sent_at"]),
            )
            for row in rows
        ]

    def _ensure_channel_tracking_state(
        self,
        connection: sqlite3.Connection,
        *,
        channel_key: str,
        channel_id: int | None,
        channel_username: str | None,
        channel_title: str,
        active_human_count: int,
        threshold_reached_at: int | None,
        now: int,
    ) -> None:
        connection.execute(
            """
            INSERT INTO channel_tracking_state (
              channel_key, channel_id, channel_username, channel_title,
              active_human_count, digest_period_started_at, threshold_reached_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(channel_key) DO UPDATE SET
              channel_id = COALESCE(excluded.channel_id, channel_tracking_state.channel_id),
              channel_username = COALESCE(
                excluded.channel_username,
                channel_tracking_state.channel_username
              ),
              channel_title = excluded.channel_title,
              active_human_count = excluded.active_human_count,
              digest_period_started_at = CASE
                WHEN channel_tracking_state.digest_period_started_at IS NULL
                THEN excluded.digest_period_started_at
                ELSE channel_tracking_state.digest_period_started_at
              END,
              threshold_reached_at = CASE
                WHEN channel_tracking_state.threshold_reached_at IS NULL
                THEN excluded.threshold_reached_at
                ELSE channel_tracking_state.threshold_reached_at
              END,
              updated_at = excluded.updated_at
            """,
            (
                channel_key,
                channel_id,
                channel_username,
                channel_title,
                active_human_count,
                threshold_reached_at,
                threshold_reached_at,
                now,
            ),
        )

    def _channel_human_count(
        self,
        connection: sqlite3.Connection,
        *,
        channel_key: str,
    ) -> int:
        row = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM channel_members
            WHERE channel_key = ? AND is_bot = 0
            """,
            (channel_key,),
        ).fetchone()
        return int(row["count"]) if row is not None else 0

    def _channel_member_count(
        self,
        connection: sqlite3.Connection,
        *,
        channel_key: str,
    ) -> int:
        row = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM channel_members
            WHERE channel_key = ?
            """,
            (channel_key,),
        ).fetchone()
        return int(row["count"]) if row is not None else 0

    def _get_channel_member_record(
        self,
        connection: sqlite3.Connection,
        *,
        channel_key: str,
        user_id: int,
    ) -> _ChannelMemberRecord | None:
        row = connection.execute(
            """
            SELECT *
            FROM channel_members
            WHERE channel_key = ? AND user_id = ?
            """,
            (channel_key, user_id),
        ).fetchone()
        if row is None:
            return None
        return _ChannelMemberRecord(
            identity=ChannelMemberIdentity(
                user_id=int(row["user_id"]),
                username=_optional_str(row["username"]),
                first_name=_optional_str(row["first_name"]),
                last_name=_optional_str(row["last_name"]),
                is_bot=bool(row["is_bot"]),
            ),
            updated_at=int(row["updated_at"]),
        )

    def _upsert_channel_member(
        self,
        connection: sqlite3.Connection,
        *,
        channel_key: str,
        user: ChannelMemberIdentity,
        joined_at: int,
        updated_at: int,
    ) -> None:
        connection.execute(
            """
            INSERT INTO channel_members (
              channel_key, user_id, username, first_name, last_name, is_bot,
              joined_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(channel_key, user_id) DO UPDATE SET
              username = excluded.username,
              first_name = excluded.first_name,
              last_name = excluded.last_name,
              is_bot = excluded.is_bot,
              updated_at = excluded.updated_at
            """,
            (
                channel_key,
                user.user_id,
                user.username,
                user.first_name,
                user.last_name,
                int(user.is_bot),
                joined_at,
                updated_at,
            ),
        )

    def _chat_summaries(self, query: str, params: tuple[Any, ...]) -> list[ChatSummary]:
        with self._connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [
            ChatSummary(
                business_connection_id=str(row["business_connection_id"]),
                chat_id=int(row["chat_id"]),
                chat_username=_optional_str(row["chat_username"]),
                chat_display=str(row["chat_display"]),
                last_inbound_at=_optional_int(row["last_inbound_at"]),
                last_owner_reply_at=_optional_int(row["last_owner_reply_at"]),
                last_auto_reply_at=_optional_int(row["last_auto_reply_at"]),
                unread_count=int(row["unread_count"]),
            )
            for row in rows
        ]


def _optional_int(value: object) -> int | None:
    return None if value is None else int(cast(Any, value))


def _optional_str(value: object) -> str | None:
    return None if value is None else str(value)
