# Nome

Nome is a private Telegram Business personal assistant bot. In v1 it can act as
a Telegram Chat Automation assistant for selected personal chats: if the owner
does not answer for three minutes, Nome sends one clear away reply on the
owner's behalf and will not repeat that reply to the same chat for twelve hours.
Auto-replies for the currently selected personal chats are disabled by default
through `NOME_AUTO_REPLY_DISABLED_USERNAMES` while inbound tracking remains on.

The repository keeps feature memory in `specs/` and durable product context in
`docs_project/`. Product runtime code is Python.

## Current Shape

- `docs_project/` contains durable product and architecture context.
- `specs/` contains per-PR feature memory: `spec.md`, `plan.md`, and `tasks.md`.
- `src/nome/` contains the long-polling Telegram client, reply scheduler,
  channel subscriber tracker, storage, and Telethon setup commands. A small
  FastAPI app exposes only a loopback `/healthz` endpoint for deployment
  verification.
- `tests/` covers privacy-sensitive bot behavior.
- `scripts/` contains local Python repository checks plus compatibility guard
  helpers used by existing GitHub workflows.
- `.github/workflows/` runs Python CI, PR guard, AI review, and dependency scans.
- `deploy/` and `scripts/deploy_release.sh` define the production systemd
  service and host-side release procedure.

## Development Workflow

1. Create one branch and one PR per meaningful change.
2. Add or update one complete `specs/<feature-id>/` folder before changing product
   paths.
3. Keep secrets out of git. Use `.env.example` for variable names only.
4. Run the local check before pushing:

```bash
uv run python scripts/preflight.py
```

## Running Locally

Install dependencies:

```bash
uv sync --dev
```

Run the bot. The process opens a long-polling connection to the Telegram Bot
API and serves a loopback `/healthz` endpoint for the deploy verifier:

```bash
uv run nome
```

Nome does not require any inbound HTTP exposure. On startup it deletes any
previously configured Telegram webhook so `getUpdates` can take over cleanly.
The polling request explicitly includes `chat_member` updates when channel
subscriber tracking is configured.

## Production Deployment

Merges to `main` deploy through GitHub Actions over SSH to the production
`bots` host. The server keeps its own `.env`, virtual environment, SQLite data,
and private session files across releases. Runtime secrets are never copied
into GitHub.

See `docs_project/project/devops/deployment.md` for GitHub secrets, SSH host
prerequisites, and operational checks.

## Telegram Business Setup

Configure Telegram Business chat automation from an existing Telethon user
session:

```bash
uv run python -m nome.business_setup
```

The setup command defaults to `@nome_ai_bot` and the selected users `@chapppp`
and `@AlexOxitocin`. It grants only `read_messages` and `reply` rights. Runtime
auto-replies for those selected users are disabled by default until
`NOME_AUTO_REPLY_DISABLED_USERNAMES` is cleared or narrowed.

## Channel Subscriber Tracking

Nome can track one owner-configured Telegram channel after the bot is added as a
channel administrator. Configure:

```env
NOME_OWNER_CHAT_ID=
NOME_TRACKED_CHANNEL_USERNAME=
NOME_TRACKED_CHANNEL_THRESHOLD=150
```

Import the current roster from an owner-authorized Telethon snapshot:

```bash
uv run nome-channel-roster-import --input data/channel-roster.json
```

The Bot API cannot export all channel subscribers. Nome stores the imported
current roster, updates it from future `chat_member` events, and uses
`getChatMemberCount` only to detect count drift.

## Safety Defaults

- Owner commands are accepted only from the hard-coded username `ks_aquila`.
- Business connections for any other owner username are ignored.
- Message text is not persisted.
- Channel subscriber history is not persisted; Nome keeps the current roster
  plus aggregate daily counters.
- Auto-replies to `@chapppp` and `@AlexOxitocin` are disabled by default, while
  their inbound chats can still appear in owner status.
- Nome answers a private Business chat at most once per twelve hours.

See `docs_project/project/product-brief.md` and
`docs_project/project/architecture.md` before adding product code.
