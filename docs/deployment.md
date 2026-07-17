# Deployment

## 1. Prerequisites

You need:

- a Cloudflare account with Workers Paid enabled
- the `jacquesverre.com` zone in that account
- Docker running locally
- Node.js and pnpm
- Wrangler authenticated with `pnpm wrangler login`

Install the project dependencies:

```bash
cd ~/Documents/Personal/dev-machine
pnpm install
```

## 2. Create the R2 bucket

```bash
pnpm wrangler r2 bucket create dev-machine-backups
```

In the Cloudflare dashboard, create an R2 API token restricted to read and write access for `dev-machine-backups`. Keep its access key ID and secret access key for step 4.

## 3. Protect the hostname

Before deploying, create a Cloudflare Access self-hosted application:

1. Open **Zero Trust** > **Access** > **Applications**.
2. Add a **Self-hosted** application for `code.jacquesverre.com`.
3. Create an **Allow** policy whose selector is **Emails** and value is `jverre@gmail.com`.
4. Enable the **One-time PIN** identity provider.
5. Set the session duration you prefer.

The Worker also checks the authenticated email header. Its public `workers.dev` and preview URLs are disabled, so the Access-protected custom hostname is the only public route.

## 4. Deploy and add R2 credentials

```bash
pnpm typecheck
pnpm deploy
```

The first deployment builds and uploads the container image. It can take several minutes.

Now add the R2 credentials to the deployed Worker:

```bash
pnpm wrangler secret put R2_ACCESS_KEY_ID
pnpm wrangler secret put R2_SECRET_ACCESS_KEY
pnpm wrangler secret put CLOUDFLARE_ACCOUNT_ID
```

The account ID is shown on the Cloudflare dashboard overview. It is not sensitive, but the Sandbox SDK reads it from the Worker environment alongside the R2 credentials. Do not open the dev machine until all three values are configured.

## 5. Pair T3 Code

Open this URL and complete the Access email PIN flow:

```text
https://code.jacquesverre.com/__dev-machine/pair
```

The first request creates the container, starts T3 Code, creates a 15-minute one-time pairing link, and redirects your browser to it.

Inside T3 Code, open a terminal and authenticate the coding agents:

```bash
codex login
claude auth login
```

Their credentials and T3 Code state live under `/workspace`, so they are included in each R2 checkpoint.
