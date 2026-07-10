import type { SecretConfig } from "./secret-config";

interface TailscaleTokenResponse {
  access_token: string;
}

interface TailscaleKeyResponse {
  key: string;
}

export async function createTailscaleAuthKey(
  secrets: SecretConfig,
  tag: string,
  description: string
): Promise<string> {
  const tailnet = requireSecret(secrets.TAILSCALE_TAILNET, "TAILSCALE_TAILNET");
  const clientId = requireSecret(secrets.TAILSCALE_CLIENT_ID, "TAILSCALE_CLIENT_ID");
  const clientSecret = requireSecret(
    secrets.TAILSCALE_CLIENT_SECRET,
    "TAILSCALE_CLIENT_SECRET"
  );

  const tokenResponse = await fetch("https://api.tailscale.com/api/v2/oauth/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ grant_type: "client_credentials" })
  });
  const token = await readJson<TailscaleTokenResponse>(tokenResponse);

  const keyResponse = await fetch(
    `https://api.tailscale.com/api/v2/tailnet/${encodeURIComponent(tailnet)}/keys`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token.access_token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        capabilities: {
          devices: {
            create: {
              reusable: false,
              ephemeral: true,
              preauthorized: true,
              tags: [`tag:${tag.replace(/^tag:/, "")}`]
            }
          }
        },
        expirySeconds: 3600,
        description
      })
    }
  );
  const key = await readJson<TailscaleKeyResponse>(keyResponse);
  return key.key;
}

function requireSecret(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Tailscale API error ${response.status}: ${body}`);
  }
  return JSON.parse(body) as T;
}
