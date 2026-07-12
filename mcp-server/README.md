# dev-machine MCP server

Cloudflare Worker MCP server with OAuth and encrypted KV config.

## Runbook

```bash
npm install
npx wrangler login
npx wrangler kv namespace create OAUTH_KV
```

Add the KV id to `wrangler.jsonc`, then:

```bash
npx wrangler secret put MCP_ADMIN_TOKEN
npx wrangler secret put CONFIG_ENCRYPTION_KEY
```

Generate `CONFIG_ENCRYPTION_KEY` with:

```bash
openssl rand -base64 32
```

Run locally:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8787/admin
```

Save:

```text
DIGITALOCEAN_ACCESS_TOKEN
TAILSCALE_TAILNET
TAILSCALE_CLIENT_ID
TAILSCALE_CLIENT_SECRET
DEV_MACHINE_SSH_PUBLIC_KEY
```

Deploy:

```bash
npm run deploy
```

MCP endpoint:

```text
/mcp
```

Admin UI:

```text
/admin
```
