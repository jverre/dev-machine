# dev-machine MCP server

Cloudflare Worker remote MCP server with OAuth endpoints.

## Local Setup

```bash
npm install
npx wrangler kv namespace create OAUTH_KV
```

Copy the returned KV namespace id into `wrangler.jsonc`.

## Secrets

```bash
npx wrangler secret put MCP_ADMIN_TOKEN
npx wrangler secret put DIGITALOCEAN_ACCESS_TOKEN
npx wrangler secret put TAILSCALE_TAILNET
npx wrangler secret put TAILSCALE_CLIENT_ID
npx wrangler secret put TAILSCALE_CLIENT_SECRET
npx wrangler secret put DEV_MACHINE_SSH_PUBLIC_KEY
```

`MCP_ADMIN_TOKEN` protects the OAuth consent page in this first version.

## Run

```bash
npm run dev
```

## Deploy

```bash
npm run deploy
```

MCP endpoint:

```text
/mcp
```

OAuth endpoints:

```text
/authorize
/token
/register
```
