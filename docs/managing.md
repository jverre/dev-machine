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

## Resize

Call `devmachine_resize` with the new allowed size:

```json
{
  "size": "s-4vcpu-8gb"
}
```

The operation resizes CPU and RAM only. The disk is never expanded, preserving the ability to resize down later. DigitalOcean powers the Droplet off during this operation; starting it again is not implemented yet.

## Delete

Call `devmachine_delete` with explicit confirmation:

```json
{
  "confirm": true
}
```

Deletion is permanent. The tool deletes the Droplet only and leaves associated snapshots and volumes untouched. Calling it when the machine is already absent makes no change.
