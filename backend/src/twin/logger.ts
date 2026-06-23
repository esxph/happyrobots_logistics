import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { CallSession } from "../sessions/store.js";

export interface TwinCallRecord {
  call_id: string;
  carrier_mc: string | null;
  fmcsa_status: string | null;
  otp_status: string;
  lane_preference: string | null;
  equipment_type: string | null;
  loads_searched_count: number;
  load_offered_id: string | null;
  negotiation_rounds: number;
  agreed_rate: number | null;
  outcome: string;
  notes: string[];
  handoff_queue_id: string | null;
  started_at: string;
  ended_at: string;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(config.TWIN_DATA_DIR, { recursive: true });
}

function toRecord(session: CallSession): TwinCallRecord {
  return {
    call_id: session.id,
    carrier_mc: session.carrier_mc,
    fmcsa_status: session.fmcsa_status,
    otp_status: session.otp_status,
    lane_preference: session.lane_preference,
    equipment_type: session.equipment_type,
    loads_searched_count: session.loads_searched.length,
    load_offered_id: session.load_offered?.load_id ?? null,
    negotiation_rounds: session.negotiation_rounds.length,
    agreed_rate: session.agreed_rate,
    outcome: session.outcome,
    notes: session.notes,
    handoff_queue_id: session.handoff_queue_id,
    started_at: session.created_at,
    ended_at: session.updated_at,
  };
}

export class TwinLogger {
  async logSession(session: CallSession): Promise<TwinCallRecord> {
    await ensureDir();
    const record = toRecord(session);
    const file = path.join(config.TWIN_DATA_DIR, `${session.id}.json`);
    await fs.writeFile(file, JSON.stringify(record, null, 2), "utf8");

    const indexFile = path.join(config.TWIN_DATA_DIR, "index.json");
    let index: TwinCallRecord[] = [];
    try {
      const raw = await fs.readFile(indexFile, "utf8");
      index = JSON.parse(raw) as TwinCallRecord[];
    } catch {
      index = [];
    }
    const filtered = index.filter((r) => r.call_id !== record.call_id);
    filtered.unshift(record);
    await fs.writeFile(indexFile, JSON.stringify(filtered.slice(0, 500), null, 2), "utf8");
    return record;
  }

  async listRecords(limit = 50): Promise<TwinCallRecord[]> {
    await ensureDir();
    const indexFile = path.join(config.TWIN_DATA_DIR, "index.json");
    try {
      const raw = await fs.readFile(indexFile, "utf8");
      const index = JSON.parse(raw) as TwinCallRecord[];
      return index.slice(0, limit);
    } catch {
      return [];
    }
  }

  async getKpis(): Promise<Record<string, number>> {
    const records = await this.listRecords(500);
    const total = records.length;
    const booked = records.filter((r) => r.outcome === "booked").length;
    const failedVerification = records.filter((r) => r.outcome === "failed_verification").length;
    const failedOtp = records.filter((r) => r.outcome === "failed_otp").length;
    const failedNegotiation = records.filter((r) => r.outcome === "failed_negotiation").length;
    const noMatch = records.filter((r) => r.outcome === "no_match").length;

    return {
      total_calls: total,
      booking_rate: total ? Number((booked / total).toFixed(4)) : 0,
      verification_pass_rate: total
        ? Number(((total - failedVerification) / total).toFixed(4))
        : 0,
      otp_pass_rate: total ? Number(((total - failedOtp) / total).toFixed(4)) : 0,
      negotiation_success_rate: total ? Number((booked / total).toFixed(4)) : 0,
      failed_negotiation_count: failedNegotiation,
      no_match_count: noMatch,
      max_rate_breach_count: 0,
    };
  }
}

export const twinLogger = new TwinLogger();
