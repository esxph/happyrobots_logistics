# Build Description

## Summary

Automates inbound carrier calls: FMCSA verification → OTP → TMS load match → rate negotiation → mock handoff → structured logging.

```
Carrier (web call) → HappyRobot Voice → Integration API → FMCSA | TMS | Twin
```

## Stack

- **API:** Node.js 22, TypeScript, Fastify, Docker
- **TMS:** TCP line protocol with retries and 45s read cache
- **FMCSA:** QCMobile REST proxy
- **OTP:** Server-side; SMS via HappyRobot (`send_otp` returns code in POC)
- **Negotiation:** `max_rate` ceiling, 3-round cap, never exposed to carriers
- **Logging:** JSON Twin store (`data/twin/`)

## Security

- Bearer auth on all endpoints except `/health`
- OTP enforced before load search / negotiation
- FMCSA + TMS credentials server-side only

## Deploy

```bash
cd backend && cp .env.example .env && docker compose up --build -d
```

Full guide: [README.md](../README.md)

## Deliverables

| Item | Location |
|------|----------|
| Code | `backend/`, `workflow/` |
| Architecture | [Architecture/](../Architecture/) |
| Voice prompt | [workflow/AGENT_PROMPT.md](../workflow/AGENT_PROMPT.md) |
| QA plan | [QA_RESULTS.md](./QA_RESULTS.md) |
| Summary email | [SUMMARY_EMAIL.md](./SUMMARY_EMAIL.md) |
