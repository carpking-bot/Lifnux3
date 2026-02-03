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

export type StockItem = {
  id: string;
  symbol: string;
  market: "KR" | "US";
  name?: string;
  label?: string;
  watchlisted?: boolean;
  notes?: string;
  mktCapRank?: number;
  last?: number;
  changePct?: number;
  changeAbs?: number;
};

export type StockList = {
  id: string;
  name: string;
  itemIds: string[];
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
  stockId?: string;
  symbolKey: string;
  avgPrice: number;
  qty: number;
  currency: "KRW" | "USD";
  notes?: string;
  countryLabel?: string;
  sectorLabel?: string;
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
