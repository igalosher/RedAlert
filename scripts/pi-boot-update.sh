#!/bin/bash
# Run at boot to pull latest RedAlert code and restart app services.
# Install: copy redalert-boot-update.service to /etc/systemd/system/ and enable it.
# This script must run as root so it can systemctl restart the app services.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Run git/npm as the owner of this script (e.g. igal) to avoid permission issues
REPO_OWNER="$(stat -c '%U' "$0" 2>/dev/null || echo "root")"

cd "$REPO_DIR"

if [ "$REPO_OWNER" != "root" ]; then
  runuser -u "$REPO_OWNER" -- git -C "$REPO_DIR" fetch origin
  runuser -u "$REPO_OWNER" -- git -C "$REPO_DIR" reset --hard origin/main
  runuser -u "$REPO_OWNER" -- bash -c "cd '$REPO_DIR' && npm install"
else
  git fetch origin
  git reset --hard origin/main
  npm install
fi

systemctl restart redalert-poll.service redalert-web.service 2>/dev/null || true
