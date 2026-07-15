import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep
} from "cloudflare:workers";
import {
  DigitalOceanClient,
  type DigitalOceanSnapshot
} from "./digitalocean";

export interface HibernateWorkflowParams {
  dropletId: number;
  snapshotName: string;
  snapshotPrefix: string;
}

const apiStep = {
  retries: {
    limit: 3,
    delay: "5 seconds",
    backoff: "exponential"
  },
  timeout: "1 minute"
} as const;

export class DevMachineHibernateWorkflow extends WorkflowEntrypoint<
  Env,
  HibernateWorkflowParams
> {
  async run(
    event: WorkflowEvent<HibernateWorkflowParams>,
    step: WorkflowStep
  ): Promise<{ snapshotId: string; snapshotName: string }> {
    const params = event.payload;
    const api = new DigitalOceanClient(this.env.DIGITALOCEAN_TOKEN);
    console.log("Dev machine hibernation started", {
      dropletId: params.dropletId,
      snapshotName: params.snapshotName
    });

    try {
      await step.do("request graceful shutdown", apiStep, async () => {
        const droplet = await api.getDroplet(params.dropletId);
        if (droplet.status === "off") {
          return { changed: false };
        }
        if (droplet.status !== "active") {
          throw new Error(
            `Cannot gracefully shut down a Droplet with status ${droplet.status}.`
          );
        }

        const action = await api.shutdownDroplet(params.dropletId);
        console.log("Graceful shutdown requested", {
          dropletId: params.dropletId,
          actionId: action.id
        });
        return { changed: true, actionId: action.id };
      });

      await this.waitForDropletOff(step, api, params.dropletId);

      const snapshotRequest = await step.do(
        "request snapshot",
        apiStep,
        async () => {
          const existing = await this.findSnapshot(api, params.snapshotName);
          if (existing) {
            return { snapshotId: existing.id, actionId: null };
          }

          const droplet = await api.getDroplet(params.dropletId);
          if (droplet.status !== "off") {
            throw new Error(
              `Refusing to snapshot a Droplet with status ${droplet.status}.`
            );
          }

          const action = await api.snapshotDroplet(
            params.dropletId,
            params.snapshotName
          );
          console.log("Snapshot requested", {
            dropletId: params.dropletId,
            actionId: action.id,
            snapshotName: params.snapshotName
          });
          return { snapshotId: null, actionId: action.id };
        }
      );

      if (snapshotRequest.actionId !== null) {
        await this.waitForAction(
          step,
          api,
          params.dropletId,
          snapshotRequest.actionId
        );
      }

      const snapshot = snapshotRequest.snapshotId
        ? await step.do("load existing snapshot", apiStep, async () => {
            const found = await this.findSnapshot(api, params.snapshotName);
            if (!found) {
              throw new Error("The completed snapshot is no longer visible.");
            }
            return found;
          })
        : await this.waitForSnapshot(step, api, params.snapshotName);

      await step.do("delete snapshotted Droplet", apiStep, async () => {
        await api.deleteDroplet(params.dropletId);
        console.log("Snapshotted Droplet deleted", {
          dropletId: params.dropletId,
          snapshotId: snapshot.id
        });
      });

      await step.do("remove older hibernation snapshots", apiStep, async () => {
        const snapshots = await api.listDropletSnapshots();
        const olderSnapshots = snapshots.filter(
          (candidate) =>
            candidate.name.startsWith(params.snapshotPrefix) &&
            candidate.id !== snapshot.id
        );
        for (const olderSnapshot of olderSnapshots) {
          await api.deleteSnapshot(olderSnapshot.id);
        }
        console.log("Older hibernation snapshots removed", {
          keptSnapshotId: snapshot.id,
          removedCount: olderSnapshots.length
        });
      });

      console.log("Dev machine hibernation completed", {
        dropletId: params.dropletId,
        snapshotId: snapshot.id
      });
      return { snapshotId: snapshot.id, snapshotName: snapshot.name };
    } catch (error) {
      console.error("Dev machine hibernation failed", {
        dropletId: params.dropletId,
        snapshotName: params.snapshotName,
        error
      });
      throw error;
    }
  }

  private async waitForDropletOff(
    step: WorkflowStep,
    api: DigitalOceanClient,
    dropletId: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const status = await step.do(
        `check shutdown ${attempt}`,
        apiStep,
        async () => (await api.getDroplet(dropletId)).status
      );
      if (status === "off") {
        return;
      }
      if (attempt < 10) {
        await step.sleep(`wait for shutdown ${attempt}`, "1 minute");
      }
    }

    throw new Error(
      "The Droplet did not shut down gracefully within 10 minutes."
    );
  }

  private async waitForAction(
    step: WorkflowStep,
    api: DigitalOceanClient,
    dropletId: number,
    actionId: number
  ): Promise<void> {
    for (let attempt = 1; attempt <= 24; attempt += 1) {
      const action = await step.do(
        `check snapshot action ${attempt}`,
        apiStep,
        async () => api.getDropletAction(dropletId, actionId)
      );
      if (action.status === "completed") {
        return;
      }
      if (action.status === "errored") {
        throw new Error(`DigitalOcean snapshot action ${actionId} failed.`);
      }
      if (attempt < 24) {
        await step.sleep(`wait for snapshot action ${attempt}`, "5 minutes");
      }
    }

    throw new Error("The DigitalOcean snapshot did not complete within 2 hours.");
  }

  private async waitForSnapshot(
    step: WorkflowStep,
    api: DigitalOceanClient,
    snapshotName: string
  ): Promise<DigitalOceanSnapshot> {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const snapshot = await step.do(
        `verify snapshot ${attempt}`,
        apiStep,
        async () => this.findSnapshot(api, snapshotName)
      );
      if (snapshot) {
        return snapshot;
      }
      if (attempt < 5) {
        await step.sleep(`wait for snapshot visibility ${attempt}`, "1 minute");
      }
    }

    throw new Error("The completed snapshot was not visible after 5 minutes.");
  }

  private async findSnapshot(
    api: DigitalOceanClient,
    snapshotName: string
  ): Promise<DigitalOceanSnapshot | undefined> {
    return (await api.listDropletSnapshots()).find(
      (snapshot) => snapshot.name === snapshotName
    );
  }
}
