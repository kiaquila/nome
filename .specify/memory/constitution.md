# Nome Constitution

## Principles

1. Privacy first: Telegram tokens, user ids, chat ids, message text, assistant
   memory, and integration payloads are private data.
2. Explicit authority: the bot must know which users may interact with it before
   executing assistant actions.
3. Handler-first design: commands and conversation flows stay small, while side
   effects go through injected ports or adapters.
4. Reversible automation: actions that mutate external systems need clear user
   intent, validation, and observable outcomes.
5. Spec-first delivery: product changes are planned in `specs/<feature-id>/`
   before implementation.

## Current Constraints

Nome starts as a single-owner Telegram assistant. Multi-user, group-chat, and
public SaaS behavior are out of scope until explicitly specified.
