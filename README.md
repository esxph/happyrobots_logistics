# HappyRobot Logistics — Inbound Carrier Sales

POC for the FDE Technical Challenge: inbound carrier qualification, OTP identity verification, TMS load matching, rate negotiation, and mock handoff — via a single **Integration API**.

HappyRobot connects with **one URL** + **one API key**. FMCSA and TMS credentials never leave the server.

**Live API example:** `https://happyapi.edhuntx.com`

---

## Quick deploy (Ubuntu + Docker)

**Requirements:** Docker 24+, Docker Compose v2, outbound HTTPS + TCP.

### 1. Clone and configure

```bash
git clone https://github.com/esxph/happyrobots_logistics.git
cd happyrobots_logistics/backend
cp .env.example .env
```

Edit `.env` — required values:

```env
API_KEY=<openssl rand -hex 32>
TMS_HOST=<from candidate brief>
TMS_PORT=<from candidate brief>
TMS_AUTH_TOKEN=<from candidate brief>
FMCSA_WEB_KEY=<from candidate brief>
```

Optional for voice testing:

```env
DEMO_MC_NUMBER=999999
DEMO_MC_PHONE=+525510506746
OTP_RETURN_CODE_IN_RESPONSE=true
```

### 2. Start

```bash
docker compose up --build -d
```

### 3. Verify

```bash
curl http://localhost:8080/health
curl -s http://localhost:8080/api/v1 -H "Authorization: Bearer YOUR_API_KEY"
```

### 4. HTTPS (recommended)

Point a domain at your server, proxy port 8080 with Nginx/Caddy, run Certbot.  
HappyRobot base URL: `https://your-domain.com`

### 5. Wire HappyRobot

1. Paste [workflow/AGENT_PROMPT.md](workflow/AGENT_PROMPT.md) into the voice agent
2. Create HTTP tools → `https://your-domain.com/api/v1/*`
3. Auth: `Authorization: Bearer <API_KEY>`
4. Enable **web call** trigger

Tool catalog: `GET /api/v1`

---

## Local development

```bash
cd backend
cp .env.example .env
npm install
npm run dev      # :8080
npm test
```

---

## Project structure

| Path | Purpose |
|------|---------|
| [backend/](backend/) | Integration API — **deploy this** |
| [workflow/AGENT_PROMPT.md](workflow/AGENT_PROMPT.md) | Voice agent instructions |
| [Architecture/](Architecture/) | System diagrams & design |
| [apps/ops-dashboard/](apps/ops-dashboard/) | Ops UI |
| [docs/](docs/) | Build description, QA, submission email |

---

## API auth

All routes except `/health`:

```http
Authorization: Bearer <API_KEY>
```

---

## Operations

```bash
cd backend
docker compose logs -f api          # logs
docker compose logs api | grep OTP    # OTP codes (POC)
docker compose up --build -d          # redeploy after changes
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `401 Unauthorized` | Check `API_KEY` header |
| `OTP_REQUIRED` | Complete `send_otp` + `verify_otp` first |
| `NO_LOAD` | Run `find_available_loads` before `negotiate_rate` |
| `500` on negotiate | Redeploy latest — numeric strings are coerced |
| TMS timeout | Normal intermittently; client retries automatically |

---

## Documentation

- [Architecture/README.md](Architecture/README.md) — Mermaid diagrams
- [docs/BUILD_DESCRIPTION.md](docs/BUILD_DESCRIPTION.md) — build summary
- [docs/QA_RESULTS.md](docs/QA_RESULTS.md) — test plan
- [docs/REFERENCES.md](docs/REFERENCES.md) — external links
