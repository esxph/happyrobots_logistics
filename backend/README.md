# Integration API

Fastify + TypeScript service: FMCSA proxy, TMS TCP client, OTP, negotiation, call logging.

**Deploy:** see [root README](../README.md).

```bash
cp .env.example .env    # fill credentials
docker compose up --build -d
curl http://localhost:8080/health
```

## Dev

```bash
npm install && npm run dev && npm test
```

## Layout

```text
src/routes/      /api/v1 handlers
src/fmcsa/       FMCSA + demo MC mock
src/tms/         TCP client, parser, cache
src/otp/         OTP service
src/sessions/    Call session state
src/negotiation/ Rate policy engine
src/twin/        JSON call log store
```
