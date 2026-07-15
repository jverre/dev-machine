interface Env {
  TEAM_DOMAIN: string;
  POLICY_AUD: string;
  ALLOWED_EMAIL: string;
  DIGITALOCEAN_TOKEN: string;
  DEV_MACHINE_NAME: string;
  DEV_MACHINE_REGION: string;
  DEV_MACHINE_IMAGE: string;
  DEV_MACHINE_DEFAULT_SIZE: string;
  DEV_MACHINE_ALLOWED_SIZES: string;
  DEV_MACHINE_SSH_KEY: string;
  DEV_MACHINE_TAG: string;
  DEV_MACHINE_SNAPSHOT_PREFIX: string;
  DEV_MACHINE_HIBERNATE: Workflow<{
    dropletId: number;
    snapshotName: string;
    snapshotPrefix: string;
  }>;
}
