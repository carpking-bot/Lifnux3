export type IndexItem = {
  id: string;
  name: string;
  symbol: string;
  region: string;
  last: number;
  changePct: number;
  changeAbs: number;
  updatedAt: number;
  visible?: boolean;
};

export type WatchlistStock = {
  id: string;
  name: string;
  ticker: string;
  market: "KR" | "US";
  isHeld: boolean;
  last: number;
  changePct: number;
  mktCapRank: number;
  notes?: string;
  watchlisted?: boolean;
};

export type BrokerAccount = {
  id: string;
  brokerName: string;
  countryType: "KR" | "US";
  memo?: string;
};

export type Holding = {
  id: string;
  accountId: string;
  stockId: string;
  avgPrice: number;
  qty: number;
  currency: "KRW" | "USD";
};

export type FinanceSettings = {
  blurSensitiveNumbers: boolean;
};

export type Trade = {
  id: string;
  accountId: string;
  stockId: string;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  executedAt: number;
};
