from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

OWNER_USERNAME = "ks_aquila"
DEFAULT_BUSINESS_BOT_USERNAME = "nome_ai_bot"
DEFAULT_SETUP_CHAT_USERNAMES = ("chapppp", "AlexOxitocin")
DEFAULT_AUTO_REPLY_TEXT = (
    "Привет! Я Nome, личный бот-ассистент Кристины. Рад приветствовать! "
    "Сейчас она занята, но обязательно ответит позже."
)


class ConfigurationError(RuntimeError):
    """Raised when required runtime configuration is missing."""


def normalize_username(username: str | None) -> str:
    return (username or "").removeprefix("@").strip().lower()


def _optional_int(name: str) -> int | None:
    value = os.getenv(name)
    if not value:
        return None
    return int(value)


def _optional_csv(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    value = os.getenv(name)
    if not value:
        return default
    return tuple(item.strip().removeprefix("@") for item in value.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    bot_token: str
    webhook_secret_token: str | None
    database_path: Path
    owner_username: str = OWNER_USERNAME
    auto_reply_delay_seconds: int = 300
    auto_reply_cooldown_hours: int = 12
    auto_reply_text: str = DEFAULT_AUTO_REPLY_TEXT
    worker_poll_interval_seconds: float = 5.0
    telegram_api_id: int | None = None
    telegram_api_hash: str | None = None
    telethon_session: str | None = None
    business_bot_username: str = DEFAULT_BUSINESS_BOT_USERNAME
    setup_chat_usernames: tuple[str, ...] = DEFAULT_SETUP_CHAT_USERNAMES

    @classmethod
    def from_env(cls, *, require_bot_token: bool = True) -> Settings:
        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        if require_bot_token and not bot_token:
            raise ConfigurationError("TELEGRAM_BOT_TOKEN is required.")

        return cls(
            bot_token=bot_token,
            webhook_secret_token=os.getenv("TELEGRAM_WEBHOOK_SECRET_TOKEN"),
            database_path=Path(os.getenv("NOME_DATABASE_PATH", "data/nome.sqlite3")),
            auto_reply_delay_seconds=int(os.getenv("NOME_AUTO_REPLY_DELAY_SECONDS", "300")),
            auto_reply_cooldown_hours=int(os.getenv("NOME_AUTO_REPLY_COOLDOWN_HOURS", "12")),
            auto_reply_text=os.getenv("NOME_AUTO_REPLY_TEXT", DEFAULT_AUTO_REPLY_TEXT),
            worker_poll_interval_seconds=float(os.getenv("NOME_WORKER_POLL_SECONDS", "5")),
            telegram_api_id=_optional_int("TELEGRAM_API_ID"),
            telegram_api_hash=os.getenv("TELEGRAM_API_HASH"),
            telethon_session=os.getenv("NOME_TELETHON_SESSION"),
            business_bot_username=os.getenv(
                "NOME_BUSINESS_BOT_USERNAME", DEFAULT_BUSINESS_BOT_USERNAME
            ).removeprefix("@"),
            setup_chat_usernames=_optional_csv(
                "NOME_BUSINESS_CHAT_USERNAMES", DEFAULT_SETUP_CHAT_USERNAMES
            ),
        )

    @property
    def auto_reply_cooldown_seconds(self) -> int:
        return self.auto_reply_cooldown_hours * 60 * 60

    @property
    def normalized_owner_username(self) -> str:
        return normalize_username(self.owner_username)

    def require_telethon(self) -> None:
        missing = [
            name
            for name, value in {
                "TELEGRAM_API_ID": self.telegram_api_id,
                "TELEGRAM_API_HASH": self.telegram_api_hash,
            }.items()
            if not value
        ]
        if missing:
            raise ConfigurationError(f"Missing required Telethon settings: {', '.join(missing)}.")
