import type {
  CreateDropletInput,
  DigitalOceanAction,
  DigitalOceanApi,
  DigitalOceanDroplet,
  DigitalOceanSnapshot
} from "./digitalocean";

export interface DevMachineConfig {
  name: string;
  region: string;
  image: string;
  defaultSize: string;
  allowedSizes: string[];
  sshKey: string;
  tag: string;
  snapshotPrefix: string;
}

export interface Machine {
  id: number;
  name: string;
  status: string;
  size: string;
  region: string;
  ipv4: string | null;
}

export interface MachineStatusResult {
  exists: boolean;
  lifecycle: "running" | "off" | "hibernated" | "absent";
  machine?: Machine;
  snapshot?: MachineSnapshot;
}

export interface MachineSnapshot {
  id: string;
  name: string;
  createdAt: string;
  sizeGigabytes: number;
}

export interface MachineHibernateRequest {
  dropletId: number;
  snapshotName: string;
  snapshotPrefix: string;
}

export interface MachineCreateResult {
  changed: boolean;
  machine: Machine;
}

export interface MachineResizeResult {
  changed: boolean;
  machine: Machine;
  requestedSize: string;
  action?: DigitalOceanAction;
}

export interface MachinePowerResult {
  changed: boolean;
  machine: Machine;
  action?: DigitalOceanAction;
}

export interface MachineDeleteResult {
  changed: boolean;
  deletedMachine?: Machine;
}

export class DevMachineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevMachineError";
  }
}

export class DevMachineService {
  constructor(
    readonly config: DevMachineConfig,
    private readonly api: DigitalOceanApi
  ) {
    if (!config.allowedSizes.includes(config.defaultSize)) {
      throw new DevMachineError(
        "DEV_MACHINE_DEFAULT_SIZE must be included in DEV_MACHINE_ALLOWED_SIZES."
      );
    }
  }

  async status(): Promise<MachineStatusResult> {
    const [droplet, snapshots] = await Promise.all([
      this.resolveDroplet(),
      this.listManagedSnapshots()
    ]);
    if (droplet) {
      return {
        exists: true,
        lifecycle:
          droplet.status === "active" || droplet.status === "new"
            ? "running"
            : "off",
        machine: toMachine(droplet)
      };
    }

    const snapshot = snapshots[0];
    return snapshot
      ? {
          exists: false,
          lifecycle: "hibernated",
          snapshot: toMachineSnapshot(snapshot)
        }
      : { exists: false, lifecycle: "absent" };
  }

  async create(size = this.config.defaultSize): Promise<MachineCreateResult> {
    this.assertAllowedSize(size);

    const existing = await this.resolveDroplet();
    if (existing) {
      return { changed: false, machine: toMachine(existing) };
    }

    if ((await this.listManagedSnapshots()).length > 0) {
      throw new DevMachineError(
        "The dev machine is hibernated. Start it to restore the latest snapshot."
      );
    }

    const droplet = await this.api.createDroplet(
      this.createDropletInput(size, this.config.image)
    );
    return { changed: true, machine: toMachine(droplet) };
  }

  async resize(size: string): Promise<MachineResizeResult> {
    this.assertAllowedSize(size);

    const droplet = await this.requireDroplet();
    const machine = toMachine(droplet);
    if (droplet.size_slug === size) {
      return { changed: false, machine, requestedSize: size };
    }

    const action = await this.api.resizeDroplet(droplet.id, size);
    return { changed: true, machine, requestedSize: size, action };
  }

  async start(): Promise<MachinePowerResult> {
    const droplet = await this.resolveDroplet();
    if (!droplet) {
      const snapshot = (await this.listManagedSnapshots())[0];
      if (!snapshot) {
        throw new DevMachineError(
          "The dev machine does not exist. Create it first."
        );
      }

      const restored = await this.api.createDroplet(
        this.createDropletInput(this.snapshotSize(snapshot), snapshot.id)
      );
      return { changed: true, machine: toMachine(restored) };
    }

    const machine = toMachine(droplet);
    if (droplet.status === "active" || droplet.status === "new") {
      return { changed: false, machine };
    }
    if (droplet.status !== "off") {
      throw new DevMachineError(
        `Cannot start the dev machine while its status is ${droplet.status}.`
      );
    }

    const action = await this.api.startDroplet(droplet.id);
    return { changed: true, machine, action };
  }

  async stop(): Promise<MachinePowerResult> {
    const droplet = await this.requireDroplet();
    const machine = toMachine(droplet);
    if (droplet.status === "off") {
      return { changed: false, machine };
    }
    if (droplet.status !== "active") {
      throw new DevMachineError(
        `Cannot stop the dev machine while its status is ${droplet.status}.`
      );
    }

    const action = await this.api.shutdownDroplet(droplet.id);
    return { changed: true, machine, action };
  }

  async prepareHibernate(): Promise<MachineHibernateRequest> {
    const droplet = await this.requireDroplet();
    if (droplet.status !== "active" && droplet.status !== "off") {
      throw new DevMachineError(
        `Cannot hibernate the dev machine while its status is ${droplet.status}.`
      );
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:.]/g, "")
      .replace("000Z", "Z");
    return {
      dropletId: droplet.id,
      snapshotName: `${this.config.snapshotPrefix}${droplet.size_slug}--${timestamp}`,
      snapshotPrefix: this.config.snapshotPrefix
    };
  }

  async delete(confirm: boolean): Promise<MachineDeleteResult> {
    if (!confirm) {
      throw new DevMachineError("Deletion must be explicitly confirmed.");
    }

    const droplet = await this.resolveDroplet();
    if (!droplet) {
      return { changed: false };
    }

    const deletedMachine = toMachine(droplet);
    await this.api.deleteDroplet(droplet.id);
    return { changed: true, deletedMachine };
  }

  private async requireDroplet(): Promise<DigitalOceanDroplet> {
    const droplet = await this.resolveDroplet();
    if (!droplet) {
      throw new DevMachineError(
        "The dev machine does not exist. Create it first."
      );
    }
    return droplet;
  }

  private async resolveDroplet(): Promise<DigitalOceanDroplet | undefined> {
    const droplets = await this.api.listDropletsByTag(this.config.tag);
    if (droplets.length > 1) {
      throw new DevMachineError(
        `Found ${droplets.length} Droplets tagged ${this.config.tag}; refusing to choose one.`
      );
    }
    return droplets[0];
  }

  private async listManagedSnapshots(): Promise<DigitalOceanSnapshot[]> {
    const snapshots = await this.api.listDropletSnapshots();
    return snapshots
      .filter((snapshot) =>
        snapshot.name.startsWith(this.config.snapshotPrefix)
      )
      .sort(
        (left, right) =>
          Date.parse(right.created_at) - Date.parse(left.created_at)
      );
  }

  private snapshotSize(snapshot: DigitalOceanSnapshot): string {
    const encodedSize = snapshot.name
      .slice(this.config.snapshotPrefix.length)
      .split("--", 1)[0];
    return this.config.allowedSizes.includes(encodedSize)
      ? encodedSize
      : this.config.defaultSize;
  }

  private createDropletInput(size: string, image: string): CreateDropletInput {
    return {
      name: this.config.name,
      region: this.config.region,
      size,
      image,
      ssh_keys: [this.config.sshKey],
      tags: [this.config.tag],
      monitoring: true,
      ipv6: true
    };
  }

  private assertAllowedSize(size: string): void {
    if (!this.config.allowedSizes.includes(size)) {
      throw new DevMachineError(
        `Size ${size} is not allowed. Choose one of: ${this.config.allowedSizes.join(", ")}.`
      );
    }
  }
}

export function parseDevMachineConfig(env: Env): DevMachineConfig {
  const allowedSizes = env.DEV_MACHINE_ALLOWED_SIZES.split(",")
    .map((size) => size.trim())
    .filter(Boolean);

  if (allowedSizes.length === 0) {
    throw new DevMachineError("DEV_MACHINE_ALLOWED_SIZES cannot be empty.");
  }

  return {
    name: env.DEV_MACHINE_NAME,
    region: env.DEV_MACHINE_REGION,
    image: env.DEV_MACHINE_IMAGE,
    defaultSize: env.DEV_MACHINE_DEFAULT_SIZE,
    allowedSizes,
    sshKey: env.DEV_MACHINE_SSH_KEY,
    tag: env.DEV_MACHINE_TAG,
    snapshotPrefix: env.DEV_MACHINE_SNAPSHOT_PREFIX
  };
}

function toMachine(droplet: DigitalOceanDroplet): Machine {
  const publicNetwork = droplet.networks.v4.find(
    (network) => network.type === "public"
  );
  return {
    id: droplet.id,
    name: droplet.name,
    status: droplet.status,
    size: droplet.size_slug,
    region: droplet.region.slug,
    ipv4: publicNetwork?.ip_address ?? null
  };
}

function toMachineSnapshot(snapshot: DigitalOceanSnapshot): MachineSnapshot {
  return {
    id: snapshot.id,
    name: snapshot.name,
    createdAt: snapshot.created_at,
    sizeGigabytes: snapshot.size_gigabytes
  };
}
