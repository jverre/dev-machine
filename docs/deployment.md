# Deployment

## Requirements

- Node.js and npm
- A Cloudflare account with the `jacquesverre.com` zone
- Wrangler authenticated with that Cloudflare account
- A DigitalOcean account containing the configured SSH key

## Install dependencies

```bash
cd mcp-server
npm install
```

## Configure Cloudflare Access

In Cloudflare Zero Trust:

1. Go to **Access controls** > **AI controls** > **MCP servers**.
2. Add an MCP server for `https://mcp.jacquesverre.com/mcp`.
3. Add an **Allow** policy for the email `jverre@gmail.com`.
4. Select **One-time PIN** as the identity provider.
5. Enable **Managed OAuth**.
6. Enable dynamic client registration, localhost clients, and loopback clients.

The Worker configuration in `mcp-server/wrangler.jsonc` contains the Access team domain, application AUD, allowed email, and custom domain. These values are identifiers rather than secrets.

## Configure DigitalOcean

Create a DigitalOcean personal access token with these custom scopes:

```text
droplet:create
droplet:read
droplet:update
droplet:delete
image:read
ssh_key:read
tag:create
tag:read
```

Add the token to the `dev-machine-mcp` Worker as an encrypted secret named `DIGITALOCEAN_TOKEN`. In the Cloudflare dashboard, open **Workers & Pages** > **dev-machine-mcp** > **Settings** > **Variables and Secrets**, then add a **Secret**.

The non-secret machine configuration is tracked in `mcp-server/wrangler.jsonc`:

```text
Name: dev-machine
Region: lon1
Image: ubuntu-24-04-x64
Default size: s-2vcpu-4gb
Allowed sizes: s-2vcpu-4gb, s-4vcpu-8gb, s-8vcpu-16gb
Tag: dev-machine-primary
SSH key: d3:ef:7e:b1:7a:49:03:d3:df:68:d6:37:f3:41:71:fc
```

## Deploy

```bash
cd mcp-server
npm run typecheck
npm run deploy
```

The MCP endpoint is `https://mcp.jacquesverre.com/mcp`.
