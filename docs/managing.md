# Managing the dev machine

The MCP server manages exactly one DigitalOcean Droplet. It finds the machine using the `dev-machine-primary` tag and refuses to mutate anything if more than one Droplet has that tag.

## Check status

Call `devmachine_status` without arguments. It reports whether the machine exists and, when present, its ID, name, power status, size, region, and public IPv4 address.

## Create

Call `devmachine_create` with an optional allowed size:

```json
{
  "size": "s-2vcpu-4gb"
}
```

When `size` is omitted, the configured default is used. If the machine already exists, it is returned unchanged.

## Start

Call `devmachine_start` without arguments. If the machine is off, the tool submits a DigitalOcean `power_on` action. If it is already active or still being created, no change is made.

## Stop

Call `devmachine_stop` without arguments. If the machine is active, the tool requests a graceful DigitalOcean `shutdown`. It does not fall back to a hard power-off. If the machine is already off, no change is made.

## Resize

Call `devmachine_resize` with the new allowed size:

```json
{
  "size": "s-4vcpu-8gb"
}
```

The operation resizes CPU and RAM only. The disk is never expanded, preserving the ability to resize down later. DigitalOcean powers the Droplet off during this operation; call `devmachine_start` after the resize completes.

## Delete

Call `devmachine_delete` with explicit confirmation:

```json
{
  "confirm": true
}
```

Deletion is permanent. The tool deletes the Droplet only and leaves associated snapshots and volumes untouched. Calling it when the machine is already absent makes no change.
