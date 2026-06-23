import net from "node:net";
import { config } from "../config.js";
import { TmsError } from "../lib/errors.js";
import { buildQueryCacheKey, TmsCache } from "./cache.js";
import {
  buildDebugEchoRequest,
  buildLoadBookRequest,
  buildLoadGetRequest,
  buildLoadQueryRequest,
  parseErrorLine,
  parseKeyValueLine,
  toLoadDetail,
  toLoadSummary,
} from "./parser.js";
import type { LoadBookParams, LoadDetail, LoadQueryParams, LoadSummary, TmsReadOptions } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof TmsError) return err.retryable;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("socket") ||
      msg.includes("malformed") ||
      msg.includes("empty")
    );
  }
  return false;
}

async function sendRequest(requestLine: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      fn();
    };

    const connectTimer = setTimeout(() => {
      finish(() => reject(new TmsError("TMS connection timeout", undefined, true)));
    }, config.TMS_CONNECT_TIMEOUT_MS);

    const readTimer = setTimeout(() => {
      finish(() => reject(new TmsError("TMS read timeout", undefined, true)));
    }, config.TMS_READ_TIMEOUT_MS);

    socket.on("data", (buf) => chunks.push(buf));
    socket.on("error", (err) => {
      clearTimeout(connectTimer);
      clearTimeout(readTimer);
      finish(() => reject(new TmsError(err.message, undefined, true)));
    });
    socket.on("close", () => {
      clearTimeout(connectTimer);
      clearTimeout(readTimer);
      const raw = Buffer.concat(chunks).toString("ascii");
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      finish(() => resolve(lines));
    });

    socket.connect(config.TMS_PORT, config.TMS_HOST, () => {
      clearTimeout(connectTimer);
      socket.write(requestLine, "ascii");
    });
  });
}

function parseResponseLines(lines: string[]): { records: Record<string, string>[]; error?: { code: string; message: string } } {
  if (lines.length === 0) {
    throw new TmsError("Empty TMS response", undefined, true);
  }

  const first = lines[0];
  if (first.startsWith("ERR")) {
    return { records: [], error: parseErrorLine(first) };
  }

  const records: Record<string, string>[] = [];
  for (const line of lines) {
    if (line === "END") break;
    if (line.startsWith("ERR")) {
      return { records: [], error: parseErrorLine(line) };
    }
    try {
      records.push(parseKeyValueLine(line));
    } catch {
      throw new TmsError("Malformed TMS response line", undefined, true);
    }
  }

  if (!lines.includes("END") && records.length > 0) {
    throw new TmsError("Unterminated TMS response", undefined, true);
  }

  return { records };
}

async function executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < config.TMS_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === config.TMS_MAX_RETRIES - 1) break;
      await sleep(250 * 2 ** attempt);
    }
  }
  throw lastError;
}

const tmsCache = new TmsCache(config.TMS_CACHE_TTL_SECONDS * 1000);

export class TmsClient {
  async debugEcho(payload = "ping"): Promise<string> {
    const lines = await executeWithRetry(() =>
      sendRequest(buildDebugEchoRequest(config.TMS_AUTH_TOKEN, payload)),
    );
    return lines.join("\n");
  }

  async searchLoads(query: LoadQueryParams, options: TmsReadOptions = {}): Promise<LoadSummary[]> {
    const cacheKey = buildQueryCacheKey(query);

    if (config.TMS_CACHE_ENABLED && !options.fresh) {
      const cached = tmsCache.getQuery(cacheKey);
      if (cached) {
        console.info(`[TMS cache] LOAD_QUERY hit key=${cacheKey}`);
        return cached;
      }
    }

    const lines = await executeWithRetry(() =>
      sendRequest(buildLoadQueryRequest(config.TMS_AUTH_TOKEN, query)),
    );
    const { records, error } = parseResponseLines(lines);
    if (error) {
      throw new TmsError(error.message, error.code, false);
    }

    const loads = records.map(toLoadSummary);
    if (config.TMS_CACHE_ENABLED) {
      tmsCache.setQuery(cacheKey, loads);
      console.info(`[TMS cache] LOAD_QUERY miss key=${cacheKey} (${loads.length} loads)`);
    }
    return loads;
  }

  async getLoad(loadId: string, options: TmsReadOptions = {}): Promise<LoadDetail> {
    if (config.TMS_CACHE_ENABLED && !options.fresh) {
      const cached = tmsCache.getLoad(loadId);
      if (cached) {
        console.info(`[TMS cache] LOAD_GET hit load_id=${loadId}`);
        return cached;
      }
    }

    const lines = await executeWithRetry(() =>
      sendRequest(buildLoadGetRequest(config.TMS_AUTH_TOKEN, loadId)),
    );
    const { records, error } = parseResponseLines(lines);
    if (error) {
      throw new TmsError(error.message, error.code, false);
    }
    if (records.length === 0) {
      throw new TmsError("No load record returned", "UNKNOWN_LOAD", false);
    }

    const detail = toLoadDetail(records[0]);
    if (config.TMS_CACHE_ENABLED) {
      tmsCache.setLoad(loadId, detail);
      console.info(`[TMS cache] LOAD_GET miss load_id=${loadId}`);
    }
    return detail;
  }

  async bookLoad(params: LoadBookParams): Promise<{ confirmation: string }> {
    const lines = await executeWithRetry(() =>
      sendRequest(
        buildLoadBookRequest(
          config.TMS_AUTH_TOKEN,
          params.load_id,
          params.mc_number,
          params.agreed_rate,
        ),
      ),
    );

    if (lines[0]?.startsWith("ERR")) {
      const err = parseErrorLine(lines[0]);
      throw new TmsError(err.message, err.code, false);
    }

    const fields = parseKeyValueLine(lines[0] ?? "");
    if (config.TMS_CACHE_ENABLED) {
      tmsCache.invalidateLoad(params.load_id);
      console.info(`[TMS cache] invalidated load_id=${params.load_id} after booking`);
    }

    return {
      confirmation: fields.CONFIRMATION ?? fields.BOOKING_REF ?? fields.BOOKING_ID ?? "BOOKED",
    };
  }
}

export const tmsClient = new TmsClient();
