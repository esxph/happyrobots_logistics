import { describe, expect, it } from "vitest";
import {
  buildLoadQueryRequest,
  parseErrorLine,
  parseKeyValueLine,
  toLoadDetail,
  toLoadSummary,
} from "../src/tms/parser.js";
import { negotiate } from "../src/negotiation/engine.js";

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
});
