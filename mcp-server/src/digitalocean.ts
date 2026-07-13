const DIGITALOCEAN_API_URL = "https://api.digitalocean.com/v2/";

export interface DigitalOceanDroplet {
  id: number;
  name: string;
  status: string;
  size_slug: string;
  region: {
    slug: string;
  };
  tags: string[];
  networks: {
    v4: Array<{
      ip_address: string;
      type: string;
    }>;
  };
}

export interface DigitalOceanAction {
  id: number;
  status: string;
  type: string;
}

export interface CreateDropletInput {
  name: string;
  region: string;
  size: string;
  image: string;
  ssh_keys: string[];
  tags: string[];
  monitoring: boolean;
  ipv6: boolean;
}

export interface DigitalOceanApi {
  listDropletsByTag(tag: string): Promise<DigitalOceanDroplet[]>;
  createDroplet(input: CreateDropletInput): Promise<DigitalOceanDroplet>;
  resizeDroplet(id: number, size: string): Promise<DigitalOceanAction>;
  deleteDroplet(id: number): Promise<void>;
}

export class DigitalOceanApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "DigitalOceanApiError";
  }
}

export class DigitalOceanClient implements DigitalOceanApi {
  constructor(private readonly token: string) {}

  async listDropletsByTag(tag: string): Promise<DigitalOceanDroplet[]> {
    const query = new URLSearchParams({
      tag_name: tag,
      per_page: "200"
    });
    const response = await this.request<{ droplets: DigitalOceanDroplet[] }>(
      `droplets?${query}`
    );
    return response.droplets;
  }

  async createDroplet(
    input: CreateDropletInput
  ): Promise<DigitalOceanDroplet> {
    const response = await this.request<{ droplet: DigitalOceanDroplet }>(
      "droplets",
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
    return response.droplet;
  }

  async resizeDroplet(
    id: number,
    size: string
  ): Promise<DigitalOceanAction> {
    const response = await this.request<{ action: DigitalOceanAction }>(
      `droplets/${id}/actions`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "resize",
          size,
          disk: false
        })
      }
    );
    return response.action;
  }

  async deleteDroplet(id: number): Promise<void> {
    await this.request<void>(`droplets/${id}`, { method: "DELETE" });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(
      new URL(path, DIGITALOCEAN_API_URL),
      {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers
        }
      }
    );

    if (!response.ok) {
      let detail = "Request failed.";
      try {
        const body = (await response.json()) as { message?: unknown };
        if (typeof body.message === "string") {
          detail = body.message;
        }
      } catch {
        // DigitalOcean occasionally returns an empty response body.
      }

      throw new DigitalOceanApiError(
        response.status,
        `DigitalOcean API error ${response.status}: ${detail}`
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
