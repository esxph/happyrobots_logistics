# Architecture

Inbound carrier sales POC: HappyRobot voice workflow → single Integration API → FMCSA, TMS, OTP, negotiation, and call logging.

## System diagram

```mermaid
flowchart TB
    Carrier[Carrier Web Call] --> HR[HappyRobot Voice Agent]
    HR -->|Bearer API_KEY| API[Integration API :8080]

    API --> FMCSA[FMCSA REST]
    API --> TMS[Legacy TMS TCP]
    API --> Session[(Session Store)]
    API --> OTP[(OTP Store)]
    API --> Twin[(Call Logs)]

    HR --> SMS[SMS OTP]
    API -.->|send_otp| SMS

    subgraph api_tools [API Tools /api/v1]
        direction TB
        T1[create_session]
        T2[verify_carrier]
        T3[send_otp / verify_otp]
        T4[find_available_loads]
        T5[negotiate_rate]
        T6[book_load]
        T7[transfer_to_colleague]
        T8[log_call]
    end

    API --> api_tools
```

## Call flow

```mermaid
sequenceDiagram
    participant C as Carrier
    participant HR as HappyRobot
    participant API as Integration API
    participant FMCSA as FMCSA
    participant TMS as TMS

    C->>HR: Calls in
    HR->>API: create_session
    HR->>API: verify_carrier (MC)
    API->>FMCSA: authority check
    HR->>API: send_otp / verify_otp
    HR->>API: find_available_loads
    API->>TMS: LOAD_QUERY
    HR->>C: Pitch load
    HR->>API: negotiate_rate
    HR->>API: book_load
    HR->>API: transfer_to_colleague
    HR->>API: log_call
```

## Security gates

```mermaid
flowchart TD
    A[API Request] --> B{Valid API_KEY?}
    B -->|no| R401[401]
    B -->|yes| C{FMCSA authorized?}
    C -->|no| End1[failed_verification]
    C -->|yes| D{OTP verified?}
    D -->|no| Block[Block load search]
    D -->|yes| E[Load search + negotiate]
    E --> F{Rate within policy?}
    F -->|yes| G[book_load + handoff]
```

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — components, API table, POC vs production
- [../workflow/AGENT_PROMPT.md](../workflow/AGENT_PROMPT.md) — voice agent + tool mapping
- [../README.md](../README.md) — deploy instructions
