# dev-machine

Public-safe setup for personal remote Linux development machines.

The repo is the source of truth for what a dev machine should become. An MCP server owns orchestration: it creates the VM, generates short-lived Tailscale bootstrap credentials, renders cloud-init, and waits until the machine is reachable.

## Recommended Flow

```text
Codex / MCP client
  -> dev-machine MCP server
    -> resolve this repo ref to a commit SHA
    -> create a short-lived Tailscale auth key
    -> render cloud-init/dev-machine.yaml
    -> create a DigitalOcean Droplet
    -> wait for Tailscale SSH
    -> return connection details

Droplet first boot
  -> create dev user
  -> clone this repo into /opt/dev-machine
  -> checkout the MCP-selected ref
  -> run scripts/bootstrap.sh
```

The important bit: each machine clones this repo, but the MCP server pins the exact ref used for that machine. Use `main` while iterating; resolve and store a commit SHA for reproducible machines.

## What The Machine Gets

The machine receives only bootstrap material:

- a repo URL
- a repo ref or commit SHA
- a short-lived Tailscale auth key
- a fallback SSH public key
- machine/user names

It does not receive DigitalOcean credentials, Tailscale OAuth credentials, or other provider secrets.

## MCP Runtime Config

See `.env.example` for the MCP server runtime variables:

```env
DIGITALOCEAN_ACCESS_TOKEN=
TAILSCALE_TAILNET=
TAILSCALE_CLIENT_ID=
TAILSCALE_CLIENT_SECRET=

DEV_MACHINE_DEFAULT_REGION=lon1
DEV_MACHINE_DEFAULT_SIZE=s-4vcpu-16gb
DEV_MACHINE_DEFAULT_IMAGE=ubuntu-24-04-x64
DEV_MACHINE_DEFAULT_NAME=devbox
DEV_MACHINE_DEFAULT_USER=jacques
DEV_MACHINE_TAG=dev-machine
DEV_MACHINE_GITHUB_REPO=https://github.com/YOUR_GITHUB_USER/dev-machine.git
DEV_MACHINE_GITHUB_REF=main
DEV_MACHINE_SSH_PUBLIC_KEY=
```

Those values belong to the MCP server process or its secret store. Do not commit real credentials.

## Cloud-Init Template

`cloud-init/dev-machine.yaml` is rendered by the MCP server. It contains these placeholders:

- `__DEV_USER__`
- `__SSH_PUBLIC_KEY__`
- `__TAILSCALE_AUTH_KEY__`
- `__TAILSCALE_HOSTNAME__`
- `__DEV_MACHINE_REPO__`
- `__DEV_MACHINE_REF__`

The rendered machine bootstraps itself by cloning this repo:

```bash
git clone "$DEV_MACHINE_REPO" /opt/dev-machine
cd /opt/dev-machine
git checkout "$DEV_MACHINE_REF"
/opt/dev-machine/scripts/bootstrap.sh
```

## Bootstrap Script

`scripts/bootstrap.sh` runs on the remote machine. It installs:

- base CLI tools
- Docker
- Tailscale
- `tmux`, shells, `direnv`, `mise`

If `TAILSCALE_AUTH_KEY` is present, it joins the tailnet with Tailscale SSH enabled.

## Daily Use

Once the MCP server creates a machine:

```bash
ssh devbox
tmux new -A -s work
```

For VS Code / Cursor-style remote work:

```bash
code --remote ssh-remote+devbox /home/jacques/work
```

## Lifecycle Semantics

The MCP server should expose a small tool surface:

```text
devmachine_list
devmachine_create
devmachine_status
devmachine_start
devmachine_stop
devmachine_suspend
devmachine_destroy
devmachine_connection_info
```

Suggested meanings:

- `stop`: clean shutdown or power-off; fast but may still reserve billable Droplet resources
- `suspend`: snapshot and destroy; slower but cost-aware
- `start`: power on an existing Droplet, or recreate from the latest snapshot
- `destroy`: delete the Droplet and optionally delete retained snapshots

## Repo Layout

```text
cloud-init/   MCP-rendered first-boot template
config/       public-safe local config examples
docs/         notes and operating guides
scripts/      machine bootstrap and temporary local helpers
```

## Public Repo Rules

Never commit:

- Tailscale auth keys
- Tailscale OAuth secrets
- cloud provider API tokens
- private SSH keys
- `.env` files with secrets
