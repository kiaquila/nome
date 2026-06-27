# Nome

Nome is a private Telegram Business personal assistant bot. In v1 it can act as
a Telegram Chat Automation assistant for selected personal chats: if the owner
does not answer for five minutes, Nome sends one clear away reply on the
owner's behalf and will not repeat that reply to the same chat for twelve hours.

The repository keeps feature memory in `specs/` and durable product context in
`docs_project/`. Product runtime code is Python.

## Current Shape

- `docs_project/` contains durable product and architecture context.
- `specs/` contains per-PR feature memory: `spec.md`, `plan.md`, and `tasks.md`.
- `src/nome/` contains the FastAPI webhook service, Telegram adapter, storage,
  scheduling logic, and Telethon setup command.
- `tests/` covers privacy-sensitive bot behavior.
- `scripts/` contains local Python repository checks plus compatibility guard
  helpers used by existing GitHub workflows.
- `.github/workflows/` runs Python CI, PR guard, AI review, and dependency scans.

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

Run the webhook service:

```bash
uv run uvicorn nome.app:app --host 0.0.0.0 --port 8000
```

Configure Telegram Business chat automation from an existing Telethon user
session:

```bash
uv run python -m nome.business_setup
```

The setup command defaults to `@nome_ai_bot` and the selected users `@chapppp`
and `@AlexOxitocin`. It grants only `read_messages` and `reply` rights.

## Safety Defaults

- Owner commands are accepted only from the hard-coded username `ks_aquila`.
- Business connections for any other owner username are ignored.
- Message text is not persisted.
- Nome answers a private Business chat at most once per twelve hours.

See `docs_project/project/product-brief.md` and
`docs_project/project/architecture.md` before adding product code.
