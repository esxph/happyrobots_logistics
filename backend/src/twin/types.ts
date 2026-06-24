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
