# dev-machine

Remote dev machines controlled by an authenticated MCP server.

## How It Works

```text
Codex
  -> Cloudflare Worker MCP server
    -> DigitalOcean API
    -> Tailscale API
    -> cloud-init

New dev machine
  -> clones this repo
  -> checks out the selected ref
  -> runs scripts/bootstrap.sh
  -> joins Tailscale
```

The dev machine never gets DigitalOcean or Tailscale OAuth secrets. It only gets short-lived bootstrap data.

## Repo Layout

```text
mcp-server/   Cloudflare Worker remote MCP server
cloud-init/   template rendered by the MCP server
scripts/      machine bootstrap scripts
docs/         design notes
```

## Start The MCP Server

```bash
cd mcp-server
npm install
npx wrangler kv namespace create OAUTH_KV
```

Add the returned KV namespace id to `mcp-server/wrangler.jsonc`, then set secrets:

```bash
npx wrangler secret put MCP_ADMIN_TOKEN
npx wrangler secret put DIGITALOCEAN_ACCESS_TOKEN
npx wrangler secret put TAILSCALE_TAILNET
npx wrangler secret put TAILSCALE_CLIENT_ID
npx wrangler secret put TAILSCALE_CLIENT_SECRET
npx wrangler secret put DEV_MACHINE_SSH_PUBLIC_KEY
```

Run locally:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

The MCP endpoint is:

```text
https://<worker-name>.<account>.workers.dev/mcp
```

OAuth endpoints are:

```text
/authorize
/token
/register
```

## Current Tools

```text
devmachine_status
devmachine_connection_info
devmachine_render_cloud_init
devmachine_create
```

`devmachine_create` currently returns a creation plan. The next step is wiring it to DigitalOcean and Tailscale.

## Public Repo Rules

Never commit real tokens, auth keys, private SSH keys, or `.env` files.
