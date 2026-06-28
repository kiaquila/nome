from __future__ import annotations

import argparse
import asyncio
from collections.abc import Sequence

from telethon import TelegramClient
from telethon.tl import functions, types

from nome.config import ConfigurationError, Settings, normalize_username


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Grant Nome Telegram Business chat automation access.",
    )
    parser.add_argument(
        "--bot",
        default=None,
        help="Business bot username. Defaults to NOME_BUSINESS_BOT_USERNAME or nome_ai_bot.",
    )
    parser.add_argument(
        "--chats",
        nargs="*",
        default=None,
        help="Usernames to grant access to. Defaults to chapppp and AlexOxitocin.",
    )
    parser.add_argument(
        "--session",
        default=None,
        help="Telethon session path/name. Defaults to NOME_TELETHON_SESSION.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolve users and print the intended setup without applying it.",
    )
    return parser


async def configure_business_bot(
    *,
    settings: Settings,
    bot_username: str,
    chat_usernames: Sequence[str],
    session: str,
    dry_run: bool,
) -> None:
    settings.require_telethon()
    api_id = settings.telegram_api_id
    api_hash = settings.telegram_api_hash
    if api_id is None or api_hash is None:
        raise ConfigurationError("Telethon API credentials are required.")

    async with TelegramClient(session, api_id, api_hash) as client:
        me = await client.get_me()
        me_username = normalize_username(getattr(me, "username", None))
        if me_username != settings.normalized_owner_username:
            raise ConfigurationError(
                "Telethon session is not logged in as the allowlisted owner username."
            )

        bot_input = _input_user_from_entity(await client.get_entity(_as_username(bot_username)))
        user_inputs = [
            _input_user_from_entity(await client.get_entity(_as_username(username)))
            for username in chat_usernames
        ]

        print("Nome Business setup")
        print(f"- owner: @{settings.normalized_owner_username}")
        print(f"- bot: @{normalize_username(bot_username)}")
        print("- selected chats:")
        for username in chat_usernames:
            print(f"  - @{normalize_username(username)}")
        print("- rights: read_messages, reply")

        if dry_run:
            print("Dry run only; no Telegram settings were changed.")
            return

        rights = types.BusinessBotRights(reply=True, read_messages=True)
        recipients = types.InputBusinessBotRecipients(users=user_inputs)
        await client(
            functions.account.UpdateConnectedBotRequest(
                bot=bot_input,
                recipients=recipients,
                rights=rights,
            )
        )
        print("Telegram Business chat automation settings updated.")


def main() -> None:
    args = build_parser().parse_args()
    settings = Settings.from_env(require_bot_token=False)
    session = args.session or settings.telethon_session
    if not session:
        raise ConfigurationError("NOME_TELETHON_SESSION or --session is required.")
    bot_username = args.bot or settings.business_bot_username
    chat_usernames = args.chats or list(settings.setup_chat_usernames)
    asyncio.run(
        configure_business_bot(
            settings=settings,
            bot_username=bot_username,
            chat_usernames=chat_usernames,
            session=session,
            dry_run=bool(args.dry_run),
        )
    )


def _as_username(username: str) -> str:
    return f"@{normalize_username(username)}"


def _input_user_from_entity(entity: object) -> types.InputUser:
    user_id = getattr(entity, "id", None)
    access_hash = getattr(entity, "access_hash", None)
    if user_id is None or access_hash is None:
        raise ConfigurationError("Expected a Telegram user with an access hash.")
    return types.InputUser(user_id=int(user_id), access_hash=int(access_hash))


if __name__ == "__main__":
    main()
