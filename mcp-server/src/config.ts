export interface DevMachineConfig {
  region: string;
  size: string;
  image: string;
  defaultName: string;
  defaultUser: string;
  tag: string;
  repo: string;
  ref: string;
  sshPublicKey?: string;
}

export function getConfig(env: Env): DevMachineConfig {
  return {
    region: env.DEV_MACHINE_DEFAULT_REGION,
    size: env.DEV_MACHINE_DEFAULT_SIZE,
    image: env.DEV_MACHINE_DEFAULT_IMAGE,
    defaultName: env.DEV_MACHINE_DEFAULT_NAME,
    defaultUser: env.DEV_MACHINE_DEFAULT_USER,
    tag: env.DEV_MACHINE_TAG,
    repo: env.DEV_MACHINE_GITHUB_REPO,
    ref: env.DEV_MACHINE_GITHUB_REF,
    sshPublicKey: env.DEV_MACHINE_SSH_PUBLIC_KEY
  };
}

export function getSecretStatus(env: Env) {
  return {
    digitalOcean: Boolean(env.DIGITALOCEAN_ACCESS_TOKEN),
    tailscale:
      Boolean(env.TAILSCALE_TAILNET) &&
      Boolean(env.TAILSCALE_CLIENT_ID) &&
      Boolean(env.TAILSCALE_CLIENT_SECRET),
    sshPublicKey: Boolean(env.DEV_MACHINE_SSH_PUBLIC_KEY),
    oauthAdminToken: Boolean(env.MCP_ADMIN_TOKEN)
  };
}
