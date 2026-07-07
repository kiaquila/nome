# Plan

## Runtime Behavior

Add `NOME_AUTO_REPLY_DISABLED_USERNAMES` as a comma-separated username list. It
defaults to the two current selected Business contacts, while
`NOME_BUSINESS_CHAT_USERNAMES` continues to control which private chats Nome
tracks at all.

The handler keeps the current allowlist flow:

- non-selected private chats are ignored;
- selected disabled chats are recorded as inbound and unread;
- disabled chats do not create pending replies;
- the due-reply worker cancels queued pending replies if the chat is disabled
  by the current configuration before send time.

This keeps the disablement reversible and avoids deleting scheduling,
cooldown, or reply-event code.

## Deployment

Keep `scripts/deploy_release.sh` as the host authority for safe release
application. Replace the GitHub Actions transport layer:

- checkout and validate the selected revision against `origin/main`;
- build a release archive with `git archive`;
- configure strict SSH from repository secrets;
- copy the archive to `/tmp/nome-release-<sha>.tar.gz` on the production host;
- run a small remote bootstrap that extracts the archive and invokes
  `scripts/deploy_release.sh`.

The workflow should require a pinned known-hosts entry and a private key secret
instead of disabling host-key checking. The host-side script keeps private
command output in `.deploy/last_deploy.log` and only reports safe status back to
GitHub Actions.

The service user and group become optional deploy-script inputs so the new host
can run `nome.service` as a non-`ubuntu` account while preserving the current
default.

## Validation

- Add unit coverage for disabled contacts at inbound-recording time and at
  due-reply recheck time.
- Add environment parsing coverage showing the disabled list defaults to
  `chapppp,AlexOxitocin` and can be cleared.
- Parse shell scripts with `bash -n`.
- Run focused tests, then `uv run python scripts/preflight.py`.
