import type { SecretConfig } from "./secret-config";

export interface DropletSpec {
  name: string;
  region: string;
  size: string;
  image: string;
  tags: string[];
  userData: string;
}

interface DigitalOceanListResponse<T> {
  droplets?: T[];
  images?: T[];
}

interface DigitalOceanDropletResponse {
  droplet: DigitalOceanDroplet;
}

interface DigitalOceanActionResponse {
  action: { id: number; status: string; type: string };
}

export interface DigitalOceanDroplet {
  id: number;
  name: string;
  status: string;
  region?: { slug: string };
  size_slug?: string;
  image?: { slug?: string; name?: string };
  tags?: string[];
  networks?: {
    v4?: Array<{ ip_address: string; type: string }>;
  };
}

export async function listDroplets(
  secrets: SecretConfig,
  tag?: string
): Promise<DigitalOceanDroplet[]> {
  const path = tag ? `/v2/droplets?tag_name=${encodeURIComponent(tag)}` : "/v2/droplets";
  const body = await digitalOceanFetch<DigitalOceanListResponse<DigitalOceanDroplet>>(
    secrets,
    path,
    { method: "GET" }
  );
  return body.droplets ?? [];
}

export async function findDroplet(
  secrets: SecretConfig,
  name: string,
  tag: string
): Promise<DigitalOceanDroplet | undefined> {
  const droplets = await listDroplets(secrets, tag);
  return droplets.find((droplet) => droplet.name === name);
}

export async function createDroplet(
  secrets: SecretConfig,
  spec: DropletSpec
): Promise<DigitalOceanDroplet> {
  const body = await digitalOceanFetch<DigitalOceanDropletResponse>(
    secrets,
    "/v2/droplets",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: spec.name,
        region: spec.region,
        size: spec.size,
        image: spec.image,
        user_data: spec.userData,
        tags: spec.tags,
        backups: false,
        ipv6: true,
        monitoring: true
      })
    }
  );
  return body.droplet;
}

export async function dropletAction(
  secrets: SecretConfig,
  dropletId: number,
  type: "power_on" | "shutdown" | "power_off" | "snapshot",
  name?: string
) {
  return digitalOceanFetch<DigitalOceanActionResponse>(
    secrets,
    `/v2/droplets/${dropletId}/actions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(name ? { type, name } : { type })
    }
  );
}

export async function waitForAction(
  secrets: SecretConfig,
  actionId: number,
  timeoutMs = 300_000
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await digitalOceanFetch<DigitalOceanActionResponse>(
      secrets,
      `/v2/actions/${actionId}`,
      { method: "GET" }
    );
    if (response.action.status === "completed") {
      return response.action;
    }
    if (response.action.status === "errored") {
      throw new Error(`DigitalOcean action ${actionId} failed.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`Timed out waiting for DigitalOcean action ${actionId}.`);
}

export async function destroyDroplet(
  secrets: SecretConfig,
  dropletId: number
): Promise<void> {
  await digitalOceanFetch(secrets, `/v2/droplets/${dropletId}`, { method: "DELETE" });
}

async function digitalOceanFetch<T = unknown>(
  secrets: SecretConfig,
  path: string,
  init: RequestInit
): Promise<T> {
  if (!secrets.DIGITALOCEAN_ACCESS_TOKEN) {
    throw new Error("DIGITALOCEAN_ACCESS_TOKEN is not configured.");
  }
  const response = await fetch(`https://api.digitalocean.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${secrets.DIGITALOCEAN_ACCESS_TOKEN}`,
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`DigitalOcean API error ${response.status}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
