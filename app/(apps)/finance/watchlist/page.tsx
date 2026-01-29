"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../(shared)/components/AppShell";
import type { IndexItem, WatchlistStock } from "../../../(shared)/types/finance";
import { createIndexItem, createWatchlistStock, loadFinanceState, saveIndices, saveWatchlist } from "../../../(shared)/lib/finance";
import { useQuotes } from "../../../../src/lib/quotes/useQuotes";

export default function FinanceWatchlistPage() {
  const router = useRouter();
  const [section, setSection] = useState<"indices" | "watchlist">("watchlist");
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>([]);
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [activeMarket, setActiveMarket] = useState<"KR" | "US">("KR");
  const [newSymbol, setNewSymbol] = useState("");
  const [newMarket, setNewMarket] = useState<"KR" | "US">("KR");
  const [newIndexName, setNewIndexName] = useState("");
  const [newIndexSymbol, setNewIndexSymbol] = useState("");
  const [newIndexRegion, setNewIndexRegion] = useState("US");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const data = loadFinanceState();
    setWatchlist(data.watchlist);
    setIndices(data.indices);
  }, []);

  useEffect(() => {
    if (watchlist.length) saveWatchlist(watchlist);
  }, [watchlist]);
  useEffect(() => {
    if (indices.length) saveIndices(indices);
  }, [indices]);

  const marketList = useMemo(
    () =>
      watchlist
        .filter((item) => item.watchlisted !== false && item.market === activeMarket)
        .sort((a, b) => a.mktCapRank - b.mktCapRank),
    [watchlist, activeMarket]
  );
  const watchSymbols = useMemo(() => marketList.map((item) => item.ticker), [marketList]);
  const { bySymbol: watchQuotes } = useQuotes(watchSymbols);

  const visibleIndices = useMemo(() => indices, [indices]);

  const formatCurrency = (value: number, market?: "KR" | "US") => {
    const symbol = market === "KR" ? "₩" : "$";
    const decimals = market === "KR" ? 0 : 2;
    return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2400);
  };

  const validateSymbol = async (symbol: string) => {
    const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`);
    if (!response.ok) return false;
    const data = (await response.json()) as { quotes?: { symbol: string; price: number | null }[] };
    const quote = data.quotes?.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase());
    return !!quote && quote.price !== null;
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1000px] pb-20 pt-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)]"
            onClick={() => router.back()}
          >
            Back
          </button>
          <div>
            <h1 className="text-3xl">Watchlist</h1>
            <div className="text-sm text-[var(--ink-1)]">Manage indices and tracked stocks.</div>
          </div>
        </div>

        <div className="lifnux-glass rounded-2xl p-6">
          {notice ? (
            <div className="mb-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-[var(--ink-1)]">
              {notice}
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Manage</div>
            <div className="flex items-center gap-2 text-xs">
              <button
                className={`rounded-full border px-3 py-1 ${section === "indices" ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"}`}
                onClick={() => setSection("indices")}
              >
                Indices
              </button>
              <button
                className={`rounded-full border px-3 py-1 ${section === "watchlist" ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"}`}
                onClick={() => setSection("watchlist")}
              >
                Stocks
              </button>
            </div>
          </div>

          {section === "indices" ? (
            <>
              <div className="mt-4 grid gap-2 md:grid-cols-[1.2fr_1fr_0.8fr_auto]">
                <input
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  placeholder="Index name"
                  value={newIndexName}
                  onChange={(event) => setNewIndexName(event.target.value)}
                />
                <input
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  placeholder="Symbol"
                  value={newIndexSymbol}
                  onChange={(event) => setNewIndexSymbol(event.target.value)}
                />
                <input
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  placeholder="Region (US/KR/JP)"
                  value={newIndexRegion}
                  onChange={(event) => setNewIndexRegion(event.target.value)}
                />
                <button
                  className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
                  onClick={async () => {
                    if (!newIndexName.trim() || !newIndexSymbol.trim()) return;
                    const symbol = newIndexSymbol.trim().toUpperCase();
                    const ok = await validateSymbol(symbol);
                    if (!ok) {
                      showNotice(`Symbol not found: ${symbol}`);
                      return;
                    }
                    const next = createIndexItem(newIndexName.trim(), symbol, newIndexRegion.trim() || "US");
                    setIndices((prev) => [...prev, next]);
                    setNewIndexName("");
                    setNewIndexSymbol("");
                    setNewIndexRegion("US");
                    showNotice(`Index added: ${symbol}`);
                  }}
                >
                  + Add Index
                </button>
              </div>

              <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-2 lifnux-scroll">
                {visibleIndices.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const draggedId = event.dataTransfer.getData("text/plain");
                      const fromIndex = indices.findIndex((entry) => entry.id === draggedId);
                      if (fromIndex < 0 || fromIndex === index) return;
                      const next = [...indices];
                      const [moved] = next.splice(fromIndex, 1);
                      next.splice(index, 0, moved);
                      setIndices(next);
                    }}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {item.name} <span className="text-[var(--ink-1)]">({item.symbol})</span>
                      </div>
                      <div className={`text-xs ${item.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {item.changePct >= 0 ? "+" : ""}
                        {item.changePct.toFixed(2)}% · {item.last.toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                        onClick={() => setIndices((prev) => prev.filter((entry) => entry.id !== item.id))}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {visibleIndices.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No indices.</div> : null}
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  placeholder="Symbol"
                  value={newSymbol}
                  onChange={(event) => setNewSymbol(event.target.value)}
                />
                <select
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  value={newMarket}
                  onChange={(event) => setNewMarket(event.target.value as "KR" | "US")}
                >
                  <option value="KR">KR</option>
                  <option value="US">US</option>
                </select>
                <button
                  className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
                  onClick={async () => {
                    if (!newSymbol.trim()) return;
                    const symbol = newSymbol.trim().toUpperCase();
                    const ok = await validateSymbol(symbol);
                    if (!ok) {
                      showNotice(`Symbol not found: ${symbol}`);
                      return;
                    }
                    const next = createWatchlistStock(symbol, newMarket);
                    setWatchlist((prev) => {
                      if (prev.some((item) => item.id === next.id)) return prev;
                      return [...prev, next];
                    });
                    setNewSymbol("");
                    showNotice(`Stock added: ${symbol}`);
                  }}
                >
                  + Add Symbol
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Market</div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    className={`rounded-full border px-3 py-1 ${activeMarket === "KR" ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"}`}
                    onClick={() => setActiveMarket("KR")}
                  >
                    KR
                  </button>
                  <button
                    className={`rounded-full border px-3 py-1 ${activeMarket === "US" ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"}`}
                    onClick={() => setActiveMarket("US")}
                  >
                    US
                  </button>
                </div>
              </div>

              <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-2 lifnux-scroll">
                {marketList.map((item, index) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      const draggedId = event.dataTransfer.getData("text/plain");
                      const fromIndex = watchlist.findIndex((entry) => entry.id === draggedId);
                      if (fromIndex < 0 || fromIndex === index) return;
                      const next = [...watchlist];
                      const [moved] = next.splice(fromIndex, 1);
                      next.splice(index, 0, moved);
                      setWatchlist(next);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {item.name} <span className="text-[var(--ink-1)]">({item.ticker})</span>
                      </div>
                      <div className="text-xs text-[var(--ink-1)]">
                        {watchQuotes.get(item.ticker.toUpperCase())?.price !== null && watchQuotes.get(item.ticker.toUpperCase())?.price !== undefined
                          ? formatCurrency(watchQuotes.get(item.ticker.toUpperCase())?.price ?? 0, item.market)
                          : "--"}
                      </div>
                      <div className={`text-xs ${watchQuotes.get(item.ticker.toUpperCase())?.changePercent && (watchQuotes.get(item.ticker.toUpperCase())?.changePercent ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {watchQuotes.get(item.ticker.toUpperCase())?.changePercent === null || watchQuotes.get(item.ticker.toUpperCase())?.changePercent === undefined
                          ? "--"
                          : `${(watchQuotes.get(item.ticker.toUpperCase())?.changePercent ?? 0) >= 0 ? "+" : ""}${(watchQuotes.get(item.ticker.toUpperCase())?.changePercent ?? 0).toFixed(2)}%`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className={`text-xs ${item.watchlisted === false ? "text-[var(--ink-1)]" : "text-[var(--accent-1)]"}`}
                        onClick={() =>
                          setWatchlist((prev) =>
                            prev.map((entry) =>
                              entry.id === item.id ? { ...entry, watchlisted: entry.watchlisted === false } : entry
                            )
                          )
                        }
                        aria-label="Toggle watchlist"
                      >
                        ★
                      </button>
                      <button
                        className={`text-xs ${item.isHeld ? "text-[var(--accent-1)]" : "text-[var(--ink-1)]"}`}
                        onClick={() =>
                          setWatchlist((prev) =>
                            prev.map((entry) => (entry.id === item.id ? { ...entry, isHeld: !entry.isHeld } : entry))
                          )
                        }
                        aria-label="Toggle held"
                      >
                        Held
                      </button>
                      <button
                        className="text-xs text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                        onClick={() => setWatchlist((prev) => prev.filter((entry) => entry.id !== item.id))}
                        aria-label="Delete stock"
                      >
                        X
                      </button>
                    </div>
                  </div>
                ))}
                {marketList.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No stocks.</div> : null}
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
