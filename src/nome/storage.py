from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast


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
    due_at: int


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
                  due_at INTEGER NOT NULL,
                  created_at INTEGER NOT NULL,
                  updated_at INTEGER NOT NULL,
                  failure_count INTEGER NOT NULL DEFAULT 0,
                  last_error TEXT,
                  PRIMARY KEY (business_connection_id, chat_id)
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
                """
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
    ) -> ScheduleResult:
        due_at = now + delay_seconds
        with self._connect() as connection:
            existing = connection.execute(
                """
                SELECT last_auto_reply_at, unread_count
                FROM chat_states
                WHERE business_connection_id = ? AND chat_id = ?
                """,
                (business_connection_id, chat_id),
            ).fetchone()
            unread_count = int(existing["unread_count"]) + 1 if existing else 1
            last_auto_reply_at = _optional_int(existing["last_auto_reply_at"]) if existing else None

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
                  last_inbound_at = excluded.last_inbound_at,
                  unread_count = excluded.unread_count,
                  updated_at = excluded.updated_at
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

            connection.execute(
                """
                INSERT INTO pending_replies (
                  business_connection_id, chat_id, chat_username, chat_display,
                  inbound_message_id, due_at, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(business_connection_id, chat_id) DO UPDATE SET
                  chat_username = excluded.chat_username,
                  chat_display = excluded.chat_display,
                  inbound_message_id = excluded.inbound_message_id,
                  due_at = excluded.due_at,
                  updated_at = excluded.updated_at,
                  last_error = NULL
                """,
                (
                    business_connection_id,
                    chat_id,
                    chat_username,
                    chat_display,
                    inbound_message_id,
                    due_at,
                    now,
                    now,
                ),
            )
        return ScheduleResult(scheduled=True, due_at=due_at)

    def record_owner_reply(
        self,
        *,
        business_connection_id: str,
        chat_id: int,
        chat_username: str | None,
        chat_display: str,
        now: int,
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
                  last_owner_reply_at = excluded.last_owner_reply_at,
                  unread_count = 0,
                  updated_at = excluded.updated_at
                """,
                (business_connection_id, chat_id, chat_username, chat_display, now, now),
            )
            connection.execute(
                """
                DELETE FROM pending_replies
                WHERE business_connection_id = ? AND chat_id = ?
                """,
                (business_connection_id, chat_id),
            )

    def due_replies(self, *, now: int, limit: int = 25) -> list[PendingReply]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM pending_replies
                WHERE due_at <= ?
                ORDER BY due_at ASC
                LIMIT ?
                """,
                (now, limit),
            ).fetchall()
        return [
            PendingReply(
                business_connection_id=str(row["business_connection_id"]),
                chat_id=int(row["chat_id"]),
                chat_username=_optional_str(row["chat_username"]),
                chat_display=str(row["chat_display"]),
                inbound_message_id=int(row["inbound_message_id"]),
                due_at=int(row["due_at"]),
            )
            for row in rows
        ]

    def mark_reply_sent(
        self,
        *,
        pending: PendingReply,
        sent_message_id: int | None,
        now: int,
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                DELETE FROM pending_replies
                WHERE business_connection_id = ? AND chat_id = ?
                """,
                (pending.business_connection_id, pending.chat_id),
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

    def mark_reply_failed(
        self, *, pending: PendingReply, now: int, retry_after_seconds: int
    ) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE pending_replies
                SET due_at = ?,
                    updated_at = ?,
                    failure_count = failure_count + 1,
                    last_error = ?
                WHERE business_connection_id = ? AND chat_id = ?
                """,
                (
                    now + retry_after_seconds,
                    now,
                    "telegram_send_failed",
                    pending.business_connection_id,
                    pending.chat_id,
                ),
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
