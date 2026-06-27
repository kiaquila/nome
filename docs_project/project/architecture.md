# Architecture

## Shape

Nome should use a handler-first architecture:

- Telegram update adapter receives raw updates and authenticates the user.
- Router maps commands or conversation state to small handlers.
- Handlers call application services with plain input objects.
- Application services use injected ports for storage, LLMs, reminders, calendar,
  mail, and outbound Telegram replies.
- Adapters own API clients, retries, serialization, and provider-specific errors.

## Boundaries

Telegram-specific types should not leak into core assistant logic. Core services
should be testable with fake ports and without network access.

## Data Safety

Logs should avoid raw message text and external payloads unless a spec explicitly
allows it for local debugging. Secrets belong in environment variables or a
secret manager, never in committed files.

## Likely Runtime

The repository is still language-neutral at this cleanup step. A later feature
spec should choose the runtime, Telegram library, storage, deployment target,
and test strategy before product code is added.
