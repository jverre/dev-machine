# dev-machine

Remote Linux dev machines controlled by an authenticated Cloudflare Worker MCP server.

## Flow

```text
Codex -> Worker MCP server -> DigitalOcean + Tailscale

New machine:
  clones this repo
  checks out the selected ref
  runs scripts/bootstrap.sh
  joins Tailscale
```

Provider credentials are saved from `/admin` into encrypted KV. The Worker needs one root secret: `CONFIG_ENCRYPTION_KEY`.

## Setup

```bash
cd mcp-server
npm install
npx wrangler kv namespace create OAUTH_KV
```

Put the returned KV id in `mcp-server/wrangler.jsonc`, then set:

```bash
npx wrangler secret put MCP_ADMIN_TOKEN
npx wrangler secret put CONFIG_ENCRYPTION_KEY
```

Generate the encryption key with:

```bash
openssl rand -base64 32
```

Run locally:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

Open `/admin` and save:

```text
DIGITALOCEAN_ACCESS_TOKEN
TAILSCALE_TAILNET
TAILSCALE_CLIENT_ID
TAILSCALE_CLIENT_SECRET
DEV_MACHINE_SSH_PUBLIC_KEY
```

## Endpoints

```text
/mcp
/authorize
/token
/register
/admin
```

## Tools

```text
devmachine_status
devmachine_list
devmachine_create
devmachine_start
devmachine_stop
devmachine_power_off
devmachine_suspend
devmachine_destroy
devmachine_connection_info
devmachine_render_cloud_init
```

## Safety

Never commit real tokens, auth keys, private SSH keys, or `.env` files.
