import type { LoadDetail, LoadQueryParams, LoadSummary } from "./types.js";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TmsCache {
  private queryCache = new Map<string, CacheEntry<LoadSummary[]>>();
  private loadCache = new Map<string, CacheEntry<LoadDetail>>();

  constructor(private readonly ttlMs: number) {}

  getQuery(key: string): LoadSummary[] | undefined {
    return this.get(this.queryCache, key);
  }

  setQuery(key: string, value: LoadSummary[]): void {
    this.set(this.queryCache, key, value);
  }

  getLoad(loadId: string): LoadDetail | undefined {
    return this.get(this.loadCache, loadId);
  }

  setLoad(loadId: string, value: LoadDetail): void {
    this.set(this.loadCache, loadId, value);
  }

  invalidateLoad(loadId: string): void {
    this.loadCache.delete(loadId);
    this.queryCache.clear();
  }

  clear(): void {
    this.queryCache.clear();
    this.loadCache.clear();
  }

  private get<T>(store: Map<string, CacheEntry<T>>, key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return structuredClone(entry.value);
  }

  private set<T>(store: Map<string, CacheEntry<T>>, key: string, value: T): void {
    store.set(key, {
      value: structuredClone(value),
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}

export function buildQueryCacheKey(query: LoadQueryParams): string {
  const equipment = query.equipment_type
    ? query.equipment_type.toUpperCase().replace(/\s+/g, "_")
    : undefined;

  return [
    query.origin_city?.toUpperCase() ?? "",
    query.origin_state?.toUpperCase() ?? "",
    query.destination_city?.toUpperCase() ?? "",
    query.destination_state?.toUpperCase() ?? "",
    equipment ?? "",
    String(query.max_results ?? 5),
  ].join("|");
}
