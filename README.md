# dev-machine

A minimal remote MCP server on Cloudflare Workers, protected by Cloudflare Access Managed OAuth.

It currently exposes one tool, `devmachine_ping`, so the MCP transport and OAuth flow can be verified before any machine-management code is added.

There is no admin UI, custom OAuth server, KV namespace, or Worker secret.

## 1. Install

```bash
cd mcp-server
npm install
```

## 2. Create the Access application

In Cloudflare Zero Trust:

1. Go to **Access controls** > **AI controls** > **MCP servers**.
2. Add an MCP server for `https://dev-machine-mcp.jverre.workers.dev/mcp`.
3. Use `dev-machine-mcp.jverre.workers.dev` as its public hostname.
4. Add an **Allow** policy whose email is exactly `jverre@gmail.com`.
5. Turn on **Managed OAuth** under **Advanced settings**.
6. Copy the application's **AUD** tag.

Cloudflare Access now handles OAuth discovery, browser login, token issuance, and policy enforcement.

## 3. Configure JWT validation

Edit `mcp-server/wrangler.jsonc`:

```jsonc
"vars": {
  "TEAM_DOMAIN": "https://<your-team-name>.cloudflareaccess.com",
  "POLICY_AUD": "<the-AUD-tag-from-the-Access-application>",
  "ALLOWED_EMAIL": "jverre@gmail.com"
}
```

Find the team domain under **Zero Trust** > **Settings** > **Team name and domain**.

These values are identifiers, not secrets. The Worker validates every Access JWT's signature, issuer, audience, and email.

## 4. Deploy

```bash
cd mcp-server
npm run typecheck
npm run deploy
```

The MCP endpoint is:

```text
https://dev-machine-mcp.jverre.workers.dev/mcp
```

## 5. Test OAuth and MCP

```bash
npx @modelcontextprotocol/inspector@latest
```

Open the Inspector URL printed by the command, select **Streamable HTTP**, enter the MCP endpoint, and connect. Cloudflare Access will open the OAuth login flow. Sign in as `jverre@gmail.com`, list the tools, and call `devmachine_ping`.

Expected result:

```json
{
  "ok": true,
  "authenticatedAs": "jverre@gmail.com"
}
```

Requests that do not pass Cloudflare Access, use the wrong Access application, or authenticate as another email are rejected.
