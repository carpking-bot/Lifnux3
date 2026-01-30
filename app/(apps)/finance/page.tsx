"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "../../(shared)/components/AppShell";
import { Modal } from "../../(shared)/components/Modal";
import type { IndexItem, StockItem } from "../../(shared)/types/finance";
import { loadFinanceState, saveIndices, saveStocks } from "../../(shared)/lib/finance";
import { useQuotes } from "../../../src/lib/quotes/useQuotes";
import { Pencil } from "lucide-react";

export default function FinancePage() {
  const router = useRouter();
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [activeMarket, setActiveMarket] = useState<"KR" | "US">("KR");
  const [detailStock, setDetailStock] = useState<StockItem | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const data = loadFinanceState();
    setIndices(data.indices);
    setStocks(data.stocks);
    setReady(true);
  }, []);

  useEffect(() => {
    if (indices.length) saveIndices(indices);
  }, [indices]);

  useEffect(() => {
    if (!ready) return;
    saveStocks(stocks);
  }, [stocks, ready]);

  const visibleIndices = useMemo(() => indices.slice(0, 10), [indices]);
  const indexSymbols = useMemo(() => visibleIndices.map((item) => item.symbol), [visibleIndices]);
  const { bySymbol: indexQuotes } = useQuotes(indexSymbols);

  const heldWatchlist = useMemo(
    () => stocks.filter((item) => item.watchlisted !== false && item.isHeld),
    [stocks]
  );
  const allWatchlist = useMemo(
    () => stocks.filter((item) => item.watchlisted !== false),
    [stocks]
  );
  const getQuoteSymbol = (item: StockItem) => {
    if (item.market === "KR" && !item.symbol.includes(".")) return `${item.symbol}.KS`;
    return item.symbol;
  };
  const watchSymbols = useMemo(() => allWatchlist.map((item) => getQuoteSymbol(item)), [allWatchlist]);
  const { bySymbol: watchQuotes } = useQuotes(watchSymbols);
  const watchlistWithQuotes = useMemo(
    () =>
      allWatchlist.map((item) => ({
        ...item,
        quote: watchQuotes.get(getQuoteSymbol(item).toUpperCase())
      })),
    [allWatchlist, watchQuotes]
  );
  const heldWithQuotes = useMemo(() => watchlistWithQuotes.filter((item) => item.isHeld), [watchlistWithQuotes]);

  const topHeldMovers = useMemo(() => {
    return [...heldWithQuotes]
      .filter((item) => item.quote?.changePercent !== null && item.quote?.changePercent !== undefined)
      .sort((a, b) => Math.abs(b.quote?.changePercent ?? 0) - Math.abs(a.quote?.changePercent ?? 0))
      .slice(0, 5);
  }, [heldWithQuotes]);
  const topGainers = useMemo(() => {
    return [...watchlistWithQuotes]
      .filter((item) => item.quote?.changePercent !== null && item.quote?.changePercent !== undefined)
      .sort((a, b) => (b.quote?.changePercent ?? -Infinity) - (a.quote?.changePercent ?? -Infinity))
      .slice(0, 5);
  }, [watchlistWithQuotes]);
  const topLosers = useMemo(() => {
    return [...watchlistWithQuotes]
      .filter((item) => item.quote?.changePercent !== null && item.quote?.changePercent !== undefined)
      .sort((a, b) => (a.quote?.changePercent ?? Infinity) - (b.quote?.changePercent ?? Infinity))
      .slice(0, 5);
  }, [watchlistWithQuotes]);

  const marketList = useMemo(
    () =>
      [...watchlistWithQuotes]
        .filter((item) => item.market === activeMarket)
        .sort((a, b) => (a.mktCapRank ?? 9999) - (b.mktCapRank ?? 9999)),
    [watchlistWithQuotes, activeMarket]
  );
  const detailQuote = useMemo(() => {
    if (!detailStock) return undefined;
    return watchQuotes.get(getQuoteSymbol(detailStock).toUpperCase());
  }, [detailStock, watchQuotes]);


  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1200px] pb-20 pt-10">
        <div className="mb-8">
          <h1 className="text-3xl">Finance</h1>
          <div className="text-sm text-[var(--ink-1)]">Snapshot dashboard for indices, watchlist, and portfolio.</div>
        </div>

        <div className="grid gap-6">
          <section className="lifnux-glass rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Indices</div>
                <div className="text-sm text-[var(--ink-1)]">Global benchmarks overview.</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              {visibleIndices.map((item) => {
                const quote = indexQuotes.get(item.symbol.toUpperCase());
                const price = quote?.price ?? null;
                const changePct = quote?.changePercent ?? null;
                const changeAbs = quote?.change ?? null;
                return (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">{item.symbol}</div>
                  <div className="text-sm">{item.name}</div>
                  <div className="mt-2 text-lg">{price !== null ? price.toLocaleString() : "--"}</div>
                  <div className={`text-xs ${changePct !== null && changePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {changePct === null ? "--" : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}
                    {" · "}
                    {changeAbs === null ? "--" : `${changeAbs >= 0 ? "+" : ""}${changeAbs.toFixed(2)}`}
                  </div>
                </div>
              );
              })}
              {visibleIndices.length === 0 ? (
                <div className="col-span-full text-sm text-[var(--ink-1)]">No indices selected.</div>
              ) : null}
            </div>
          </section>

          <section className="lifnux-glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Watchlist Movers</div>
            <div className="mt-4 grid gap-4">
              <MoverRow title="Held Movers" items={topHeldMovers} />
              <MoverRow title="Top Gainers" items={topGainers} />
              <MoverRow title="Top Losers" items={topLosers} />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section
              className="lifnux-glass rounded-2xl p-6"
              onClick={() => router.push("/finance/watchlist")}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Watchlist</div>
                  <div className="text-sm text-[var(--ink-1)]">Manage tracked stocks by market.</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    className={`rounded-full border px-3 py-1 ${activeMarket === "KR" ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveMarket("KR");
                    }}
                  >
                    KR
                  </button>
                  <button
                    className={`rounded-full border px-3 py-1 ${activeMarket === "US" ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveMarket("US");
                    }}
                  >
                    US
                  </button>
                </div>
              </div>
              <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto pr-2 lifnux-scroll">
                {marketList.map((item) => (
                  <button
                    key={item.id}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDetailStock(item);
                    }}
                  >
                    <div>
                      <div className="font-medium">
                        {item.name ?? item.symbol} <span className="text-[var(--ink-1)]">({item.symbol})</span>
                      </div>
                      <div
                        className={`text-xs ${
                          item.quote?.changePercent !== null && item.quote?.changePercent !== undefined && item.quote?.changePercent >= 0
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}
                      >
                        {item.quote?.changePercent === null || item.quote?.changePercent === undefined
                          ? "--"
                          : `${item.quote.changePercent >= 0 ? "+" : ""}${item.quote.changePercent.toFixed(2)}%`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className={`text-xs ${item.watchlisted === false ? "text-[var(--ink-1)]" : "text-[var(--accent-1)]"}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setStocks((prev) =>
                            prev.map((entry) =>
                              entry.id === item.id ? { ...entry, watchlisted: entry.watchlisted === false } : entry
                            )
                          );
                        }}
                        aria-label="Toggle watchlist"
                      >
                        ??                      </button>
                      <button
                        className={`text-xs ${item.isHeld ? "text-[var(--accent-1)]" : "text-[var(--ink-1)]"}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setStocks((prev) =>
                            prev.map((entry) => (entry.id === item.id ? { ...entry, isHeld: !entry.isHeld } : entry))
                          );
                        }}
                        aria-label="Toggle held"
                      >
                        Held
                      </button>
                    </div>
                  </button>
                ))}
                {marketList.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No stocks.</div> : null}
              </div>
            </section>

            <section className="lifnux-glass rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Portfolio</div>
                  <div className="text-sm text-[var(--ink-1)]">Manage holdings across brokers.</div>
                </div>
                <Link className="text-xs text-[var(--ink-1)]" href="/finance/portfolio">
                  Open Portfolio
                </Link>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm">
                <div>Go to Portfolio Management</div>
                <div className="flex items-center gap-2 text-[var(--ink-1)]">
                  <span>Manage</span>
                  <Pencil className="h-4 w-4" />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <Modal
        open={!!detailStock}
        title="Stock Detail"
        onClose={() => setDetailStock(null)}
        actions={
          <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setDetailStock(null)}>
            Close
          </button>
        }
      >
        {detailStock ? (
          <div className="space-y-2 text-sm">
            <div className="text-lg">{detailStock.name ?? detailStock.symbol}</div>
            <div className="text-[var(--ink-1)]">{detailStock.symbol}</div>
            <div className="text-[var(--ink-1)]">
              Last:{" "}
              {detailQuote?.price !== null && detailQuote?.price !== undefined
                ? detailQuote.price.toLocaleString()
                : "--"}
            </div>
            <div
              className={`text-xs ${
                detailQuote?.changePercent !== null && detailQuote?.changePercent !== undefined && detailQuote?.changePercent >= 0
                  ? "text-emerald-300"
                  : "text-rose-300"
              }`}
            >
              {detailQuote?.changePercent === null || detailQuote?.changePercent === undefined
                ? "--"
                : `${detailQuote.changePercent >= 0 ? "+" : ""}${detailQuote.changePercent.toFixed(2)}%`}
            </div>
            <div className="text-xs text-[var(--ink-1)]">{detailStock.notes || "Beta info only."}</div>
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}

type WatchlistMover = StockItem & {
  quote?: {
    price: number | null;
    changePercent: number | null;
  };
};

function MoverRow({ title, items }: { title: string; items: WatchlistMover[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">{item.symbol}</div>
            <div className="font-medium">{item.name ?? item.symbol}</div>
            <div className="mt-1 text-xs">
              {item.quote?.price !== null && item.quote?.price !== undefined ? item.quote.price.toLocaleString() : "--"}
            </div>
            <div
              className={`text-xs ${
                item.quote?.changePercent !== null && item.quote?.changePercent !== undefined && item.quote?.changePercent >= 0
                  ? "text-emerald-300"
                  : "text-rose-300"
              }`}
            >
              {item.quote?.changePercent === null || item.quote?.changePercent === undefined
                ? "--"
                : `${item.quote.changePercent >= 0 ? "+" : ""}${item.quote.changePercent.toFixed(2)}%`}
              {item.isHeld ? <span className="ml-2 rounded-full border border-white/10 px-2 py-[1px] text-[9px]">HELD</span> : null}
            </div>
          </div>
        ))}
        {items.length === 0 ? <div className="col-span-full text-sm text-[var(--ink-1)]">No data.</div> : null}
      </div>
    </div>
  );
}
