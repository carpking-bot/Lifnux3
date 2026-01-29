"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "../../(shared)/components/AppShell";
import { Modal } from "../../(shared)/components/Modal";
import type { IndexItem, WatchlistStock } from "../../(shared)/types/finance";
import { loadFinanceState, saveIndices, saveWatchlist } from "../../(shared)/lib/finance";
import { useQuotes } from "../../../src/lib/quotes/useQuotes";
import { Pencil } from "lucide-react";

export default function FinancePage() {
  const router = useRouter();
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistStock[]>([]);
  const [activeMarket, setActiveMarket] = useState<"KR" | "US">("KR");
  const [detailStock, setDetailStock] = useState<WatchlistStock | null>(null);

  useEffect(() => {
    const data = loadFinanceState();
    setIndices(data.indices);
    setWatchlist(data.watchlist);
  }, []);

  useEffect(() => {
    if (indices.length) saveIndices(indices);
  }, [indices]);

  useEffect(() => {
    if (watchlist.length) saveWatchlist(watchlist);
  }, [watchlist]);

  const visibleIndices = useMemo(() => indices.slice(0, 10), [indices]);
  const indexSymbols = useMemo(() => visibleIndices.map((item) => item.symbol), [visibleIndices]);
  const { bySymbol: indexQuotes } = useQuotes(indexSymbols);

  const heldWatchlist = useMemo(
    () => watchlist.filter((item) => item.watchlisted !== false && item.isHeld),
    [watchlist]
  );
  const allWatchlist = useMemo(
    () => watchlist.filter((item) => item.watchlisted !== false),
    [watchlist]
  );

  const topHeldMovers = useMemo(
    () =>
      [...heldWatchlist]
        .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
        .slice(0, 5),
    [heldWatchlist]
  );
  const topGainers = useMemo(
    () => [...allWatchlist].sort((a, b) => b.changePct - a.changePct).slice(0, 5),
    [allWatchlist]
  );
  const topLosers = useMemo(
    () => [...allWatchlist].sort((a, b) => a.changePct - b.changePct).slice(0, 5),
    [allWatchlist]
  );

  const marketList = useMemo(
    () =>
      [...allWatchlist]
        .filter((item) => item.market === activeMarket)
        .sort((a, b) => a.mktCapRank - b.mktCapRank),
    [allWatchlist, activeMarket]
  );


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
                        {item.name} <span className="text-[var(--ink-1)]">({item.ticker})</span>
                      </div>
                      <div className={`text-xs ${item.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {item.changePct >= 0 ? "+" : ""}
                        {item.changePct.toFixed(2)}%
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className={`text-xs ${item.watchlisted === false ? "text-[var(--ink-1)]" : "text-[var(--accent-1)]"}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setWatchlist((prev) =>
                            prev.map((entry) =>
                              entry.id === item.id ? { ...entry, watchlisted: entry.watchlisted === false } : entry
                            )
                          );
                        }}
                        aria-label="Toggle watchlist"
                      >
                        ★
                      </button>
                      <button
                        className={`text-xs ${item.isHeld ? "text-[var(--accent-1)]" : "text-[var(--ink-1)]"}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setWatchlist((prev) =>
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
            <div className="text-lg">{detailStock.name}</div>
            <div className="text-[var(--ink-1)]">{detailStock.ticker}</div>
            <div className="text-[var(--ink-1)]">Last: {detailStock.last.toLocaleString()}</div>
            <div className={`text-xs ${detailStock.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {detailStock.changePct >= 0 ? "+" : ""}
              {detailStock.changePct.toFixed(2)}%
            </div>
            <div className="text-xs text-[var(--ink-1)]">{detailStock.notes || "Beta info only."}</div>
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}

function MoverRow({ title, items }: { title: string; items: WatchlistStock[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">{item.ticker}</div>
            <div className="font-medium">{item.name}</div>
            <div className="mt-1 text-xs">{item.last.toLocaleString()}</div>
            <div className={`text-xs ${item.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {item.changePct >= 0 ? "+" : ""}
              {item.changePct.toFixed(2)}%
              {item.isHeld ? <span className="ml-2 rounded-full border border-white/10 px-2 py-[1px] text-[9px]">HELD</span> : null}
            </div>
          </div>
        ))}
        {items.length === 0 ? <div className="col-span-full text-sm text-[var(--ink-1)]">No data.</div> : null}
      </div>
    </div>
  );
}
