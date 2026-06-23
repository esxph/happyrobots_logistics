import { describe, expect, it } from "vitest";
import { buildQueryCacheKey, TmsCache } from "../src/tms/cache.js";

describe("TMS cache", () => {
  it("builds stable query keys", () => {
    const a = buildQueryCacheKey({
      origin_city: "miami",
      equipment_type: "dry van",
      max_results: 5,
    });
    const b = buildQueryCacheKey({
      origin_city: "MIAMI",
      equipment_type: "DRY VAN",
      max_results: 5,
    });
    expect(a).toBe(b);
  });

  it("returns cached value before TTL expires", () => {
    const cache = new TmsCache(60_000);
    const loads = [
      {
        load_id: "LD001",
        origin: "Miami, FL",
        destination: "Dallas, TX",
        pickup_datetime: "2026-06-24T06:00:00",
        equipment_type: "REEFER",
        loadboard_rate: 2400,
        miles: 1200,
        status: "OPEN",
      },
    ];
    cache.setQuery("miami|reefer", loads);
    expect(cache.getQuery("miami|reefer")).toEqual(loads);
  });

  it("expires entries after TTL", async () => {
    const cache = new TmsCache(10);
    cache.setLoad("LD001", {
      load_id: "LD001",
      origin: "A",
      destination: "B",
      origin_zip: "",
      destination_zip: "",
      pickup_datetime: "",
      delivery_datetime: "",
      equipment_type: "DRY VAN",
      loadboard_rate: 1000,
      max_rate: 900,
      weight: 0,
      commodity_type: "",
      num_of_pieces: 0,
      miles: 0,
      dimensions: "",
      notes: "",
      status: "OPEN",
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.getLoad("LD001")).toBeUndefined();
  });

  it("invalidates load and query cache on booking", () => {
    const cache = new TmsCache(60_000);
    cache.setQuery("q1", []);
    cache.setLoad("LD001", {
      load_id: "LD001",
      origin: "A",
      destination: "B",
      origin_zip: "",
      destination_zip: "",
      pickup_datetime: "",
      delivery_datetime: "",
      equipment_type: "DRY VAN",
      loadboard_rate: 1000,
      max_rate: 900,
      weight: 0,
      commodity_type: "",
      num_of_pieces: 0,
      miles: 0,
      dimensions: "",
      notes: "",
      status: "OPEN",
    });
    cache.invalidateLoad("LD001");
    expect(cache.getLoad("LD001")).toBeUndefined();
    expect(cache.getQuery("q1")).toBeUndefined();
  });
});
