#!/usr/bin/env bash
set -euo pipefail

DEV_USER="${DEV_USER:-jacques}"
WORK_DIR="${WORK_DIR:-/home/${DEV_USER}/work}"

if [[ "$(id -u)" -ne 0 ]]; then
  SUDO=sudo
else
  SUDO=
fi

log() {
  printf '\n==> %s\n' "$*"
}

log "Updating packages"
$SUDO apt-get update
$SUDO apt-get install -y \
  apt-transport-https \
  ca-certificates \
  curl \
  direnv \
  fd-find \
  fish \
  git \
  gnupg \
  htop \
  jq \
  ripgrep \
  shellcheck \
  tmux \
  unzip \
  vim \
  zsh

log "Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | $SUDO sh
fi

if id "$DEV_USER" >/dev/null 2>&1; then
  $SUDO usermod -aG docker "$DEV_USER"
fi

log "Installing Tailscale"
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | $SUDO sh
fi

if [[ -n "${TAILSCALE_AUTH_KEY:-}" ]]; then
  log "Joining Tailscale"
  $SUDO tailscale up \
    --auth-key="${TAILSCALE_AUTH_KEY}" \
    --hostname="${TAILSCALE_HOSTNAME:-devbox}" \
    --ssh
else
  log "Skipping Tailscale login because TAILSCALE_AUTH_KEY is not set"
  printf 'Run later: sudo tailscale up --ssh --hostname=%s\n' "${TAILSCALE_HOSTNAME:-devbox}"
fi

log "Creating work directory"
$SUDO mkdir -p "$WORK_DIR"
if id "$DEV_USER" >/dev/null 2>&1; then
  $SUDO chown -R "$DEV_USER:$DEV_USER" "$WORK_DIR"
fi

log "Installing mise"
if ! command -v mise >/dev/null 2>&1; then
  curl https://mise.run | sh
fi

log "Configuring shell helpers"
if id "$DEV_USER" >/dev/null 2>&1; then
  $SUDO -u "$DEV_USER" mkdir -p "/home/${DEV_USER}/.config"
  if ! $SUDO -u "$DEV_USER" grep -q 'mise activate' "/home/${DEV_USER}/.zshrc" 2>/dev/null; then
    printf '\neval "$("$HOME/.local/bin/mise" activate zsh)"\n' | $SUDO tee -a "/home/${DEV_USER}/.zshrc" >/dev/null
  fi
  if ! $SUDO -u "$DEV_USER" grep -q 'direnv hook zsh' "/home/${DEV_USER}/.zshrc" 2>/dev/null; then
    printf '\neval "$(direnv hook zsh)"\n' | $SUDO tee -a "/home/${DEV_USER}/.zshrc" >/dev/null
  fi
fi

log "Done"
printf 'Reconnect or run newgrp docker before using Docker without sudo.\n'
