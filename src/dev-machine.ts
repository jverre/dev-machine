import {
  Sandbox,
  type DirectoryBackup,
  type Process
} from "@cloudflare/sandbox";
import type { Env } from "./env";

const BACKUP_KEY = "workspace-backup";
const BACKUP_TTL_SECONDS = 365 * 24 * 60 * 60;
const PROCESS_ID = "t3-code";

export class DevMachine extends Sandbox<Env> {
  defaultPort = 3773;
  sleepAfter = "30m";

  private bootPromise: Promise<void> | undefined;

  async ensureReady(): Promise<void> {
    if (!this.bootPromise) {
      this.bootPromise = this.boot().finally(() => {
        this.bootPromise = undefined;
      });
    }

    await this.bootPromise;
  }

  async machineStatus() {
    const [state, backup] = await Promise.all([
      this.getState(),
      this.ctx.storage.get<DirectoryBackup>(BACKUP_KEY)
    ]);

    return {
      state: state.status,
      lastChange: new Date(state.lastChange).toISOString(),
      backup: backup
        ? {
            id: backup.id,
            directory: backup.dir
          }
        : null
    };
  }

  async createPairingLink(publicUrl: string) {
    await this.ensureReady();
    const result = await this.exec(
      `t3 auth pairing create --base-dir /workspace/t3 --base-url ${shellQuote(publicUrl)} --ttl 15m --json`,
      { timeout: 30_000 }
    );

    if (!result.success) {
      throw new Error(`T3 pairing failed: ${result.stderr || result.stdout}`);
    }

    return JSON.parse(result.stdout) as {
      id: string;
      credential: string;
      pairUrl: string;
      expiresAt: string;
    };
  }

  async checkpoint(): Promise<{ backupId: string }> {
    await this.ensureReady();
    await this.stopT3();

    try {
      const backup = await this.createWorkspaceBackup();
      await this.ctx.storage.put(BACKUP_KEY, backup);
      await this.startT3();
      return { backupId: backup.id };
    } catch (error) {
      await this.startT3();
      throw error;
    }
  }

  async sleep(): Promise<{ backupId: string }> {
    await this.ensureReady();
    await this.stopT3();

    try {
      const backup = await this.createWorkspaceBackup();
      await this.ctx.storage.put(BACKUP_KEY, backup);
      await this.stop();
      return { backupId: backup.id };
    } catch (error) {
      await this.startT3();
      throw error;
    }
  }

  override async onActivityExpired(): Promise<void> {
    if (await this.hasActiveAgentTurn()) {
      console.log("An active coding-agent turn exists; extending the idle window.");
      await this.setEnvVars({});
      return;
    }

    console.log("Dev machine is idle; checkpointing /workspace before shutdown.");
    await this.stopT3();

    try {
      const backup = await this.createWorkspaceBackup();
      await this.ctx.storage.put(BACKUP_KEY, backup);
      console.log(`Workspace checkpoint ${backup.id} completed.`);
      await super.onActivityExpired();
    } catch (error) {
      console.error("Workspace checkpoint failed; keeping the container alive.", error);
      await this.startT3();
      await this.setEnvVars({});
    }
  }

  private async boot(): Promise<void> {
    const state = await this.getState();
    if (state.status !== "running" && state.status !== "healthy") {
      await this.start();
      await this.restoreWorkspace();
    }

    await this.ensureWorkspaceLayout();
    await this.startT3();
  }

  private async restoreWorkspace(): Promise<void> {
    const backup = await this.ctx.storage.get<DirectoryBackup>(BACKUP_KEY);
    if (!backup) {
      console.log("No workspace checkpoint exists; starting a new dev machine.");
      return;
    }

    console.log(`Restoring workspace checkpoint ${backup.id}.`);
    const result = await this.restoreBackup(backup);
    if (!result.success) {
      throw new Error(`Workspace checkpoint ${backup.id} could not be restored.`);
    }
  }

  private async ensureWorkspaceLayout(): Promise<void> {
    const result = await this.exec(
      "mkdir -p /workspace/home /workspace/repos /workspace/t3",
      { timeout: 10_000 }
    );

    if (!result.success) {
      throw new Error(`Could not initialize /workspace: ${result.stderr}`);
    }
  }

  private async startT3(): Promise<void> {
    let process = await this.getProcess(PROCESS_ID);
    const status = process ? await process.getStatus() : undefined;

    if (!process || !status || !["starting", "running"].includes(status)) {
      process = await this.startProcess(
        `t3 serve --host 0.0.0.0 --port ${this.defaultPort} --base-dir /workspace/t3 /workspace/repos`,
        {
          autoCleanup: false,
          cwd: "/workspace/repos",
          env: {
            HOME: "/workspace/home",
            T3CODE_HOME: "/workspace/t3"
          },
          processId: PROCESS_ID
        }
      );
    }

    await process.waitForPort(this.defaultPort, {
      mode: "http",
      path: "/",
      status: { min: 200, max: 499 },
      timeout: 90_000
    });
  }

  private async stopT3(): Promise<void> {
    const process = await this.getProcess(PROCESS_ID);
    if (!process || !(await isRunning(process))) {
      return;
    }

    await process.kill("SIGTERM");
    try {
      await process.waitForExit(15_000);
    } catch {
      await process.kill("SIGKILL");
    }
  }

  private async hasActiveAgentTurn(): Promise<boolean> {
    const result = await this.exec(
      `node --no-warnings -e ${shellQuote(`const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/workspace/t3/userdata/state.sqlite", { readOnly: true }); const row = db.prepare("SELECT EXISTS(SELECT 1 FROM projection_thread_sessions WHERE status = 'running' AND active_turn_id IS NOT NULL) AS active").get(); console.log(row.active);`)}`,
      { timeout: 10_000 }
    );

    if (!result.success) {
      console.warn(
        "Could not read T3 Code agent state; extending the idle window.",
        result.stderr
      );
      return true;
    }

    return result.stdout.trim() === "1";
  }

  private async createWorkspaceBackup(): Promise<DirectoryBackup> {
    if (!hasProductionBackupCredentials(this.env)) {
      throw new Error(
        "Workspace backups require CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and BACKUP_BUCKET_NAME."
      );
    }

    return this.createBackup({
      dir: "/workspace",
      name: `dev-machine-${new Date().toISOString()}`,
      ttl: BACKUP_TTL_SECONDS
    });
  }
}

async function isRunning(process: Process): Promise<boolean> {
  return ["starting", "running"].includes(await process.getStatus());
}

function hasProductionBackupCredentials(env: Env): boolean {
  return Boolean(
    env.CLOUDFLARE_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.BACKUP_BUCKET_NAME
  );
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
