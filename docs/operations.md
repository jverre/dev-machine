# Operations

## Daily use

Open [code.jacquesverre.com](https://code.jacquesverre.com). The first request wakes the container and restores the most recent `/workspace` checkpoint. Cold starts include container provisioning and can take a minute or two.

Repositories belong in `/workspace/repos`. T3 Code opens that directory by default. Home-directory state is persisted at `/workspace/home`.

## Automatic sleep

The machine uses a 30-minute idle window. An open T3 Code connection counts as activity. When the window expires, the Worker reads T3 Code's persisted session state:

- an active agent turn, including one waiting for approval, extends the idle window
- no active turn stops T3 Code, checkpoints `/workspace` to R2, and shuts down the container
- an unreadable agent state extends the idle window instead of interrupting uncertain work
- a checkpoint failure restarts T3 Code and leaves the container running

The next browser request restores the latest checkpoint and starts T3 Code again. Running processes and RAM are not restored; repositories, credentials, configuration, T3 state, and files under `/workspace` are restored.

## Service status

Open:

```text
https://code.jacquesverre.com/__dev-machine/status
```

It returns the container state and latest checkpoint ID without waking a stopped container.

## Create a new pairing link

Open:

```text
https://code.jacquesverre.com/__dev-machine/pair
```

This wakes the machine, creates a single-use link valid for 15 minutes, and redirects to T3 Code's pairing page.

## Manual checkpoint and sleep

The Worker exposes these Access-protected operations:

```text
POST /__dev-machine/checkpoint
POST /__dev-machine/sleep
```

`checkpoint` briefly restarts T3 Code after writing the snapshot. `sleep` writes the snapshot and stops the container. Normal use does not require either endpoint because idle shutdown runs automatically.

## Logs

Stream Worker and container lifecycle logs with:

```bash
pnpm wrangler tail
```

Startup, restore, pairing, checkpoint, and shutdown errors are logged with request paths. R2 credentials are never included in application logs.
