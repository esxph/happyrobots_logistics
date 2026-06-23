import type { LoadDetail, LoadQueryParams, LoadSummary } from "./types.js";

const FIELD_ALIASES: Record<string, string> = {
  LOAD_ID: "load_id",
  ORIG_CITY: "origin_city",
  ORIG_STATE: "origin_state",
  ORIG_ZIP: "origin_zip",
  DEST_CITY: "destination_city",
  DEST_STATE: "destination_state",
  DEST_ZIP: "destination_zip",
  PICKUP_DT: "pickup_datetime",
  DELIVERY_DT: "delivery_datetime",
  EQTYPE: "equipment_type",
  RATE: "loadboard_rate",
  MAX_BUY: "max_rate",
  WEIGHT: "weight",
  COMMODITY: "commodity_type",
  PIECES: "num_of_pieces",
  MILES: "miles",
  DIMS: "dimensions",
  NOTES: "notes",
  STATUS: "status",
};

function trimValue(value: string): string {
  return value.trim();
}

function parseNumeric(value: string | undefined): number {
  if (!value) return 0;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

export function parseKeyValueLine(line: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of line.split("|")) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1);
    fields[key] = value;
  }
  return fields;
}

export function parseErrorLine(line: string): { code: string; message: string } {
  const fields = parseKeyValueLine(line.replace(/^ERR\|?/, ""));
  return {
    code: fields.CODE ?? "SERVER_ERROR",
    message: fields.MSG ?? "unknown error",
  };
}

function formatLocation(city?: string, state?: string): string {
  const c = trimValue(city ?? "");
  const s = trimValue(state ?? "");
  if (c && s) return `${c}, ${s}`;
  return c || s;
}

function mapEquipment(eq?: string): string {
  return trimValue(eq ?? "").replace(/_/g, " ");
}

function formatDatetime(dt?: string): string {
  const raw = trimValue(dt ?? "");
  if (raw.length !== 14) return raw;
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  const hh = raw.slice(8, 10);
  const mm = raw.slice(10, 12);
  return `${y}-${m}-${d}T${hh}:${mm}:00`;
}

export function toLoadSummary(fields: Record<string, string>): LoadSummary {
  return {
    load_id: trimValue(fields.LOAD_ID ?? ""),
    origin: formatLocation(fields.ORIG_CITY, fields.ORIG_STATE),
    destination: formatLocation(fields.DEST_CITY, fields.DEST_STATE),
    pickup_datetime: formatDatetime(fields.PICKUP_DT),
    equipment_type: mapEquipment(fields.EQTYPE),
    loadboard_rate: parseNumeric(fields.RATE),
    miles: parseNumeric(fields.MILES),
    status: trimValue(fields.STATUS ?? ""),
  };
}

export function toLoadDetail(fields: Record<string, string>): LoadDetail {
  return {
    load_id: trimValue(fields.LOAD_ID ?? ""),
    origin: formatLocation(fields.ORIG_CITY, fields.ORIG_STATE),
    destination: formatLocation(fields.DEST_CITY, fields.DEST_STATE),
    origin_zip: trimValue(fields.ORIG_ZIP ?? ""),
    destination_zip: trimValue(fields.DEST_ZIP ?? ""),
    pickup_datetime: formatDatetime(fields.PICKUP_DT),
    delivery_datetime: formatDatetime(fields.DELIVERY_DT),
    equipment_type: mapEquipment(fields.EQTYPE),
    loadboard_rate: parseNumeric(fields.RATE),
    max_rate: fields.MAX_BUY !== undefined ? parseNumeric(fields.MAX_BUY) : null,
    weight: parseNumeric(fields.WEIGHT),
    commodity_type: trimValue(fields.COMMODITY ?? ""),
    num_of_pieces: parseNumeric(fields.PIECES),
    miles: parseNumeric(fields.MILES),
    dimensions: trimValue(fields.DIMS ?? ""),
    notes: trimValue(fields.NOTES ?? ""),
    status: trimValue(fields.STATUS ?? ""),
  };
}

export function buildRequestLine(
  cmd: string,
  auth: string,
  params: Record<string, string | number | undefined>,
): string {
  const parts = [`CMD:${cmd}`, `AUTH:${auth}`];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    parts.push(`${key}:${value}`);
  }
  return `${parts.join("|")}\r\n`;
}

export function buildLoadQueryRequest(auth: string, query: LoadQueryParams): string {
  const eqMap: Record<string, string> = {
    "DRY VAN": "DRY_VAN",
    DRY_VAN: "DRY_VAN",
    REEFER: "REEFER",
    FLATBED: "FLATBED",
  };
  const eq = query.equipment_type
    ? eqMap[query.equipment_type.toUpperCase()] ?? query.equipment_type.toUpperCase().replace(/\s+/g, "_")
    : undefined;

  return buildRequestLine("LOAD_QUERY", auth, {
    ORIG_CITY: query.origin_city?.toUpperCase(),
    ORIG_STATE: query.origin_state?.toUpperCase(),
    DEST_CITY: query.destination_city?.toUpperCase(),
    DEST_STATE: query.destination_state?.toUpperCase(),
    EQTYPE: eq,
    MAX_RESULTS: query.max_results ?? 5,
  });
}

export function buildLoadGetRequest(auth: string, loadId: string): string {
  return buildRequestLine("LOAD_GET", auth, { LOAD_ID: loadId });
}

export function buildLoadBookRequest(
  auth: string,
  loadId: string,
  mcNumber: string,
  agreedRate: number,
): string {
  return buildRequestLine("LOAD_BOOK", auth, {
    LOAD_ID: loadId,
    MC_NUM: mcNumber.replace(/\D/g, ""),
    AGREED_RATE: agreedRate,
  });
}

export function buildDebugEchoRequest(auth: string, payload: string): string {
  return buildRequestLine("DEBUG_ECHO", auth, { PAYLOAD: payload });
}

export { FIELD_ALIASES };
