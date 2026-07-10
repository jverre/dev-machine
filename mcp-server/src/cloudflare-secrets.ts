export const MANAGED_SECRET_NAMES = [
  "DIGITALOCEAN_ACCESS_TOKEN",
  "TAILSCALE_TAILNET",
  "TAILSCALE_CLIENT_ID",
  "TAILSCALE_CLIENT_SECRET",
  "DEV_MACHINE_SSH_PUBLIC_KEY"
] as const;

export type ManagedSecretName = (typeof MANAGED_SECRET_NAMES)[number];

interface CloudflareApiResponse<T> {
  success: boolean;
  errors?: Array<{ code?: number; message: string }>;
  result?: T;
}

export interface SecretSummary {
  id: string;
  name: string;
  created_at?: string;
  modified_at?: string;
}

export function hasSecretsStoreConfig(env: Env): boolean {
  return Boolean(
    env.CLOUDFLARE_ACCOUNT_ID &&
      env.CLOUDFLARE_SECRETS_STORE_ID &&
      env.CLOUDFLARE_API_TOKEN
  );
}

export async function listSecrets(env: Env): Promise<SecretSummary[]> {
  const response = await cloudflareFetch<SecretSummary[]>(env, "/secrets", {
    method: "GET"
  });
  return Array.isArray(response) ? response : [];
}

export async function putSecret(
  env: Env,
  name: ManagedSecretName,
  value: string
): Promise<void> {
  const existing = await findSecret(env, name);
  if (existing) {
    await cloudflareFetch(env, `/secrets/${existing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value, scopes: ["workers"] })
    });
    return;
  }

  await cloudflareFetch(env, "/secrets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([
      {
        name,
        value,
        scopes: ["workers"],
        comment: "Managed by dev-machine MCP admin UI"
      }
    ])
  });
}

export async function deleteSecret(env: Env, name: ManagedSecretName): Promise<void> {
  const existing = await findSecret(env, name);
  if (!existing) {
    return;
  }

  await cloudflareFetch(env, `/secrets/${existing.id}`, {
    method: "DELETE"
  });
}

async function findSecret(
  env: Env,
  name: ManagedSecretName
): Promise<SecretSummary | undefined> {
  const secrets = await listSecrets(env);
  return secrets.find((secret) => secret.name === name);
}

function baseUrl(env: Env): string {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_SECRETS_STORE_ID) {
    throw new Error("Cloudflare Secrets Store account/store configuration is missing.");
  }

  const apiBase =
    env.CLOUDFLARE_SECRETS_STORE_API_BASE ??
    "https://api.cloudflare.com/client/v4/accounts";

  return `${apiBase}/${env.CLOUDFLARE_ACCOUNT_ID}/secrets_store/stores/${env.CLOUDFLARE_SECRETS_STORE_ID}`;
}

async function cloudflareFetch<T>(
  env: Env,
  path: string,
  init: RequestInit
): Promise<T> {
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_API_TOKEN is not configured.");
  }

  const response = await fetch(`${baseUrl(env)}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      ...(init.headers ?? {})
    }
  });

  const body = (await response.json().catch(() => null)) as
    | CloudflareApiResponse<T>
    | null;

  if (!response.ok || body?.success === false) {
    const message =
      body?.errors?.map((error) => error.message).join("; ") ||
      `Cloudflare API request failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return body?.result as T;
}
