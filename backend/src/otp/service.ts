import { randomInt } from "node:crypto";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";

interface OtpRecord {
  code: string;
  phone: string;
  mc_number: string;
  expires_at: number;
  attempts: number;
  pending_digits: string;
  verified: boolean;
}

const store = new Map<string, OtpRecord>();

function otpKey(sessionId: string): string {
  return sessionId;
}

function generateCode(): string {
  const max = 10 ** config.OTP_LENGTH;
  return String(randomInt(0, max)).padStart(config.OTP_LENGTH, "0");
}

const DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  won: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
};

/** Voice ASR often returns spaced, punctuated, or spoken digits. */
export function normalizeOtpCode(code: string): string {
  const wordsAsDigits = code
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .map((token) => {
      const cleaned = token.replace(/[^a-z0-9]/g, "");
      if (/^\d+$/.test(cleaned)) return cleaned;
      return DIGIT_WORDS[cleaned] ?? "";
    })
    .join("");

  const literalDigits = code.replace(/\D/g, "");
  return wordsAsDigits || literalDigits;
}

export class OtpService {
  send(
    sessionId: string,
    mcNumber: string,
    phone: string,
  ): { sent: boolean; masked_phone: string; code: string } {
    if (!phone) {
      throw new AppError(
        "No registered phone on file",
        "NO_PHONE",
        400,
        "I cannot send a verification code without a registered phone number on file.",
      );
    }

    const code = generateCode();
    store.set(otpKey(sessionId), {
      code,
      phone,
      mc_number: mcNumber,
      expires_at: Date.now() + config.OTP_TTL_SECONDS * 1000,
      attempts: 0,
      pending_digits: "",
      verified: false,
    });

    // HappyRobot SMS integration hooks here; log in dev for testing.
    console.info(`[OTP] session=${sessionId} mc=${mcNumber} phone=${phone} code=${code}`);

    const masked = phone.length > 4 ? `***${phone.slice(-4)}` : "****";
    return { sent: true, masked_phone: masked, code };
  }

  verify(sessionId: string, code: string): { verified: boolean } {
    const record = store.get(otpKey(sessionId));
    if (!record) {
      throw new AppError("OTP not sent", "OTP_NOT_SENT", 400, "Please request a verification code first.");
    }
    if (record.verified) {
      return { verified: true };
    }
    if (Date.now() > record.expires_at) {
      store.delete(otpKey(sessionId));
      throw new AppError("OTP expired", "OTP_EXPIRED", 400, "That code has expired. I can send a new one.");
    }
    if (record.attempts >= config.OTP_MAX_ATTEMPTS) {
      throw new AppError("OTP locked", "OTP_LOCKED", 403, "Too many incorrect attempts. This call cannot continue.");
    }

    const incoming = normalizeOtpCode(code);
    const combined = `${record.pending_digits}${incoming}`;
    if (combined.length < config.OTP_LENGTH) {
      record.pending_digits = combined;
      throw new AppError(
        "Partial OTP",
        "OTP_PARTIAL",
        400,
        `I have ${combined.length} digits. Please give me the remaining ${config.OTP_LENGTH - combined.length} digits.`,
      );
    }

    record.attempts += 1;
    const candidate = combined.slice(0, config.OTP_LENGTH);
    if (record.code !== candidate) {
      record.pending_digits = "";
      throw new AppError("Invalid OTP", "OTP_INVALID", 400, "That code is incorrect. Please try again.");
    }

    record.pending_digits = "";
    record.verified = true;
    return { verified: true };
  }

  isVerified(sessionId: string): boolean {
    return store.get(otpKey(sessionId))?.verified ?? false;
  }

  requireVerified(sessionId: string): void {
    if (!this.isVerified(sessionId)) {
      throw new AppError(
        "OTP required",
        "OTP_REQUIRED",
        403,
        "Identity verification is required before we can continue.",
      );
    }
  }
}

export const otpService = new OtpService();
