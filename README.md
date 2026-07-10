# dev-machine

Personal, public-safe setup for a remote Linux development machine.

The goal is a durable dev box that feels like a Mac mini you can reach from anywhere:

- private access through Tailscale
- VS Code Remote SSH / Cursor / terminal-friendly workflow
- Docker and devcontainers for project isolation
- repeatable bootstrap scripts
- no secrets committed to git

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

Use `cloud-init/dev-machine.yaml` as a template when creating a VM. Replace:

- `YOUR_SSH_PUBLIC_KEY`
- `YOUR_GITHUB_USER`
- `YOUR_TAILSCALE_AUTH_KEY`

Prefer a short-lived, tagged Tailscale auth key. Do not commit real auth keys.

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
