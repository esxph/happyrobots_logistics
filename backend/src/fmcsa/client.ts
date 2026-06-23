import { config } from "../config.js";
import { AppError } from "../lib/errors.js";

export interface CarrierVerification {
  authorized: boolean;
  mc_number: string;
  dot_number: string | null;
  legal_name: string | null;
  registered_phone: string | null;
  authority_status: string;
  reason: string | null;
}

interface FmcsaCarrier {
  allowedToOperate?: string;
  legalName?: string;
  dotNumber?: number;
  commonAuthorityStatus?: string;
  contractAuthorityStatus?: string;
  brokerAuthorityStatus?: string;
  telephone?: string;
  phyCity?: string;
  phyState?: string;
}

function normalizeMc(mc: string): string {
  return mc.replace(/\D/g, "");
}

function hasActiveAuthority(carrier: FmcsaCarrier): boolean {
  const statuses = [
    carrier.commonAuthorityStatus,
    carrier.contractAuthorityStatus,
    carrier.brokerAuthorityStatus,
  ];
  return statuses.some((s) => s === "A");
}

function authoritySummary(carrier: FmcsaCarrier): string {
  return [
    `common=${carrier.commonAuthorityStatus ?? "?"}`,
    `contract=${carrier.contractAuthorityStatus ?? "?"}`,
    `broker=${carrier.brokerAuthorityStatus ?? "?"}`,
  ].join(", ");
}

export class FmcsaClient {
  async verifyCarrier(mcNumber: string): Promise<CarrierVerification> {
    const mc = normalizeMc(mcNumber);
    if (!mc) {
      throw new AppError("Invalid MC number", "INVALID_MC", 400, "I need a valid MC number to continue.");
    }

    const url = `${config.FMCSA_BASE_URL}/carriers/docket-number/${mc}?webKey=${config.FMCSA_WEB_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new AppError("FMCSA lookup failed", "FMCSA_ERROR", 502, "Carrier verification is temporarily unavailable.");
    }

    const body = (await res.json()) as { content?: Array<{ carrier?: FmcsaCarrier }> };
    const carrier = body.content?.[0]?.carrier;

    if (!carrier) {
      return {
        authorized: false,
        mc_number: mc,
        dot_number: null,
        legal_name: null,
        registered_phone: config.OTP_PHONE_OVERRIDE ?? null,
        authority_status: "NOT_FOUND",
        reason: "Carrier not found in FMCSA database",
      };
    }

    const allowed = carrier.allowedToOperate === "Y";
    const activeAuthority = hasActiveAuthority(carrier);
    const authorized = allowed && activeAuthority;

    return {
      authorized,
      mc_number: mc,
      dot_number: carrier.dotNumber ? String(carrier.dotNumber) : null,
      legal_name: carrier.legalName ?? null,
      registered_phone: carrier.telephone ?? config.OTP_PHONE_OVERRIDE ?? null,
      authority_status: authoritySummary(carrier),
      reason: authorized
        ? null
        : !allowed
          ? "Carrier not allowed to operate"
          : "No active operating authority",
    };
  }
}

export const fmcsaClient = new FmcsaClient();
