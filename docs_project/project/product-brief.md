# Product Brief

## Purpose

Nome is a private Telegram bot that helps its owner capture, organize, and act
on personal information from chat. It should feel like a careful assistant:
fast to invoke, conservative with side effects, and clear about what it did.

## Initial User

The initial user is the repository owner. Nome should reject unknown Telegram
users by default and expose allowlist configuration before any assistant actions
are implemented.

## First Capabilities

- Reply through Telegram Business Chat Automation when the owner is busy and a
  selected private chat has waited for three minutes.
- Report recent inbound private chats, away replies, and inferred unread chats
  through an owner-only Telegram command.
- Capture short notes, tasks, and reminders from Telegram messages.
- Confirm parsed intent before scheduling or sending anything externally.
- Store assistant memory in a replaceable persistence layer.
- Support future adapters for calendar, mail, documents, and LLM calls without
  coupling those services to Telegram handlers.

## Non-Goals For Now

- Public bot distribution.
- Group-chat workflows.
- Multi-tenant accounts or billing.
- Autonomous outbound messages outside explicit owner-configured Telegram
  Business chat automation.
