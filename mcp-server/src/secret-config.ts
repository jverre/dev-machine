export const MANAGED_SECRET_NAMES = [
  "DIGITALOCEAN_ACCESS_TOKEN",
  "TAILSCALE_TAILNET",
  "TAILSCALE_CLIENT_ID",
  "TAILSCALE_CLIENT_SECRET",
  "DEV_MACHINE_SSH_PUBLIC_KEY"
] as const;

export type ManagedSecretName = (typeof MANAGED_SECRET_NAMES)[number];

export type SecretConfig = Partial<Record<ManagedSecretName, string>>;

interface EncryptedValue {
  iv: string;
  data: string;
}

const PREFIX = "secret:";

export async function getSecretConfig(env: Env): Promise<SecretConfig> {
  const entries = await Promise.all(
    MANAGED_SECRET_NAMES.map(async (name) => [name, await getSecret(env, name)] as const)
  );
  return Object.fromEntries(entries.filter(([, value]) => value)) as SecretConfig;
}

export async function getSecretStatus(env: Env) {
  const config = await getSecretConfig(env);
  return {
    digitalOcean: Boolean(config.DIGITALOCEAN_ACCESS_TOKEN),
    tailscale:
      Boolean(config.TAILSCALE_TAILNET) &&
      Boolean(config.TAILSCALE_CLIENT_ID) &&
      Boolean(config.TAILSCALE_CLIENT_SECRET),
    sshPublicKey: Boolean(config.DEV_MACHINE_SSH_PUBLIC_KEY),
    configEncryptionKey: Boolean(env.CONFIG_ENCRYPTION_KEY),
    oauthAdminToken: Boolean(env.MCP_ADMIN_TOKEN)
  };
}

export async function listConfiguredSecrets(env: Env): Promise<Set<ManagedSecretName>> {
  const keys = await Promise.all(
    MANAGED_SECRET_NAMES.map(async (name) => [name, Boolean(await env.OAUTH_KV.get(PREFIX + name))] as const)
  );
  return new Set(
    keys.filter(([, configured]) => configured).map(([name]) => name)
  );
}

export async function putSecret(
  env: Env,
  name: ManagedSecretName,
  value: string
): Promise<void> {
  const encrypted = await encrypt(env, value);
  await env.OAUTH_KV.put(PREFIX + name, JSON.stringify(encrypted));
}

export async function deleteSecret(env: Env, name: ManagedSecretName): Promise<void> {
  await env.OAUTH_KV.delete(PREFIX + name);
}

async function getSecret(
  env: Env,
  name: ManagedSecretName
): Promise<string | undefined> {
  const stored = await env.OAUTH_KV.get(PREFIX + name, { type: "json" });
  if (!stored) {
    return undefined;
  }
  return decrypt(env, stored as EncryptedValue);
}

async function encrypt(env: Env, plaintext: string): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    encoded
  );

  return {
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function decrypt(env: Env, encrypted: EncryptedValue): Promise<string> {
  const iv = base64ToBytes(encrypted.iv);
  const data = base64ToBytes(encrypted.data);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    data
  );
  return new TextDecoder().decode(plaintext);
}

async function encryptionKey(env: Env): Promise<CryptoKey> {
  if (!env.CONFIG_ENCRYPTION_KEY) {
    throw new Error("CONFIG_ENCRYPTION_KEY is not configured.");
  }
  const material = new TextEncoder().encode(env.CONFIG_ENCRYPTION_KEY);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt"
  ]);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
