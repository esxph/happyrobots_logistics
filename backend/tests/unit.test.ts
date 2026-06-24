import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { getMockCarrierVerification } from "../src/fmcsa/mock-carriers.js";
import { optionalPositiveApiNumber } from "../src/lib/schemas.js";
import {
  buildLoadQueryRequest,
  parseErrorLine,
  parseKeyValueLine,
  toLoadDetail,
  toLoadSummary,
} from "../src/tms/parser.js";
import { negotiate } from "../src/negotiation/engine.js";
import { AppError } from "../src/lib/errors.js";
import { OtpService, normalizeOtpCode, otpService } from "../src/otp/service.js";
import { createSession, updateSession } from "../src/sessions/store.js";
import { registerRoutes } from "../src/routes/api.js";

describe("TMS parser", () => {
  it("parses LOAD_QUERY response line", () => {
    const line =
      "LOAD_ID:LD0000045821|ORIG_CITY:Atlanta                       |ORIG_STATE:GA|ORIG_ZIP:30303|DEST_CITY:Dallas                        |DEST_STATE:TX|DEST_ZIP:75201|PICKUP_DT:20260512080000|EQTYPE:DRY_VAN   |RATE:0002150|MILES:000785|STATUS:OPEN";
    const fields = parseKeyValueLine(line);
    const summary = toLoadSummary(fields);
    expect(summary.load_id).toBe("LD0000045821");
    expect(summary.origin).toBe("Atlanta, GA");
    expect(summary.loadboard_rate).toBe(2150);
  });

  it("parses LOAD_GET with MAX_BUY", () => {
    const line =
      "LOAD_ID:LD0000045821|ORIG_CITY:Atlanta|ORIG_STATE:GA|ORIG_ZIP:30303|DEST_CITY:Dallas|DEST_STATE:TX|DEST_ZIP:75201|PICKUP_DT:20260512080000|DELIVERY_DT:20260513170000|EQTYPE:DRY_VAN|RATE:0002150|WEIGHT:0042000|COMMODITY:PALLETIZED CONSUMER GOODS|PIECES:000026|MILES:000785|DIMS:48X40 STD|NOTES:|STATUS:OPEN|MAX_BUY:0001950";
    const detail = toLoadDetail(parseKeyValueLine(line));
    expect(detail.max_rate).toBe(1950);
    expect(detail.weight).toBe(42000);
  });

  it("parses error line", () => {
    expect(parseErrorLine("ERR|CODE:UNKNOWN_LOAD|MSG:load not found")).toEqual({
      code: "UNKNOWN_LOAD",
      message: "load not found",
    });
  });

  it("builds LOAD_QUERY request", () => {
    const req = buildLoadQueryRequest("token-123", {
      origin_state: "GA",
      destination_state: "TX",
      equipment_type: "DRY VAN",
      max_results: 5,
    });
    expect(req).toContain("CMD:LOAD_QUERY");
    expect(req).toContain("AUTH:token-123");
    expect(req).toContain("ORIG_STATE:GA");
    expect(req).toContain("EQTYPE:DRY_VAN");
    expect(req.endsWith("\r\n")).toBe(true);
  });
});

describe("demo mock carrier", () => {
  it("returns authorized carrier with demo phone for DEMO_MC_NUMBER", () => {
    const result = getMockCarrierVerification("999999");
    expect(result).not.toBeNull();
    expect(result?.authorized).toBe(true);
    expect(result?.registered_phone).toBe("+525510506746");
    expect(result?.legal_name).toBe("HappyRobot Demo Carrier");
  });

  it("returns null for real MC numbers", () => {
    expect(getMockCarrierVerification("872144")).toBeNull();
  });
});

describe("api numeric coercion", () => {
  it("coerces string counter rates", () => {
    expect(optionalPositiveApiNumber.parse("2400")).toBe(2400);
  });

  it("coerces currency-formatted strings", () => {
    expect(optionalPositiveApiNumber.parse("$2,400")).toBe(2400);
  });

  it("accepts real numbers", () => {
    expect(optionalPositiveApiNumber.parse(2400)).toBe(2400);
  });
});

describe("OTP normalization", () => {
  it("strips non-digits from spoken codes", () => {
    expect(normalizeOtpCode("1 2 3 4 5 6")).toBe("123456");
    expect(normalizeOtpCode("123-456")).toBe("123456");
    expect(normalizeOtpCode("one two three four five six")).toBe("123456");
    expect(normalizeOtpCode("the code is one two 345")).toBe("12345");
  });

  it("accepts spaced digits on verify", () => {
    const svc = new OtpService();
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";
    const sent = svc.send(sessionId, "999999", "+15551234567");
    const spaced = sent.code.split("").join(" ");
    expect(svc.verify(sessionId, spaced).verified).toBe(true);
  });

  it("combines split OTP tool calls without burning attempts", () => {
    const svc = new OtpService();
    const sessionId = "550e8400-e29b-41d4-a716-446655440001";
    const sent = svc.send(sessionId, "999999", "+15551234567");

    expect(() => svc.verify(sessionId, sent.code.slice(0, 3))).toThrow(AppError);
    expect(svc.verify(sessionId, sent.code.slice(3)).verified).toBe(true);
  });

  it("combines spoken split OTP tool calls", () => {
    const svc = new OtpService();
    const sessionId = "550e8400-e29b-41d4-a716-446655440002";
    const sent = svc.send(sessionId, "999999", "+15551234567");
    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    const spoken = sent.code
      .split("")
      .map((digit) => words[Number(digit)]);

    expect(() => svc.verify(sessionId, spoken.slice(0, 3).join(" "))).toThrow(AppError);
    expect(svc.verify(sessionId, spoken.slice(3).join(" ")).verified).toBe(true);
  });
});

describe("negotiation engine", () => {
  it("accepts at or below max rate", () => {
    const result = negotiate({
      action: "accept",
      current_offer_rate: 1900,
      loadboard_rate: 2150,
      max_rate: 1950,
      round: 0,
    });
    expect(result.status).toBe("accepted");
    expect(result.agreed_rate).toBe(1900);
  });

  it("counters when carrier asks above ceiling", () => {
    const result = negotiate({
      action: "counter",
      carrier_counter_rate: 2500,
      current_offer_rate: 2150,
      loadboard_rate: 2150,
      max_rate: 1950,
      round: 1,
    });
    expect(result.status).toBe("counter_offer");
    expect(result.next_offer_rate).toBeLessThanOrEqual(1950);
  });

  it("fails after max rounds", () => {
    const result = negotiate({
      action: "counter",
      carrier_counter_rate: 2500,
      current_offer_rate: 1950,
      loadboard_rate: 2150,
      max_rate: 1950,
      round: 3,
    });
    expect(result.status).toBe("failed_negotiation");
  });

  it("accepts a carrier counter $5 below the current offer", () => {
    const result = negotiate({
      action: "counter",
      carrier_counter_rate: 2434,
      current_offer_rate: 2439,
      loadboard_rate: 2439,
      max_rate: 2600,
      round: 0,
    });
    expect(result.status).toBe("accepted");
    expect(result.agreed_rate).toBe(2434);
  });
});

describe("negotiation API routes", () => {
  it("accept_first_rate accepts default rate with session_id only", async () => {
    const app = Fastify();
    await registerRoutes(app);

    const session = createSession();
    const sent = otpService.send(session.id, "999999", "+15551234567");
    otpService.verify(session.id, sent.code);
    updateSession(session.id, {
      carrier_mc: "999999",
      otp_status: "verified",
      current_offer_rate: 2439,
      load_offered: {
        load_id: "LDTEST000001",
        origin: "Miami, FL",
        destination: "Oklahoma City, OK",
        origin_zip: "33101",
        destination_zip: "73102",
        pickup_datetime: "2026-06-24T06:00:00.000Z",
        delivery_datetime: "2026-06-25T15:00:00.000Z",
        equipment_type: "REEFER",
        loadboard_rate: 2439,
        max_rate: 2600,
        weight: 8769,
        commodity_type: "steel coils",
        num_of_pieces: 12,
        miles: 1500,
        dimensions: "48x8x9 ft",
        notes: "",
        status: "OPEN",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/accept_first_rate",
      payload: { session_id: session.id },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("accepted");
    expect(body.agreed_rate).toBe(2439);

    await app.close();
  });
});
