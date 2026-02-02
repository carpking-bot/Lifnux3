"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../(shared)/components/AppShell";
import { Modal } from "../../../(shared)/components/Modal";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import type { IndexItem, StockItem, StockList } from "../../../(shared)/types/finance";
import { createIndexItem, createStockItem, detectMarketFromSymbol, loadFinanceState, saveIndices, saveStockLists, saveStocks } from "../../../(shared)/lib/finance";
import { useQuotes } from "../../../../src/lib/quotes/useQuotes";
import { Eye, EyeOff } from "lucide-react";

export default function FinanceWatchlistPage() {
  const router = useRouter();
  const [section, setSection] = useState<"indices" | "watchlist">("watchlist");
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [stockLists, setStockLists] = useState<StockList[]>([]);
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [activeListId, setActiveListId] = useState<string>("all");
  const [newSymbol, setNewSymbol] = useState("");
  const [playlistAddId, setPlaylistAddId] = useState("");
  const [newIndexName, setNewIndexName] = useState("");
  const [newIndexSymbol, setNewIndexSymbol] = useState("");
  const [newIndexRegion, setNewIndexRegion] = useState("US");
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listModalMode, setListModalMode] = useState<"create" | "rename">("create");
  const [listNameDraft, setListNameDraft] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [pendingDeleteList, setPendingDeleteList] = useState<StockList | null>(null);

  useEffect(() => {
    const data = loadFinanceState();
    setStocks(data.stocks);
    setStockLists(data.stockLists);
    setIndices(data.indices);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveStocks(stocks);
  }, [stocks, ready]);
  useEffect(() => {
    if (!ready) return;
    saveStockLists(stockLists);
  }, [stockLists, ready]);
  useEffect(() => {
    if (indices.length) saveIndices(indices);
  }, [indices]);

  const baseStocks = useMemo(() => stocks, [stocks]);
  const activeList = useMemo(() => stockLists.find((list) => list.id === activeListId), [stockLists, activeListId]);
  const visibleStocks = useMemo(() => {
    if (activeListId === "all") return baseStocks;
    if (activeListId === "KR" || activeListId === "US") {
      return baseStocks.filter((item) => item.market === activeListId);
    }
    if (!activeList) return baseStocks;
    return activeList.itemIds
      .map((id) => baseStocks.find((item) => item.id === id))
      .filter((item): item is StockItem => Boolean(item));
  }, [activeList, activeListId, baseStocks]);
  const getQuoteSymbol = (item: StockItem) => {
    if (item.market === "KR" && !item.symbol.includes(".")) return `${item.symbol}.KS`;
    return item.symbol;
  };

  const watchSymbols = useMemo(() => visibleStocks.map((item) => getQuoteSymbol(item)), [visibleStocks]);
  const { bySymbol: watchQuotes } = useQuotes(watchSymbols);

  const visibleIndices = useMemo(() => indices, [indices]);

  const formatCurrency = (value: number, market?: "KR" | "US") => {
    const symbol = market === "KR" ? "KRW " : "$";
    const decimals = market === "KR" ? 0 : 2;
    return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2400);
  };

  const fetchQuote = async (symbol: string) => {
    try {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`);
      if (!response.ok) return null;
      const data = (await response.json()) as {
        quotes?: { symbol: string; price: number | null; changePercent: number | null }[];
      };
      return data.quotes?.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
    } catch (error) {
      console.error("[QUOTE FETCH FAILED]", error);
      return null;
    }
  };

  const isValidQuote = (quote: { price: number | null; changePercent: number | null } | null) => {
    return !!quote && quote.price !== null && quote.changePercent !== null;
  };

  const resolveSymbolForSave = async (rawSymbol: string) => {
    const normalized = rawSymbol.trim().toUpperCase();
    if (!normalized) return null;

    const directQuote = await fetchQuote(normalized);
    if (isValidQuote(directQuote)) {
      return { symbol: normalized, market: detectMarketFromSymbol(normalized) };
    }

    if (!normalized.includes(".") && /^\d{6}$/.test(normalized)) {
      for (const suffix of [".KS", ".KQ"]) {
        const trial = `${normalized}${suffix}`;
        const quote = await fetchQuote(trial);
        if (isValidQuote(quote)) {
          return { symbol: trial, market: "KR" as const };
        }
      }
    }

    return null;
  };

  const updateList = (listId: string, updater: (list: StockList) => StockList) => {
    setStockLists((prev) => prev.map((list) => (list.id === listId ? updater(list) : list)));
  };

  const addStockToList = (listId: string, stockId: string) => {
    updateList(listId, (list) =>
      list.itemIds.includes(stockId) ? list : { ...list, itemIds: [...list.itemIds, stockId] }
    );
  };

  const removeStockFromAllLists = (stockId: string) => {
    setStockLists((prev) =>
      prev.map((list) => ({ ...list, itemIds: list.itemIds.filter((id) => id !== stockId) }))
    );
  };

  const availablePlaylistStocks = useMemo(() => {
    if (!activeList) return [];
    return baseStocks.filter((item) => !activeList.itemIds.includes(item.id));
  }, [activeList, baseStocks]);

  const openCreateList = () => {
    setListModalMode("create");
    setListNameDraft("");
    setListError(null);
    setListModalOpen(true);
  };

  const openRenameList = () => {
    if (!activeList) return;
    setListModalMode("rename");
    setListNameDraft(activeList.name);
    setListError(null);
    setListModalOpen(true);
  };

  const submitListModal = () => {
    const trimmed = listNameDraft.trim();
    if (!trimmed) {
      setListError("List name is required.");
      return;
    }
    if (listModalMode === "create") {
      const nextId = crypto.randomUUID();
      setStockLists((prev) => [...prev, { id: nextId, name: trimmed, itemIds: [] }]);
      setActiveListId(nextId);
    } else if (activeList) {
      updateList(activeList.id, (list) => ({ ...list, name: trimmed }));
    }
    setListModalOpen(false);
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
                    const quote = await fetchQuote(symbol);
                    if (!isValidQuote(quote)) {
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
                <button
                  className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black"
                  onClick={async () => {
                    if (!newSymbol.trim()) return;
                    const symbol = newSymbol.trim().toUpperCase();
                    const resolved = await resolveSymbolForSave(symbol);
                    if (!resolved) {
                      showNotice(`Symbol not found or quote unavailable: ${symbol}`);
                      return;
                    }
                    const existing = stocks.find(
                      (item) => item.symbol.toUpperCase() === resolved.symbol && item.market === resolved.market
                    );
                    const next = existing ?? createStockItem(resolved.symbol, resolved.market);
                    if (!existing) {
                      setStocks((prev) => [...prev, next]);
                    }
                    if (activeList) {
                      addStockToList(activeList.id, next.id);
                    }
                    setNewSymbol("");
                    showNotice(`Stock added: ${symbol}`);
                  }}
                >
                  + Add Symbol
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">LIST</div>
                  <select
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                    value={activeListId}
                    onChange={(event) => setActiveListId(event.target.value)}
                  >
                    <option value="all">All Stocks</option>
                    <option value="KR">KR</option>
                    <option value="US">US</option>
                    {stockLists.length ? (
                      <optgroup label="LISTS">
                        {stockLists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    className="rounded-full border border-white/10 px-3 py-1 text-[var(--ink-1)]"
                    onClick={openCreateList}
                  >
                    + List
                  </button>
                  <button
                    className="rounded-full border border-white/10 px-3 py-1 text-[var(--ink-1)] disabled:opacity-40"
                    disabled={!activeList}
                    onClick={openRenameList}
                  >
                    Rename
                  </button>
                  <button
                    className="rounded-full border border-white/10 px-3 py-1 text-[var(--ink-1)] disabled:opacity-40"
                    disabled={!activeList}
                    onClick={() => {
                      if (!activeList) return;
                      setPendingDeleteList(activeList);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {activeList ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                    value={playlistAddId}
                    onChange={(event) => setPlaylistAddId(event.target.value)}
                  >
                    <option value="">Add stock to list</option>
                    {availablePlaylistStocks.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name ?? item.symbol} ({item.symbol})
                      </option>
                    ))}
                  </select>
                  <button
                    className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)] disabled:opacity-40"
                    disabled={!playlistAddId}
                    onClick={() => {
                      if (!playlistAddId || !activeList) return;
                      addStockToList(activeList.id, playlistAddId);
                      setPlaylistAddId("");
                    }}
                  >
                    Add
                  </button>
                </div>
              ) : null}

              <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-2 lifnux-scroll">
                {visibleStocks.map((item, index) => (
                  <div
                    key={item.id}
                    draggable={!!activeList}
                    onDragStart={(event) => {
                      if (!activeList) return;
                      event.dataTransfer.setData("text/plain", item.id);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      if (!activeList) return;
                      const draggedId = event.dataTransfer.getData("text/plain");
                      const fromIndex = activeList.itemIds.findIndex((entry) => entry === draggedId);
                      if (fromIndex < 0 || fromIndex === index) return;
                      const next = [...activeList.itemIds];
                      const [moved] = next.splice(fromIndex, 1);
                      next.splice(index, 0, moved);
                      updateList(activeList.id, (list) => ({ ...list, itemIds: next }));
                    }}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {item.name ?? item.symbol} <span className="text-[var(--ink-1)]">({item.symbol})</span>
                      </div>
                      <div className="text-xs text-[var(--ink-1)]">
                        {watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.price !== null && watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.price !== undefined
                          ? formatCurrency(watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.price ?? 0, item.market)
                          : "--"}
                      </div>
                      <div className={`text-xs ${watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.changePercent && (watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.changePercent ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.changePercent === null || watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.changePercent === undefined
                          ? "--"
                          : `${(watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.changePercent ?? 0) >= 0 ? "+" : ""}${(watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.changePercent ?? 0).toFixed(2)}%`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className={`text-xs ${item.watchlisted === false ? "text-[var(--ink-1)]" : "text-[var(--accent-1)]"}`}
                        onClick={() =>
                          setStocks((prev) =>
                            prev.map((entry) =>
                              entry.id === item.id ? { ...entry, watchlisted: entry.watchlisted === false } : entry
                            )
                          )
                        }
                        aria-label="Toggle watchlist"
                      >
                        {item.watchlisted === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        className={`text-xs ${item.isHeld ? "text-[var(--accent-1)]" : "text-[var(--ink-1)]"}`}
                        onClick={() =>
                          setStocks((prev) =>
                            prev.map((entry) => (entry.id === item.id ? { ...entry, isHeld: !entry.isHeld } : entry))
                          )
                        }
                        aria-label="Toggle held"
                      >
                        Held
                      </button>
                      {activeList ? (
                        <button
                          className="text-xs text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                          onClick={() =>
                            updateList(activeList.id, (list) => ({
                              ...list,
                              itemIds: list.itemIds.filter((id) => id !== item.id)
                            }))
                          }
                        >
                          Remove
                        </button>
                      ) : null}
                      <button
                        className="text-xs text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                        onClick={() => {
                          setStocks((prev) => prev.filter((entry) => entry.id !== item.id));
                          removeStockFromAllLists(item.id);
                        }}
                        aria-label="Delete stock"
                      >
                        X
                      </button>
                    </div>
                  </div>
                ))}
                {visibleStocks.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No stocks.</div> : null}
              </div>
            </>
          )}
        </div>
      </div>
      <Modal
        open={listModalOpen}
        title={listModalMode === "create" ? "Create List" : "Rename List"}
        onClose={() => {
          setListModalOpen(false);
          setListError(null);
        }}
        closeOnBackdrop
        closeOnEsc
        actions={
          <>
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={() => {
                setListModalOpen(false);
                setListError(null);
              }}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black disabled:opacity-40"
              type="submit"
              form="list-modal-form"
              disabled={!listNameDraft.trim()}
            >
              {listModalMode === "create" ? "Create" : "Save"}
            </button>
          </>
        }
      >
        <form
          id="list-modal-form"
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitListModal();
          }}
        >
          <label className="block text-xs uppercase tracking-wide">
            List name
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              value={listNameDraft}
              onChange={(event) => {
                setListNameDraft(event.target.value);
                if (listError) setListError(null);
              }}
              autoFocus
            />
          </label>
          {listError ? <div className="text-xs text-rose-300">{listError}</div> : null}
        </form>
      </Modal>

      <ConfirmModal
        open={!!pendingDeleteList}
        title="Delete List"
        description={
          pendingDeleteList ? `Delete list "${pendingDeleteList.name}"? This will not remove the stocks.` : ""
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (!pendingDeleteList) return;
          setStockLists((prev) => prev.filter((list) => list.id !== pendingDeleteList.id));
          setActiveListId("all");
          setPendingDeleteList(null);
        }}
        onCancel={() => setPendingDeleteList(null)}
      />
    </AppShell>
  );
}



