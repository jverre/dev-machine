# DigitalOcean Notes

DigitalOcean is a good fit for a personal dev box if you want a simple VM and predictable operations.

## Start And Stop

Install and authenticate `doctl` locally:

```bash
brew install doctl
doctl auth init
```

Then use:

```bash
scripts/devbox status
scripts/devbox up
scripts/devbox down
```

## Billing Note

Powering off a Droplet is not the same as suspending billing for reserved resources. For a real sleep-like workflow, use:

1. snapshot the Droplet
2. destroy the Droplet
3. recreate a new Droplet from the snapshot
4. let cloud-init/Tailscale bring it back online

That workflow is slower, but cheaper for machines that sit idle most of the time.

## Future Automation

Good next steps:

- add OpenTofu/Terraform for Droplet creation
- generate cloud-init from templates
- add snapshot + destroy + recreate commands
- wait for Tailscale SSH to become reachable after boot
