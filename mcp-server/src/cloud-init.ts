const CLOUD_INIT_TEMPLATE = `#cloud-config
package_update: true
package_upgrade: false

users:
  - name: __DEV_USER__
    groups: sudo
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    ssh_authorized_keys:
      - __SSH_PUBLIC_KEY__

packages:
  - ca-certificates
  - curl
  - git

write_files:
  - path: /root/bootstrap-dev-machine.sh
    permissions: "0755"
    content: |
      #!/usr/bin/env bash
      set -euo pipefail
      export DEV_USER="__DEV_USER__"
      export TAILSCALE_AUTH_KEY="__TAILSCALE_AUTH_KEY__"
      export TAILSCALE_HOSTNAME="__TAILSCALE_HOSTNAME__"
      git clone "__DEV_MACHINE_REPO__" /opt/dev-machine
      cd /opt/dev-machine
      git checkout "__DEV_MACHINE_REF__"
      /opt/dev-machine/scripts/bootstrap.sh

runcmd:
  - [bash, /root/bootstrap-dev-machine.sh]
`;

export interface CloudInitValues {
  devUser: string;
  sshPublicKey: string;
  tailscaleAuthKey: string;
  tailscaleHostname: string;
  repo: string;
  ref: string;
}

export function renderCloudInit(values: CloudInitValues): string {
  return CLOUD_INIT_TEMPLATE
    .replaceAll("__DEV_USER__", values.devUser)
    .replaceAll("__SSH_PUBLIC_KEY__", values.sshPublicKey)
    .replaceAll("__TAILSCALE_AUTH_KEY__", values.tailscaleAuthKey)
    .replaceAll("__TAILSCALE_HOSTNAME__", values.tailscaleHostname)
    .replaceAll("__DEV_MACHINE_REPO__", values.repo)
    .replaceAll("__DEV_MACHINE_REF__", values.ref);
}
