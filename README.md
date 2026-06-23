# HappyRobot Logistics — Inbound Carrier Sales (POC)

Proof-of-concept for the **FDE Technical Challenge**: automate inbound carrier qualification, identity verification, load matching, rate negotiation, and handoff — via a single **Integration API** that proxies FMCSA, legacy TMS, and call logging.

HappyRobot voice workflow connects with **one base URL** and **one API key**. FMCSA and TMS credentials stay on the server.

---

## Repository structure

```
HappyRobots/
├── backend/              Integration API (Fastify, TypeScript, Docker)
├── workflow/             Voice agent prompt & tool mapping
├── apps/ops-dashboard/   Operations dashboard (static HTML)
├── Architecture/         System design & Mermaid diagrams
├── docs/                   Submission docs (build, QA, email templates)
└── scripts/                Deployment helpers
```

| Path | Description |
|------|-------------|
| [backend/](backend/) | REST API — deploy this to your server |
| [workflow/AGENT_PROMPT.md](workflow/AGENT_PROMPT.md) | HappyRobot voice agent instructions |
| [Architecture/ARCHITECTURE.md](Architecture/ARCHITECTURE.md) | Architecture & data flow |
| [docs/BUILD_DESCRIPTION.md](docs/BUILD_DESCRIPTION.md) | IT/business build summary |
| [docs/QA_RESULTS.md](docs/QA_RESULTS.md) | Test plan & results log |

---

## What it does

```text
Carrier (web call) → HappyRobot Voice → Integration API
                                          ├── FMCSA (MC verification)
                                          ├── OTP (identity gate)
                                          ├── TMS TCP (load search/book)
                                          ├── Negotiation (max 3 rounds)
                                          └── Call logging (Twin POC)
```

**API catalog:** `GET /api/v1` (requires auth)

---

## Prerequisites

- **Docker** 24+ and **Docker Compose** v2
- Outbound HTTPS (FMCSA) and TCP (TMS) from the server
- Credentials from your candidate brief:
  - `API_KEY` — you choose (HappyRobot uses this)
  - `FMCSA_WEB_KEY`
  - `TMS_HOST`, `TMS_PORT`, `TMS_AUTH_TOKEN`

---

## Deploy on Ubuntu (production server)

These steps assume **Ubuntu 22.04 or 24.04** with SSH access.

### 1. Install Docker (one-time)

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
```

Optional — run Docker without `sudo`:

```bash
sudo usermod -aG docker $USER
# log out and back in
```

### 2. Clone the repository

```bash
git clone <your-repo-url> happyrobots-carrier-sales
cd happyrobots-carrier-sales
```

Or copy the project to the server with `scp` / `rsync`.

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
nano backend/.env   # or vim
```

**Required variables:**

```env
# Strong secret — HappyRobot sends this as Bearer token
API_KEY=replace-with-long-random-secret

PORT=8080
HOST=0.0.0.0

# Legacy TMS (from candidate email)
TMS_HOST=tramway.proxy.rlwy.net
TMS_PORT=17159
TMS_AUTH_TOKEN=your-tms-token

# FMCSA
FMCSA_WEB_KEY=your-fmcsa-web-key

# Optional: when FMCSA record has no phone number
OTP_PHONE_OVERRIDE=+15555550100
```

Generate a strong API key:

```bash
openssl rand -hex 32
```

### 4. Build and start

```bash
cd backend
docker compose up --build -d
```

Or use the helper script from repo root:

```bash
chmod +x scripts/deploy-ubuntu.sh
sudo ./scripts/deploy-ubuntu.sh
```

### 5. Verify deployment

```bash
# Health (no auth)
curl http://localhost:8080/health

# API catalog (requires API_KEY)
curl -s http://localhost:8080/api/v1 \
  -H "Authorization: Bearer YOUR_API_KEY" | jq

# FMCSA proxy smoke test
curl -s http://localhost:8080/api/v1/carriers/872144 \
  -H "Authorization: Bearer YOUR_API_KEY" | jq
```

Expected health response:

```json
{"status":"ok","service":"carrier-sales-api","timestamp":"..."}
```

### 6. Open firewall (if using UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8080/tcp    # or only 80/443 if using nginx below
sudo ufw enable
```

### 7. HTTPS with Nginx (recommended for HappyRobot)

HappyRobot should call your API over HTTPS. Example with Nginx reverse proxy:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/carrier-api`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/carrier-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.yourdomain.com
```

HappyRobot base URL: `https://api.yourdomain.com`

### 8. Wire HappyRobot workflow

1. Open [workflow/AGENT_PROMPT.md](workflow/AGENT_PROMPT.md) — paste into voice agent prompt
2. Create HTTP tools pointing to `https://api.yourdomain.com/api/v1/*`
3. Set header: `Authorization: Bearer <API_KEY>`
4. Enable web call trigger (no phone number)

**Tool paths:**

| Tool | Method | Path |
|------|--------|------|
| create_session | POST | `/api/v1/create_session` |
| verify_carrier | POST | `/api/v1/verify_carrier` |
| send_otp | POST | `/api/v1/send_otp` |
| verify_otp | POST | `/api/v1/verify_otp` |
| find_available_loads | POST | `/api/v1/find_available_loads` |
| get_load_detail | GET | `/api/v1/loads/:load_id` |
| negotiate_rate | POST | `/api/v1/negotiate_rate` |
| book_load | POST | `/api/v1/book_load` |
| transfer_to_colleague | POST | `/api/v1/transfer_to_colleague` |
| log_call | POST | `/api/v1/log_call` |

---

## Local development (macOS / Linux)

```bash
cd backend
cp .env.example .env   # fill credentials
npm install
npm run dev            # hot reload on :8080
```

```bash
npm test               # unit tests
npm run build          # compile TypeScript
```

---

## Operations

### View logs

```bash
cd backend
docker compose logs -f api
```

### Restart after config change

```bash
cd backend
docker compose down
docker compose up --build -d
```

### Ops dashboard

Open [apps/ops-dashboard/index.html](apps/ops-dashboard/index.html) in a browser.

Set:
- **API URL:** `https://api.yourdomain.com` (or `http://server-ip:8080`)
- **API Key:** your `API_KEY`

Or serve statically via Nginx alongside the API.

### OTP in development

After `send_otp`, the code is printed in API logs:

```bash
docker compose logs api | grep OTP
```

---

## API authentication

All routes except `/health` require:

```http
Authorization: Bearer <API_KEY>
```

or:

```http
X-API-Key: <API_KEY>
```

---

## Security notes

- Never commit `backend/.env` — it is gitignored
- FMCSA and TMS keys are server-side only; HappyRobot never sees them
- `max_rate` is never returned to carriers
- OTP is required before load search or negotiation
- Change default `API_KEY` before deploying

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `TMS connection timeout` | Check `TMS_HOST`/`TMS_PORT`, server outbound TCP |
| Empty TMS responses | Normal intermittently — client retries automatically |
| `FMCSA_ERROR` | Verify `FMCSA_WEB_KEY` |
| `OTP_NOT_SENT` | Call `send_otp` before `verify_otp` with same `session_id` |
| `401 Unauthorized` | Check `Authorization: Bearer` header matches `API_KEY` |
| Container won't start | `docker compose logs api` — usually missing `.env` values |

---

## Deliverables checklist

- [x] Code repository
- [x] Build description — [docs/BUILD_DESCRIPTION.md](docs/BUILD_DESCRIPTION.md)
- [x] Summary email — [docs/SUMMARY_EMAIL.md](docs/SUMMARY_EMAIL.md)
- [x] QA test plan — [docs/QA_RESULTS.md](docs/QA_RESULTS.md)
- [x] Architecture — [Architecture/ARCHITECTURE.md](Architecture/ARCHITECTURE.md)
- [ ] HappyRobot workflow link
- [ ] Walkthrough video (~5 min)

---

## References

See [docs/REFERENCES.md](docs/REFERENCES.md).

---

## License

POC for HappyRobot FDE Technical Challenge — internal evaluation use.
