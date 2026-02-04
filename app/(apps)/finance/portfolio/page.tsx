"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../(shared)/components/AppShell";
import { Modal } from "../../../(shared)/components/Modal";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import { Select } from "../../../(shared)/components/Select";
import type { BrokerAccount, Holding, StockItem, Trade } from "../../../(shared)/types/finance";
import { loadFinanceState, normalizeSymbol, saveAccounts, saveFinanceSettings, saveHoldings, saveTrades } from "../../../(shared)/lib/finance";
import { loadState, saveState } from "../../../(shared)/lib/storage";
import { useQuotes } from "../../../../src/lib/quotes/useQuotes";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

const PORTFOLIO_LABEL_OPTIONS_KEY = "lifnux.finance.portfolio.labels.v100";
const PORTFOLIO_HISTORY_KEY = "lifnux.finance.portfolio.history.v100";

type PortfolioLabelOptions = {
  countries: string[];
  sectors: string[];
};

type PortfolioHistoryPoint = {
  date: string;
  totalKrw: number;
};

const isLikelySeededTwoYearHistory = (history: PortfolioHistoryPoint[]) => {
  if (history.length !== 730) return false;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(`${sorted[i - 1].date}T00:00:00Z`).getTime();
    const curr = new Date(`${sorted[i].date}T00:00:00Z`).getTime();
    if (curr - prev !== 86400000) return false;
  }
  return true;
};

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
  const [pendingDelete, setPendingDelete] = useState<Holding | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [labelOptions, setLabelOptions] = useState<PortfolioLabelOptions>({ countries: ["KR", "US"], sectors: [] });
  const [history, setHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [newCountryLabel, setNewCountryLabel] = useState("");
  const [newSectorLabel, setNewSectorLabel] = useState("");
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
  const [sortKey, setSortKey] = useState<"weight" | "pnl" | "value" | "cost" | "account" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const data = loadFinanceState();
    setAccounts(data.accounts);
    setHoldings(data.holdings);
    setStocks(data.stocks);
    setSettings(data.settings);
    setTrades(data.trades);
    const persistedOptions = loadState<PortfolioLabelOptions>(PORTFOLIO_LABEL_OPTIONS_KEY, {
      countries: ["KR", "US"],
      sectors: []
    });
    const countrySet = new Set(persistedOptions.countries.map((entry) => entry.trim()).filter(Boolean));
    const sectorSet = new Set(persistedOptions.sectors.map((entry) => entry.trim()).filter(Boolean));
    data.holdings.forEach((holding) => {
      if (holding.countryLabel?.trim()) countrySet.add(holding.countryLabel.trim());
      if (holding.sectorLabel?.trim()) sectorSet.add(holding.sectorLabel.trim());
    });
    setLabelOptions({
      countries: Array.from(countrySet),
      sectors: Array.from(sectorSet)
    });
    const loadedHistory = loadState<PortfolioHistoryPoint[]>(PORTFOLIO_HISTORY_KEY, []);
    setHistory(isLikelySeededTwoYearHistory(loadedHistory) ? [] : loadedHistory);
    setReady(true);
  }, []);

  useEffect(() => {
    void fetchFxRate();
    const timer = window.setInterval(() => {
      void fetchFxRate();
    }, 30000);
    return () => window.clearInterval(timer);
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
  useEffect(() => {
    if (!ready) return;
    saveState(PORTFOLIO_LABEL_OPTIONS_KEY, labelOptions);
  }, [labelOptions, ready]);
  useEffect(() => {
    if (!ready) return;
    saveState(PORTFOLIO_HISTORY_KEY, history);
  }, [history, ready]);

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
  const useFx = !!fxRate;
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
    let costBasisKrw = 0;
    derivedHoldings.forEach((entry) => {
      if (entry.holding.currency === "KRW") {
        krw += entry.marketValue;
      } else {
        usd += entry.marketValue;
      }
      costBasisKrw += entry.costBasisKrw;
    });
    const totalKrw = useFx && fxRate ? krw + usd * fxRate : null;
    const pnlKrw = totalKrw !== null ? totalKrw - costBasisKrw : null;
    const pnlPct = pnlKrw !== null && costBasisKrw > 0 ? (pnlKrw / costBasisKrw) * 100 : null;
    return { krw, usd, totalKrw, costBasisKrw, pnlKrw, pnlPct };
  }, [derivedHoldings, fxRate, useFx]);

  useEffect(() => {
    if (!ready || totals.totalKrw === null || totals.totalKrw <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    setHistory((prev) => {
      const next = [...prev];
      const index = next.findIndex((item) => item.date === today);
      const point: PortfolioHistoryPoint = { date: today, totalKrw: totals.totalKrw as number };
      if (index >= 0) {
        next[index] = point;
      } else {
        next.push(point);
      }
      next.sort((a, b) => a.date.localeCompare(b.date));
      return next;
    });
  }, [ready, totals.totalKrw]);

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
  const countryLabelOptions = useMemo(
    () =>
      labelOptions.countries
        .filter((entry) => entry.trim().length > 0)
        .map((entry) => ({ value: entry, label: entry })),
    [labelOptions.countries]
  );
  const sectorLabelOptions = useMemo(
    () =>
      labelOptions.sectors
        .filter((entry) => entry.trim().length > 0)
        .map((entry) => ({ value: entry, label: entry })),
    [labelOptions.sectors]
  );

  const addCountryLabelOption = () => {
    const value = newCountryLabel.trim();
    if (!value) return;
    setLabelOptions((prev) => ({
      ...prev,
      countries: prev.countries.includes(value) ? prev.countries : [...prev.countries, value]
    }));
    if (editingId) {
      setDrafts((prev) => ({
        ...prev,
        [editingId]: { ...prev[editingId], countryLabel: value }
      }));
    }
    setNewCountryLabel("");
  };

  const addSectorLabelOption = () => {
    const value = newSectorLabel.trim();
    if (!value) return;
    setLabelOptions((prev) => ({
      ...prev,
      sectors: prev.sectors.includes(value) ? prev.sectors : [...prev.sectors, value]
    }));
    if (editingId) {
      setDrafts((prev) => ({
        ...prev,
        [editingId]: { ...prev[editingId], sectorLabel: value }
      }));
    }
    setNewSectorLabel("");
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
      if (sortKey === "cost") return (a.costBasisKrw - b.costBasisKrw) * dir;
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
  const editingHolding = useMemo(
    () => (editingId ? holdings.find((entry) => entry.id === editingId) ?? null : null),
    [editingId, holdings]
  );
  const editingDraft = editingId ? drafts[editingId] : undefined;

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

  const openEditHolding = (holding: Holding) => {
    setEditingId(holding.id);
    setDrafts((prev) => ({
      ...prev,
      [holding.id]: {
        accountId: holding.accountId,
        stockId: holding.stockId ?? "",
        avgPrice: String(holding.avgPrice),
        qty: String(holding.qty),
        countryLabel: holding.countryLabel ?? "",
        sectorLabel: holding.sectorLabel ?? ""
      }
    }));
    setNewCountryLabel("");
    setNewSectorLabel("");
    setEditModalOpen(true);
  };

  const saveHoldingEdit = () => {
    if (!editingId) return;
    const nextDraft = drafts[editingId];
    const target = holdings.find((entry) => entry.id === editingId);
    if (!nextDraft || !target) return;
    const nextAvg = parseNumber(nextDraft.avgPrice);
    const nextQty = parseNumber(nextDraft.qty);
    if (!(nextAvg >= 0) || !(nextQty > 0)) return;
    const nextStock = stocks.find((item) => item.id === nextDraft.stockId);
    const nextSymbolKey = normalizeSymbol(nextStock?.symbol ?? target.symbolKey);
    setHoldings((prev) =>
      prev.map((entry) =>
        entry.id === editingId
          ? {
              ...entry,
              accountId: nextDraft.accountId,
              stockId: nextDraft.stockId || undefined,
              symbolKey: nextSymbolKey,
              avgPrice: nextAvg,
              qty: nextQty,
              countryLabel: nextDraft.countryLabel?.trim() || undefined,
              sectorLabel: nextDraft.sectorLabel?.trim() || undefined
            }
          : entry
      )
    );
    const normalizedCountry = nextDraft.countryLabel?.trim();
    const normalizedSector = nextDraft.sectorLabel?.trim();
    if (normalizedCountry) {
      setLabelOptions((prev) => ({
        ...prev,
        countries: prev.countries.includes(normalizedCountry) ? prev.countries : [...prev.countries, normalizedCountry]
      }));
    }
    if (normalizedSector) {
      setLabelOptions((prev) => ({
        ...prev,
        sectors: prev.sectors.includes(normalizedSector) ? prev.sectors : [...prev.sectors, normalizedSector]
      }));
    }
    setEditModalOpen(false);
    setEditingId(null);
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
          <div className="sticky top-3 z-10 mb-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">Total Portfolio</div>
                <div className={`text-3xl font-semibold ${blurClass}`}>
                  {formatCurrency(totals.totalKrw ?? totals.krw, "KRW")}
                </div>
                <div className={`mt-1 text-xs text-white/85 ${blurClass}`}>
                  KRW {formatCurrency(totals.krw, "KRW")} / USD {formatCurrency(totals.usd, "USD")}
                </div>
              </div>
              <div className={`text-right ${blurClass}`}>
                <div
                  className={`text-base ${
                    totals.pnlKrw !== null && totals.pnlKrw >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {totals.pnlKrw !== null
                    ? `${totals.pnlKrw >= 0 ? "+" : "-"}${formatCurrency(Math.abs(totals.pnlKrw), "KRW")}`
                    : "-"}
                </div>
                <div className="text-[10px] text-[var(--ink-1)]">
                  <span
                    className={`text-lg font-semibold ${
                      totals.pnlPct !== null && totals.pnlPct >= 0 ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {totals.pnlPct !== null ? `${totals.pnlPct >= 0 ? "+" : ""}${totals.pnlPct.toFixed(2)}%` : "FX not ready"}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--ink-1)]">
                  {useFx && fxRate ? `FX ${formatCurrency(fxRate, "KRW")}` : "FX not applied"}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Holdings</div>
            <div className="flex items-center gap-3 text-xs text-[var(--ink-1)]">
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={openTrade}>
                Trade
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={() => setAccountsOpen(true)}>
                Manage Accounts
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={() => setHistoryOpen(true)}>
                Asset History
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
            <div className="min-w-[1080px] space-y-2 text-sm">
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
                <button
                  className="text-left text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)] hover:text-white"
                  onClick={() => {
                    setSortKey("cost");
                    setSortDir((prev) => (sortKey === "cost" && prev === "desc" ? "asc" : "desc"));
                  }}
                >
                  Avg / Cost
                </button>
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
                const displayCurrency = entry.rate ? "KRW" : holding.currency;
                const displayMarketValue = entry.rate ? entry.marketValueKrw : marketValue;
                const displayCostBasis = entry.rate ? entry.costBasisKrw : costBasis;
                const displayPnl = entry.rate ? entry.pnlKrw : pnlValue;
                return (
                  <div
                    key={holding.id}
                    className="grid grid-cols-[1.2fr_1.2fr_1.2fr_1.2fr_0.7fr_1fr_1.2fr_0.8fr_0.7fr] gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm">{account?.brokerName ?? "-"}</div>
                      <div className="mt-1 text-[10px] text-[var(--ink-1)]">{account?.countryType}</div>
                    </div>
                    <div>
                      <div className="text-sm">
                        {stock?.label ?? holding.symbolKey ?? "-"}{" "}
                        <span className="text-[var(--ink-1)]">({stock?.symbol ?? holding.symbolKey ?? "-"})</span>
                      </div>
                    </div>
                    <div className={blurClass}>
                      <div>{formatCurrency(currentPrice, holding.currency)}</div>
                      <div className="text-xs text-white/80">
                        {formatCurrency(displayMarketValue, displayCurrency)}
                      </div>
                      {entry.rate ? (
                        <div className="text-xs text-[var(--ink-1)]">
                          {formatCurrency(marketValue, "USD")}
                        </div>
                      ) : null}
                    </div>
                    <div className={blurClass}>
                      <div>{formatCurrency(holding.avgPrice, holding.currency)}</div>
                      <div className="text-xs text-white/80">
                        {formatCurrency(displayCostBasis, displayCurrency)}
                      </div>
                      {entry.rate ? (
                        <div className="text-xs text-[var(--ink-1)]">
                          {formatCurrency(costBasis, "USD")}
                        </div>
                      ) : null}
                    </div>
                    <div className={blurClass}>
                      <div>{formatNumber(holding.qty, 0)}</div>
                    </div>
                    <div>
                      <div className="flex flex-wrap gap-1 text-[10px] text-[var(--ink-1)]">
                        <span className="rounded-full border border-white/10 px-2 py-[1px]">
                          {holding.countryLabel || "—"}
                        </span>
                        <span className="rounded-full border border-white/10 px-2 py-[1px]">
                          {holding.sectorLabel || "—"}
                        </span>
                      </div>
                    </div>
                    <div className={blurClass}>
                      <div className={displayPnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                        {displayPnl >= 0 ? "+" : ""}
                        {formatCurrency(Math.abs(displayPnl), displayCurrency)}
                      </div>
                      <div className={`text-xs ${pnlPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
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
                        onClick={() => openEditHolding(holding)}
                        aria-label="Edit holding"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
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
        open={editModalOpen}
        title="Edit Holding"
        onClose={() => {
          setEditModalOpen(false);
          setEditingId(null);
        }}
        actions={
          <>
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={() => {
                setEditModalOpen(false);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
            <button className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black" onClick={saveHoldingEdit}>
              Save
            </button>
          </>
        }
      >
        {editingHolding && editingDraft ? (
          <div className="space-y-3 text-sm">
            <label className="block text-xs uppercase tracking-wide">
              Account
              <Select
                className="mt-1"
                value={editingDraft.accountId}
                options={accountOptions}
                onChange={(value) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [editingHolding.id]: { ...prev[editingHolding.id], accountId: value }
                  }))
                }
              />
            </label>
            <label className="block text-xs uppercase tracking-wide">
              Stock
              <Select
                className="mt-1"
                value={editingDraft.stockId}
                options={stockOptions}
                onChange={(value) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [editingHolding.id]: { ...prev[editingHolding.id], stockId: value }
                  }))
                }
              />
            </label>
            <label className="block text-xs uppercase tracking-wide">
              Avg Price
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={editingDraft.avgPrice}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [editingHolding.id]: { ...prev[editingHolding.id], avgPrice: event.target.value }
                  }))
                }
              />
            </label>
            <label className="block text-xs uppercase tracking-wide">
              Quantity
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={editingDraft.qty}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [editingHolding.id]: { ...prev[editingHolding.id], qty: event.target.value }
                  }))
                }
              />
            </label>
            <label className="block text-xs uppercase tracking-wide">
              Country Label
              <Select
                className="mt-1"
                value={editingDraft.countryLabel}
                options={countryLabelOptions}
                onChange={(value) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [editingHolding.id]: { ...prev[editingHolding.id], countryLabel: value }
                  }))
                }
                placeholder="Select country label"
              />
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  value={newCountryLabel}
                  placeholder="Add new country label"
                  onChange={(event) => setNewCountryLabel(event.target.value)}
                />
                <button className="rounded-full border border-white/10 px-3 py-2 text-xs" onClick={addCountryLabelOption}>
                  Add
                </button>
              </div>
            </label>
            <label className="block text-xs uppercase tracking-wide">
              Sector Label
              <Select
                className="mt-1"
                value={editingDraft.sectorLabel}
                options={sectorLabelOptions}
                onChange={(value) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [editingHolding.id]: { ...prev[editingHolding.id], sectorLabel: value }
                  }))
                }
                placeholder="Select sector label"
              />
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  value={newSectorLabel}
                  placeholder="Add new sector label"
                  onChange={(event) => setNewSectorLabel(event.target.value)}
                />
                <button className="rounded-full border border-white/10 px-3 py-2 text-xs" onClick={addSectorLabelOption}>
                  Add
                </button>
              </div>
            </label>
          </div>
        ) : null}
      </Modal>

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

      <Modal
        open={historyOpen}
        title="Asset History"
        onClose={() => setHistoryOpen(false)}
        panelClassName="!w-[96vw] !max-w-[1400px] min-h-[70vh] pt-8"
        titleClassName="text-3xl font-semibold tracking-tight"
        contentClassName="text-base md:text-lg"
        closeButtonClassName="p-2 text-base text-white/80 hover:text-white"
        actions={
          <button className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/85" onClick={() => setHistoryOpen(false)}>
            Close
          </button>
        }
      >
        <PortfolioHistoryChart
          data={history}
          currentPnlPct={totals.pnlPct}
          onDeleteLog={(date) => setHistory((prev) => prev.filter((entry) => entry.date !== date))}
        />
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

function PortfolioHistoryChart({
  data,
  currentPnlPct,
  onDeleteLog
}: {
  data: PortfolioHistoryPoint[];
  currentPnlPct: number | null;
  onDeleteLog: (date: string) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logQuery, setLogQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  if (!data.length) {
    return <div className="text-sm text-[var(--ink-1)]">No history yet.</div>;
  }

  const snapshots = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const filled = (() => {
    if (!snapshots.length) return [] as PortfolioHistoryPoint[];
    const result: PortfolioHistoryPoint[] = [];
    const start = new Date(`${snapshots[0].date}T00:00:00Z`);
    const end = new Date(`${snapshots[snapshots.length - 1].date}T00:00:00Z`);
    let pointer = 0;
    let lastKnown: number | null = null;
    const cursor = new Date(start);

    while (cursor <= end) {
      const dateKey = cursor.toISOString().slice(0, 10);
      while (pointer < snapshots.length && snapshots[pointer].date <= dateKey) {
        lastKnown = snapshots[pointer].totalKrw;
        pointer += 1;
      }
      if (lastKnown !== null) {
        result.push({ date: dateKey, totalKrw: lastKnown });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  })();

  if (!filled.length) {
    return <div className="text-sm text-[var(--ink-1)]">No history yet.</div>;
  }

  const sorted = filled;
  const width = 1600;
  const height = 540;
  const paddingLeft = 280;
  const paddingRight = 80;
  const paddingTop = 30;
  const paddingBottom = 130;
  const selectedIndex = hoveredIndex !== null && hoveredIndex < sorted.length ? hoveredIndex : -1;
  const selected = selectedIndex >= 0 ? sorted[selectedIndex] : null;
  const previous = selectedIndex > 0 ? sorted[selectedIndex - 1] : null;
  const fallbackSelected = sorted[sorted.length - 1];
  const byDate = new Map(sorted.map((entry) => [entry.date, entry]));
  const indexByDate = new Map(sorted.map((entry, index) => [entry.date, index]));
  const snapshotLogs = [...snapshots].sort((a, b) => b.date.localeCompare(a.date));
  const filteredSnapshotLogs = snapshotLogs.filter((entry) => entry.date.includes(logQuery.trim()));

  const formatKrw = (value: number) => `₩${Math.round(value).toLocaleString("ko-KR")}`;
  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : "-";
    const abs = Math.abs(value);
    if (abs > 999.99) return `${sign}999.99%+`;
    return `${sign}${abs.toFixed(2)}%`;
  };
  const formatCompactUnit = (value: number) =>
    new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(Math.round(value));

  const values = sorted.map((entry) => entry.totalKrw);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const yTicks = 4;
  const xTicks = Array.from(
    new Set(sorted.length > 2 ? [0, Math.floor((sorted.length - 1) / 2), sorted.length - 1] : [0, sorted.length - 1])
  );

  const toX = (index: number) => {
    if (sorted.length === 1) return width / 2;
    return paddingLeft + (index / (sorted.length - 1)) * (width - paddingLeft - paddingRight);
  };
  const toY = (value: number) =>
    paddingTop + ((max - value) / range) * (height - paddingTop - paddingBottom);
  const points = sorted.map((entry, index) => `${toX(index)},${toY(entry.totalKrw)}`).join(" ");
  const tooltipWidth = 360;
  const tooltipHeight = 120;
  const selectedX = selected ? toX(selectedIndex) : 0;
  const selectedY = selected ? toY(selected.totalKrw) : 0;
  const tooltipX = Math.max(12, Math.min(selectedX + 14, width - tooltipWidth - 12));
  const tooltipY = Math.max(12, Math.min(selectedY - tooltipHeight - 14, height - tooltipHeight - 12));
  const selectedValueText = selected ? formatKrw(selected.totalKrw) : "";
  const selectedValueClass = selectedValueText.length > 13 ? "text-[22px]" : "text-[28px]";
  const selectedCompact = selected && selectedValueText.length > 13 ? `${formatCompactUnit(selected.totalKrw)} KRW` : null;
  const rangeError = (() => {
    if (!showDetail) return null;
    if (!startDate || !endDate) return "시작일/종료일을 선택해 주세요.";
    if (startDate > endDate) return "시작일은 종료일보다 늦을 수 없습니다.";
    if (!byDate.has(startDate) || !byDate.has(endDate)) return "선택한 기간에 총 자산 데이터가 없습니다.";
    const pointsInRange = sorted.filter((entry) => entry.date >= startDate && entry.date <= endDate);
    if (!pointsInRange.length) return "선택한 기간에 총 자산 데이터가 없습니다.";
    return null;
  })();
  const rangeSummary = (() => {
    if (rangeError) return null;
    const start = byDate.get(startDate);
    const end = byDate.get(endDate);
    if (!start || !end) return null;
    const diff = end.totalKrw - start.totalKrw;
    const assetChangePct = start.totalKrw > 0 ? (diff / start.totalKrw) * 100 : 0;
    return { start, end, diff, assetChangePct };
  })();

  const defaultStartDate = (() => {
    const base = new Date(fallbackSelected.date);
    base.setDate(base.getDate() - 1);
    const candidate = base.toISOString().slice(0, 10);
    return candidate < sorted[0].date ? sorted[0].date : candidate;
  })();
  const dayChangePct =
    selected && previous && previous.totalKrw > 0 ? ((selected.totalKrw - previous.totalKrw) / previous.totalKrw) * 100 : null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[520px] w-full" onMouseLeave={() => setHoveredIndex(null)}>
          {Array.from({ length: yTicks }).map((_, tickIndex) => {
            const ratio = tickIndex / (yTicks - 1);
            const value = max - range * ratio;
            const y = toY(value);
            return (
              <g key={`y-tick-${tickIndex}`}>
                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                <text x={paddingLeft - 18} y={y + 6} textAnchor="end" className="fill-white text-[15px] font-semibold">
                  {formatKrw(value)}
                </text>
              </g>
            );
          })}
          {xTicks.map((tickIndex) => {
            const x = toX(tickIndex);
            const anchor = tickIndex === xTicks[0] ? "start" : tickIndex === xTicks[xTicks.length - 1] ? "end" : "middle";
            return (
              <g key={`x-tick-${tickIndex}`}>
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={height - paddingBottom}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="1"
                />
                <text x={x} y={height - 16} textAnchor={anchor} className="fill-white text-[14px] font-semibold">
                  {sorted[tickIndex]?.date ?? ""}
                </text>
              </g>
            );
          })}
          <polyline points={points} fill="none" stroke="#7FE9CF" strokeWidth="2.2" />
          {sorted.map((entry, index) => {
            const x = toX(index);
            const y = toY(entry.totalKrw);
            const isActive = index === selectedIndex;
            return (
              <g key={entry.date}>
                <circle
                  cx={x}
                  cy={y}
                  r="8"
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseMove={() => setHoveredIndex(index)}
                />
                <circle cx={x} cy={y} r={isActive ? 3.5 : 2.2} fill={isActive ? "#93C5FD" : "rgba(147,197,253,0.65)"} />
              </g>
            );
          })}
          {selected ? (
            <foreignObject x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight}>
              <div
                xmlns="http://www.w3.org/1999/xhtml"
                className="h-full max-w-[360px] overflow-hidden rounded-xl border border-white/15 bg-black/90 px-3 py-2 text-white"
              >
                <div className="truncate text-xs text-white/75">{selected.date}</div>
                <div className={`truncate font-bold leading-tight ${selectedValueClass}`}>{selectedValueText}</div>
                {selectedCompact ? <div className="truncate text-[12px] text-white/60">{selectedCompact}</div> : null}
                <div className={`truncate text-[15px] ${dayChangePct !== null && dayChangePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {dayChangePct === null ? "전일 대비: -" : `전일 대비: ${formatPercent(dayChangePct)}`}
                </div>
              </div>
            </foreignObject>
          ) : null}
        </svg>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          className="rounded-full border border-white/10 px-4 py-2 text-base text-white/85 hover:text-white"
          onClick={() => setShowLogs((prev) => !prev)}
        >
          LOG
        </button>
        <button
          className="rounded-full border border-white/10 px-4 py-2 text-base text-white/85 hover:text-white"
          onClick={() => {
            if (!showDetail) {
              setStartDate(defaultStartDate);
              setEndDate(fallbackSelected.date);
            }
            setShowDetail((prev) => !prev);
          }}
        >
          DETAIL
        </button>
      </div>
      {showLogs ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-lg font-semibold uppercase tracking-[0.2em] text-white/95">History Log</div>
          <div className="mt-3">
            <input
              type="search"
              inputMode="numeric"
              placeholder="날짜 검색 (예: 2026-02 또는 2026-02-04)"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/45"
              value={logQuery}
              onChange={(event) => setLogQuery(event.target.value)}
            />
          </div>
          <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
            {filteredSnapshotLogs.length ? (
              filteredSnapshotLogs.map((entry) => (
                <div
                  key={entry.date}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="text-left text-sm text-white/80 hover:text-white"
                      onClick={() => {
                        const index = indexByDate.get(entry.date);
                        if (typeof index === "number") setHoveredIndex(index);
                      }}
                    >
                      {entry.date}
                    </button>
                    <div className="truncate text-base font-semibold text-white">{formatKrw(entry.totalKrw)}</div>
                  </div>
                  <button
                    type="button"
                    className="ml-3 rounded-full border border-rose-500/40 px-3 py-1 text-xs text-rose-200 hover:text-rose-100"
                    onClick={() => {
                      if (window.confirm(`${entry.date} 로그를 삭제할까요?`)) {
                        onDeleteLog(entry.date);
                      }
                    }}
                  >
                    삭제
                  </button>
                </div>
              ))
            ) : (
              <div className="text-sm text-[var(--ink-1)]">{snapshotLogs.length ? "검색 결과가 없습니다." : "로그가 없습니다."}</div>
            )}
          </div>
        </div>
      ) : null}
      {showDetail ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-base">
          <div className="text-lg font-semibold uppercase tracking-[0.28em] text-white/95">Range Detail</div>
          <div className="mt-3 grid gap-x-3 gap-y-4 md:grid-cols-2">
            <label className="text-base font-medium text-white/95">
              START DATE
              <input
                type="date"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-base"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="text-base font-medium text-white/95">
              END DATE
              <input
                type="date"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-base"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>
          {rangeError ? (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-base text-rose-200">
              {rangeError}
            </div>
          ) : rangeSummary ? (
            <div className="mt-4 space-y-3 text-lg text-white/90">
              <div className="flex flex-wrap items-baseline gap-2">
                기간 자산 변화{" "}
                <span className={`break-all text-xl font-semibold ${rangeSummary.diff >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {rangeSummary.diff >= 0 ? "+" : "-"}
                  {formatKrw(Math.abs(rangeSummary.diff))}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                기간 자산 증액률{" "}
                <span className={`break-all text-xl font-semibold ${rangeSummary.assetChangePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {formatPercent(rangeSummary.assetChangePct)}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-2">
                기간 투자 수익률{" "}
                <span className={`break-all text-xl font-semibold ${currentPnlPct !== null && currentPnlPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {currentPnlPct === null ? "-" : formatPercent(currentPnlPct)}
                </span>
              </div>
              <div className="text-base text-[var(--ink-1)]">
                {rangeSummary.start.date} ({formatKrw(rangeSummary.start.totalKrw)}) → {rangeSummary.end.date} ({formatKrw(rangeSummary.end.totalKrw)})
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}








