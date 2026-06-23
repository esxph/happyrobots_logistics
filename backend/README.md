# Carrier Sales Integration API

Fastify + TypeScript service that proxies **FMCSA**, **legacy TMS (TCP)**, OTP, negotiation, and call logging for the HappyRobot inbound carrier sales workflow.

**Deployment & Ubuntu instructions:** see the [root README](../README.md).

## Quick start (Docker)

```bash
cp .env.example .env   # fill all required values
docker compose up --build -d
curl http://localhost:8080/health
```

## API surface

Canonical routes under `/api/v1/*` — see `GET /api/v1` for the tool catalog.

Legacy aliases (`/verify-carrier`, `/search-loads`, etc.) remain supported.

## Development

```bash
npm install
npm run dev
npm test
```

## Project layout

```text
src/
  routes/       handlers + route registration
  fmcsa/        FMCSA QCMobile client (proxied)
  tms/          TCP client, parser, cache
  otp/          Per-session OTP (in-memory POC)
  sessions/     Call session state (in-memory POC)
  negotiation/  Rate policy engine
  twin/         JSON call log store
```

## Environment

Copy [`.env.example`](.env.example) → `.env`. Required: `API_KEY`, `TMS_HOST`, `TMS_PORT`, `TMS_AUTH_TOKEN`, `FMCSA_WEB_KEY`.
