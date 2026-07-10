# Security Notes

Keep the public repository free of credentials.

## Access

- Prefer Tailscale SSH over exposing SSH to the public internet.
- Use Tailscale ACLs to restrict who can SSH.
- Consider check mode for sensitive machines.
- Keep a fallback SSH key path until Tailscale access is confirmed.

## Secrets

Never commit:

- Tailscale auth keys
- DigitalOcean tokens
- private SSH keys
- `.env` files
- cloud-init files with real secrets

## Host Hardening

After first boot:

```bash
sudo tailscale status
sudo ufw status
docker run hello-world
```

If exposing public SSH anyway:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
```
