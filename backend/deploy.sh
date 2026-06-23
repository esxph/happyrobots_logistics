#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Missing .env — run: cp .env.example .env && edit values"
  exit 1
fi

docker compose up --build -d

echo "Waiting for health..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:8080/health >/dev/null 2>&1; then
    echo "API healthy at http://localhost:8080"
    echo "Catalog: curl -H \"Authorization: Bearer \$API_KEY\" http://localhost:8080/api/v1"
    exit 0
  fi
  sleep 2
done

echo "Health check failed — run: docker compose logs api"
exit 1
