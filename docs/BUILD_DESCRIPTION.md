# Build Description — Inbound Carrier Sales Automation

## Overview

Proof-of-concept automating the first leg of inbound carrier calls: verify authority, confirm identity, match loads, negotiate rates, and hand off to a senior rep — without dispatcher involvement.

## Architecture

```
Carrier (Web Call) → HappyRobot Voice Workflow → Integration API → [FMCSA | TMS TCP | Twin]
                                                      ↓
                                              Ops Dashboard (Apps)
```

## Components

### Integration API (`backend/`)

- **Stack:** Node.js 22, TypeScript, Fastify
- **Auth:** Bearer token on all endpoints except `/health`
- **TMS:** TCP line protocol, one connection per request, 3 retries with backoff
- **FMCSA:** QCMobile REST API (`/carriers/docket-number/{mc}`)
- **OTP:** Server-side generation, expiry, attempt limits; SMS via HappyRobot (console log in dev)
- **Negotiation:** Server-enforced max_rate ceiling, 3-round cap
- **Twin:** JSON file store (`data/twin/`) — swap for HappyRobot Twin API in production

### Ops Dashboard (`apps/ops-dashboard/`)

- Reads `/ops/calls` and `/ops/kpis` from integration API
- Filters by outcome and MC number

### Voice Workflow (`workflow/AGENT_PROMPT.md`)

- Agent instructions and tool-call sequence for HappyRobot platform
- Web call trigger only (no phone number)

## Security & compliance

- All API endpoints authenticated
- OTP cannot be bypassed (enforced server-side on search/negotiate)
- `max_rate` / `MAX_BUY` stripped from carrier-facing responses
- Secrets via environment variables only

## Deployment

Single-command Docker deploy. **Full Ubuntu server guide:** [README.md](../README.md#deploy-on-ubuntu-production-server).

```bash
cd backend
cp .env.example .env
docker compose up --build -d
```

## External dependencies

| System | Protocol | Purpose |
|--------|----------|---------|
| Legacy TMS | TCP fixed-width | Load search, detail, booking |
| FMCSA QCMobile | HTTPS REST | MC authority verification |
| HappyRobot Platform | Voice + SMS + Twin | Call orchestration, OTP delivery, logging |

## KPIs

Tracked via `/ops/kpis`: booking rate, verification pass rate, OTP pass rate, failed negotiation count, max_rate breach count (target: 0).

## Known limitations (POC)

- Senior rep handoff is mocked (web calls cannot PSTN transfer)
- Twin uses local JSON store until HappyRobot Twin API is wired
- OTP SMS logs to console in dev; production requires HappyRobot SMS integration
