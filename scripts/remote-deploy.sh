#!/usr/bin/env bash
# Sync repo to Ubuntu server and run docker compose
# Prerequisites: deploy.env filled, SSH key access to server, Docker on server
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_ENV="${DEPLOY_ENV:-$REPO_ROOT/deploy.env}"

if [[ ! -f "$DEPLOY_ENV" ]]; then
  echo "Missing $DEPLOY_ENV — create deploy.env with SSH details"
  exit 1
fi

# shellcheck source=/dev/null
source "$DEPLOY_ENV"

: "${DEPLOY_SSH_HOST:?Set DEPLOY_SSH_HOST in deploy.env}"
: "${DEPLOY_SSH_USER:?Set DEPLOY_SSH_USER in deploy.env}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/happyrobots-carrier-sales}"
SSH_KEY="${DEPLOY_SSH_KEY_PATH:-}"
SSH_OPTS=(-p "$DEPLOY_SSH_PORT" -o StrictHostKeyChecking=accept-new)
[[ -n "$SSH_KEY" && -f "$SSH_KEY" ]] && SSH_OPTS+=(-i "$SSH_KEY")

REMOTE="${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}"

echo "==> Syncing to $REMOTE:$DEPLOY_REMOTE_DIR"
ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p $DEPLOY_REMOTE_DIR"

rsync -avz --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules \
  --exclude backend/dist \
  --exclude backend/data \
  --exclude .git \
  --exclude deploy.env \
  --exclude test.env \
  "$REPO_ROOT/" "$REMOTE:$DEPLOY_REMOTE_DIR/"

echo "==> Building and starting on remote..."
ssh "${SSH_OPTS[@]}" "$REMOTE" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd "$DEPLOY_REMOTE_DIR/backend"
if [[ ! -f .env ]]; then
  echo "ERROR: backend/.env missing on server. Copy it before deploy."
  exit 1
fi
docker compose down 2>/dev/null || true
docker compose up --build -d
sleep 5
curl -sf http://localhost:8080/health && echo "" && echo "Remote deploy OK"
REMOTE_SCRIPT

echo "==> Done. API: http://${DEPLOY_SSH_HOST}:8080/health"
