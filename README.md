# dev-machine

Authenticated remote MCP server for creating Linux dev machines on DigitalOcean and joining them to Tailscale.

## What You Need

- Cloudflare account with Workers enabled
- `wrangler` logged in:
  ```bash
  npx wrangler login
  ```
- DigitalOcean API token
- Tailscale OAuth client with permission to create auth keys
- SSH public key:
  ```bash
  cat ~/.ssh/id_ed25519.pub
  ```

## 1. Install

```bash
cd /Users/jacquesverre/Documents/Personal/dev-machine/mcp-server
npm install
```

## 2. Create KV

```bash
npx wrangler kv namespace create OAUTH_KV
```

Copy the returned `id` into `mcp-server/wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "OAUTH_KV",
    "id": "paste-kv-id-here"
  }
]
```

## 3. Set Bootstrap Secrets

Generate an encryption key:

```bash
openssl rand -base64 32
```

Set the Worker secrets:

```bash
npx wrangler secret put CONFIG_ENCRYPTION_KEY
npx wrangler secret put ADMIN_EMAIL
```

Use `jverre@gmail.com` for `ADMIN_EMAIL`.

`CONFIG_ENCRYPTION_KEY` encrypts provider credentials before storing them in KV.

Recommended: put the Worker behind Cloudflare Access and allow only `jverre@gmail.com`. When Cloudflare Access sends that email to the Worker, `/admin` and OAuth approval do not need an admin token.

Optional fallback:

```bash
npx wrangler secret put MCP_ADMIN_TOKEN
```

## 4. Run Locally

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:8787/admin
```

If running locally without Cloudflare Access, set and enter `MCP_ADMIN_TOKEN`. Then save:

```text
DIGITALOCEAN_ACCESS_TOKEN
TAILSCALE_TAILNET
TAILSCALE_CLIENT_ID
TAILSCALE_CLIENT_SECRET
DEV_MACHINE_SSH_PUBLIC_KEY
```

## 5. Deploy

```bash
npm run deploy
```

Your endpoints will be:

```text
https://dev-machine-mcp.<your-subdomain>.workers.dev/admin
https://dev-machine-mcp.<your-subdomain>.workers.dev/mcp
```

Open `/admin` on the deployed Worker and save the provider credentials there too. Local KV and deployed KV are separate unless configured otherwise.

## 6. Connect An MCP Client

Use the deployed MCP endpoint:

```text
https://dev-machine-mcp.<your-subdomain>.workers.dev/mcp
```

The OAuth endpoints are:

```text
/authorize
/token
/register
```

When prompted to authorize, Cloudflare Access should authenticate `jverre@gmail.com`. If not using Access, use `MCP_ADMIN_TOKEN`.

## 7. Create A Dev Machine

Call:

```text
devmachine_create
```

Useful arguments:

```json
{
  "name": "devbox",
  "region": "lon1",
  "size": "s-4vcpu-16gb",
  "image": "ubuntu-24-04-x64",
  "ref": "main"
}
```

Then connect through Tailscale:

```bash
ssh jacques@devbox
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

## Troubleshooting

Check configured secrets:

```text
devmachine_status
```

If `/admin` says `CONFIG_ENCRYPTION_KEY` is missing, run:

```bash
npx wrangler secret put CONFIG_ENCRYPTION_KEY
```

If OAuth state/token storage fails, confirm `OAUTH_KV` is bound in `wrangler.jsonc`.

Never commit real tokens, auth keys, private SSH keys, or `.env` files.
