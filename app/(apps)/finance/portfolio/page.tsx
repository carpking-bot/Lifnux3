"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../(shared)/components/AppShell";
import { Modal } from "../../../(shared)/components/Modal";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import { Select } from "../../../(shared)/components/Select";
import type { BrokerAccount, CashBalance, Holding, LedgerRecord, StockItem, Trade } from "../../../(shared)/types/finance";
import {
  loadCashBalances,
  loadFinanceState,
  loadLedgerRecords,
  normalizeSymbol,
  saveAccounts,
  saveCashBalances,
  saveFinanceSettings,
  saveHoldings,
  saveLedgerRecords,
  saveTrades
} from "../../../(shared)/lib/finance";
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
  const [cashBalances, setCashBalances] = useState<CashBalance[]>([]);
  const [ledgerRecords, setLedgerRecords] = useState<LedgerRecord[]>([]);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
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
  const [labelEdits, setLabelEdits] = useState<{ country: Record<string, string>; sector: Record<string, string> }>({
    country: {},
    sector: {}
  });
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
    qty: "",
    fee: "",
    memo: ""
  });
  const [cashForm, setCashForm] = useState({
    accountId: "",
    direction: "DEPOSIT" as "DEPOSIT" | "WITHDRAW",
    amount: "",
    memo: ""
  });
  const [sortKey, setSortKey] = useState<"weight" | "pnl" | "value" | "cost" | "account" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [realizedRange, setRealizedRange] = useState<"MTD" | "YTD" | "ALL">("MTD");
  const [realizedDetailOpen, setRealizedDetailOpen] = useState(false);
  const [realizedDetailSortKey, setRealizedDetailSortKey] = useState<"price" | "time">("time");
  const [realizedDetailSortDir, setRealizedDetailSortDir] = useState<"asc" | "desc">("desc");
  const [ledgerFilters, setLedgerFilters] = useState({
    accountId: "ALL",
    type: "ALL" as "ALL" | "TRADE" | "CASHFLOW",
    side: "ALL" as "ALL" | "BUY" | "SELL",
    startDate: "",
    endDate: ""
  });

  useEffect(() => {
    const data = loadFinanceState();
    const normalizedAccounts = data.accounts.map((account) => ({
      ...account,
      currency: account.currency ?? (account.countryType === "US" ? "USD" : "KRW")
    }));
    setAccounts(normalizedAccounts);
    setHoldings(data.holdings);
    setStocks(data.stocks);
    setSettings(data.settings);
    setTrades(data.trades);
    const loadedCash = loadCashBalances();
    const loadedLedger = loadLedgerRecords();
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
    setCashBalances((prev) => {
      if (prev.length) return prev;
      const normalized = normalizedAccounts.length
        ? normalizedAccounts.map((account) => ({
            accountId: account.id,
            currency: account.currency ?? (account.countryType === "US" ? "USD" : "KRW"),
            balance: 0
          }))
        : [];
      return loadedCash.length ? loadedCash : normalized;
    });
    setLedgerRecords(loadedLedger);
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
    if (!accounts.length) return;
    setCashBalances((prev) => {
      const next = normalizeCashBalances(prev);
      const unchanged =
        prev.length === next.length &&
        prev.every(
          (entry, index) =>
            entry.accountId === next[index]?.accountId &&
            entry.currency === next[index]?.currency &&
            entry.balance === next[index]?.balance
        );
      return unchanged ? prev : next;
    });
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
    saveCashBalances(cashBalances);
  }, [cashBalances, ready]);
  useEffect(() => {
    if (!ready) return;
    saveLedgerRecords(ledgerRecords);
  }, [ledgerRecords, ready]);
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
      const marketValueKrw = isUsd ? (rate ? marketValue * rate : null) : marketValue;
      const costBasisKrw = isUsd ? (rate ? costBasis * rate : null) : costBasis;
      const pnlKrw = isUsd ? (rate ? pnlValue * rate : null) : pnlValue;
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

  const activeCashBalances = useMemo(() => {
    const accountIds = new Set(accounts.map((account) => account.id));
    return cashBalances.filter((entry) => accountIds.has(entry.accountId));
  }, [accounts, cashBalances]);

  const cashByAccount = useMemo(() => {
    return new Map(activeCashBalances.map((entry) => [entry.accountId, entry]));
  }, [activeCashBalances]);

  const cashRows = useMemo(() => {
    return accounts.map((account) => {
      const currency = account.currency ?? (account.countryType === "US" ? "USD" : "KRW");
      const balance = cashByAccount.get(account.id)?.balance ?? 0;
      const balanceKrw = currency === "USD" ? (useFx && fxRate ? balance * fxRate : null) : balance;
      return {
        kind: "cash" as const,
        account,
        currency,
        balance,
        balanceKrw,
        valueKrw: balanceKrw ?? 0
      };
    });
  }, [accounts, cashByAccount, fxRate, useFx]);

  const totals = useMemo(() => {
    let holdingsKrw = 0;
    let holdingsUsd = 0;
    let cashKrw = 0;
    let cashUsd = 0;
    let costBasisKrwPartial = 0;
    let holdingsMarketValueKrwPartial = 0;
    let hasUsdHoldings = false;
    derivedHoldings.forEach((entry) => {
      if (entry.holding.currency === "KRW") {
        holdingsKrw += entry.marketValue;
        holdingsMarketValueKrwPartial += entry.marketValue;
        costBasisKrwPartial += entry.costBasis;
      } else {
        holdingsUsd += entry.marketValue;
        hasUsdHoldings = true;
        if (entry.marketValueKrw !== null) holdingsMarketValueKrwPartial += entry.marketValueKrw;
        if (entry.costBasisKrw !== null) costBasisKrwPartial += entry.costBasisKrw;
      }
    });
    cashRows.forEach((entry) => {
      if (entry.currency === "KRW") {
        cashKrw += entry.balance;
      } else {
        cashUsd += entry.balance;
      }
    });
    const hasUsdCash = cashUsd > 0;
    const totalKrw =
      hasUsdHoldings || hasUsdCash
        ? useFx && fxRate
          ? holdingsKrw + holdingsUsd * fxRate + cashKrw + cashUsd * fxRate
          : null
        : holdingsKrw + cashKrw;
    const holdingsMarketValueKrw = hasUsdHoldings && !(useFx && fxRate) ? null : holdingsMarketValueKrwPartial;
    const costBasisKrw = hasUsdHoldings && !(useFx && fxRate) ? null : costBasisKrwPartial;
    const unrealizedPnlKrw =
      holdingsMarketValueKrw !== null && costBasisKrw !== null ? holdingsMarketValueKrw - costBasisKrw : null;
    const unrealizedPnlPct =
      unrealizedPnlKrw !== null && costBasisKrw !== null && costBasisKrw > 0 ? (unrealizedPnlKrw / costBasisKrw) * 100 : null;
    return {
      holdingsKrw,
      holdingsUsd,
      cashKrw,
      cashUsd,
      totalKrw,
      holdingsMarketValueKrw,
      costBasisKrw,
      unrealizedPnlKrw,
      unrealizedPnlPct
    };
  }, [cashRows, derivedHoldings, fxRate, useFx]);

  const realizedSummary = useMemo(() => {
    const now = new Date();
    let startTs: number | null = null;
    if (realizedRange === "MTD") {
      startTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    } else if (realizedRange === "YTD") {
      startTs = new Date(now.getFullYear(), 0, 1).getTime();
    }
    const records = ledgerRecords.filter((record) => {
      if (record.type !== "TRADE" || record.side !== "SELL") return false;
      if (typeof record.realizedPnl !== "number") return false;
      if (startTs && record.ts < startTs) return false;
      return true;
    });
    let realizedKrw = 0;
    let realizedUsd = 0;
    let costKrw = 0;
    let costUsd = 0;
    records.forEach((record) => {
      const pnl = record.realizedPnl ?? 0;
      const costBasis =
        typeof record.costBasis === "number"
          ? record.costBasis
          : typeof record.realizedPnlPercent === "number" && record.realizedPnlPercent !== 0
            ? pnl / (record.realizedPnlPercent / 100)
            : null;
      if (record.currency === "KRW") {
        realizedKrw += pnl;
        if (costBasis !== null) costKrw += costBasis;
      } else {
        realizedUsd += pnl;
        if (costBasis !== null) costUsd += costBasis;
      }
    });
    const hasUsd = realizedUsd !== 0 || costUsd !== 0;
    const realizedTotalKrw =
      hasUsd && !(useFx && fxRate) ? null : realizedKrw + (useFx && fxRate ? realizedUsd * fxRate : 0);
    const costTotalKrw = hasUsd && !(useFx && fxRate) ? null : costKrw + (useFx && fxRate ? costUsd * fxRate : 0);
    const realizedPct =
      realizedTotalKrw !== null && costTotalKrw !== null && costTotalKrw > 0 ? (realizedTotalKrw / costTotalKrw) * 100 : null;
    return { records, realizedTotalKrw, realizedPct };
  }, [fxRate, ledgerRecords, realizedRange, useFx]);

  const filteredLedgerRecords = useMemo(() => {
    return [...ledgerRecords]
      .filter((record) => {
        if (ledgerFilters.accountId !== "ALL" && record.accountId !== ledgerFilters.accountId) return false;
        if (ledgerFilters.type !== "ALL" && record.type !== ledgerFilters.type) return false;
        if (ledgerFilters.type === "TRADE" && ledgerFilters.side !== "ALL" && record.side !== ledgerFilters.side) return false;
        const recordDate = new Date(record.ts).toISOString().slice(0, 10);
        if (ledgerFilters.startDate && recordDate < ledgerFilters.startDate) return false;
        if (ledgerFilters.endDate && recordDate > ledgerFilters.endDate) return false;
        return true;
      })
      .sort((a, b) => b.ts - a.ts);
  }, [ledgerFilters, ledgerRecords]);

  const realizedDetailRows = useMemo(() => {
    const rows = [...realizedSummary.records];
    rows.sort((a, b) => {
      if (realizedDetailSortKey === "price") {
        return (a.price ?? 0) - (b.price ?? 0);
      }
      return a.ts - b.ts;
    });
    return realizedDetailSortDir === "asc" ? rows : rows.reverse();
  }, [realizedDetailSortDir, realizedDetailSortKey, realizedSummary.records]);

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

  const formatInputNumber = (value: string, decimals: number) => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    if (!cleaned) return "";
    const parts = cleaned.split(".");
    const intPart = parts[0] ?? "";
    const fracRaw = parts[1] ?? "";
    const frac = decimals > 0 ? fracRaw.slice(0, decimals) : "";
    const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (decimals === 0) return intFormatted;
    if (parts.length === 1) return intFormatted;
    return `${intFormatted}.${frac}`;
  };

  const formatDateTime = (ts: number) => {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const parseNumber = (value: string) => {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatAccountName = (account: BrokerAccount | undefined) => {
    if (!account) return "-";
    const currency = account.currency ?? (account.countryType === "US" ? "USD" : "KRW");
    return `${account.brokerName} (${currency})`;
  };

  const findStockDisplay = (symbol: string | undefined) => {
    if (!symbol) return "-";
    const normalized = normalizeSymbol(symbol);
    const stock = stocks.find((item) => normalizeSymbol(item.symbol) === normalized);
    const name = stock?.label?.trim() || stock?.name?.trim();
    return name ? `${name} (${symbol})` : symbol;
  };

  const resolveAccountCurrency = (accountId: string) => {
    const account = accounts.find((entry) => entry.id === accountId);
    return account?.currency ?? (account?.countryType === "US" ? "USD" : "KRW");
  };

  const normalizeCashBalances = (source: CashBalance[]) => {
    const byAccount = new Map(source.map((entry) => [entry.accountId, entry]));
    const normalized = accounts.map((account) => {
      const currency = account.currency ?? (account.countryType === "US" ? "USD" : "KRW");
      const existing = byAccount.get(account.id);
      if (existing) {
        return { ...existing, currency };
      }
      return { accountId: account.id, currency, balance: 0 };
    });
    const extras = source.filter((entry) => !accounts.some((account) => account.id === entry.accountId));
    return [...normalized, ...extras];
  };

  const accountOptions = useMemo(
    () => accounts.map((acc) => ({ value: acc.id, label: formatAccountName(acc) })),
    [accounts]
  );
  const ledgerAccountOptions = useMemo(
    () => [{ value: "ALL", label: "All Accounts" }, ...accountOptions],
    [accountOptions]
  );
  const stockOptions = useMemo(
    () => stocks.map((item) => ({ value: item.id, label: `${item.label ?? item.symbol} (${item.symbol})` })),
    [stocks]
  );
  const sellableStockOptions = useMemo(() => {
    if (!tradeForm.accountId) return [];
    const heldIds = new Set(
      holdings
        .filter((holding) => holding.accountId === tradeForm.accountId && holding.qty > 0)
        .map((holding) => holding.stockId)
        .filter(Boolean) as string[]
    );
    const heldBySymbol = new Set(
      holdings
        .filter((holding) => holding.accountId === tradeForm.accountId && holding.qty > 0)
        .map((holding) => normalizeSymbol(holding.symbolKey))
        .filter(Boolean)
    );
    return stocks
      .filter((item) => heldIds.has(item.id) || heldBySymbol.has(normalizeSymbol(item.symbol)))
      .map((item) => ({ value: item.id, label: `${item.label ?? item.symbol} (${item.symbol})` }));
  }, [holdings, stocks, tradeForm.accountId]);
  const buyableStockOptions = useMemo(() => {
    if (!tradeForm.accountId) return stockOptions;
    const currency = resolveAccountCurrency(tradeForm.accountId);
    const allowedMarket = currency === "USD" ? "US" : "KR";
    return stocks
      .filter((item) => item.market === allowedMarket)
      .map((item) => ({ value: item.id, label: `${item.label ?? item.symbol} (${item.symbol})` }));
  }, [stocks, tradeForm.accountId, stockOptions]);
  const tradeStockOptions = tradeForm.side === "SELL" ? sellableStockOptions : buyableStockOptions;

  const tradeCurrency = useMemo(() => {
    const stock = stocks.find((item) => item.id === tradeForm.stockId);
    return stock?.market === "KR" ? "KRW" : "USD";
  }, [stocks, tradeForm.stockId]);

  const cashFormCurrency = useMemo(() => resolveAccountCurrency(cashForm.accountId), [cashForm.accountId]);

  useEffect(() => {
    if (!tradeForm.accountId) return;
    const available = tradeStockOptions.map((option) => option.value);
    if (!available.length) {
      setTradeForm((prev) => ({ ...prev, stockId: "" }));
      return;
    }
    if (!available.includes(tradeForm.stockId)) {
      setTradeForm((prev) => ({ ...prev, stockId: available[0] }));
    }
  }, [tradeForm.accountId, tradeForm.side, tradeForm.stockId, tradeStockOptions]);
  const countryOptions = useMemo(
    () => [
      { value: "KR", label: "KR" },
      { value: "US", label: "US" }
    ],
    []
  );
  const currencyOptions = useMemo(
    () => [
      { value: "KRW", label: "KRW" },
      { value: "USD", label: "USD" }
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

  const updateLabelEdits = (type: "country" | "sector", key: string, nextValue: string) => {
    setLabelEdits((prev) => ({
      ...prev,
      [type]: { ...prev[type], [key]: nextValue }
    }));
  };

  const commitLabelRename = (type: "country" | "sector", original: string) => {
    const nextValue = labelEdits[type][original]?.trim();
    if (!nextValue || nextValue === original) return;
    setLabelOptions((prev) => {
      const list = type === "country" ? prev.countries : prev.sectors;
      const updated = list.map((entry) => (entry === original ? nextValue : entry));
      const unique = Array.from(new Set(updated));
      return type === "country" ? { ...prev, countries: unique } : { ...prev, sectors: unique };
    });
    setHoldings((prev) =>
      prev.map((holding) => {
        if (type === "country") {
          return holding.countryLabel === original ? { ...holding, countryLabel: nextValue } : holding;
        }
        return holding.sectorLabel === original ? { ...holding, sectorLabel: nextValue } : holding;
      })
    );
  };

  const deleteLabelOption = (type: "country" | "sector", target: string) => {
    setLabelOptions((prev) => {
      const list = type === "country" ? prev.countries : prev.sectors;
      const updated = list.filter((entry) => entry !== target);
      return type === "country" ? { ...prev, countries: updated } : { ...prev, sectors: updated };
    });
    setHoldings((prev) =>
      prev.map((holding) => {
        if (type === "country") {
          return holding.countryLabel === target ? { ...holding, countryLabel: undefined } : holding;
        }
        return holding.sectorLabel === target ? { ...holding, sectorLabel: undefined } : holding;
      })
    );
    setLabelEdits((prev) => {
      const next = { ...prev[type] };
      delete next[target];
      return { ...prev, [type]: next };
    });
  };

  const portfolioRows = useMemo(() => {
    const holdingRows = derivedHoldings.map((entry) => ({ kind: "holding" as const, ...entry }));
    return [...holdingRows, ...cashRows];
  }, [cashRows, derivedHoldings]);

  const sortedHoldings = useMemo(() => {
    const rows = [...portfolioRows];
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      if (sortKey === "account") {
        const aAccountId = a.kind === "cash" ? a.account.id : a.holding.accountId;
        const bAccountId = b.kind === "cash" ? b.account.id : b.holding.accountId;
        const aName = accounts.find((acc) => acc.id === aAccountId)?.brokerName ?? "";
        const bName = accounts.find((acc) => acc.id === bAccountId)?.brokerName ?? "";
        return aName.localeCompare(bName) * dir;
      }
      if (sortKey === "cost") {
        const aValue = a.kind === "cash" ? 0 : a.costBasisKrw ?? 0;
        const bValue = b.kind === "cash" ? 0 : b.costBasisKrw ?? 0;
        return (aValue - bValue) * dir;
      }
      if (sortKey === "pnl") {
        const aValue = a.kind === "cash" ? 0 : a.pnlKrw ?? 0;
        const bValue = b.kind === "cash" ? 0 : b.pnlKrw ?? 0;
        return (aValue - bValue) * dir;
      }
      if (sortKey === "value" || sortKey === "weight") {
        const aValue = a.kind === "cash" ? a.valueKrw : a.marketValueKrw ?? 0;
        const bValue = b.kind === "cash" ? b.valueKrw : b.marketValueKrw ?? 0;
        return (aValue - bValue) * dir;
      }
      return 0;
    });
  }, [accounts, portfolioRows, sortDir, sortKey]);

  const totalWeightBaseKrw = totals.totalKrw;

  const buildBuckets = (key: "sectorLabel" | "countryLabel") => {
    const buckets = new Map<string, number>();
    derivedHoldings.forEach((entry) => {
      const label = entry.holding[key]?.trim() || "Unlabeled";
      buckets.set(label, (buckets.get(label) ?? 0) + (entry.marketValueKrw ?? 0));
    });
    return Array.from(buckets.entries())
      .map(([label, value]) => ({ label, value }))
      .filter((item) => item.value > 0);
  };

  const sectorDetails = useMemo(() => {
    const map: Record<string, { name: string; value: number }[]> = {};
    derivedHoldings.forEach((entry) => {
      const label = entry.holding.sectorLabel?.trim() || "Unlabeled";
      const value = entry.marketValueKrw ?? 0;
      if (value <= 0) return;
      const stockLabel = entry.stock?.label ?? entry.stock?.symbol ?? entry.holding.symbolKey ?? "Unknown";
      if (!map[label]) map[label] = [];
      map[label].push({ name: stockLabel, value });
    });
    const cashTotal = cashRows.reduce((sum, entry) => sum + entry.valueKrw, 0);
    if (cashTotal > 0) {
      map.Cash = cashRows
        .filter((entry) => entry.valueKrw > 0)
        .map((entry) => ({
          name: `${formatAccountName(entry.account)} Cash (${entry.currency})`,
          value: entry.valueKrw
        }));
    }
    Object.values(map).forEach((items) => items.sort((a, b) => b.value - a.value));
    return map;
  }, [cashRows, derivedHoldings]);

  const sectorData = useMemo(() => {
    const base = buildBuckets("sectorLabel");
    const cashTotal = cashRows.reduce((sum, entry) => sum + entry.valueKrw, 0);
    if (cashTotal > 0) base.push({ label: "Cash", value: cashTotal });
    return base.sort((a, b) => b.value - a.value);
  }, [cashRows, derivedHoldings]);

  const countryDetails = useMemo(() => {
    const map: Record<string, { name: string; value: number }[]> = {};
    derivedHoldings.forEach((entry) => {
      const label = entry.holding.countryLabel?.trim() || "Unlabeled";
      const value = entry.marketValueKrw ?? 0;
      if (value <= 0) return;
      const stockLabel = entry.stock?.label ?? entry.stock?.symbol ?? entry.holding.symbolKey ?? "Unknown";
      if (!map[label]) map[label] = [];
      map[label].push({ name: stockLabel, value });
    });
    const cashTotal = cashRows.reduce((sum, entry) => sum + entry.valueKrw, 0);
    if (cashTotal > 0) {
      map.Cash = cashRows
        .filter((entry) => entry.valueKrw > 0)
        .map((entry) => ({
          name: `${formatAccountName(entry.account)} Cash (${entry.currency})`,
          value: entry.valueKrw
        }));
    }
    Object.values(map).forEach((items) => items.sort((a, b) => b.value - a.value));
    return map;
  }, [cashRows, derivedHoldings]);

  const countryData = useMemo(() => {
    const base = buildBuckets("countryLabel");
    const cashTotal = cashRows.reduce((sum, entry) => sum + entry.valueKrw, 0);
    if (cashTotal > 0) base.push({ label: "Cash", value: cashTotal });
    return base;
  }, [cashRows, derivedHoldings]);
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
      qty: "",
      fee: "",
      memo: ""
    });
    setTradeOpen(true);
  };

  const openCash = () => {
    const firstAccount = accounts[0]?.id ?? "";
    setCashForm({
      accountId: firstAccount,
      direction: "DEPOSIT",
      amount: "",
      memo: ""
    });
    setCashOpen(true);
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
    const { accountId, stockId, side, price, qty, fee, memo } = tradeForm;
    const priceValue = parseNumber(price);
    const qtyValue = parseNumber(qty);
    const feeValue = parseNumber(fee);
    if (!accountId || !stockId || !Number.isFinite(priceValue) || !Number.isFinite(qtyValue) || qtyValue <= 0) return;
    const stock = stocks.find((item) => item.id === stockId);
    if (!stock) return;
    const symbolKey = normalizeSymbol(stock.symbol ?? "");
    const existing =
      holdings.find((entry) => entry.accountId === accountId && entry.stockId === stockId) ??
      holdings.find((entry) => entry.accountId === accountId && normalizeSymbol(entry.symbolKey) === symbolKey);
    if (!existing && side === "SELL") {
      window.alert("Holding not found for this account.");
      return;
    }
    const currency = stock.market === "KR" ? "KRW" : "USD";
    const cashCurrency = resolveAccountCurrency(accountId);
    const grossTradeValue = priceValue * qtyValue;
    const netCashChange = side === "BUY" ? -(grossTradeValue + feeValue) : grossTradeValue - feeValue;

    const cashEntry = cashBalances.find((entry) => entry.accountId === accountId);
    const currentCash = cashEntry?.balance ?? 0;
    if (side === "BUY") {
      if (!cashEntry) {
        window.alert("Please add cash to this account before buying.");
        return;
      }
      if (cashCurrency !== currency) {
        window.alert("Account cash currency does not match this trade currency.");
        return;
      }
    }
    if (side === "BUY" && currentCash + netCashChange < 0) {
      window.alert("Not enough cash for this buy.");
      return;
    }
    if (side === "SELL" && existing && qtyValue > existing.qty) {
      window.alert("Not enough shares to sell.");
      return;
    }

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
            stockId: existing.stockId ?? stockId,
            qty: nextQty,
            avgPrice: nextAvg,
            symbolKey: existing.symbolKey || symbolKey
          };
        }
      }
    }

    const realizedPnl =
      side === "SELL" && existing ? (priceValue - existing.avgPrice) * qtyValue - feeValue : null;
    const costBasis = side === "SELL" && existing ? existing.avgPrice * qtyValue : null;
    const realizedPnlPercent =
      realizedPnl !== null && costBasis && costBasis > 0 ? (realizedPnl / costBasis) * 100 : null;

    setHoldings(nextHoldings);
    setCashBalances((prev) => {
      const normalized = normalizeCashBalances(prev);
      return normalized.map((entry) =>
        entry.accountId === accountId ? { ...entry, currency: cashCurrency, balance: entry.balance + netCashChange } : entry
      );
    });
    const executedAt = Date.now();
    const trimmedMemo = memo.trim();
    setTrades((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        accountId,
        stockId,
        side,
        price: priceValue,
        qty: qtyValue,
        executedAt,
        fee: feeValue || undefined,
        memo: trimmedMemo || undefined,
        realizedPnl,
        realizedPnlPercent
      }
    ]);
    setLedgerRecords((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ts: executedAt,
        accountId,
        type: "TRADE",
        currency,
        symbol: stock.symbol,
        side,
        qty: qtyValue,
        price: priceValue,
        fee: feeValue || undefined,
        memo: trimmedMemo || undefined,
        realizedPnl,
        realizedPnlPercent,
        costBasis
      }
    ]);
    setTradeOpen(false);
  };

  const applyCashflow = () => {
    const { accountId, direction, amount, memo } = cashForm;
    const amountValue = parseNumber(amount);
    if (!accountId || !Number.isFinite(amountValue) || amountValue <= 0) return;
    const currency = resolveAccountCurrency(accountId);
    const currentBalance = cashBalances.find((entry) => entry.accountId === accountId)?.balance ?? 0;
    const netChange = direction === "DEPOSIT" ? amountValue : -amountValue;
    if (currentBalance + netChange < 0) {
      window.alert("Withdraw amount exceeds available cash.");
      return;
    }
    const ts = Date.now();
    const trimmedMemo = memo.trim();
    setCashBalances((prev) => {
      const normalized = normalizeCashBalances(prev);
      return normalized.map((entry) =>
        entry.accountId === accountId ? { ...entry, currency, balance: entry.balance + netChange } : entry
      );
    });
    setLedgerRecords((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ts,
        accountId,
        type: "CASHFLOW",
        currency,
        direction,
        amount: amountValue,
        memo: trimmedMemo || undefined
      }
    ]);
    setCashOpen(false);
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
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">Total Value (KRW)</div>
                <div className={`mt-2 text-2xl font-semibold ${blurClass}`}>
                  {totals.totalKrw !== null ? formatCurrency(totals.totalKrw, "KRW") : "FX not ready"}
                </div>
                <div className={`mt-1 text-xs text-white/75 ${blurClass}`}>
                  Holdings KRW {formatCurrency(totals.holdingsKrw, "KRW")} / USD {formatCurrency(totals.holdingsUsd, "USD")} · Cash KRW{" "}
                  {formatCurrency(totals.cashKrw, "KRW")} / USD {formatCurrency(totals.cashUsd, "USD")}
                </div>
                <div className="mt-1 text-[10px] text-[var(--ink-1)]">
                  {useFx && fxRate ? `FX ${formatCurrency(fxRate, "KRW")}` : "FX not applied"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">Unrealized PnL (KRW)</div>
                <div
                  className={`mt-2 text-2xl font-semibold ${
                    totals.unrealizedPnlKrw !== null && totals.unrealizedPnlKrw >= 0 ? "text-emerald-300" : "text-rose-300"
                  } ${blurClass}`}
                >
                  {totals.unrealizedPnlKrw !== null
                    ? `${totals.unrealizedPnlKrw >= 0 ? "+" : "-"}${formatCurrency(Math.abs(totals.unrealizedPnlKrw), "KRW")}`
                    : "-"}
                </div>
                <div className={`mt-1 text-xs ${blurClass}`}>
                  {totals.unrealizedPnlPct !== null ? `${totals.unrealizedPnlPct >= 0 ? "+" : ""}${totals.unrealizedPnlPct.toFixed(2)}%` : "FX not ready"}
                </div>
                <div className="mt-1 text-[10px] text-[var(--ink-1)]">Holdings only</div>
              </div>
              <div
                className="rounded-xl border border-white/10 bg-black/30 p-3 text-left transition hover:border-white/25 cursor-pointer"
                onClick={() => setRealizedDetailOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setRealizedDetailOpen(true);
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">Realized PnL (KRW)</div>
                  <div className="flex items-center gap-1 text-[10px]">
                    {(["MTD", "YTD", "ALL"] as const).map((range) => (
                      <button
                        key={range}
                        className={`rounded-full border px-2 py-1 ${
                          realizedRange === range ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setRealizedRange(range);
                        }}
                        type="button"
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className={`mt-2 text-2xl font-semibold ${
                    realizedSummary.realizedTotalKrw !== null && realizedSummary.realizedTotalKrw >= 0 ? "text-emerald-300" : "text-rose-300"
                  } ${blurClass}`}
                >
                  {realizedSummary.realizedTotalKrw !== null
                    ? `${realizedSummary.realizedTotalKrw >= 0 ? "+" : "-"}${formatCurrency(Math.abs(realizedSummary.realizedTotalKrw), "KRW")}`
                    : "-"}
                </div>
                <div className={`mt-1 text-xs ${blurClass}`}>
                  {realizedSummary.realizedPct !== null ? `${realizedSummary.realizedPct >= 0 ? "+" : ""}${realizedSummary.realizedPct.toFixed(2)}%` : "FX not ready"}
                </div>
                <div className="mt-1 text-[10px] text-[var(--ink-1)]">Sells only</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Holdings</div>
            <div className="flex items-center gap-3 text-xs text-[var(--ink-1)]">
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={openTrade}>
                Trade
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={openCash}>
                Add Cash
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={() => setAccountsOpen(true)}>
                Manage Accounts
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={() => setHistoryOpen(true)}>
                Asset History
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={() => setLedgerOpen(true)}>
                History
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
                if (entry.kind === "cash") {
                  const weightPct =
                    totalWeightBaseKrw && totalWeightBaseKrw > 0 ? (entry.valueKrw / totalWeightBaseKrw) * 100 : null;
                  return (
                    <div
                      key={`cash-${entry.account.id}`}
                      className="grid grid-cols-[1.2fr_1.2fr_1.2fr_1.2fr_0.7fr_1fr_1.2fr_0.8fr_0.7fr] gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                    >
                      <div>
                      <div className="text-sm">{formatAccountName(entry.account)}</div>
                        <div className="mt-1 text-[10px] text-[var(--ink-1)]">{entry.account.countryType}</div>
                      </div>
                      <div>
                        <div className="text-sm">
                          CASH <span className="text-[var(--ink-1)]">({entry.currency})</span>
                        </div>
                      </div>
                      <div className={blurClass}>
                        <div>-</div>
                        <div className="text-xs text-white/80">{formatCurrency(entry.balance, entry.currency)}</div>
                      </div>
                      <div className={blurClass}>
                        <div>-</div>
                        <div className="text-xs text-white/80">-</div>
                      </div>
                      <div className={blurClass}>-</div>
                      <div className={blurClass}>
                        <div className="flex flex-wrap gap-1 text-[10px] text-[var(--ink-1)]">
                          <span className="rounded-full border border-white/10 px-2 py-[1px]">
                            {entry.currency === "USD" ? "US" : "KR"}
                          </span>
                          <span className="rounded-full border border-white/10 px-2 py-[1px]">Cash</span>
                        </div>
                      </div>
                      <div className={blurClass}>-</div>
                      <div className={blurClass}>{weightPct !== null ? `${formatNumber(weightPct, 2)}%` : "-"}</div>
                      <div className="text-[var(--ink-1)]">-</div>
                    </div>
                  );
                }

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
                const valueKrw = entry.marketValueKrw ?? 0;
                const weightPct =
                  totalWeightBaseKrw && totalWeightBaseKrw > 0 ? (valueKrw / totalWeightBaseKrw) * 100 : null;
                const displayCurrency = entry.rate ? "KRW" : holding.currency;
                const displayMarketValue = entry.rate ? entry.marketValueKrw ?? marketValue : marketValue;
                const displayCostBasis = entry.rate ? entry.costBasisKrw ?? costBasis : costBasis;
                const displayPnl = entry.rate ? entry.pnlKrw ?? pnlValue : pnlValue;
                return (
                  <div
                    key={holding.id}
                    className="grid grid-cols-[1.2fr_1.2fr_1.2fr_1.2fr_0.7fr_1fr_1.2fr_0.8fr_0.7fr] gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm">{formatAccountName(account)}</div>
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
                    <div className={blurClass}>{weightPct !== null ? `${formatNumber(weightPct, 2)}%` : "-"}</div>
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
              {activeHoldings.length === 0 && cashRows.length === 0 ? (
                <div className="text-sm text-[var(--ink-1)]">No holdings yet.</div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1.35fr_0.85fr]">
            <DonutCard title="Sector Weight (KRW)" data={sectorData} detailsByLabel={sectorDetails} />
            <DonutCard title="Country Exposure (KRW)" data={countryData} detailsByLabel={countryDetails} />
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
                enableSearch
                maxVisibleItems={8}
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
                enableSearch
                maxVisibleItems={8}
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
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Manage Country Labels</div>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {labelOptions.countries.length ? (
                  labelOptions.countries.map((label) => (
                    <div key={label} className="flex items-center gap-2">
                      <input
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                        value={labelEdits.country[label] ?? label}
                        onChange={(event) => updateLabelEdits("country", label, event.target.value)}
                      />
                      <button
                        className="rounded-full border border-white/10 px-3 py-2 text-xs"
                        type="button"
                        onClick={() => commitLabelRename("country", label)}
                      >
                        Rename
                      </button>
                      <button
                        className="rounded-full border border-rose-500/40 px-3 py-2 text-xs text-rose-200"
                        type="button"
                        onClick={() => deleteLabelOption("country", label)}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[var(--ink-1)]">No country labels.</div>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Manage Sector Labels</div>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                {labelOptions.sectors.length ? (
                  labelOptions.sectors.map((label) => (
                    <div key={label} className="flex items-center gap-2">
                      <input
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                        value={labelEdits.sector[label] ?? label}
                        onChange={(event) => updateLabelEdits("sector", label, event.target.value)}
                      />
                      <button
                        className="rounded-full border border-white/10 px-3 py-2 text-xs"
                        type="button"
                        onClick={() => commitLabelRename("sector", label)}
                      >
                        Rename
                      </button>
                      <button
                        className="rounded-full border border-rose-500/40 px-3 py-2 text-xs text-rose-200"
                        type="button"
                        onClick={() => deleteLabelOption("sector", label)}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[var(--ink-1)]">No sector labels.</div>
                )}
              </div>
            </div>
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
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Select
                  value={account.currency ?? (account.countryType === "US" ? "USD" : "KRW")}
                  options={currencyOptions}
                  onChange={(value) =>
                    setAccounts((prev) =>
                      prev.map((entry) =>
                        entry.id === account.id ? { ...entry, currency: value as "KRW" | "USD" } : entry
                      )
                    )
                  }
                  buttonClassName="px-2 py-1 text-xs"
                />
                <input
                  className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                  value={account.memo ?? ""}
                  placeholder="Memo"
                  onChange={(event) =>
                    setAccounts((prev) =>
                      prev.map((entry) => (entry.id === account.id ? { ...entry, memo: event.target.value } : entry))
                    )
                  }
                />
              </div>
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
                { id: crypto.randomUUID(), brokerName: "New Broker", countryType: "KR", currency: "KRW", memo: "" }
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
              options={tradeStockOptions}
              onChange={(value) => setTradeForm((prev) => ({ ...prev, stockId: value }))}
              className="mt-1"
              enableSearch
              maxVisibleItems={8}
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
            Price ({tradeCurrency ?? "—"})
            <div className="mt-1 flex items-center gap-2">
              <input
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                type="text"
                inputMode="decimal"
                value={tradeForm.price}
                onChange={(event) =>
                  setTradeForm((prev) => ({
                    ...prev,
                    price: formatInputNumber(event.target.value, tradeCurrency === "KRW" ? 0 : 2)
                  }))
                }
              />
              <span className="text-xs text-[var(--ink-1)]">{tradeCurrency ?? ""}</span>
            </div>
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Quantity
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              type="text"
              inputMode="numeric"
              value={tradeForm.qty}
              onChange={(event) =>
                setTradeForm((prev) => ({ ...prev, qty: formatInputNumber(event.target.value, 0) }))
              }
            />
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Fee (Optional, {tradeCurrency ?? "—"})
            <div className="mt-1 flex items-center gap-2">
              <input
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                type="text"
                inputMode="decimal"
                value={tradeForm.fee}
                onChange={(event) =>
                  setTradeForm((prev) => ({
                    ...prev,
                    fee: formatInputNumber(event.target.value, tradeCurrency === "KRW" ? 0 : 2)
                  }))
                }
              />
              <span className="text-xs text-[var(--ink-1)]">{tradeCurrency ?? ""}</span>
            </div>
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Memo (Optional)
            <textarea
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              rows={3}
              value={tradeForm.memo}
              onChange={(event) => setTradeForm((prev) => ({ ...prev, memo: event.target.value }))}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={cashOpen}
        title="Add Cash"
        onClose={() => setCashOpen(false)}
        actions={
          <>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setCashOpen(false)}>
              Cancel
            </button>
            <button className="rounded-full bg-[var(--accent-1)] px-4 py-2 text-xs text-black" onClick={applyCashflow}>
              Save
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <label className="block text-xs uppercase tracking-wide">
            Account
            <Select
              value={cashForm.accountId}
              options={accountOptions}
              onChange={(value) => setCashForm((prev) => ({ ...prev, accountId: value }))}
              className="mt-1"
            />
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Direction
            <div className="mt-1 flex gap-2">
              {(["DEPOSIT", "WITHDRAW"] as const).map((direction) => (
                <button
                  key={direction}
                  className={`rounded-full border px-4 py-2 text-xs ${
                    cashForm.direction === direction ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10"
                  }`}
                  onClick={() => setCashForm((prev) => ({ ...prev, direction }))}
                  type="button"
                >
                  {direction}
                </button>
              ))}
            </div>
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Amount ({cashFormCurrency})
            <div className="mt-1 flex items-center gap-2">
              <input
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                type="text"
                inputMode="decimal"
                value={cashForm.amount}
                onChange={(event) =>
                  setCashForm((prev) => ({
                    ...prev,
                    amount: formatInputNumber(event.target.value, cashFormCurrency === "KRW" ? 0 : 2)
                  }))
                }
              />
              <span className="text-xs text-[var(--ink-1)]">{cashFormCurrency}</span>
            </div>
          </label>
          <label className="block text-xs uppercase tracking-wide">
            Memo (Optional)
            <textarea
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              rows={3}
              value={cashForm.memo}
              onChange={(event) => setCashForm((prev) => ({ ...prev, memo: event.target.value }))}
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
          currentPnlPct={totals.unrealizedPnlPct}
          onDeleteLog={(date) => setHistory((prev) => prev.filter((entry) => entry.date !== date))}
        />
      </Modal>

      <Modal
        open={ledgerOpen}
        title="History"
        onClose={() => setLedgerOpen(false)}
        panelClassName="!w-[96vw] !max-w-[1200px] min-h-[60vh] pt-8"
        titleClassName="text-3xl font-semibold tracking-tight"
        contentClassName="text-base md:text-lg"
        closeButtonClassName="p-2 text-base text-white/80 hover:text-white"
        actions={
          <button className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/85" onClick={() => setLedgerOpen(false)}>
            Close
          </button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="text-xs uppercase tracking-wide text-[var(--ink-1)]">
              Account
              <Select
                className="mt-2"
                value={ledgerFilters.accountId}
                options={ledgerAccountOptions}
                onChange={(value) => setLedgerFilters((prev) => ({ ...prev, accountId: value }))}
              />
            </label>
            <label className="text-xs uppercase tracking-wide text-[var(--ink-1)]">
              Type
              <Select
                className="mt-2"
                value={ledgerFilters.type}
                options={[
                  { value: "ALL", label: "All" },
                  { value: "TRADE", label: "Trades" },
                  { value: "CASHFLOW", label: "Cashflows" }
                ]}
                onChange={(value) => setLedgerFilters((prev) => ({ ...prev, type: value as "ALL" | "TRADE" | "CASHFLOW" }))}
              />
            </label>
            {ledgerFilters.type === "TRADE" ? (
              <label className="text-xs uppercase tracking-wide text-[var(--ink-1)]">
                Side
                <Select
                  className="mt-2"
                  value={ledgerFilters.side}
                  options={[
                    { value: "ALL", label: "All" },
                    { value: "BUY", label: "BUY" },
                    { value: "SELL", label: "SELL" }
                  ]}
                  onChange={(value) => setLedgerFilters((prev) => ({ ...prev, side: value as "ALL" | "BUY" | "SELL" }))}
                />
              </label>
            ) : (
              <div />
            )}
            <label className="text-xs uppercase tracking-wide text-[var(--ink-1)]">
              Start Date
              <input
                type="date"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={ledgerFilters.startDate}
                onChange={(event) => setLedgerFilters((prev) => ({ ...prev, startDate: event.target.value }))}
              />
            </label>
            <label className="text-xs uppercase tracking-wide text-[var(--ink-1)]">
              End Date
              <input
                type="date"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={ledgerFilters.endDate}
                onChange={(event) => setLedgerFilters((prev) => ({ ...prev, endDate: event.target.value }))}
              />
            </label>
          </div>

          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {filteredLedgerRecords.length ? (
              filteredLedgerRecords.map((record) => {
                const account = accounts.find((acc) => acc.id === record.accountId);
                const summary =
                  record.type === "TRADE"
                    ? {
                        label: `${record.side ?? ""} ${findStockDisplay(record.symbol)}`,
                        qty: record.qty ?? 0,
                        price: record.price ?? 0
                      }
                    : null;
                const realized = record.side === "SELL" && typeof record.realizedPnl === "number" ? record.realizedPnl : null;
                const realizedKrw = realized !== null && record.currency === "USD" && fxRate ? realized * fxRate : null;
                return (
                  <div key={record.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs text-[var(--ink-1)]">
                          {formatDateTime(record.ts)} · {formatAccountName(account)}
                        </div>
                        {record.type === "TRADE" && summary ? (
                          <div className="mt-1 text-base">
                            <span className="font-semibold">{summary.label}</span> x{formatNumber(summary.qty, 0)} @{" "}
                            <span className={blurClass}>{formatCurrency(summary.price, record.currency)}</span>
                          </div>
                        ) : (
                          <div className="mt-1 text-base">
                            <span className="font-semibold">{record.direction ?? "CASHFLOW"}</span>{" "}
                            <span className={blurClass}>{formatCurrency(record.amount ?? 0, record.currency)}</span>
                          </div>
                        )}
                        {record.memo ? <div className="mt-1 text-xs text-[var(--ink-1)]">{record.memo}</div> : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">
                          {record.type === "TRADE" ? "TRADE" : "CASHFLOW"}
                        </div>
                        {realized !== null ? (
                          <div className={`mt-2 text-xs ${realized >= 0 ? "text-emerald-300" : "text-rose-300"} ${blurClass}`}>
                            Realized {realized >= 0 ? "+" : "-"}
                            {formatCurrency(Math.abs(realized), record.currency)}
                          </div>
                        ) : null}
                        {realizedKrw !== null ? (
                          <div className={`text-[10px] text-[var(--ink-1)] ${blurClass}`}>
                            (~{realizedKrw >= 0 ? "+" : "-"}
                            {formatCurrency(Math.abs(realizedKrw), "KRW")})
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-[var(--ink-1)]">No history yet.</div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={realizedDetailOpen}
        title="Realized PnL Detail"
        onClose={() => setRealizedDetailOpen(false)}
        panelClassName="!w-[96vw] !max-w-[1200px] min-h-[60vh] pt-8"
        titleClassName="text-3xl font-semibold tracking-tight"
        contentClassName="text-base md:text-lg"
        closeButtonClassName="p-2 text-base text-white/80 hover:text-white"
        actions={
          <button className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/85" onClick={() => setRealizedDetailOpen(false)}>
            Close
          </button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">SELL records with realized pnl ({realizedRange})</div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--ink-1)]">
              <button
                className={`rounded-full border px-2 py-1 ${realizedDetailSortKey === "price" ? "border-white/30 text-white" : "border-white/10"}`}
                onClick={() => {
                  if (realizedDetailSortKey === "price") {
                    setRealizedDetailSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                  } else {
                    setRealizedDetailSortKey("price");
                    setRealizedDetailSortDir("desc");
                  }
                }}
              >
                Price {realizedDetailSortKey === "price" ? (realizedDetailSortDir === "asc" ? "▲" : "▼") : ""}
              </button>
              <button
                className={`rounded-full border px-2 py-1 ${realizedDetailSortKey === "time" ? "border-white/30 text-white" : "border-white/10"}`}
                onClick={() => {
                  if (realizedDetailSortKey === "time") {
                    setRealizedDetailSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                  } else {
                    setRealizedDetailSortKey("time");
                    setRealizedDetailSortDir("desc");
                  }
                }}
              >
                Time {realizedDetailSortKey === "time" ? (realizedDetailSortDir === "asc" ? "▲" : "▼") : ""}
              </button>
            </div>
          </div>

          <div className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
            {realizedDetailRows.length ? (
              realizedDetailRows.map((record) => {
                const account = accounts.find((acc) => acc.id === record.accountId);
                const realized = typeof record.realizedPnl === "number" ? record.realizedPnl : 0;
                const realizedKrw = record.currency === "USD" && fxRate ? realized * fxRate : record.currency === "KRW" ? realized : null;
                return (
                  <div key={record.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs text-[var(--ink-1)]">
                          {formatDateTime(record.ts)} · {formatAccountName(account)}
                        </div>
                        <div className="mt-1 text-base">
                          <span className="font-semibold">{record.side ?? "SELL"} {findStockDisplay(record.symbol)}</span>
                          {" "}x{formatNumber(record.qty ?? 0, 0)} @{" "}
                          <span className={blurClass}>{formatCurrency(record.price ?? 0, record.currency)}</span>
                        </div>
                        {record.memo ? <div className="mt-1 text-xs text-[var(--ink-1)]">{record.memo}</div> : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-xs ${realized >= 0 ? "text-emerald-300" : "text-rose-300"} ${blurClass}`}>
                          Realized {realized >= 0 ? "+" : "-"}
                          {formatCurrency(Math.abs(realized), record.currency)}
                        </div>
                        {realizedKrw !== null ? (
                          <div className={`mt-1 text-[11px] ${realizedKrw >= 0 ? "text-emerald-300" : "text-rose-300"} ${blurClass}`}>
                            KRW {realizedKrw >= 0 ? "+" : "-"}
                            {formatCurrency(Math.abs(realizedKrw), "KRW")}
                          </div>
                        ) : (
                          <div className={`mt-1 text-[10px] text-[var(--ink-1)] ${blurClass}`}>KRW FX not ready</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-[var(--ink-1)]">No realized records in this range.</div>
            )}
          </div>
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

type DonutDetailItem = {
  name: string;
  value: number;
};

function DonutCard({
  title,
  data,
  detailsByLabel
}: {
  title: string;
  data: DonutDatum[];
  detailsByLabel?: Record<string, DonutDetailItem[]>;
}) {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [pinnedLabel, setPinnedLabel] = useState<string | null>(null);
  const palette = [
    "#6EE7B7",
    "#93C5FD",
    "#F9A8D4",
    "#FCD34D",
    "#A5B4FC",
    "#FDBA74",
    "#67E8F9",
    "#F472B6",
    "#34D399",
    "#60A5FA",
    "#FBBF24",
    "#C4B5FD",
    "#F97316",
    "#2DD4BF",
    "#E879F9",
    "#A3E635",
    "#F43F5E",
    "#38BDF8",
    "#FB7185",
    "#22C55E"
  ];
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const formatKrw = (value: number) => `₩${Math.round(value).toLocaleString("ko-KR")}`;
  const activeLabel = pinnedLabel ?? hoveredLabel;
  const activeDetails = activeLabel ? detailsByLabel?.[activeLabel] ?? null : null;
  const activeTotal = activeDetails?.reduce((sum, item) => sum + item.value, 0) ?? null;
  const legendTwoCol = data.length >= 8;
  const splitIndex = Math.ceil(data.length / 2);
  const legendCols = legendTwoCol ? [data.slice(0, splitIndex), data.slice(splitIndex)] : [data];
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 min-h-[480px]">
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">{title}</div>
      <div className="mt-3 flex items-center gap-4">
        <DonutChart
          data={data}
          palette={palette}
          onHover={(label) => {
            if (!pinnedLabel) setHoveredLabel(label);
          }}
          onSelect={(label) => {
            setPinnedLabel((prev) => (prev === label ? null : label));
            setHoveredLabel(label);
          }}
        />
        <div className={`${legendTwoCol ? "grid grid-cols-2 gap-x-6 text-xs flex-1" : "space-y-2 text-xs"}`}>
          {data.length ? (
            legendCols.map((col, colIndex) => (
              <div key={colIndex} className="space-y-2">
                {col.map((item) => {
                  const dataIndex = data.findIndex((entry) => entry.label === item.label);
                  return (
                    <button
                      key={item.label}
                      className="flex w-full min-w-0 items-center gap-2 text-left"
                      onMouseEnter={() => {
                        if (!pinnedLabel) setHoveredLabel(item.label);
                      }}
                      onMouseLeave={() => {
                        if (!pinnedLabel) setHoveredLabel(null);
                      }}
                      onClick={() => {
                        setPinnedLabel((prev) => (prev === item.label ? null : item.label));
                        setHoveredLabel(item.label);
                      }}
                      type="button"
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette[dataIndex % palette.length] }} />
                      <span className={`min-w-0 flex-1 truncate whitespace-nowrap ${activeLabel === item.label ? "text-white" : "text-[var(--ink-1)]"}`}>
                        {item.label}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-white/80">
                        {formatKrw(item.value)}
                        {total > 0 ? ` · ${(item.value / total * 100).toFixed(1)}%` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="text-[var(--ink-1)]">No data</div>
          )}
        </div>
      </div>
      <div className="mt-3 h-[190px] rounded-xl border border-white/10 bg-black/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--ink-1)]">
            {activeLabel ? `${activeLabel} Breakdown` : "Breakdown"}
          </div>
          {pinnedLabel ? (
            <button
              className="rounded-full border border-white/10 px-2 py-1 text-[10px]"
              onClick={() => setPinnedLabel(null)}
              type="button"
            >
              Unpin
            </button>
          ) : null}
        </div>
        <div className="mt-2 h-[126px] overflow-y-auto space-y-1 text-xs">
          {activeLabel && activeDetails && activeDetails.length ? (
            activeDetails.map((item) => (
              <div key={`${activeLabel}-${item.name}`} className="flex items-center justify-between gap-3">
                <span className="truncate text-white/80">{item.name}</span>
                <span className="shrink-0 text-white/90">
                  {formatKrw(item.value)} {total > 0 ? `· ${(item.value / total * 100).toFixed(1)}%` : ""}
                </span>
              </div>
            ))
          ) : (
            <div className="text-[var(--ink-1)]">Hover or click a segment to view holdings.</div>
          )}
        </div>
        {activeTotal !== null ? (
          <div className="mt-2 text-[10px] text-[var(--ink-1)]">
            Total: {formatKrw(activeTotal)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DonutChart({
  data,
  palette,
  onHover,
  onSelect
}: {
  data: DonutDatum[];
  palette: string[];
  onHover?: (label: string | null) => void;
  onSelect?: (label: string) => void;
}) {
  const size = 140;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return (
    <svg width={size} height={size} className="shrink-0" onMouseLeave={() => onHover?.(null)}>
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
              strokeLinecap="butt"
              onMouseEnter={() => onHover?.(item.label)}
              onClick={() => onSelect?.(item.label)}
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








