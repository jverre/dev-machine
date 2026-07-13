# dev-machine

A remote MCP server running on Cloudflare Workers and protected by Cloudflare Access Managed OAuth.

The server manages one DigitalOcean dev machine and exposes these tools:

- `devmachine_ping`: verifies the MCP connection and returns the authenticated email address.
- `devmachine_status`: returns the machine's current state and public IP address.
- `devmachine_create`: creates the machine if it does not already exist.
- `devmachine_start`: powers on the machine.
- `devmachine_stop`: requests a graceful shutdown.
- `devmachine_resize`: changes its CPU and RAM without expanding its disk.
- `devmachine_delete`: permanently deletes the machine.

The Worker validates the Cloudflare Access JWT signature, issuer, audience, and email before handling MCP requests.

## Documentation

- [Deploy and configure the server](docs/deployment.md)
- [Connect an MCP client](docs/connecting.md)
- [Manage the dev machine](docs/managing.md)
