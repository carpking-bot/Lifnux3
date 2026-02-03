"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../(shared)/components/AppShell";
import { Modal } from "../../../(shared)/components/Modal";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import { Select } from "../../../(shared)/components/Select";
import type { BrokerAccount, Holding, StockItem, Trade } from "../../../(shared)/types/finance";
import { loadFinanceState, normalizeSymbol, saveAccounts, saveFinanceSettings, saveHoldings, saveTrades } from "../../../(shared)/lib/finance";
import { useQuotes } from "../../../../src/lib/quotes/useQuotes";
import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PortfolioPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [settings, setSettings] = useState({ blurSensitiveNumbers: true });
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [fxUpdatedAt, setFxUpdatedAt] = useState<number | null>(null);
  const [krwMode, setKrwMode] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Holding | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        accountId: string;
        stockId: string;
        avgPrice: string;
        qty: string;
        countryLabel: string;
        sectorLabel: string;
      }
    >
  >({});
  const [tradeForm, setTradeForm] = useState({
    accountId: "",
    stockId: "",
    side: "BUY" as "BUY" | "SELL",
    price: "",
    qty: ""
  });
  const [sortKey, setSortKey] = useState<"weight" | "pnl" | "value" | "account" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const data = loadFinanceState();
    setAccounts(data.accounts);
    setHoldings(data.holdings);
    setStocks(data.stocks);
    setSettings(data.settings);
    setTrades(data.trades);
    setReady(true);
  }, []);

  const fetchFxRate = async () => {
    try {
      const response = await fetch("/api/fx?pair=USD/KRW", { cache: "no-store" });
      if (!response.ok) return null;
      const data = (await response.json()) as { fx?: { rate?: number | null; ts?: number | null } };
      const rate = typeof data.fx?.rate === "number" ? data.fx.rate : null;
      if (rate && rate > 0) {
        setFxRate(rate);
        setFxUpdatedAt(typeof data.fx?.ts === "number" ? data.fx.ts : Date.now());
        return rate;
      }
    } catch {
      // keep last known rate
    }
    return null;
  };

  useEffect(() => {
    if (accounts.length) saveAccounts(accounts);
  }, [accounts]);
  useEffect(() => {
    if (!ready) return;
    saveHoldings(holdings);
  }, [holdings, ready]);
  useEffect(() => {
    saveFinanceSettings(settings);
  }, [settings]);
  useEffect(() => {
    saveTrades(trades);
  }, [trades]);

  const activeHoldings = useMemo(() => holdings.filter((holding) => holding.qty > 0), [holdings]);
  const heldSymbolKeys = useMemo(
    () => new Set(activeHoldings.map((holding) => normalizeSymbol(holding.symbolKey))),
    [activeHoldings]
  );
  const heldStocks = useMemo(
    () => stocks.filter((stock) => heldSymbolKeys.has(normalizeSymbol(stock.symbol))),
    [stocks, heldSymbolKeys]
  );
  const getQuoteSymbol = (stock: StockItem) => {
    if (stock.market === "KR" && !stock.symbol.includes(".")) return `${stock.symbol}.KS`;
    return stock.symbol;
  };
  const heldSymbols = useMemo(() => heldStocks.map((stock) => getQuoteSymbol(stock)), [heldStocks]);
  const { bySymbol: heldQuotes } = useQuotes(heldSymbols);
  const useFx = krwMode && !!fxRate;
  const derivedHoldings = useMemo(() => {
    return activeHoldings.map((holding) => {
      const stock = stocks.find((item) => normalizeSymbol(item.symbol) === normalizeSymbol(holding.symbolKey));
      const quote = stock ? heldQuotes.get(getQuoteSymbol(stock).toUpperCase()) : undefined;
      const price = quote?.price ?? stock?.last ?? 0;
      const marketValue = price * holding.qty;
      const costBasis = holding.avgPrice * holding.qty;
      const pnlValue = marketValue - costBasis;
      const isUsd = holding.currency === "USD";
      const rate = useFx && isUsd ? fxRate : null;
      const marketValueKrw = rate ? marketValue * rate : marketValue;
      const costBasisKrw = rate ? costBasis * rate : costBasis;
      const pnlKrw = rate ? pnlValue * rate : pnlValue;
      return {
        holding,
        stock,
        quote,
        price,
        marketValue,
        costBasis,
        pnlValue,
        marketValueKrw,
        costBasisKrw,
        pnlKrw,
        isUsd,
        rate
      };
    });
  }, [activeHoldings, fxRate, heldQuotes, heldStocks, stocks, useFx]);

  const totalMarketValue = useMemo(() => {
    return derivedHoldings.reduce((sum, entry) => sum + entry.marketValueKrw, 0);
  }, [derivedHoldings]);

  const totals = useMemo(() => {
    let krw = 0;
    let usd = 0;
    derivedHoldings.forEach((entry) => {
      if (entry.holding.currency === "KRW") {
        krw += entry.marketValue;
      } else {
        usd += entry.marketValue;
      }
    });
    const totalKrw = useFx && fxRate ? krw + usd * fxRate : null;
    return { krw, usd, totalKrw };
  }, [derivedHoldings, fxRate, useFx]);

  const blurClass = settings.blurSensitiveNumbers ? "blur-sm select-none" : "";

  const formatNumber = (value: number, decimals: number) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const formatCurrency = (value: number, currency: "KRW" | "USD") => {
    const symbol = currency === "KRW" ? "₩" : "$";
    const decimals = currency === "KRW" ? 0 : 2;
    return `${symbol}${formatNumber(value, decimals)}`;
  };

  const parseNumber = (value: string) => {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const accountOptions = useMemo(
    () => accounts.map((acc) => ({ value: acc.id, label: acc.brokerName })),
    [accounts]
  );
  const stockOptions = useMemo(
    () => stocks.map((item) => ({ value: item.id, label: `${item.label ?? item.symbol} (${item.symbol})` })),
    [stocks]
  );
  const countryOptions = useMemo(
    () => [
      { value: "KR", label: "KR" },
      { value: "US", label: "US" }
    ],
    []
  );

  const applyFxConversion = async () => {
    const rate = await fetchFxRate();
    if (!rate && !fxRate) {
      setKrwMode(false);
      return;
    }
    setKrwMode(true);
  };

  const sortedHoldings = useMemo(() => {
    const rows = [...derivedHoldings];
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      if (sortKey === "account") {
        const aName = accounts.find((acc) => acc.id === a.holding.accountId)?.brokerName ?? "";
        const bName = accounts.find((acc) => acc.id === b.holding.accountId)?.brokerName ?? "";
        return aName.localeCompare(bName) * dir;
      }
      if (sortKey === "pnl") return (a.pnlKrw - b.pnlKrw) * dir;
      if (sortKey === "value") return (a.marketValueKrw - b.marketValueKrw) * dir;
      if (sortKey === "weight") return (a.marketValueKrw - b.marketValueKrw) * dir;
      return 0;
    });
  }, [accounts, derivedHoldings, sortDir, sortKey]);

  const buildBuckets = (key: "sectorLabel" | "countryLabel") => {
    const buckets = new Map<string, number>();
    derivedHoldings.forEach((entry) => {
      const label = entry.holding[key]?.trim() || "Unlabeled";
      buckets.set(label, (buckets.get(label) ?? 0) + entry.marketValueKrw);
    });
    return Array.from(buckets.entries())
      .map(([label, value]) => ({ label, value }))
      .filter((item) => item.value > 0);
  };

  const sectorData = useMemo(() => buildBuckets("sectorLabel"), [derivedHoldings]);
  const countryData = useMemo(() => buildBuckets("countryLabel"), [derivedHoldings]);

  const openTrade = () => {
    const firstAccount = accounts[0]?.id ?? "";
    const firstStock = stocks[0]?.id ?? "";
    setTradeForm({
      accountId: firstAccount,
      stockId: firstStock,
      side: "BUY",
      price: "",
      qty: ""
    });
    setTradeOpen(true);
  };

  const applyTrade = () => {
    const { accountId, stockId, side, price, qty } = tradeForm;
    const priceValue = Number(price);
    const qtyValue = Number(qty);
    if (!accountId || !stockId || !Number.isFinite(priceValue) || !Number.isFinite(qtyValue) || qtyValue <= 0) return;
    const existing = holdings.find((entry) => entry.accountId === accountId && entry.stockId === stockId);
    if (!existing && side === "SELL") return;

    const stock = stocks.find((item) => item.id === stockId);
    const currency = stock?.market === "KR" ? "KRW" : "USD";
    const symbolKey = normalizeSymbol(stock?.symbol ?? "");
    const nextHoldings = [...holdings];
    if (!existing && side === "BUY") {
      nextHoldings.push({
        id: crypto.randomUUID(),
        accountId,
        stockId,
        symbolKey,
        avgPrice: priceValue,
        qty: qtyValue,
        currency
      });
    } else if (existing) {
      const idx = nextHoldings.findIndex((entry) => entry.id === existing.id);
      if (idx >= 0) {
        const currentQty = existing.qty;
        const nextQty = side === "BUY" ? currentQty + qtyValue : currentQty - qtyValue;
        if (nextQty <= 0) {
          nextHoldings.splice(idx, 1);
        } else {
          const nextAvg =
            side === "BUY" ? (existing.avgPrice * currentQty + priceValue * qtyValue) / nextQty : existing.avgPrice;
          nextHoldings[idx] = {
            ...existing,
            qty: nextQty,
            avgPrice: nextAvg,
            symbolKey: existing.symbolKey || symbolKey
          };
        }
      }
    }

    setHoldings(nextHoldings);
    setTrades((prev) => [
      ...prev,
      { id: crypto.randomUUID(), accountId, stockId, side, price: priceValue, qty: qtyValue, executedAt: Date.now() }
    ]);
    setTradeOpen(false);
  };

  return (
    <AppShell showTitle={false}>
      <div className="sticky top-3 z-20 mx-auto w-full max-w-[1200px] px-4">
        <div className="lifnux-glass flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">Total Portfolio</div>
            <div className={`text-lg ${blurClass}`}>
              {totals.totalKrw !== null
                ? formatCurrency(totals.totalKrw, "KRW")
                : `${formatCurrency(totals.krw, "KRW")} + ${formatCurrency(totals.usd, "USD")}`}
            </div>
          </div>
          <div className="text-[10px] text-[var(--ink-1)]">
            {useFx && fxRate ? `FX ${formatCurrency(fxRate, "KRW")}` : "FX not applied"}
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1200px] pb-20 pt-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)]"
            onClick={() => router.back()}
          >
            Back
          </button>
          <div>
            <h1 className="text-3xl">Portfolio</h1>
            <div className="text-sm text-[var(--ink-1)]">Track holdings and broker allocation.</div>
          </div>
        </div>

        <div className="lifnux-glass rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Holdings</div>
            <div className="flex items-center gap-3 text-xs text-[var(--ink-1)]">
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={openTrade}>
                Trade
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={() => setAccountsOpen(true)}>
                Manage Accounts
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={applyFxConversion}>
                Add Holding
              </button>
              <button
                className={`rounded-full border px-3 py-1 ${
                  settings.blurSensitiveNumbers ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10"
                }`}
                onClick={() =>
                  setSettings((prev) => ({ ...prev, blurSensitiveNumbers: !prev.blurSensitiveNumbers }))
                }
              >
                {settings.blurSensitiveNumbers ? "Reveal" : "Hide"}
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[1080px] space-y-2 text-xs">
              <div className="grid grid-cols-[1.2fr_1.2fr_1.2fr_1.2fr_0.7fr_1fr_1.2fr_0.8fr_0.7fr] gap-3 text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">
                <button
                  className="text-left text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)] hover:text-white"
                  onClick={() => {
                    setSortKey("account");
                    setSortDir((prev) => (sortKey === "account" && prev === "desc" ? "asc" : "desc"));
                  }}
                >
                  Account
                </button>
                <div>Stock</div>
                <button
                  className="text-left text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)] hover:text-white"
                  onClick={() => {
                    setSortKey("value");
                    setSortDir((prev) => (sortKey === "value" && prev === "desc" ? "asc" : "desc"));
                  }}
                >
                  Current / Value
                </button>
                <div>Avg / Cost</div>
                <div>Qty</div>
                <div>Labels</div>
                <button
                  className="text-left text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)] hover:text-white"
                  onClick={() => {
                    setSortKey("pnl");
                    setSortDir((prev) => (sortKey === "pnl" && prev === "desc" ? "asc" : "desc"));
                  }}
                >
                  PnL
                </button>
                <button
                  className="text-left text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)] hover:text-white"
                  onClick={() => {
                    setSortKey("weight");
                    setSortDir((prev) => (sortKey === "weight" && prev === "desc" ? "asc" : "desc"));
                  }}
                >
                  Weight
                </button>
                <div>Today</div>
              </div>
              {sortedHoldings.map((entry) => {
                const holding = entry.holding;
                const account = accounts.find((acc) => acc.id === holding.accountId);
                const stock = entry.stock;
                const quote = entry.quote;
                const currentPrice = entry.price;
                const changePct = quote?.changePercent ?? stock?.changePct ?? null;
                const marketValue = entry.marketValue;
                const costBasis = entry.costBasis;
                const pnlValue = entry.pnlValue;
                const pnlPct = costBasis > 0 ? (pnlValue / costBasis) * 100 : 0;
                const weightPct = totalMarketValue > 0 ? (entry.marketValueKrw / totalMarketValue) * 100 : 0;
                const market = stock?.market ?? (holding.currency === "KRW" ? "KR" : "US");
                const displayCurrency = entry.rate ? "KRW" : holding.currency;
                const displayMarketValue = entry.rate ? entry.marketValueKrw : marketValue;
                const displayCostBasis = entry.rate ? entry.costBasisKrw : costBasis;
                const displayPnl = entry.rate ? entry.pnlKrw : pnlValue;
                const isEditing = editingId === holding.id;
                const draft = drafts[holding.id];
                return (
                  <div
                    key={holding.id}
                    className="grid grid-cols-[1.2fr_1.2fr_1.2fr_1.2fr_0.7fr_1fr_1.2fr_0.8fr_0.7fr] gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div>
                      {isEditing ? (
                        <Select
                          value={draft?.accountId ?? holding.accountId}
                          options={accountOptions}
                          onChange={(value) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [holding.id]: {
                                ...(prev[holding.id] ?? {
                                  accountId: holding.accountId,
                                  stockId: holding.stockId,
                                  avgPrice: String(holding.avgPrice),
                                  qty: String(holding.qty),
                                  countryLabel: holding.countryLabel ?? "",
                                  sectorLabel: holding.sectorLabel ?? ""
                                }),
                                accountId: value
                              }
                            }))
                          }
                          buttonClassName="px-2 py-1 text-xs"
                        />
                      ) : (
                        <div className="text-sm">{account?.brokerName ?? "-"}</div>
                      )}
                      <div className="mt-1 text-[10px] text-[var(--ink-1)]">{account?.countryType}</div>
                    </div>
                    <div>
                      {isEditing ? (
                        <Select
                          value={draft?.stockId ?? holding.stockId}
                          options={stockOptions}
                          onChange={(value) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [holding.id]: {
                                ...(prev[holding.id] ?? {
                                  accountId: holding.accountId,
                                  stockId: holding.stockId,
                                  avgPrice: String(holding.avgPrice),
                                  qty: String(holding.qty),
                                  countryLabel: holding.countryLabel ?? "",
                                  sectorLabel: holding.sectorLabel ?? ""
                                }),
                                stockId: value
                              }
                            }))
                          }
                          buttonClassName="px-2 py-1 text-xs"
                        />
                      ) : (
                        <div className="text-sm">
                          {stock?.label ?? holding.symbolKey ?? "-"}{" "}
                          <span className="text-[var(--ink-1)]">({stock?.symbol ?? holding.symbolKey ?? "-"})</span>
                        </div>
                      )}
                    </div>
                    <div className={blurClass}>
                      <div>{formatCurrency(currentPrice, holding.currency)}</div>
                      <div className="text-[10px] text-[var(--ink-1)]">
                        {formatCurrency(displayMarketValue, displayCurrency)}
                      </div>
                      {entry.rate ? (
                        <div className="text-[10px] text-[var(--ink-1)]">
                          {formatCurrency(marketValue, "USD")}
                        </div>
                      ) : null}
                    </div>
                    <div className={blurClass}>
                      {isEditing ? (
                        <div>
                          <input
                            className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                            value={draft?.avgPrice ?? String(holding.avgPrice)}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [holding.id]: {
                                  ...(prev[holding.id] ?? {
                                    accountId: holding.accountId,
                                    stockId: holding.stockId,
                                    avgPrice: String(holding.avgPrice),
                                    qty: String(holding.qty),
                                  countryLabel: holding.countryLabel ?? "",
                                  sectorLabel: holding.sectorLabel ?? ""
                                  }),
                                  avgPrice: event.target.value
                                }
                              }))
                            }
                            onBlur={(event) => {
                              const normalized = formatNumber(parseNumber(event.target.value), market === "KR" ? 0 : 2);
                              setDrafts((prev) => ({
                                ...prev,
                                [holding.id]: {
                                  ...(prev[holding.id] ?? {
                                    accountId: holding.accountId,
                                    stockId: holding.stockId,
                                    avgPrice: String(holding.avgPrice),
                                    qty: String(holding.qty),
                                  countryLabel: holding.countryLabel ?? "",
                                  sectorLabel: holding.sectorLabel ?? ""
                                  }),
                                  avgPrice: normalized
                                }
                              }));
                            }}
                          />
                        </div>
                      ) : (
                        <div>{formatCurrency(holding.avgPrice, holding.currency)}</div>
                      )}
                      <div className="text-[10px] text-[var(--ink-1)]">
                        {formatCurrency(displayCostBasis, displayCurrency)}
                      </div>
                      {entry.rate ? (
                        <div className="text-[10px] text-[var(--ink-1)]">
                          {formatCurrency(costBasis, "USD")}
                        </div>
                      ) : null}
                    </div>
                    <div className={blurClass}>
                      {isEditing ? (
                        <input
                          className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                          value={draft?.qty ?? String(holding.qty)}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [holding.id]: {
                                ...(prev[holding.id] ?? {
                                  accountId: holding.accountId,
                                  stockId: holding.stockId,
                                  avgPrice: String(holding.avgPrice),
                                  qty: String(holding.qty),
                                  countryLabel: holding.countryLabel ?? "",
                                  sectorLabel: holding.sectorLabel ?? ""
                                }),
                                qty: event.target.value
                              }
                            }))
                          }
                          onBlur={(event) => {
                            const normalized = formatNumber(parseNumber(event.target.value), 0);
                            setDrafts((prev) => ({
                              ...prev,
                              [holding.id]: {
                                ...(prev[holding.id] ?? {
                                  accountId: holding.accountId,
                                  stockId: holding.stockId,
                                  avgPrice: String(holding.avgPrice),
                                  qty: String(holding.qty),
                                  countryLabel: holding.countryLabel ?? "",
                                  sectorLabel: holding.sectorLabel ?? ""
                                }),
                                qty: normalized
                              }
                            }));
                          }}
                        />
                      ) : (
                        <div>{formatNumber(holding.qty, 0)}</div>
                      )}
                    </div>
                    <div>
                      {isEditing ? (
                        <div className="space-y-1">
                          <input
                            className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                            placeholder="Country (KR/US/CN...)"
                            value={draft?.countryLabel ?? holding.countryLabel ?? ""}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [holding.id]: {
                                  ...(prev[holding.id] ?? {
                                    accountId: holding.accountId,
                                    stockId: holding.stockId,
                                    avgPrice: String(holding.avgPrice),
                                    qty: String(holding.qty),
                                  countryLabel: holding.countryLabel ?? "",
                                  sectorLabel: holding.sectorLabel ?? "",
                                    countryLabel: holding.countryLabel ?? "",
                                    sectorLabel: holding.sectorLabel ?? ""
                                  }),
                                  countryLabel: event.target.value
                                }
                              }))
                            }
                          />
                          <input
                            className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                            placeholder="Sector (AI, Energy...)"
                            value={draft?.sectorLabel ?? holding.sectorLabel ?? ""}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [holding.id]: {
                                  ...(prev[holding.id] ?? {
                                    accountId: holding.accountId,
                                    stockId: holding.stockId,
                                    avgPrice: String(holding.avgPrice),
                                    qty: String(holding.qty),
                                  countryLabel: holding.countryLabel ?? "",
                                  sectorLabel: holding.sectorLabel ?? "",
                                    countryLabel: holding.countryLabel ?? "",
                                    sectorLabel: holding.sectorLabel ?? ""
                                  }),
                                  sectorLabel: event.target.value
                                }
                              }))
                            }
                          />
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1 text-[10px] text-[var(--ink-1)]">
                          <span className="rounded-full border border-white/10 px-2 py-[1px]">
                            {holding.countryLabel || "—"}
                          </span>
                          <span className="rounded-full border border-white/10 px-2 py-[1px]">
                            {holding.sectorLabel || "—"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className={blurClass}>
                      <div className={displayPnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                        {displayPnl >= 0 ? "+" : ""}
                        {formatCurrency(Math.abs(displayPnl), displayCurrency)}
                      </div>
                      <div className="text-[10px] text-[var(--ink-1)]">
                        {pnlPct >= 0 ? "+" : ""}
                        {pnlPct.toFixed(2)}%
                      </div>
                    </div>
                    <div className={blurClass}>
                      {formatNumber(weightPct, 2)}%
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={
                          changePct !== null && changePct !== undefined && changePct >= 0
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }
                      >
                        {changePct === null || changePct === undefined
                          ? "-"
                          : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}
                      </span>
                      <button
                        className="text-[10px] text-[var(--ink-1)] hover:text-[var(--accent-1)]"
                        onClick={() => {
                          if (isEditing) return;
                          setEditingId(holding.id);
                          setDrafts((prev) => ({
                            ...prev,
                            [holding.id]: {
                              accountId: holding.accountId,
                              stockId: holding.stockId,
                              avgPrice: String(holding.avgPrice),
                              qty: String(holding.qty),
                                  countryLabel: holding.countryLabel ?? "",
                                  sectorLabel: holding.sectorLabel ?? "",
                              countryLabel: holding.countryLabel ?? "",
                              sectorLabel: holding.sectorLabel ?? ""
                            }
                          }));
                        }}
                        aria-label="Edit holding"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {isEditing ? (
                        <>
                          <button
                            className="text-[10px] text-emerald-300"
                            onClick={() => {
                              const nextDraft = drafts[holding.id];
                              if (!nextDraft) return;
                              const nextAvg = parseNumber(nextDraft.avgPrice);
                              const nextQty = parseNumber(nextDraft.qty);
                              const nextStock = stocks.find((item) => item.id === nextDraft.stockId);
                              const nextSymbolKey = normalizeSymbol(nextStock?.symbol ?? holding.symbolKey);
                              setHoldings((prev) =>
                                prev.map((entry) =>
                                  entry.id === holding.id
                                    ? {
                                        ...entry,
                                        accountId: nextDraft.accountId,
                                        stockId: nextDraft.stockId,
                                        symbolKey: nextSymbolKey,
                                        avgPrice: nextAvg,
                                        qty: nextQty,
                                        countryLabel: nextDraft.countryLabel?.trim() || undefined,
                                        sectorLabel: nextDraft.sectorLabel?.trim() || undefined
                                      }
                                    : entry
                                )
                              );
                              setEditingId(null);
                            }}
                            aria-label="Save holding"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            className="text-[10px] text-[var(--ink-1)]"
                            onClick={() => setEditingId(null)}
                            aria-label="Cancel edit"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : null}
                      <button
                        className="text-[10px] text-[var(--ink-1)] hover:text-[var(--accent-2)]"
                        onClick={() => {
                          setPendingDelete(holding);
                          setDeleteConfirmOpen(true);
                        }}
                        aria-label="Delete holding"
                      >
                        X
                      </button>
                    </div>
                  </div>
                );
              })}
              {activeHoldings.length === 0 ? <div className="text-sm text-[var(--ink-1)]">No holdings yet.</div> : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <DonutCard title="Sector Weight (KRW)" data={sectorData} />
            <DonutCard title="Country Exposure (KRW)" data={countryData} />
          </div>
        </div>
      </div>

      <Modal
        open={accountsOpen}
        title="Manage Accounts"
        onClose={() => setAccountsOpen(false)}
        actions={
          <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setAccountsOpen(false)}>
            Close
          </button>
        }
      >
        <div className="space-y-3">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                  value={account.brokerName}
                  onChange={(event) =>
                    setAccounts((prev) =>
                      prev.map((entry) =>
                        entry.id === account.id ? { ...entry, brokerName: event.target.value } : entry
                      )
                    )
                  }
                />
                <Select
                  value={account.countryType}
                  options={countryOptions}
                  onChange={(value) =>
                    setAccounts((prev) =>
                      prev.map((entry) =>
                        entry.id === account.id ? { ...entry, countryType: value as "KR" | "US" } : entry
                      )
                    )
                  }
                  buttonClassName="px-2 py-1 text-xs"
                />
              </div>
              <input
                className="mt-2 w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                value={account.memo ?? ""}
                placeholder="Memo"
                onChange={(event) =>
                  setAccounts((prev) =>
                    prev.map((entry) => (entry.id === account.id ? { ...entry, memo: event.target.value } : entry))
                  )
                }
              />
              <div className="mt-2 text-right">
                <button
                  className="text-xs text-[var(--ink-1)]"
                  onClick={() => setAccounts((prev) => prev.filter((entry) => entry.id !== account.id))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-[var(--ink-1)]"
            onClick={() =>
              setAccounts((prev) => [
                ...prev,
                { id: crypto.randomUUID(), brokerName: "New Broker", countryType: "KR", memo: "" }
              ])
            }
          >
            Add Account
          </button>
        </div>
      </Modal>

      <Modal
        open={tradeOpen}
        title="Trade"
        onClose={() => setTradeOpen(false)}
        actions={
          <>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setTradeOpen(false)}>
              Cancel
            </button>
            <button className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black" onClick={applyTrade}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="block text-xs uppercase tracking-wide">
            Account
            <Select
              value={tradeForm.accountId}
              options={accountOptions}
              onChange={(value) => setTradeForm((prev) => ({ ...prev, accountId: value }))}
              className="mt-1"
            />
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Stock
            <Select
              value={tradeForm.stockId}
              options={stockOptions}
              onChange={(value) => setTradeForm((prev) => ({ ...prev, stockId: value }))}
              className="mt-1"
            />
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Side
            <div className="mt-1 flex gap-2">
              {(["BUY", "SELL"] as const).map((side) => (
                <button
                  key={side}
                  className={`rounded-full border px-4 py-2 text-xs ${
                    tradeForm.side === side ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10"
                  }`}
                  onClick={() => setTradeForm((prev) => ({ ...prev, side }))}
                  type="button"
                >
                  {side}
                </button>
              ))}
            </div>
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Price
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              type="number"
              value={tradeForm.price}
              onChange={(event) => setTradeForm((prev) => ({ ...prev, price: event.target.value }))}
            />
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Quantity
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              type="number"
              value={tradeForm.qty}
              onChange={(event) => setTradeForm((prev) => ({ ...prev, qty: event.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete Holding"
        description="??蹂댁쑀 醫낅ぉ????젣?좉퉴??"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (pendingDelete) {
            setHoldings((prev) => prev.filter((entry) => entry.id !== pendingDelete.id));
          }
          setPendingDelete(null);
          setDeleteConfirmOpen(false);
        }}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteConfirmOpen(false);
        }}
      />
    </AppShell>
  );
}

type DonutDatum = {
  label: string;
  value: number;
};

function DonutCard({ title, data }: { title: string; data: DonutDatum[] }) {
  const palette = [
    "#6EE7B7",
    "#93C5FD",
    "#F9A8D4",
    "#FCD34D",
    "#A5B4FC",
    "#FDBA74",
    "#67E8F9"
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">{title}</div>
      <div className="mt-3 flex items-center gap-4">
        <DonutChart data={data} palette={palette} />
        <div className="space-y-2 text-xs">
          {data.length ? (
            data.map((item, index) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
                <span className="text-[var(--ink-1)]">{item.label}</span>
                <span className="text-white/80">{item.value.toLocaleString()}</span>
              </div>
            ))
          ) : (
            <div className="text-[var(--ink-1)]">No data</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DonutChart({ data, palette }: { data: DonutDatum[]; palette: string[] }) {
  const size = 140;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return (
    <svg width={size} height={size} className="shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        {data.map((item, index) => {
          const value = total > 0 ? (item.value / total) * circumference : 0;
          const dasharray = `${value} ${circumference - value}`;
          const dashoffset = -offset;
          offset += value;
          return (
            <circle
              key={item.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={palette[index % palette.length]}
              strokeWidth={stroke}
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
              strokeLinecap="round"
            />
          );
        })}
      </g>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-white text-xs">
        {total > 0 ? "100%" : "0%"}
      </text>
    </svg>
  );
}








