import { config } from "../config.js";
import type { TwinCallRecord } from "./types.js";

function twinEnabled(): boolean {
  return Boolean(config.HP_API) && config.HP_TWIN_SYNC;
}

function formatTimestampForTwin(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.replace("T", " ").replace(/Z$/, "").slice(0, 19);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const escaped = JSON.stringify(value).replace(/'/g, "''");
    return `'${escaped}'::jsonb`;
  }
  const str = String(value);
  if (str.includes("T") && (str.endsWith("Z") || str.includes("+00:00"))) {
    return `'${formatTimestampForTwin(str)}'`;
  }
  return `'${str.replace(/'/g, "''")}'`;
}

function stringifyRowValues(record: TwinCallRecord): Record<string, string> {
  const values: Record<string, string> = {
    call_id: record.call_id,
    carrier_mc: record.carrier_mc ?? "",
    fmcsa_status: record.fmcsa_status ?? "",
    otp_status: record.otp_status,
    lane_preference: record.lane_preference ?? "",
    equipment_type: record.equipment_type ?? "",
    loads_searched_count: String(record.loads_searched_count),
    load_offered_id: record.load_offered_id ?? "",
    negotiation_rounds: String(record.negotiation_rounds),
    outcome: record.outcome,
    notes: JSON.stringify(record.notes),
    handoff_queue_id: record.handoff_queue_id ?? "",
    started_at: formatTimestampForTwin(record.started_at),
    ended_at: formatTimestampForTwin(record.ended_at),
  };
  if (record.agreed_rate !== null) {
    values.agreed_rate = String(record.agreed_rate);
  }
  return values;
}

function buildUpdateSql(table: string, record: TwinCallRecord): string {
  const sets = [
    `carrier_mc = ${sqlLiteral(record.carrier_mc)}`,
    `fmcsa_status = ${sqlLiteral(record.fmcsa_status)}`,
    `otp_status = ${sqlLiteral(record.otp_status)}`,
    `lane_preference = ${sqlLiteral(record.lane_preference)}`,
    `equipment_type = ${sqlLiteral(record.equipment_type)}`,
    `loads_searched_count = ${record.loads_searched_count}`,
    `load_offered_id = ${sqlLiteral(record.load_offered_id)}`,
    `negotiation_rounds = ${record.negotiation_rounds}`,
    `agreed_rate = ${record.agreed_rate === null ? "NULL" : record.agreed_rate}`,
    `outcome = ${sqlLiteral(record.outcome)}`,
    `notes = ${sqlLiteral(record.notes)}`,
    `handoff_queue_id = ${sqlLiteral(record.handoff_queue_id)}`,
    `started_at = ${sqlLiteral(formatTimestampForTwin(record.started_at))}`,
    `ended_at = ${sqlLiteral(formatTimestampForTwin(record.ended_at))}`,
  ];
  return `UPDATE ${table} SET ${sets.join(", ")} WHERE call_id = ${sqlLiteral(record.call_id)}`;
}

export class HappyRobotTwinClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly table: string;

  constructor() {
    this.baseUrl = config.HP_BASE_URL.replace(/\/$/, "");
    this.apiKey = config.HP_API ?? "";
    this.table = config.HP_TWIN_TABLE;
  }

  isEnabled(): boolean {
    return twinEnabled();
  }

  async upsertCallRecord(record: TwinCallRecord): Promise<void> {
    if (!this.isEnabled()) return;

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const updateResp = await fetch(`${this.baseUrl}/twin/sql`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sql: buildUpdateSql(this.table, record) }),
    });

    if (!updateResp.ok) {
      const body = await updateResp.text();
      console.warn(
        `[twin] UPDATE failed (${updateResp.status}) for ${record.call_id}: ${body.slice(0, 200)}`,
      );
      return;
    }

    const updateData = (await updateResp.json()) as { rowCount?: number | null };
    if (updateData.rowCount && updateData.rowCount > 0) return;

    const insertResp = await fetch(`${this.baseUrl}/twin/tables/${this.table}/rows`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: stringifyRowValues(record) }),
    });

    if (!insertResp.ok) {
      const body = await insertResp.text();
      console.warn(
        `[twin] INSERT failed (${insertResp.status}) for ${record.call_id}: ${body.slice(0, 200)}`,
      );
    }
  }
}

export const happyRobotTwin = new HappyRobotTwinClient();
