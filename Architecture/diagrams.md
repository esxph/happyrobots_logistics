# Architecture diagrams

Standalone Mermaid diagrams for the Inbound Carrier Sales POC.  
Full narrative: [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## 1. System context

```mermaid
flowchart TB
    subgraph external [External]
        Carrier[Carrier_WebCall]
        FMCSA[FMCSA_QCMobile_REST]
        TMS[Legacy_TMS_TCP]
    end

    subgraph happyrobot [HappyRobot Platform]
        WebCall[WebCallTrigger]
        VoiceAgent[VoiceAgent]
        SMS[SMS_OTP]
        TwinHR[Twin_Platform]
        Apps[Ops_Apps]
    end

    subgraph poc [Integration API_POC]
        API[Fastify_API_v1]
        Sessions[(InMemory_Sessions)]
        OTP[(InMemory_OTP)]
        TwinFile[(JSON_Twin_Files)]
        TMSClient[TMS_Client_Cache]
        FMCSAClient[FMCSA_Client]
        Negotiation[Negotiation_Engine]
    end

    Carrier --> WebCall
    WebCall --> VoiceAgent
    VoiceAgent -->|Bearer_API_KEY| API
    API --> Sessions
    API --> OTP
    API --> FMCSAClient
    API --> TMSClient
    API --> Negotiation
    API --> TwinFile
    API -->|send_otp| SMS
    FMCSAClient --> FMCSA
    TMSClient --> TMS
    TwinFile -.->|future_sync| TwinHR
    Apps -->|ops_endpoints| API
```

---

## 2. Call sequence

```mermaid
sequenceDiagram
    participant C as Carrier
    participant HR as HappyRobot_Voice
    participant API as Integration_API
    participant FMCSA as FMCSA
    participant OTP as OTP_Store
    participant TMS as Legacy_TMS
    participant Log as Call_Log

    C->>HR: Web call starts
    HR->>API: POST /api/v1/create_session
    API-->>HR: session_id

    HR->>C: Lane / reference / MC?
    C->>HR: MC number
    HR->>API: POST /api/v1/verify_carrier
    API->>FMCSA: GET carriers/docket-number/{mc}
    FMCSA-->>API: carrier + authority
    API-->>HR: authorized, legal_name

    HR->>C: Is this [company]?
    HR->>API: POST /api/v1/send_otp
    API->>OTP: store code keyed by session_id
    API-->>HR: masked_phone

    C->>HR: OTP code
    HR->>API: POST /api/v1/verify_otp
    API->>OTP: verify session_id + code
    API-->>HR: verified

    HR->>API: POST /api/v1/find_available_loads
    API->>TMS: LOAD_QUERY + LOAD_GET
    TMS-->>API: load records
    API-->>HR: recommended_load, rate

    HR->>C: Pitch load
    loop Max 3 counter rounds
        C->>HR: accept / reject / counter
        HR->>API: POST /api/v1/negotiate_rate
        API-->>HR: status, next_offer or agreed_rate
    end

    HR->>API: POST /api/v1/book_load
    API->>TMS: LOAD_BOOK
    TMS-->>API: confirmation

    HR->>API: POST /api/v1/transfer_to_colleague
    API-->>HR: queue_id

    HR->>API: POST /api/v1/log_call
    API->>Log: persist outcome
```

---

## 3. POC data stores

```mermaid
flowchart LR
    subgraph runtime [InMemory_Runtime]
        S[sessions/store.ts_Map]
        O[otp/service.ts_Map]
        C[tms/cache.ts_Map]
    end

    subgraph persistent [File_Persistent]
        T[data/twin/*.json]
        I[data/twin/index.json]
    end

    API[Integration_API] --> S
    API --> O
    API --> C
    API --> T
    API --> I
```

---

## 4. Security gates

```mermaid
flowchart TD
    Request[API_Request] --> Auth{API_KEY_valid?}
    Auth -->|no| Reject401[401_Unauthorized]
    Auth -->|yes| Route[Tool_Handler]

    Route --> FMCSA_Gate{FMCSA_pass?}
    FMCSA_Gate -->|no| EndVerify[End_failed_verification]

    FMCSA_Gate -->|yes| OTP_Gate{OTP_verified?}
    OTP_Gate -->|no| BlockLoad[Block_load_search_negotiate]

    OTP_Gate -->|yes| Negotiate[Negotiation]
    Negotiate --> Ceiling{rate_le_max_rate?}
    Ceiling -->|no| CounterOrFail[Counter_or_fail]
    Ceiling -->|yes| Book[book_load]
```

---

## 5. Production target (future)

```mermaid
flowchart TB
    API[Integration_API]

    API --> Redis[(Redis)]
    API --> Postgres[(Postgres)]
    API --> Twin[HappyRobot_Twin]

    Redis --> R1["session:{uuid}"]
    Redis --> R2["otp:{uuid} hashed"]

    Postgres --> P1[call_sessions]
    Postgres --> P2[call_events]

    Twin --> T1[Platform_call_activity]
```

---

## 6. Docker deployment

```mermaid
flowchart TB
    subgraph docker [Docker]
        Container[carrier-sales-api]
        Vol[data/twin_volume]
    end

    HR[HappyRobot_Cloud] -->|HTTPS| Container
    Container --> Vol
    Container --> FMCSA[FMCSA_API]
    Container --> TMS[TMS_TCP]
```
