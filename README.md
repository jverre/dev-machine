# dev-machine

Personal, public-safe setup for a remote Linux development machine.

The goal is a durable dev box that feels like a Mac mini you can reach from anywhere:

- private access through Tailscale
- VS Code Remote SSH / Cursor / terminal-friendly workflow
- Docker and devcontainers for project isolation
- repeatable bootstrap scripts
- MCP-managed lifecycle for create, start, stop, snapshot, and destroy
- no machine secrets committed to git

## Target Host

Recommended baseline:

- Ubuntu 24.04 LTS or Debian 12
- 4-8 vCPU
- 16-32 GB RAM
- 100+ GB NVMe
- Tailscale installed during first boot

## Quick Start

On a fresh Linux host:

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB_USER/dev-machine/main/scripts/bootstrap.sh | bash
```

Or, safer while iterating:

```bash
git clone https://github.com/YOUR_GITHUB_USER/dev-machine.git
cd dev-machine
./scripts/bootstrap.sh
```

## First Boot With Cloud-Init

Use `cloud-init/dev-machine.yaml` as a template when creating a VM. In the normal flow, the MCP server renders the `__TOKEN__` placeholders from trusted runtime values:

- `__DEV_USER__`
- `__SSH_PUBLIC_KEY__`
- `__TAILSCALE_AUTH_KEY__`
- `__TAILSCALE_HOSTNAME__`
- `__DEV_MACHINE_REPO__`

The auth key should be generated just-in-time by the MCP server through the Tailscale API, then injected into DigitalOcean cloud-init. Do not commit real auth keys.

## MCP-First Flow

The intended control plane is an MCP server with access to DigitalOcean and Tailscale APIs.

```text
Codex / MCP client
  -> dev-machine MCP server
    -> create short-lived Tailscale auth key
    -> render cloud-init
    -> create DigitalOcean Droplet
    -> wait for Tailscale SSH
    -> return connection details
```

See `docs/mcp-flow.md` for the orchestration design.

## Daily Workflow

From your laptop:

```bash
ssh devbox
```

Then keep long-running work in `tmux`:

```bash
tmux new -A -s work
```

For VS Code:

```bash
code --remote ssh-remote+devbox /home/jacques/work
```

## Local SSH Config

Example `~/.ssh/config` entry:

```sshconfig
Host devbox
  HostName devbox
  User jacques
  ForwardAgent yes
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

If using Tailscale MagicDNS, `HostName devbox` can be the Tailscale machine name.

## Repo Layout

```text
cloud-init/   first-boot VM templates
config/       public-safe config examples
docs/         notes and operating guides
scripts/      bootstrap and lifecycle helpers
```

## Public Repo Rules

Never commit:

- Tailscale auth keys
- cloud provider API tokens
- private SSH keys
- machine-specific passwords
- `.env` files with secrets

Use `.env.example` files and local shell exports instead.
