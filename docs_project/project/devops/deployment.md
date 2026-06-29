# Production Deployment

## Overview

Nome deploys to one AWS EC2 host through GitHub Actions. The workflow uses
GitHub OIDC for short-lived AWS credentials, S3 for the release archive, and
AWS Systems Manager Run Command for host access. No SSH key or long-lived AWS
access key is stored in GitHub.

The workflow is defined in `.github/workflows/deploy.yml`. It runs after a push
to `main` and can also be dispatched manually for a revision already contained
in `main` history.

GitHub logs mask the AWS account id during role assumption and suppress
successful S3 upload destinations. They also do not print the configured
production target path. Verbose dependency and file synchronization output
remains in a host-local deploy log under `.deploy/`; the target path remains
available in host-local deployment metadata.

## GitHub Variables

Define these repository-level GitHub Actions variables:

| Variable | Purpose |
| --- | --- |
| `AWS_REGION` | Region containing the deployment resources and EC2 instance. |
| `AWS_DEPLOY_ROLE_ARN` | IAM role trusted by the Nome production environment's OIDC subject. |
| `DEPLOY_S3_BUCKET` | Private bucket used for immutable release archives. |
| `DEPLOY_INSTANCE_ID` | SSM-managed EC2 instance that runs Nome. |
| `DEPLOY_TARGET_DIR` | Stable absolute host path to the dedicated Nome directory, normally `/home/ubuntu/nome`. The final path segment must be `nome`. |

These values are deployment coordinates, not runtime secrets. Telegram tokens
and other Nome settings must not be copied into GitHub variables or secrets.

## AWS Access

Use a repository-specific IAM role for deployment. Its trust policy should
accept only this GitHub OIDC subject:

```text
repo:kiaquila/nome:ref:refs/heads/main
```

Keeping the job outside a GitHub Environment preserves the branch name in the
OIDC subject. This lets AWS reject deploy attempts from any other branch even
when repository Actions variables are readable there.

The role needs permission to upload and read release objects in the configured
bucket, send and cancel `AWS-RunShellScript` commands for the production
instance, and read SSM command invocation status. The EC2 instance must already
be registered with Systems Manager and have permission to receive Run Command
requests.

## Host Prerequisites

The host uses Ubuntu, Python 3.12, `rsync`, `flock`, `systemd`, and a
passwordless `sudo` policy for the `ubuntu` deployment user. Before the first
workflow deployment, provision this file directly on the host:

```text
/home/ubuntu/nome/.env
```

It must be owned by the service user and have mode `0600`. Deployment only
checks that the file exists; it does not print, upload, replace, or delete it.

## Release Lifecycle

1. GitHub archives the exact checked-out Git revision.
2. The archive is uploaded to S3 and exposed to the instance with a one-hour
   presigned URL.
3. SSM downloads and extracts the archive into a temporary host directory.
4. `scripts/deploy_release.sh` synchronizes tracked files into the stable target
   directory while preserving `.env`, `.venv`, `data/`, deploy metadata,
   Telethon sessions, and SQLite files.
5. The script verifies that `uv.lock` matches project metadata, synchronizes
   production dependencies from the committed lockfile, compiles `src/nome`,
   installs the managed systemd unit, and restarts `nome.service`.
6. The release succeeds only when systemd reports the service active and the
   loopback `/healthz` endpoint responds successfully.
7. The deployed revision is recorded in `.deploy/current_release.json`.

Deployments are serialized in GitHub Actions and again on the host with a file
lock. The current service remains loopback-only while Nome still contains its
webhook adapter. Long polling is a separate runtime change.

The SSM command has a five-minute start deadline and a twenty-minute shell
execution timeout. GitHub Actions polls through that full window plus one poll
interval before reporting a timeout, and cancels the command before exiting so a
deployment cannot continue silently after the workflow has failed.

The host script refuses broad parent directories such as `/home/ubuntu` and
symlinked target paths. The target must be a dedicated directory whose final
path segment is `nome` before the destructive `rsync --delete` step can run.

## Operations

Inspect the service on the host with:

```bash
sudo systemctl status nome
sudo journalctl -u nome -n 100 --no-pager
```

Inspect the deployed revision without reading runtime secrets:

```bash
cat /home/ubuntu/nome/.deploy/current_release.json
```

A failed workflow prints the SSM command output and safe systemd state fields,
but it does not stream service journal entries back into GitHub Actions. Inspect
private service logs on the host, correct the release or host configuration,
then dispatch the workflow again for a revision in `main`.
