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
npx wrangler secret put CONFIG_ENCRYPTION_KEY
npx wrangler secret put ADMIN_EMAIL
```

Generate `CONFIG_ENCRYPTION_KEY` with:

```bash
openssl rand -base64 32
```

Use `jverre@gmail.com` for `ADMIN_EMAIL`.

Recommended: protect the Worker with Cloudflare Access and allow only `jverre@gmail.com`. The Worker trusts the `cf-access-authenticated-user-email` header set by Cloudflare Access.

Optional local fallback:

```bash
npx wrangler secret put MCP_ADMIN_TOKEN
```

Run locally:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8787/admin
```

If running locally without Cloudflare Access, enter `MCP_ADMIN_TOKEN`.

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
