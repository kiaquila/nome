# Feature: Disable Selected Away Replies And Deploy To Bots

## Summary

Nome keeps Telegram Business chat automation installed for the selected private
contacts, but auto-replies to `@chapppp` and `@AlexOxitocin` are disabled by
default. Their inbound messages continue to update owner status and unread
state, so the behavior is reversible by configuration instead of deleting the
away-reply implementation.

Production deployment moves from the old AWS OIDC/S3/SSM path to the new `bots`
host over SSH. Merges to `main` still trigger an auditable GitHub Actions
deployment of the exact merged revision.

## Goal

Pause outbound away replies to the two selected contacts and deploy future main
merges to the new production server without changing runtime Telegram secrets or
removing the existing away-reply feature.

## Scope

- Add a username-level disabled list for Business auto-replies.
- Default the disabled list to `chapppp,AlexOxitocin`.
- Keep selected-chat inbound tracking and owner status reporting active for
  disabled contacts.
- Recheck the disabled list before sending already queued pending replies.
- Replace the GitHub Actions AWS deployment workflow with an SSH deployment to
  the production host.
- Keep the existing host-side deploy script responsible for safe rsync,
  dependency sync, systemd install, service restart, health verification, and
  release metadata.
- Document the new runtime variable and SSH deployment secrets.

## Non-Goals

- Removing Telegram Business automation rights from the selected users.
- Removing away-reply code, cooldown storage, or status reporting.
- Moving runtime `.env` contents into GitHub.
- Adding containers, multi-host deploys, or automatic rollback.

## Acceptance Criteria

- AC-001: With default environment settings, inbound private Business messages
  from `@chapppp` and `@AlexOxitocin` do not create pending away replies.
- AC-002: Inbound messages from disabled contacts still update recent inbound
  and unread status without storing message text.
- AC-003: Clearing `NOME_AUTO_REPLY_DISABLED_USERNAMES` re-enables scheduling
  for otherwise selected contacts.
- AC-004: If a pending reply exists and the contact becomes disabled before the
  worker sends it, the worker cancels the pending reply and sends nothing.
- AC-005: The production deploy workflow still triggers on push to `main` and
  supports manual dispatch for a ref contained in `main`.
- AC-006: The workflow no longer requests AWS OIDC credentials, uploads to S3,
  or invokes SSM; it transfers the release archive and runs deployment over
  SSH.
- AC-007: SSH deployment uses a private key and pinned known-hosts value from
  GitHub secrets, keeps `DEPLOY_TARGET_DIR` masked, and does not print runtime
  `.env`, database contents, Telegram identifiers, or service journals.
- AC-008: The host deploy script remains protective around `.env`, `.venv`,
  `data/`, logs, deploy metadata, Telethon sessions, and SQLite files.
- AC-009: Local preflight passes before the PR is published, or any failure is
  explained with evidence.

## Privacy Requirements

- Do not commit Telegram tokens, user IDs, chat IDs, SSH keys, host private
  paths, production `.env` contents, databases, exported chats, or session
  files.
- Do not log raw Telegram message text while testing disabled contacts.
- Treat SSH coordinates as deployment secrets in GitHub Actions even when the
  local operator can reach the host with `ssh bots`.
