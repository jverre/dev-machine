import type { DevMachine } from "./dev-machine";

export interface Env {
  ALLOWED_EMAIL: string;
  BACKUP_BUCKET: R2Bucket;
  BACKUP_BUCKET_NAME: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  DEV_MACHINE: DurableObjectNamespace<DevMachine>;
  IDLE_TIMEOUT: string;
  PUBLIC_URL: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  T3_PORT: string;
}
