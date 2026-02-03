"use client";

import { loadState, saveState } from "./storage";
import type { BrokerAccount, FinanceSettings, Holding, IndexItem, StockItem, StockList, Trade } from "../types/finance";

const INDICES_KEY = "lifnux.finance.indices.v100";
const STOCKS_KEY = "lifnux.finance.stocks.v200";
const STOCK_LISTS_KEY = "lifnux.finance.stockLists.v100";
const WATCHLIST_KEY = "lifnux.finance.watchlist.v100";
const ACCOUNTS_KEY = "lifnux.finance.accounts.v100";
const HOLDINGS_KEY = "lifnux.finance.holdings.v100";
export const PORTFOLIO_POSITIONS_KEY = "portfolio.positions";
const SETTINGS_KEY = "lifnux.finance.settings.v100";
const TRADES_KEY = "lifnux.finance.trades.v100";

function now() {
  return Date.now();
}

export function seedIndices(): IndexItem[] {
  const base = [
    { name: "NASDAQ", symbol: "IXIC", region: "US", last: 18234.1, changePct: 0.72, changeAbs: 130.4 },
    { name: "S&P 500", symbol: "SPX", region: "US", last: 5112.3, changePct: -0.18, changeAbs: -9.2 },
    { name: "DOW", symbol: "DJI", region: "US", last: 38722.4, changePct: 0.11, changeAbs: 42.7 },
    { name: "USD/KRW", symbol: "USD/KRW", region: "FX", last: 1320.5, changePct: 0.12, changeAbs: 1.6 },
    { name: "KOSPI", symbol: "KS11", region: "KR", last: 2654.2, changePct: 0.64, changeAbs: 16.9 },
    { name: "KOSDAQ", symbol: "KQ11", region: "KR", last: 846.8, changePct: -0.42, changeAbs: -3.6 },
    { name: "HSI", symbol: "HSI", region: "HK", last: 17840.5, changePct: -0.25, changeAbs: -44.6 },
    { name: "NIKKEI", symbol: "N225", region: "JP", last: 38510.7, changePct: 0.38, changeAbs: 145.2 },
    { name: "FTSE 100", symbol: "FTSE", region: "UK", last: 7684.2, changePct: 0.09, changeAbs: 6.8 },
    { name: "DAX", symbol: "GDAXI", region: "DE", last: 17510.9, changePct: 0.21, changeAbs: 36.8 },
    { name: "TSX", symbol: "GSPTSE", region: "CA", last: 21980.4, changePct: -0.14, changeAbs: -30.5 },
    { name: "SENSEX", symbol: "BSESN", region: "IN", last: 72112.6, changePct: 0.31, changeAbs: 222.2 },
    { name: "ASX 200", symbol: "AXJO", region: "AU", last: 7564.1, changePct: -0.07, changeAbs: -5.2 }
  ];
  return base.map((item, index) => ({
    id: `${item.symbol}-${index}`,
    ...item,
    updatedAt: now(),
    visible: index < 10
  }));
}

export function seedStocks(): StockItem[] {
  const data: StockItem[] = [
    { id: "aapl", name: "Apple", label: "Apple", symbol: "AAPL", market: "US", last: 189.2, changePct: 1.4, mktCapRank: 1 },
    { id: "msft", name: "Microsoft", label: "Microsoft", symbol: "MSFT", market: "US", last: 412.6, changePct: 0.6, mktCapRank: 2 },
    { id: "nvda", name: "NVIDIA", label: "NVIDIA", symbol: "NVDA", market: "US", last: 845.3, changePct: 2.1, mktCapRank: 3 },
    { id: "amzn", name: "Amazon", label: "Amazon", symbol: "AMZN", market: "US", last: 176.7, changePct: -0.3, mktCapRank: 4 },
    { id: "googl", name: "Alphabet", label: "Alphabet", symbol: "GOOGL", market: "US", last: 154.9, changePct: -1.2, mktCapRank: 5 },
    { id: "tsla", name: "Tesla", label: "Tesla", symbol: "TSLA", market: "US", last: 214.5, changePct: 3.6, mktCapRank: 6 },
    { id: "meta", name: "Meta", label: "Meta", symbol: "META", market: "US", last: 479.3, changePct: 0.9, mktCapRank: 7 },
    { id: "brka", name: "Berkshire", label: "Berkshire", symbol: "BRK.A", market: "US", last: 610500, changePct: -0.2, mktCapRank: 8 },
    { id: "samsung", name: "Samsung Elec", label: "Samsung Elec", symbol: "005930", market: "KR", last: 74500, changePct: 1.1, mktCapRank: 1 },
    { id: "skhynix", name: "SK Hynix", label: "SK Hynix", symbol: "000660", market: "KR", last: 163500, changePct: 2.6, mktCapRank: 2 },
    { id: "naver", name: "NAVER", label: "NAVER", symbol: "035420", market: "KR", last: 214000, changePct: -0.8, mktCapRank: 3 },
    { id: "kakao", name: "Kakao", label: "Kakao", symbol: "035720", market: "KR", last: 47600, changePct: -1.9, mktCapRank: 4 },
    { id: "lgchem", name: "LG Chem", label: "LG Chem", symbol: "051910", market: "KR", last: 412000, changePct: 0.2, mktCapRank: 5 },
    { id: "samsungbio", name: "Samsung Bio", label: "Samsung Bio", symbol: "207940", market: "KR", last: 822000, changePct: 1.7, mktCapRank: 6 }
  ];
  return data.map((item) => ({ ...item, watchlisted: true }));
}

export function seedStockLists(): StockList[] {
  return [{ id: "list-default", name: "My Playlist", itemIds: [] }];
}

function hashSymbol(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function normalizeSymbol(raw: string) {
  const cleaned = raw.trim().toUpperCase();
  if (!cleaned) return "";
  if (cleaned.endsWith(".KS") || cleaned.endsWith(".KQ")) {
    return cleaned.slice(0, -3);
  }
  if (/^\d{6}$/.test(cleaned)) return cleaned;
  if (/^[A-Z]{2,5}:[A-Z0-9.\-]+$/.test(cleaned)) return cleaned;
  return `NAS:${cleaned}`;
}

export function mockQuote(symbol: string, market: "KR" | "US") {
  const seed = hashSymbol(symbol);
  const changePct = ((seed % 600) - 300) / 100; // -3.00% ~ +3.00%
  const base = market === "KR" ? 50000 : 120;
  const last = market === "KR" ? base + (seed % 120000) : base + (seed % 800) / 2;
  const changeAbs = (last * changePct) / 100;
  return { last: Number(last.toFixed(market === "KR" ? 0 : 2)), changePct, changeAbs };
}

export function detectMarketFromSymbol(symbol: string): "KR" | "US" {
  const normalized = symbol.trim().toUpperCase();
  if (normalized.endsWith(".KS") || normalized.endsWith(".KQ") || /^\d{6}$/.test(normalized)) {
    return "KR";
  }
  return "US";
}

export function createStockItem(symbol: string, market?: "KR" | "US", label?: string): StockItem {
  const normalized = symbol.trim().toUpperCase();
  const resolvedMarket = market ?? detectMarketFromSymbol(normalized);
  const quote = mockQuote(normalized, resolvedMarket);
  const displayLabel = label?.trim() ? label.trim() : normalized;
  return {
    id: `${resolvedMarket}-${normalized}`.toLowerCase(),
    label: displayLabel,
    symbol: normalized,
    market: resolvedMarket,
    last: quote.last,
    changePct: quote.changePct,
    changeAbs: quote.changeAbs,
    mktCapRank: 9999,
    notes: "",
    watchlisted: true
  };
}

export function createIndexItem(name: string, symbol: string, region: string): IndexItem {
  const market = region === "KR" ? "KR" : "US";
  const quote = mockQuote(symbol, market);
  return {
    id: `${symbol}-${now()}`,
    name,
    symbol: symbol.toUpperCase(),
    region,
    last: quote.last,
    changePct: quote.changePct,
    changeAbs: quote.changeAbs,
    updatedAt: now(),
    visible: true
  };
}

export function seedAccounts(): BrokerAccount[] {
  return [
    { id: "acc-kr-1", brokerName: "NH Invest", countryType: "KR", memo: "Main KR account" },
    { id: "acc-us-1", brokerName: "Robinhood", countryType: "US", memo: "US growth" }
  ];
}

export function seedHoldings(): Holding[] {
  return [
    { id: "hold-1", accountId: "acc-us-1", stockId: "aapl", symbolKey: "NAS:AAPL", avgPrice: 172.4, qty: 12, currency: "USD" },
    { id: "hold-2", accountId: "acc-us-1", stockId: "meta", symbolKey: "NAS:META", avgPrice: 421.3, qty: 5, currency: "USD" },
    { id: "hold-3", accountId: "acc-kr-1", stockId: "samsung", symbolKey: "005930", avgPrice: 69800, qty: 30, currency: "KRW" }
  ];
}

export function seedSettings(): FinanceSettings {
  return { blurSensitiveNumbers: true };
}

export function seedTrades(): Trade[] {
  return [];
}

export function loadFinanceState() {
  let indices = loadState<IndexItem[]>(INDICES_KEY, seedIndices());
  let stocks = loadState<StockItem[]>(STOCKS_KEY, []);
  if (indices.length) {
    const hasFx = indices.some((item) => item.symbol === "USD/KRW");
    if (!hasFx) {
      indices = [...indices, { id: `USD/KRW-${now()}`, name: "USD/KRW", symbol: "USD/KRW", region: "FX", last: 0, changePct: 0, changeAbs: 0, updatedAt: now(), visible: true }];
    }
  }
  if (stocks.length) {
    stocks = stocks.map((item) => {
      const normalizedSymbol = item.symbol.trim().toUpperCase();
      const trimmedLabel = item.label?.trim();
      const trimmedName = item.name?.trim();
      const normalizedLabel = trimmedLabel?.toUpperCase();
      const normalizedName = trimmedName?.toUpperCase();
      const resolvedLabel =
        trimmedLabel && normalizedLabel !== normalizedSymbol
          ? trimmedLabel
          : trimmedName && normalizedName !== normalizedSymbol
            ? trimmedName
            : normalizedSymbol;
      return { ...item, symbol: normalizedSymbol, label: resolvedLabel };
    });
  }
  if (!stocks.length) {
    const legacy = loadState<
      {
        id: string;
        name?: string;
        ticker?: string;
        market: "KR" | "US";
        isHeld?: boolean;
        last?: number;
        changePct?: number;
        changeAbs?: number;
        mktCapRank?: number;
        notes?: string;
        watchlisted?: boolean;
      }[]
    >(WATCHLIST_KEY, []);
    const migrated =
      legacy.length > 0
        ? legacy.map((item) => ({
            id: item.id,
            symbol: item.ticker ? item.ticker.toUpperCase() : item.name ?? "",
            market: item.market,
            name: item.name ?? item.ticker,
            label: item.name ?? item.ticker ?? (item.ticker ? item.ticker.toUpperCase() : ""),
            watchlisted: item.watchlisted ?? true,
            notes: item.notes ?? "",
            mktCapRank: item.mktCapRank ?? 9999,
            last: item.last,
            changePct: item.changePct,
            changeAbs: item.changeAbs
          }))
        : seedStocks();
    stocks = migrated;
  }
  const stockLists = loadState<StockList[]>(STOCK_LISTS_KEY, seedStockLists());
  const accounts = loadState<BrokerAccount[]>(ACCOUNTS_KEY, seedAccounts());
  const legacyHoldings = loadState<Holding[]>(HOLDINGS_KEY, []);
  const savedPositions = loadState<Holding[]>(PORTFOLIO_POSITIONS_KEY, []);
  const holdingsSeed = seedHoldings();
  const rawHoldings = savedPositions.length ? savedPositions : legacyHoldings.length ? legacyHoldings : holdingsSeed;
  const holdings = rawHoldings.map((holding) => {
    const stock = holding.stockId ? stocks.find((item) => item.id === holding.stockId) : undefined;
    const symbol = holding.symbolKey || stock?.symbol || "";
    return {
      ...holding,
      symbolKey: normalizeSymbol(symbol)
    };
  });
  console.log("[PORTFOLIO LOAD] count=", holdings.length);
  const settings = loadState<FinanceSettings>(SETTINGS_KEY, seedSettings());
  const trades = loadState<Trade[]>(TRADES_KEY, seedTrades());
  return { indices, stocks, stockLists, accounts, holdings, settings, trades };
}

export function saveIndices(items: IndexItem[]) {
  saveState(INDICES_KEY, items);
}

export function saveStocks(items: StockItem[]) {
  saveState(STOCKS_KEY, items);
}

export function saveStockLists(items: StockList[]) {
  saveState(STOCK_LISTS_KEY, items);
}

export function saveAccounts(items: BrokerAccount[]) {
  saveState(ACCOUNTS_KEY, items);
}

export function saveHoldings(items: Holding[]) {
  const cleaned = items.map((holding) => ({
    ...holding,
    symbolKey: normalizeSymbol(holding.symbolKey || "")
  }));
  saveState(PORTFOLIO_POSITIONS_KEY, cleaned);
  console.log("[PORTFOLIO SAVE] key=", PORTFOLIO_POSITIONS_KEY, "count=", cleaned.length);
  const reloaded = loadState<Holding[]>(PORTFOLIO_POSITIONS_KEY, []);
  console.log("[PORTFOLIO LOAD] count=", reloaded.length);
}

export function loadPositions() {
  return loadState<Holding[]>(PORTFOLIO_POSITIONS_KEY, []);
}

export function saveFinanceSettings(settings: FinanceSettings) {
  saveState(SETTINGS_KEY, settings);
}

export function saveTrades(items: Trade[]) {
  saveState(TRADES_KEY, items);
}
