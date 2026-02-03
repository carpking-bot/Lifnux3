"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../../(shared)/components/AppShell";
import { Modal } from "../../../(shared)/components/Modal";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import { Select } from "../../../(shared)/components/Select";
import type { BrokerAccount, Holding, IndexItem, StockItem, StockList } from "../../../(shared)/types/finance";
import { createIndexItem, createStockItem, detectMarketFromSymbol, loadFinanceState, loadPositions, normalizeSymbol, saveHoldings, saveIndices, saveStockLists, saveStocks } from "../../../(shared)/lib/finance";
import { useQuotes } from "../../../../src/lib/quotes/useQuotes";
import { Eye, EyeOff } from "lucide-react";

export default function FinanceWatchlistPage() {
  const defaultExcd = "NAS";
  const excdCandidates = (process.env.NEXT_PUBLIC_KIS_EXCD_CANDIDATES ?? "NAS,NYS,AMS")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const router = useRouter();
  const [section, setSection] = useState<"indices" | "watchlist">("watchlist");
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [stockLists, setStockLists] = useState<StockList[]>([]);
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [activeListId, setActiveListId] = useState<string>("all");
  const [newSymbol, setNewSymbol] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [heldFilter, setHeldFilter] = useState<"all" | "held" | "not-held">("all");
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
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const [labelTargetId, setLabelTargetId] = useState<string | null>(null);
  const [holdingModalOpen, setHoldingModalOpen] = useState(false);
  const [holdingMode, setHoldingMode] = useState<"add" | "edit">("add");
  const [holdingTargetId, setHoldingTargetId] = useState<string | null>(null);
  const [holdingDraft, setHoldingDraft] = useState({
    accountId: "",
    qty: "",
    avgPrice: "",
    notes: ""
  });
  const [holdingError, setHoldingError] = useState<string | null>(null);

  useEffect(() => {
    const data = loadFinanceState();
    setStocks(data.stocks);
    setHoldings(data.holdings);
    setAccounts(data.accounts);
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
  const heldSymbolKeys = useMemo(() => {
    const ids = new Set<string>();
    holdings.forEach((holding) => {
      if (holding.qty > 0) ids.add(holding.symbolKey);
    });
    return ids;
  }, [holdings]);
  const visibleStocks = useMemo(() => {
    const filteredByList =
      activeListId === "all"
        ? baseStocks
        : activeListId === "KR" || activeListId === "US"
          ? baseStocks.filter((item) => item.market === activeListId)
          : activeList
            ? activeList.itemIds
                .map((id) => baseStocks.find((item) => item.id === id))
                .filter((item): item is StockItem => Boolean(item))
            : baseStocks;
    if (heldFilter === "held") {
      return filteredByList.filter((item) => heldSymbolKeys.has(normalizeSymbol(item.symbol)));
    }
    if (heldFilter === "not-held") {
      return filteredByList.filter((item) => !heldSymbolKeys.has(normalizeSymbol(item.symbol)));
    }
    return filteredByList;
  }, [activeList, activeListId, baseStocks, heldFilter, heldSymbolKeys]);
  const getQuoteSymbol = (item: StockItem) => {
    if (item.market === "KR" && !item.symbol.includes(".")) return `${item.symbol}.KS`;
    return item.symbol;
  };

  const watchSymbols = useMemo(() => visibleStocks.map((item) => getQuoteSymbol(item)), [visibleStocks]);
  const { bySymbol: watchQuotes } = useQuotes(watchSymbols);

  const visibleIndices = useMemo(() => indices, [indices]);

  const resolveCurrency = (symbol: string, market: "KR" | "US", quoteCurrency?: string | null) => {
    if (quoteCurrency) return quoteCurrency;
    if (/^\d{6}$/.test(symbol) || symbol.endsWith(".KS") || symbol.endsWith(".KQ") || market === "KR") return "KRW";
    return "USD";
  };

  const formatCurrency = (value: number, symbol: string, market: "KR" | "US", quoteCurrency?: string | null) => {
    const currency = resolveCurrency(symbol, market, quoteCurrency);
    const isKRW = currency === "KRW";
    const prefix = isKRW ? "₩" : "$";
    const decimals = isKRW ? 0 : 2;
    return `${prefix}${value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })}`;
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
        quotes?: { symbol: string; price: number | null; changePercent: number | null; currency?: string | null; name?: string | null }[];
      };
      return data.quotes?.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
    } catch (error) {
      console.error("[QUOTE FETCH FAILED]", error);
      return null;
    }
  };

  const isValidQuote = (quote: { price: number | null } | null) => {
    return !!quote && quote.price !== null && quote.price > 0;
  };

  const resolveSymbolForSave = async (rawSymbol: string) => {
    let normalized = rawSymbol.trim().toUpperCase();
    if (!normalized) return null;

    if (normalized.endsWith(".KS") || normalized.endsWith(".KQ")) {
      normalized = normalized.slice(0, -3);
    }

    if (/^\d{6}$/.test(normalized)) {
      const quote = await fetchQuote(normalized);
      if (isValidQuote(quote)) {
        return { symbol: normalized, market: "KR" as const };
      }
      return null;
    }

    if (!/^[A-Z]{2,5}:[A-Z0-9.\-]+$/.test(normalized)) {
      const candidates = excdCandidates.length ? excdCandidates : [defaultExcd];
      for (const excd of candidates) {
        const candidate = `${excd}:${normalized}`;
        const quote = await fetchQuote(candidate);
        if (isValidQuote(quote)) {
          return { symbol: candidate, market: "US" as const };
        }
      }
      return null;
    }

    const quote = await fetchQuote(normalized);
    if (isValidQuote(quote)) {
      return { symbol: normalized, market: "US" as const };
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

  const listOptions = useMemo(() => {
    const base = [
      { value: "all", label: "All Stocks" },
      { value: "KR", label: "KR" },
      { value: "US", label: "US" }
    ];
    const lists = stockLists.map((list) => ({ value: list.id, label: list.name, group: "LISTS" }));
    return [...base, ...lists];
  }, [stockLists]);

  const playlistOptions = useMemo(
    () =>
      availablePlaylistStocks.map((item) => ({
        value: item.id,
        label: `${item.label ?? item.symbol} (${item.symbol})`
      })),
    [availablePlaylistStocks]
  );

  const accountOptions = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: account.brokerName })),
    [accounts]
  );

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

  const openLabelModal = (stock: StockItem) => {
    setLabelTargetId(stock.id);
    setLabelDraft(stock.label ?? stock.symbol);
    setLabelError(null);
    setLabelModalOpen(true);
  };

  const submitLabelModal = () => {
    const trimmed = labelDraft.trim();
    if (!trimmed) {
      setLabelError("Display name is required.");
      return;
    }
    if (!labelTargetId) return;
    setStocks((prev) =>
      prev.map((item) => (item.id === labelTargetId ? { ...item, label: trimmed } : item))
    );
    setLabelModalOpen(false);
    setLabelTargetId(null);
  };

  const findHoldingForStock = (symbolKey: string) =>
    holdings.find((holding) => holding.symbolKey === symbolKey);

  const openHoldingModal = (stock: StockItem) => {
    const symbolKey = normalizeSymbol(stock.symbol);
    const existing = findHoldingForStock(symbolKey);
    const accountId = existing?.accountId ?? accounts[0]?.id ?? "";
    const quote = watchQuotes.get(getQuoteSymbol(stock).toUpperCase());
    const priceValue = typeof quote?.price === "number" && quote.price > 0 ? quote.price : null;
    const defaultAvgPrice =
      priceValue !== null
        ? stock.market === "KR"
          ? String(Math.round(priceValue))
          : priceValue.toFixed(2)
        : "";
    setHoldingMode(existing ? "edit" : "add");
    setHoldingTargetId(symbolKey);
    setHoldingDraft({
      accountId,
      qty: existing ? String(existing.qty) : "",
      avgPrice: existing ? String(existing.avgPrice) : defaultAvgPrice,
      notes: existing?.notes ?? ""
    });
    setHoldingError(null);
    setHoldingModalOpen(true);
  };

  const closeHoldingModal = () => {
    setHoldingModalOpen(false);
    setHoldingTargetId(null);
    setHoldingError(null);
  };

  const submitHoldingModal = () => {
    if (!holdingTargetId) return;
    const qtyValue = Number(holdingDraft.qty.replace(/,/g, "").trim());
    const avgInput = holdingDraft.avgPrice.replace(/,/g, "").trim();
    const avgValue = avgInput ? Number(avgInput) : NaN;
    if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
      setHoldingError("Qty must be greater than 0.");
      return;
    }
    const stock = stocks.find((item) => normalizeSymbol(item.symbol) === holdingTargetId);
    if (!stock) return;
    const quote = watchQuotes.get(getQuoteSymbol(stock).toUpperCase());
    const quotePrice = typeof quote?.price === "number" && quote.price > 0 ? quote.price : null;
    const resolvedAvgValue = Number.isFinite(avgValue) ? avgValue : quotePrice ?? 0;
    if (!Number.isFinite(resolvedAvgValue) || resolvedAvgValue < 0) {
      setHoldingError("Avg price must be 0 or greater.");
      return;
    }
    const currency = stock.market === "KR" ? "KRW" : "USD";
    const existing = holdings.find((entry) => entry.symbolKey === holdingTargetId);
    const next = existing
      ? holdings.map((entry) =>
          entry.id === existing.id
            ? {
                ...entry,
                accountId: holdingDraft.accountId || existing.accountId,
                qty: qtyValue,
                avgPrice: resolvedAvgValue,
                currency,
                notes: holdingDraft.notes.trim() || undefined
              }
            : entry
        )
      : [
          ...holdings,
          {
            id: crypto.randomUUID(),
            accountId: holdingDraft.accountId || accounts[0]?.id || "default",
            stockId: stock.id,
            symbolKey: holdingTargetId,
            avgPrice: resolvedAvgValue,
            qty: qtyValue,
            currency,
            notes: holdingDraft.notes.trim() || undefined
          }
        ];
    saveHoldings(next);
    const reloaded = loadPositions();
    console.log("[PORTFOLIO LOAD] count=", reloaded.length);
    setHoldings(reloaded.length ? reloaded : next);
    console.log(
      "[PORTFOLIO SAVE] key=portfolio.positions symbol=",
      holdingTargetId,
      "qty=",
      qtyValue,
      "avgPrice=",
      avgValue
    );
    closeHoldingModal();
  };

  const closePosition = () => {
    if (!holdingTargetId) return;
    const next = holdings.filter((entry) => entry.symbolKey !== holdingTargetId);
    saveHoldings(next);
    const reloaded = loadPositions();
    console.log("[PORTFOLIO LOAD] count=", reloaded.length);
    setHoldings(reloaded.length ? reloaded : next);
    closeHoldingModal();
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
                <input
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  placeholder="Display name (optional)"
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
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
                    const rawLabel = newLabel.trim();
                    const fallbackLabel = symbol.includes(":") ? symbol : symbol.replace(/\.K[QS]$/i, "");
                    const label = rawLabel || fallbackLabel || resolved.symbol;
                    const next = existing ?? createStockItem(resolved.symbol, resolved.market, label);
                    if (!existing) {
                      setStocks((prev) => [...prev, next]);
                    } else if (label && existing.label !== label) {
                      setStocks((prev) =>
                        prev.map((item) => (item.id === existing.id ? { ...item, label } : item))
                      );
                    }
                    if (activeList) {
                      addStockToList(activeList.id, next.id);
                    }
                    setNewSymbol("");
                    setNewLabel("");
                    showNotice(`Stock added: ${symbol}`);
                  }}
                >
                  + Add Symbol
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">LIST</div>
                  <Select
                    value={activeListId}
                    options={listOptions}
                    onChange={(value) => setActiveListId(value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Filter</div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      className={`rounded-full border px-3 py-1 ${heldFilter === "all" ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"}`}
                      onClick={() => setHeldFilter("all")}
                    >
                      All
                    </button>
                    <button
                      className={`rounded-full border px-3 py-1 ${heldFilter === "not-held" ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"}`}
                      onClick={() => setHeldFilter("not-held")}
                    >
                      Not held
                    </button>
                    <button
                      className={`rounded-full border px-3 py-1 ${heldFilter === "held" ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"}`}
                      onClick={() => setHeldFilter("held")}
                    >
                      Held
                    </button>
                  </div>
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
                  <Select
                    value={playlistAddId}
                    options={[{ value: "", label: "Add stock to list", disabled: true }, ...playlistOptions]}
                    onChange={(value) => setPlaylistAddId(value)}
                  />
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
                        {item.label ?? item.symbol} <span className="text-[var(--ink-1)]">({item.symbol})</span>
                        {heldSymbolKeys.has(normalizeSymbol(item.symbol)) ? (
                          <span className="ml-2 rounded-full border border-white/10 px-2 py-[1px] text-[9px] text-[var(--accent-1)]">
                            HELD
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-[var(--ink-1)]">
                        {watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.price !== null && watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.price !== undefined
                          ? formatCurrency(
                              watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.price ?? 0,
                              item.symbol,
                              item.market,
                              watchQuotes.get(getQuoteSymbol(item).toUpperCase())?.currency
                            )
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
                        className="text-xs text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                        onClick={() => openLabelModal(item)}
                        aria-label="Rename stock"
                      >
                        Rename
                      </button>
                      <button
                        className={`text-xs ${heldSymbolKeys.has(normalizeSymbol(item.symbol)) ? "text-[var(--accent-1)]" : "text-[var(--ink-1)]"}`}
                        onClick={() => openHoldingModal(item)}
                        aria-label="Manage holding"
                      >
                        HELD
                      </button>
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

      <Modal
        open={holdingModalOpen}
        title={holdingMode === "edit" ? "Edit Position" : "Add to Portfolio"}
        onClose={closeHoldingModal}
        closeOnBackdrop
        closeOnEsc
        actions={
          <>
            {holdingMode === "edit" ? (
              <button
                className="rounded-full border border-white/10 px-4 py-2 text-xs text-rose-300"
                onClick={closePosition}
              >
                Close position
              </button>
            ) : null}
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={closeHoldingModal}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black disabled:opacity-40"
              type="submit"
              form="holding-modal-form"
              disabled={!holdingDraft.qty.trim()}
            >
              {holdingMode === "edit" ? "Save" : "Add"}
            </button>
          </>
        }
      >
        <form
          id="holding-modal-form"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitHoldingModal();
          }}
        >
          <label className="block text-xs uppercase tracking-wide">
            Account
            <Select
              value={holdingDraft.accountId}
              options={accountOptions}
              onChange={(value) => setHoldingDraft((prev) => ({ ...prev, accountId: value }))}
              className="mt-1"
            />
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Qty
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              value={holdingDraft.qty}
              onChange={(event) => setHoldingDraft((prev) => ({ ...prev, qty: event.target.value }))}
              placeholder="e.g. 10"
            />
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Avg price (optional)
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              value={holdingDraft.avgPrice}
              onChange={(event) => setHoldingDraft((prev) => ({ ...prev, avgPrice: event.target.value }))}
              placeholder="e.g. 72000"
            />
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Notes (optional)
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              value={holdingDraft.notes}
              onChange={(event) => setHoldingDraft((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Add a note"
            />
          </label>
          {holdingError ? <div className="text-xs text-rose-300">{holdingError}</div> : null}
        </form>
      </Modal>

      <Modal
        open={labelModalOpen}
        title="Rename Stock"
        onClose={() => {
          setLabelModalOpen(false);
          setLabelTargetId(null);
          setLabelError(null);
        }}
        closeOnBackdrop
        closeOnEsc
        actions={
          <>
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={() => {
                setLabelModalOpen(false);
                setLabelTargetId(null);
                setLabelError(null);
              }}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black disabled:opacity-40"
              type="submit"
              form="label-modal-form"
              disabled={!labelDraft.trim()}
            >
              Save
            </button>
          </>
        }
      >
        <form
          id="label-modal-form"
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitLabelModal();
          }}
        >
          <label className="block text-xs uppercase tracking-wide">
            Display name
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              value={labelDraft}
              onChange={(event) => {
                setLabelDraft(event.target.value);
                if (labelError) setLabelError(null);
              }}
              autoFocus
            />
          </label>
          {labelError ? <div className="text-xs text-rose-300">{labelError}</div> : null}
        </form>
      </Modal>
    </AppShell>
  );
}



