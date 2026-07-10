# dev-machine MCP server

Cloudflare Worker remote MCP server with OAuth and encrypted KV config.

## Setup

```bash
npm install
npx wrangler kv namespace create OAUTH_KV
```

Copy the returned KV namespace id into `wrangler.jsonc`.

Set the only bootstrap secrets:

```bash
npx wrangler secret put MCP_ADMIN_TOKEN
npx wrangler secret put CONFIG_ENCRYPTION_KEY
```

Generate `CONFIG_ENCRYPTION_KEY` with:

```bash
openssl rand -base64 32
```

## Configure Provider Credentials

Run or deploy the Worker, then open `/admin`.

Save:

```text
DIGITALOCEAN_ACCESS_TOKEN
TAILSCALE_TAILNET
TAILSCALE_CLIENT_ID
TAILSCALE_CLIENT_SECRET
DEV_MACHINE_SSH_PUBLIC_KEY
```

These values are encrypted with `CONFIG_ENCRYPTION_KEY` and stored in KV.

## Run

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```
