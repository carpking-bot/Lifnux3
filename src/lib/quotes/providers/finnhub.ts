import type { Quote } from "../types";

const DEFAULT_CONCURRENCY = 6;
let didLogEnv = false;

function getToken() {
  return process.env.FINNHUB_API_KEY || process.env.FINNHUB_TOKEN || "";
}

function emptyQuote(symbol: string): Quote {
  return {
    symbol,
    price: null,
    change: null,
    changePercent: null,
    currency: null,
    marketTime: null,
    source: "finnhub"
  };
}

export async function getFinnhubQuote(symbol: string): Promise<Quote> {
  const token = getToken();
  if (!didLogEnv) {
    didLogEnv = true;
    console.log("[FINNHUB ENV] tokenExists=", Boolean(token));
  }
  if (!token) {
    console.warn("[FINNHUB TOKEN MISSING]", symbol);
    return emptyQuote(symbol);
  }
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[FINNHUB ERROR]", response.status, response.statusText, symbol, text);
      return emptyQuote(symbol);
    }
    const data = (await response.json()) as { c?: number; d?: number; dp?: number; t?: number };
    if (typeof data.c !== "number" || typeof data.t !== "number") {
      console.warn("[FINNHUB DATA]", symbol, data);
      return emptyQuote(symbol);
    }
    const marketTime = data.t ? new Date(data.t * 1000).toISOString() : null;
    return {
      symbol,
      price: typeof data.c === "number" ? data.c : null,
      change: typeof data.d === "number" ? data.d : null,
      changePercent: typeof data.dp === "number" ? data.dp : null,
      currency: null,
      marketTime,
      source: "finnhub"
    };
  } catch (error) {
    console.error("[FINNHUB FETCH ERROR]", symbol, error);
    return emptyQuote(symbol);
  }
}

async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      const res = await fn(current);
      results.push(res);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function getFinnhubQuotes(symbols: string[], concurrency = DEFAULT_CONCURRENCY): Promise<Quote[]> {
  const limit = Math.max(1, Math.min(8, concurrency));
  return runWithLimit(symbols, limit, (symbol) => getFinnhubQuote(symbol));
}
