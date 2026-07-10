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
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
npx wrangler secret put CLOUDFLARE_SECRETS_STORE_ID
npx wrangler secret put CLOUDFLARE_API_TOKEN
```

`MCP_ADMIN_TOKEN` protects the OAuth consent page and `/admin` in this first version.
`CLOUDFLARE_API_TOKEN` needs permission to write Cloudflare Secrets Store entries.

After deploy, open `/admin` and save:

```text
DIGITALOCEAN_ACCESS_TOKEN
TAILSCALE_TAILNET
TAILSCALE_CLIENT_ID
TAILSCALE_CLIENT_SECRET
DEV_MACHINE_SSH_PUBLIC_KEY
```

Cloudflare does not let secret values be read back through the API after saving. Bind the saved Secrets Store entries to this Worker before MCP tools need to use the values.

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

Admin UI:

```text
/admin
```
