"use client";

import { loadState, saveState } from "./storage";
import type { BrokerAccount, FinanceSettings, Holding, IndexItem, Trade, WatchlistStock } from "../types/finance";

const INDICES_KEY = "lifnux.finance.indices.v100";
const WATCHLIST_KEY = "lifnux.finance.watchlist.v100";
const ACCOUNTS_KEY = "lifnux.finance.accounts.v100";
const HOLDINGS_KEY = "lifnux.finance.holdings.v100";
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

export function seedWatchlist(): WatchlistStock[] {
  const data: WatchlistStock[] = [
    { id: "aapl", name: "Apple", ticker: "AAPL", market: "US", isHeld: true, last: 189.2, changePct: 1.4, mktCapRank: 1 },
    { id: "msft", name: "Microsoft", ticker: "MSFT", market: "US", isHeld: true, last: 412.6, changePct: 0.6, mktCapRank: 2 },
    { id: "nvda", name: "NVIDIA", ticker: "NVDA", market: "US", isHeld: false, last: 845.3, changePct: 2.1, mktCapRank: 3 },
    { id: "amzn", name: "Amazon", ticker: "AMZN", market: "US", isHeld: false, last: 176.7, changePct: -0.3, mktCapRank: 4 },
    { id: "googl", name: "Alphabet", ticker: "GOOGL", market: "US", isHeld: true, last: 154.9, changePct: -1.2, mktCapRank: 5 },
    { id: "tsla", name: "Tesla", ticker: "TSLA", market: "US", isHeld: false, last: 214.5, changePct: 3.6, mktCapRank: 6 },
    { id: "meta", name: "Meta", ticker: "META", market: "US", isHeld: true, last: 479.3, changePct: 0.9, mktCapRank: 7 },
    { id: "brka", name: "Berkshire", ticker: "BRK.A", market: "US", isHeld: false, last: 610500, changePct: -0.2, mktCapRank: 8 },
    { id: "samsung", name: "Samsung Elec", ticker: "005930", market: "KR", isHeld: true, last: 74500, changePct: 1.1, mktCapRank: 1 },
    { id: "skhynix", name: "SK Hynix", ticker: "000660", market: "KR", isHeld: false, last: 163500, changePct: 2.6, mktCapRank: 2 },
    { id: "naver", name: "NAVER", ticker: "035420", market: "KR", isHeld: true, last: 214000, changePct: -0.8, mktCapRank: 3 },
    { id: "kakao", name: "Kakao", ticker: "035720", market: "KR", isHeld: false, last: 47600, changePct: -1.9, mktCapRank: 4 },
    { id: "lgchem", name: "LG Chem", ticker: "051910", market: "KR", isHeld: false, last: 412000, changePct: 0.2, mktCapRank: 5 },
    { id: "samsungbio", name: "Samsung Bio", ticker: "207940", market: "KR", isHeld: true, last: 822000, changePct: 1.7, mktCapRank: 6 }
  ];
  return data.map((item) => ({ ...item, watchlisted: true }));
}

function hashSymbol(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function mockQuote(symbol: string, market: "KR" | "US") {
  const seed = hashSymbol(symbol);
  const changePct = ((seed % 600) - 300) / 100; // -3.00% ~ +3.00%
  const base = market === "KR" ? 50000 : 120;
  const last = market === "KR" ? base + (seed % 120000) : base + (seed % 800) / 2;
  const changeAbs = (last * changePct) / 100;
  return { last: Number(last.toFixed(market === "KR" ? 0 : 2)), changePct, changeAbs };
}

export function createWatchlistStock(symbol: string, market: "KR" | "US"): WatchlistStock {
  const quote = mockQuote(symbol, market);
  return {
    id: `${market}-${symbol}`.toLowerCase(),
    name: symbol,
    ticker: symbol.toUpperCase(),
    market,
    isHeld: false,
    last: quote.last,
    changePct: quote.changePct,
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
    { id: "hold-1", accountId: "acc-us-1", stockId: "aapl", avgPrice: 172.4, qty: 12, currency: "USD" },
    { id: "hold-2", accountId: "acc-us-1", stockId: "meta", avgPrice: 421.3, qty: 5, currency: "USD" },
    { id: "hold-3", accountId: "acc-kr-1", stockId: "samsung", avgPrice: 69800, qty: 30, currency: "KRW" }
  ];
}

export function seedSettings(): FinanceSettings {
  return { blurSensitiveNumbers: true };
}

export function seedTrades(): Trade[] {
  return [];
}

export function loadFinanceState() {
  const indices = loadState<IndexItem[]>(INDICES_KEY, seedIndices());
  const watchlist = loadState<WatchlistStock[]>(WATCHLIST_KEY, seedWatchlist());
  const accounts = loadState<BrokerAccount[]>(ACCOUNTS_KEY, seedAccounts());
  const holdings = loadState<Holding[]>(HOLDINGS_KEY, seedHoldings());
  const settings = loadState<FinanceSettings>(SETTINGS_KEY, seedSettings());
  const trades = loadState<Trade[]>(TRADES_KEY, seedTrades());
  return { indices, watchlist, accounts, holdings, settings, trades };
}

export function saveIndices(items: IndexItem[]) {
  saveState(INDICES_KEY, items);
}

export function saveWatchlist(items: WatchlistStock[]) {
  saveState(WATCHLIST_KEY, items);
}

export function saveAccounts(items: BrokerAccount[]) {
  saveState(ACCOUNTS_KEY, items);
}

export function saveHoldings(items: Holding[]) {
  saveState(HOLDINGS_KEY, items);
}

export function saveFinanceSettings(settings: FinanceSettings) {
  saveState(SETTINGS_KEY, settings);
}

export function saveTrades(items: Trade[]) {
  saveState(TRADES_KEY, items);
}
