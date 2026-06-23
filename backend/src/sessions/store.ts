import type { LoadDetail, LoadSummary } from "../tms/types.js";

export type CallOutcome =
  | "in_progress"
  | "booked"
  | "failed_verification"
  | "failed_otp"
  | "no_match"
  | "failed_negotiation"
  | "rejected_by_carrier"
  | "system_error";

export interface NegotiationRound {
  round: number;
  action: string;
  carrier_rate?: number;
  broker_rate: number;
}

export interface CallSession {
  id: string;
  created_at: string;
  updated_at: string;
  carrier_mc: string | null;
  fmcsa_status: string | null;
  otp_status: "pending" | "sent" | "verified" | "failed";
  lane_preference: string | null;
  equipment_type: string | null;
  loads_searched: LoadSummary[];
  load_offered: LoadDetail | null;
  negotiation_rounds: NegotiationRound[];
  current_offer_rate: number | null;
  agreed_rate: number | null;
  outcome: CallOutcome;
  notes: string[];
  handoff_queue_id: string | null;
}

const sessions = new Map<string, CallSession>();

export function createSession(id?: string): CallSession {
  const sessionId = id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const session: CallSession = {
    id: sessionId,
    created_at: now,
    updated_at: now,
    carrier_mc: null,
    fmcsa_status: null,
    otp_status: "pending",
    lane_preference: null,
    equipment_type: null,
    loads_searched: [],
    load_offered: null,
    negotiation_rounds: [],
    current_offer_rate: null,
    agreed_rate: null,
    outcome: "in_progress",
    notes: [],
    handoff_queue_id: null,
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(id: string): CallSession {
  const session = sessions.get(id);
  if (!session) {
    throw new Error(`Session not found: ${id}`);
  }
  return session;
}

export function updateSession(id: string, patch: Partial<CallSession>): CallSession {
  const session = getSession(id);
  const updated = { ...session, ...patch, updated_at: new Date().toISOString() };
  sessions.set(id, updated);
  return updated;
}

export function listSessions(): CallSession[] {
  return [...sessions.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
