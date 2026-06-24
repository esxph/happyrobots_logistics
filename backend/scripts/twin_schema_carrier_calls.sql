-- HappyRobot Twin schema for inbound carrier sales call logs.
-- Apply with: npm run twin:schema (requires HP_API in .env)
-- One statement per request — HR Cloudflare WAF rejects multi-statement bodies.

CREATE TABLE carrier_calls (
  id BIGSERIAL PRIMARY KEY,
  call_id TEXT NOT NULL,
  carrier_mc TEXT,
  fmcsa_status TEXT,
  otp_status TEXT,
  lane_preference TEXT,
  equipment_type TEXT,
  loads_searched_count BIGINT,
  load_offered_id TEXT,
  negotiation_rounds BIGINT,
  agreed_rate DOUBLE PRECISION,
  outcome TEXT,
  notes JSONB,
  handoff_queue_id TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- === STATEMENT BREAK ===

ALTER TABLE carrier_calls ADD CONSTRAINT carrier_calls_call_id_uniq UNIQUE (call_id);
