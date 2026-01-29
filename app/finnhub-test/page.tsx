"use client";

import { useState } from "react";

type Quote = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string | null;
  marketTime: string | null;
  source: string;
};

type ApiResponse = {
  quotes: Quote[];
};

export default function FinnhubTestPage() {
  const [symbols, setSymbols] = useState("AAPL,MSFT,TSLA");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, {
        cache: "no-store"
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
      }
      const data = (await res.json()) as ApiResponse;
      setResponse(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">finnhub test</p>
          <h1 className="text-3xl font-semibold">Finnhub API 연결 확인</h1>
          <p className="text-sm text-slate-400">
            서버 API(`/api/quotes`)를 통해 Finnhub 응답을 확인합니다.
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.55)]">
          <label className="mb-2 block text-sm font-medium text-slate-200">
            Symbols (comma separated)
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={symbols}
              onChange={(event) => setSymbols(event.target.value)}
              className="w-full flex-1 rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none ring-0 focus:border-slate-400"
              placeholder="AAPL,MSFT,TSLA"
              spellCheck={false}
            />
            <button
              onClick={handleFetch}
              disabled={loading}
              className="rounded-xl bg-emerald-400/90 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_10px_24px_rgba(16,185,129,0.35)] transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "요청 중..." : "API 호출"}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            예: AAPL, MSFT, NVDA, TSLA (최대 50개)
          </p>
          {error && (
            <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          )}
        </section>

        {response && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-lg font-semibold">Quotes</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-left text-xs uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Symbol</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Change</th>
                      <th className="px-4 py-3">Change %</th>
                      <th className="px-4 py-3">Market Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.quotes.map((quote) => (
                      <tr key={quote.symbol} className="border-t border-white/5">
                        <td className="px-4 py-3 font-semibold text-slate-100">{quote.symbol}</td>
                        <td className="px-4 py-3 text-slate-200">
                          {quote.price ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-200">
                          {quote.change ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-200">
                          {quote.changePercent ?? "-"}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {quote.marketTime ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
              <h3 className="text-sm font-semibold text-slate-200">Raw response</h3>
              <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-black/60 p-4 text-xs text-slate-300">
                {JSON.stringify(response, null, 2)}
              </pre>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
