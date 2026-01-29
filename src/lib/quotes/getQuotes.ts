import type { Quote } from "./types";
import { getFinnhubQuotes } from "./providers/finnhub";

const CACHE_TTL_SECONDS = Number(process.env.QUOTES_CACHE_TTL_SECONDS ?? "30");
const TTL_SECONDS = Math.min(60, Math.max(15, CACHE_TTL_SECONDS || 30));
const TTL_MS = TTL_SECONDS * 1000;

type CacheEntry = {
  expiresAt: number;
  quotes: Quote[];
};

const cache = new Map<string, CacheEntry>();

function normalizeSymbols(symbols: string[]) {
  return Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim())
        .filter(Boolean)
        .map((symbol) => symbol.toUpperCase())
    )
  );
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const normalized = normalizeSymbols(symbols);
  if (normalized.length === 0) return [];
  const key = normalized.slice().sort().join(",");
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.quotes;
  }

  const quotes = await getFinnhubQuotes(normalized);
  cache.set(key, { expiresAt: Date.now() + TTL_MS, quotes });
  return quotes;
}
