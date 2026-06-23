import { config } from "../config.js";
import type { CarrierVerification } from "./client.js";

/** Demo MC for POC / HappyRobot testing — bypasses FMCSA with authorized + OTP phone. */
export const DEMO_MC_NUMBER = config.DEMO_MC_NUMBER;

export function getMockCarrierVerification(mc: string): CarrierVerification | null {
  if (mc !== DEMO_MC_NUMBER) return null;

  return {
    authorized: true,
    mc_number: mc,
    dot_number: config.DEMO_MC_DOT,
    legal_name: config.DEMO_MC_LEGAL_NAME,
    registered_phone: config.DEMO_MC_PHONE,
    authority_status: "common=A, contract=A, broker=N",
    reason: null,
  };
}
