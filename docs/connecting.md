# Connecting

## Codex CLI

Remove any existing `dev-machine` configuration:

```bash
codex mcp remove dev-machine
```

Add the MCP server and start the OAuth login:

```bash
codex mcp add dev-machine --url https://mcp.jacquesverre.com/mcp
codex mcp login dev-machine
```

Enter `jverre@gmail.com` in the browser and use the one-time PIN sent by Cloudflare.

After login, call `devmachine_ping`. A successful response contains:

```json
{
  "ok": true,
  "authenticatedAs": "jverre@gmail.com"
}
```

## MCP Inspector

Start the Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

Select **Streamable HTTP**, connect to `https://mcp.jacquesverre.com/mcp`, complete the One-time PIN login, and call `devmachine_ping`.
