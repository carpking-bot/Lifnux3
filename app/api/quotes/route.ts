import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_SERVICE_URL = "http://127.0.0.1:8000";

type Quote = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency?: string | null;
  marketTime?: string | null;
  source?: string | null;
  name?: string | null;
  warning?: string | null;
};

type ClassifiedSymbol = {
  original: string;
  normalized: string;
  kind: "KR_STOCK" | "KR_ETF_ETN" | "US";
};

const isKrStock = (code: string) => /^\d{6}$/.test(code);
const isKrEtfEtn = (code: string) => /^\d{4}[0-9A-Z]{2}$/.test(code) && /[A-Z]/.test(code);

const classifySymbol = (raw: string): ClassifiedSymbol => {
  const original = raw.trim().toUpperCase();
  const base = original.replace(/\.(KS|KQ)$/i, "");
  if (isKrStock(base)) {
    return { original, normalized: original, kind: "KR_STOCK" };
  }
  if (isKrEtfEtn(base)) {
    // KR ETF/ETN short code must be sent as raw base (no .KS/.KQ suffix).
    return { original, normalized: base, kind: "KR_ETF_ETN" };
  }
  return { original, normalized: original, kind: "US" };
};

const chooseNonNullPrice = (a?: Quote, b?: Quote): Quote | undefined => {
  if (!a) return b;
  if (!b) return a;
  const aHasPrice = typeof a.price === "number";
  const bHasPrice = typeof b.price === "number";
  if (aHasPrice && !bHasPrice) return a;
  if (!aHasPrice && bHasPrice) return b;
  return a;
};

const emptyQuote = (symbol: string): Quote => ({
  symbol,
  price: null,
  change: null,
  changePercent: null,
  currency: null,
  marketTime: null,
  source: "manual",
  name: null,
  warning: "not-found"
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("symbols") ?? "";
  const inputSymbols = raw
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (inputSymbols.length === 0) {
    return NextResponse.json({ quotes: [] });
  }

  const classified = inputSymbols.map(classifySymbol);
  const upstreamSymbols = [...new Set(classified.map((item) => item.normalized))];

  const baseUrl = process.env.QUOTE_SERVICE_URL || DEFAULT_SERVICE_URL;
  const upstreamUrl = `${baseUrl}/quotes?symbols=${encodeURIComponent(upstreamSymbols.join(","))}`;

  console.log("[NEXT QUOTES IN]", {
    inputSymbols,
    classified: classified.map((item) => ({ symbol: item.original, normalized: item.normalized, kind: item.kind }))
  });
  console.log("[NEXT QUOTES UPSTREAM]", { upstreamUrl, upstreamSymbols });

  try {
    const response = await fetch(upstreamUrl, { cache: "no-store" });
    if (!response.ok) {
      console.error("[NEXT QUOTES UPSTREAM ERROR]", response.status, response.statusText);
      return NextResponse.json({ quotes: [], error: "quote-service-error" });
    }

    const data = (await response.json()) as { quotes?: Quote[] };
    const upstreamQuotes = data.quotes ?? [];
    const bySymbol = new Map<string, Quote>();

    for (const quote of upstreamQuotes) {
      const key = quote.symbol.toUpperCase();
      bySymbol.set(key, chooseNonNullPrice(bySymbol.get(key), quote) as Quote);
    }

    const firstUpstream = upstreamQuotes[0] ?? null;
    console.log("[NEXT QUOTES UPSTREAM SAMPLE]", firstUpstream);

    const finalQuotes = classified.map((item) => {
      const direct = bySymbol.get(item.original);
      const normalized = bySymbol.get(item.normalized);
      const picked = chooseNonNullPrice(direct, normalized);
      if (!picked) return emptyQuote(item.original);
      // Keep requested symbol in response so frontend key-lookup is stable.
      return { ...picked, symbol: item.original };
    });

    console.log("[NEXT QUOTES OUT SAMPLE]", finalQuotes[0] ?? null);
    return NextResponse.json({ quotes: finalQuotes });
  } catch (error) {
    console.error("[NEXT QUOTES UNAVAILABLE]", error);
    return NextResponse.json({ quotes: [], error: "quote-service-unavailable" });
  }
}

