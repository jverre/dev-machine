# dev-machine

A personal remote development machine built entirely on Cloudflare.

The Worker runs [T3 Code](https://github.com/pingdotgg/t3code), Codex, and Claude Code in one Cloudflare Sandbox container. Cloudflare Access protects the public hostname, and R2 stores `/workspace` checkpoints so the container can stop when idle and restore on the next request.

## How it works

```text
Browser
  -> Cloudflare Access
  -> Worker at code.jacquesverre.com
  -> Cloudflare Sandbox container
       - T3 Code
       - Codex
       - Claude Code
       - /workspace
  -> R2 workspace checkpoints
```

There is one Durable Object and at most one container instance. Requests wake it automatically. After 30 minutes without traffic, the Worker checks T3 Code's active-turn state, checkpoints `/workspace`, and stops the container. A failed checkpoint keeps the container alive instead of risking data loss.

## Documentation

- [Deploy the dev machine](docs/deployment.md)
- [Use and operate the dev machine](docs/operations.md)

Cloudflare Containers and the Sandbox SDK are still evolving. Pinning their versions in this repository keeps deployments repeatable.
