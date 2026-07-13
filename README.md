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
2. Add an MCP server for `https://mcp.jacquesverre.com/mcp`.
3. Use `mcp.jacquesverre.com` as its public hostname.
4. Add an **Allow** policy whose email is exactly `jverre@gmail.com`.
5. Select **One-time PIN** as the only identity provider.
6. Turn on **Managed OAuth** under **Advanced settings**.
7. Enable dynamic client registration, localhost clients, and loopback clients.
8. Copy the application's **AUD** tag into `POLICY_AUD` in `mcp-server/wrangler.jsonc`.

Cloudflare Access now handles OAuth discovery, browser login, token issuance, and policy enforcement.

## 3. Configure JWT validation

The repository is configured for this deployment:

```jsonc
"vars": {
  "TEAM_DOMAIN": "https://lucky-truth-10f2.cloudflareaccess.com",
  "POLICY_AUD": "11f4dab8584f87607673628c34551808d3c21bc8c1bfe11d8acb0676074c2fb3",
  "ALLOWED_EMAIL": "jverre@gmail.com"
}
```

These values are identifiers, not secrets. The Worker validates every Access JWT's signature, issuer, audience, and email.

## 4. Deploy

```bash
cd mcp-server
npm run typecheck
npm run deploy
```

The MCP endpoint is:

```text
https://mcp.jacquesverre.com/mcp
```

## 5. Test OAuth and MCP

```bash
npx @modelcontextprotocol/inspector@latest
```

Open the Inspector URL printed by the command, select **Streamable HTTP**, enter the MCP endpoint, and connect. Cloudflare Access will ask for `jverre@gmail.com` and email a single-use PIN. Enter the PIN, list the tools, and call `devmachine_ping`.

Expected result:

```json
{
  "ok": true,
  "authenticatedAs": "jverre@gmail.com"
}
```

Requests that do not pass Cloudflare Access, use the wrong Access application, or authenticate as another email are rejected.
