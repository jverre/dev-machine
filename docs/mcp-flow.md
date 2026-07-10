# MCP-First Dev Machine Flow

The dev machine should be controlled by an MCP server, not by hand-edited secrets on each laptop.

## Goal

From Codex or another MCP client:

```text
create a dev machine named devbox
stop devbox
start devbox
snapshot devbox and destroy it
recreate devbox from the latest snapshot
show connection details
```

The MCP server becomes the control plane for DigitalOcean and Tailscale.

## Secret Model

The public repo should contain no real secrets.

The MCP server runtime needs long-lived credentials for provider APIs:

```env
DIGITALOCEAN_ACCESS_TOKEN=
TAILSCALE_TAILNET=
TAILSCALE_CLIENT_ID=
TAILSCALE_CLIENT_SECRET=
```

The dev machines should not need long-lived secrets. For each machine creation, the MCP server should:

1. request a short-lived Tailscale API access token through OAuth client credentials
2. create a short-lived, tagged Tailscale auth key
3. resolve the requested `dev-machine` repo ref to a commit SHA
4. render cloud-init with the one-time auth key, repo URL, and resolved ref
5. create the DigitalOcean Droplet
6. wait for the node to appear in Tailscale
7. return the Tailscale DNS name and SSH command

This means the machine gets only the temporary bootstrap credential it needs to join the tailnet.

## Tailscale OAuth

Tailscale OAuth clients are designed for ongoing API access. The MCP server stores a client ID and client secret, then exchanges them for an access token when it needs to call the Tailscale API.

Recommended OAuth permissions:

- create auth keys
- read devices
- write devices if the MCP server should delete/expire machines
- grant only the `tag:dev-machine` tag, if possible

The generated auth key should be:

- short-lived
- tagged as `tag:dev-machine`
- preferably ephemeral for throwaway machines
- not stored after cloud-init is rendered

## DigitalOcean Flow

### Create

1. Generate a Tailscale auth key.
2. Resolve the requested repo ref, such as `main`, to a commit SHA.
3. Render `cloud-init/dev-machine.yaml` with:
   - SSH public key
   - GitHub repo URL
   - GitHub repo ref or resolved commit SHA
   - generated Tailscale auth key
   - desired hostname
   - dev user
4. Create Droplet with the rendered cloud-init user data.
5. Poll DigitalOcean until the Droplet is active.
6. Poll Tailscale until the hostname appears.
7. Return:

```text
ssh jacques@devbox
code --remote ssh-remote+devbox /home/jacques/work
```

The Droplet bootstraps itself by cloning the repo and checking out the MCP-selected ref:

```bash
git clone "$DEV_MACHINE_REPO" /opt/dev-machine
cd /opt/dev-machine
git checkout "$DEV_MACHINE_REF"
/opt/dev-machine/scripts/bootstrap.sh
```

### Stop

For a quick pause:

```text
DigitalOcean shutdown/power-off
```

This keeps the Droplet around and is fast, but it may still reserve billable resources.

For a cost-saving pause:

```text
snapshot -> destroy -> keep snapshot metadata
```

### Start

For a powered-off Droplet:

```text
power-on -> wait for Tailscale
```

For a destroyed Droplet:

```text
create from latest snapshot -> wait for Tailscale
```

## Proposed MCP Tools

Keep the tool surface small and explicit:

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

- `stop`: clean shutdown or power-off, fast but not necessarily cheaper
- `suspend`: snapshot and destroy, slower but cost-aware
- `start`: power on if a Droplet exists, recreate from snapshot otherwise
- `destroy`: delete Droplet and optionally delete snapshots

## No-Secret Client Experience

The user should not paste DigitalOcean or Tailscale secrets into Codex during normal operation.

Instead:

1. configure the MCP server once
2. store provider secrets in the MCP server host secret store
3. expose only safe MCP tools to Codex
4. require confirmation for destructive operations

Codex then asks the MCP server to perform operations; it does not directly receive provider credentials.

## Open Questions

- Where should the MCP server run: locally, on a small always-on host, or inside the tailnet?
- Should snapshots be kept per named environment or globally?
- Should the MCP server manage DigitalOcean firewalls?
- Should the MCP server remove old Tailscale devices after destroy?
- Should SSH fallback be enabled after the first successful Tailscale SSH connection?
