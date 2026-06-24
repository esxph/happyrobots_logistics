# Architecture reference (compact)

Full stack, Docker, module map, and diagrams: **[README.md](./README.md)**.

## Components

| Component | Role |
|-----------|------|
| **HappyRobot Voice** | Inbound call UX, tool orchestration, SMS |
| **Integration API** (`backend/`) | Node 22 / TypeScript / Fastify — proxies FMCSA, TMS, OTP, negotiation |
| **FMCSA** | MC authority verification (REST) |
| **Legacy TMS** | Load search, detail, booking (TCP fixed-width protocol) |
| **Twin** | JSON logs in Docker volume + optional HappyRobot `carrier_calls` table |
| **Ops dashboard** | Static HTML → `/ops/calls`, `/ops/kpis` |

HappyRobot uses **one base URL** and **one `API_KEY`**. FMCSA, TMS, and `HP_API` stay on the server.

## API endpoints (`/api/v1`)

| Tool | Method | Path |
|------|--------|------|
| Catalog | GET | `/api/v1` |
| `create_session` | POST | `/api/v1/create_session` |
| `verify_carrier` | POST | `/api/v1/verify_carrier` |
| `lookup_carrier` | GET | `/api/v1/carriers/:mc_number` |
| `send_otp` | POST | `/api/v1/send_otp` |
| `verify_otp` | POST | `/api/v1/verify_otp` |
| `find_available_loads` | POST | `/api/v1/find_available_loads` |
| `get_load_detail` | GET | `/api/v1/loads/:load_id` |
| `negotiate_rate` | POST | `/api/v1/negotiate_rate` |
| `book_load` | POST | `/api/v1/book_load` |
| `transfer_to_colleague` | POST | `/api/v1/transfer_to_colleague` |
| `log_call` | POST | `/api/v1/log_call` |

**Auth:** `Authorization: Bearer <API_KEY>` or `X-API-Key: <API_KEY>`

## Policy (server-enforced)

- OTP required before load search or negotiation
- `max_rate` never returned to carriers
- Max 3 negotiation counter rounds
- Fresh TMS status check before booking

## POC storage → production

| Data | POC | Production |
|------|-----|------------|
| Sessions | In-memory | **Redis** (TTL) |
| OTP | In-memory plaintext | **Redis** (HMAC hash, TTL, attempt counter) |
| Call logs | JSON volume + Twin | **Twin only** |
| TMS cache | In-memory 45s | Redis (optional) |

See [README.md](./README.md#production-data-layer--redis-nosql-recommendation) for Redis key patterns, secure OTP checklist, and Compose sketch.

## Deployment

See [README.md](./README.md#docker-deployment) for Dockerfile, Compose, volumes, and healthcheck.

```bash
cd backend && cp .env.example .env && docker compose up --build -d
```

## Repository layout

```text
backend/           Integration API (deploy this)
Architecture/      This folder
apps/ops-dashboard/  Ops UI
```
