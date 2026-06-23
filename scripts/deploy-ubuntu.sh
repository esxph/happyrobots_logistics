#!/usr/bin/env bash
# Deploy Carrier Sales API on Ubuntu (22.04+)
# Usage: sudo ./scripts/deploy-ubuntu.sh
# Or run steps manually from README.md

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKEND_DIR="$REPO_DIR/backend"

echo "==> HappyRobot Carrier Sales API — Ubuntu deploy"
echo "    Repo: $REPO_DIR"

# --- Docker ---
if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  apt-get update -qq
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  echo "==> Docker installed."
else
  echo "==> Docker already installed: $(docker --version)"
fi

# --- Environment ---
if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "==> Creating backend/.env from .env.example"
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  echo ""
  echo "!! IMPORTANT: Edit $BACKEND_DIR/.env before going to production:"
  echo "   - API_KEY (strong secret for HappyRobot)"
  echo "   - TMS_HOST, TMS_PORT, TMS_AUTH_TOKEN"
  echo "   - FMCSA_WEB_KEY"
  echo "   - OTP_PHONE_OVERRIDE (if FMCSA has no phone)"
  echo ""
  read -r -p "Press Enter after editing .env, or Ctrl+C to abort..."
fi

# --- Build & run ---
echo "==> Building and starting containers..."
cd "$BACKEND_DIR"
docker compose down 2>/dev/null || true
docker compose up --build -d

echo "==> Waiting for health check..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:8080/health" >/dev/null 2>&1; then
    echo "==> API is healthy."
    curl -s "http://localhost:8080/health" | head -c 200
    echo ""
    echo ""
    echo "Deploy complete."
    echo "  Health:  http://localhost:8080/health"
    echo "  Catalog: http://localhost:8080/api/v1  (requires API_KEY header)"
    echo ""
    echo "Next: point HappyRobot tools at http://<your-server-ip>:8080/api/v1/*"
    echo "      see workflow/AGENT_PROMPT.md"
    exit 0
  fi
  sleep 2
done

echo "!! Health check failed. Logs:"
docker compose logs --tail=50
exit 1
