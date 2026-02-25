import type { LinkedMetricResult, LinkedSource } from "../types";

function deterministicNumber(seed: string, min: number, max: number) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash % 10000) / 10000;
  return min + (max - min) * normalized;
}

type AssetCategory = { id?: string; name?: string };
type AssetItem = { categoryId?: string; amountKRW?: number };
type MonthlyAssetSnapshot = { month?: string; items?: AssetItem[]; updatedAt?: number };
type IndexItem = { symbol?: string; last?: number };
type StockItem = { id?: string; symbol?: string; market?: "KR" | "US"; currency?: "KRW" | "USD"; last?: number };
type Holding = { stockId?: string; symbolKey?: string; avgPrice?: number; qty?: number; currency?: "KRW" | "USD" };
type CashBalance = { currency?: "KRW" | "USD"; balance?: number };
type LedgerRecord = {
  type?: "TRADE" | "CASHFLOW";
  side?: "BUY" | "SELL";
  ts?: number;
  price?: number;
  qty?: number;
  fee?: number;
  stockId?: string;
  currency?: "KRW" | "USD";
  realizedPnl?: number | null;
  realizedPnlPercent?: number | null;
  costBasis?: number | null;
};

const ASSET_SNAPSHOTS_KEY = "asset_monthly_snapshots";
const ASSET_CATEGORY_SCHEMA_KEY = "lifnux.finance.asset.category.schema.v1";
const INDICES_KEY = "lifnux.finance.indices.v100";
const STOCKS_KEY = "lifnux.finance.stocks.v200";
const POSITIONS_KEY = "portfolio.positions";
const CASH_BALANCES_KEY = "investing_cash_balances";
const LEDGER_RECORDS_KEY = "investing_ledger_records";
const PORTFOLIO_PERFORMANCE_KEY = "investing.portfolio.performance.v1";
const HEALTH_ACTIVITY_LOGS_KEY = "lifnux.health.activityLogs.v1";

type PortfolioPerformanceSnapshot = {
  totalValueKrw?: number | null;
  unrealizedPnlKrw?: number | null;
  realizedPnlYtdKrw?: number | null;
  updatedAt?: number;
};

function readStorageJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type HealthActivityLog = {
  typeId?: string;
  loggedForDate?: string;
};

type GuitarAttendance = {
  dateKey?: string;
};

function getHealthSwimmingSessionsByYear(year: number) {
  const logs = readStorageJson<HealthActivityLog[]>(HEALTH_ACTIVITY_LOGS_KEY, []);
  const yearPrefix = `${year}-`;
  return logs.filter((log) => log.typeId === "swimming" && typeof log.loggedForDate === "string" && log.loggedForDate.startsWith(yearPrefix)).length;
}

const GUITAR_ATTENDANCE_KEY = "lifnux:guitar:attendance";

function getGuitarPracticeSessionsByYear(year: number) {
  const attendance = readStorageJson<GuitarAttendance[]>(GUITAR_ATTENDANCE_KEY, []);
  const yearPrefix = `${year}-`;
  return attendance.filter((entry) => typeof entry.dateKey === "string" && entry.dateKey.startsWith(yearPrefix)).length;
}

function resolveLinkedYear(linkedSource: LinkedSource) {
  const yearFromParam = Number(linkedSource.params?.year);
  if (Number.isInteger(yearFromParam) && yearFromParam >= 1900 && yearFromParam <= 9999) return yearFromParam;

  const yearFromMetric = linkedSource.sourceMetric.match(/(\d{4})$/)?.[1];
  if (yearFromMetric) {
    const parsed = Number(yearFromMetric);
    if (Number.isInteger(parsed)) return parsed;
  }

  return new Date().getFullYear();
}

function normalizeCategoryName(value: string) {
  return value.trim().toUpperCase();
}

function isDebtCategory(categoryId: string, debtCategoryIds: Set<string>) {
  if (debtCategoryIds.has(categoryId)) return true;
  const normalizedId = categoryId.toUpperCase();
  return normalizedId.includes("DEBT") || normalizedId.includes("BUCHAE");
}

function getLatestAssetNetWorth(): number | null {
  const snapshotsMap = readStorageJson<Record<string, MonthlyAssetSnapshot>>(ASSET_SNAPSHOTS_KEY, {});
  const categories = readStorageJson<AssetCategory[]>(ASSET_CATEGORY_SCHEMA_KEY, []);
  const debtCategoryIds = new Set(
    categories
      .filter((category) => {
        const name = normalizeCategoryName(category.name ?? "");
        return name.includes("DEBT") || name.includes("\uBD80\uCC44");
      })
      .map((category) => category.id ?? "")
      .filter(Boolean)
  );

  const currentMonth = new Date().toISOString().slice(0, 7);
  const validSnapshots = Object.values(snapshotsMap)
    .filter((snapshot) => typeof snapshot?.month === "string" && snapshot.month <= currentMonth && Array.isArray(snapshot.items) && snapshot.items.length > 0)
    .sort((a, b) => String(a.month ?? "").localeCompare(String(b.month ?? "")));

  if (!validSnapshots.length) return null;

  const current = validSnapshots.find((snapshot) => snapshot.month === currentMonth) ?? null;
  const effective = current ?? [...validSnapshots].reverse().find((snapshot) => (snapshot.month ?? "") < currentMonth) ?? null;
  if (!effective) return null;

  const total = (effective.items ?? []).reduce((sum, item) => {
    const amount = typeof item.amountKRW === "number" ? item.amountKRW : 0;
    const categoryId = item.categoryId ?? "";
    return sum + (isDebtCategory(categoryId, debtCategoryIds) ? -Math.abs(amount) : amount);
  }, 0);
  return Math.round(total);
}

function getUsdKrwRate() {
  const indices = readStorageJson<IndexItem[]>(INDICES_KEY, []);
  const fx = indices.find((item) => (item.symbol ?? "").toUpperCase() === "USD/KRW")?.last;
  return typeof fx === "number" && Number.isFinite(fx) && fx > 0 ? fx : 1300;
}

function resolveStockCurrency(stock: StockItem | undefined, symbolKey: string | undefined): "KRW" | "USD" {
  if (stock?.currency === "KRW" || stock?.currency === "USD") return stock.currency;
  if (stock?.market === "KR") return "KRW";
  if (stock?.market === "US") return "USD";
  const symbol = (symbolKey ?? "").toUpperCase();
  if (/^\d{6}$/.test(symbol) || symbol.endsWith(".KS") || symbol.endsWith(".KQ")) return "KRW";
  return "USD";
}

function toKrw(amount: number, currency: "KRW" | "USD", usdKrw: number) {
  if (!Number.isFinite(amount)) return 0;
  return currency === "USD" ? amount * usdKrw : amount;
}

function normalizeSymbolKey(raw?: string) {
  const value = (raw ?? "").trim().toUpperCase();
  if (!value) return "";
  if (value.includes(":")) {
    const [, tail] = value.split(":", 2);
    return (tail ?? "").trim().toUpperCase();
  }
  if (value.endsWith(".KS") || value.endsWith(".KQ")) return value.slice(0, -3);
  return value;
}

function getAnnualReturnRatePercent(): number | null {
  const snapshot = readStorageJson<PortfolioPerformanceSnapshot | null>(PORTFOLIO_PERFORMANCE_KEY, null);
  const totalValueFromSnapshot = snapshot?.totalValueKrw;
  const unrealizedFromSnapshot = snapshot?.unrealizedPnlKrw;
  const realizedYtdFromSnapshot = snapshot?.realizedPnlYtdKrw;
  if (
    typeof totalValueFromSnapshot === "number" &&
    Number.isFinite(totalValueFromSnapshot) &&
    typeof unrealizedFromSnapshot === "number" &&
    Number.isFinite(unrealizedFromSnapshot)
  ) {
    const investedCapital = totalValueFromSnapshot - unrealizedFromSnapshot;
    if (Number.isFinite(investedCapital) && investedCapital > 0) {
      const realizedYtd = typeof realizedYtdFromSnapshot === "number" && Number.isFinite(realizedYtdFromSnapshot) ? realizedYtdFromSnapshot : 0;
      const totalProfit = unrealizedFromSnapshot + realizedYtd;
      const totalReturnPct = (totalProfit / investedCapital) * 100;
      if (Number.isFinite(totalReturnPct)) return totalReturnPct;
    }
  }

  const usdKrw = getUsdKrwRate();
  const stocks = readStorageJson<StockItem[]>(STOCKS_KEY, []);
  const holdings = readStorageJson<Holding[]>(POSITIONS_KEY, []);
  const cashBalances = readStorageJson<CashBalance[]>(CASH_BALANCES_KEY, []);
  const ledgerRecords = readStorageJson<LedgerRecord[]>(LEDGER_RECORDS_KEY, []);

  const stockById = new Map(stocks.map((stock) => [stock.id ?? "", stock]));
  const stockBySymbol = new Map(stocks.map((stock) => [normalizeSymbolKey(stock.symbol), stock]));

  const holdingsMarketValueKrw = holdings.reduce((sum, holding) => {
    const qty = typeof holding.qty === "number" ? holding.qty : 0;
    if (qty <= 0) return sum;
    const stockFromId = holding.stockId ? stockById.get(holding.stockId) : undefined;
    const stockFromSymbol = stockBySymbol.get(normalizeSymbolKey(holding.symbolKey));
    const stock = stockFromId ?? stockFromSymbol;
    const currency = holding.currency ?? resolveStockCurrency(stock, holding.symbolKey);
    const lastPrice = typeof stock?.last === "number" ? stock.last : 0;
    return sum + toKrw(lastPrice * qty, currency, usdKrw);
  }, 0);

  const cashKrw = cashBalances.reduce((sum, cash) => {
    const balance = typeof cash.balance === "number" ? cash.balance : 0;
    const currency = cash.currency === "USD" ? "USD" : "KRW";
    return sum + toKrw(balance, currency, usdKrw);
  }, 0);

  const unrealizedPnlKrw = holdings.reduce((sum, holding) => {
    const qty = typeof holding.qty === "number" ? holding.qty : 0;
    if (qty <= 0) return sum;
    const stockFromId = holding.stockId ? stockById.get(holding.stockId) : undefined;
    const stockFromSymbol = stockBySymbol.get(normalizeSymbolKey(holding.symbolKey));
    const stock = stockFromId ?? stockFromSymbol;
    const currency = holding.currency ?? resolveStockCurrency(stock, holding.symbolKey);
    const lastPrice = typeof stock?.last === "number" ? stock.last : 0;
    const avgPrice = typeof holding.avgPrice === "number" ? holding.avgPrice : 0;
    return sum + toKrw((lastPrice - avgPrice) * qty, currency, usdKrw);
  }, 0);

  const now = new Date();
  const startOfYearTs = new Date(now.getFullYear(), 0, 1).getTime();
  const realizedPnlKrw = ledgerRecords.reduce((sum, record) => {
    if (record.type !== "TRADE" || record.side !== "SELL") return sum;
    const tsRaw = typeof record.ts === "number" ? record.ts : NaN;
    if (!Number.isFinite(tsRaw)) return sum;
    const tsMs = tsRaw > 0 && tsRaw < 1_000_000_000_000 ? tsRaw * 1000 : tsRaw;
    if (tsMs < startOfYearTs) return sum;
    if (typeof record.realizedPnl !== "number" || !Number.isFinite(record.realizedPnl)) return sum;
    const currency = record.currency === "USD" ? "USD" : "KRW";
    return sum + toKrw(record.realizedPnl, currency, usdKrw);
  }, 0);

  // User-agreed formula:
  // INVESTED_CAPITAL = TOTAL_VALUE - UNREALIZED_PNL
  // TOTAL_RETURN(%) = (UNREALIZED_PNL + REALIZED_PNL) / INVESTED_CAPITAL * 100
  const totalValueKrw = holdingsMarketValueKrw + cashKrw;
  const investedCapitalKrw = totalValueKrw - unrealizedPnlKrw;
  if (!Number.isFinite(investedCapitalKrw) || investedCapitalKrw <= 0) return null;

  const totalProfitKrw = unrealizedPnlKrw + realizedPnlKrw;
  const totalReturnPct = (totalProfitKrw / investedCapitalKrw) * 100;
  return Number.isFinite(totalReturnPct) ? totalReturnPct : null;
}

export function getLinkedMetricValue(linkedSource?: LinkedSource): LinkedMetricResult | null {
  if (!linkedSource) return null;
  const seed = `${linkedSource.sourceApp}:${linkedSource.sourceMetric}:${JSON.stringify(linkedSource.params ?? {})}`;

  switch (`${linkedSource.sourceApp}:${linkedSource.sourceMetric}`) {
    case "HEALTH:swimmingSessions2026": {
      const value = getHealthSwimmingSessionsByYear(2026);
      return { value, unit: "sessions", summary: "Health swimming sessions in 2026" };
    }
    case "HEALTH:swimAttendanceThisMonth": {
      const attended = Math.round(deterministicNumber(seed, 4, 14));
      return { value: attended, unit: "sessions" };
    }
    case "HEALTH:stepsAvg": {
      const steps = Math.round(deterministicNumber(seed, 7000, 13500));
      return { value: steps, unit: "steps/day" };
    }
    case "ASSET:netWorth": {
      const value = getLatestAssetNetWorth() ?? 0;
      return { value, unit: "KRW" };
    }
    case "INVESTING:monthlyContribution": {
      const value = Math.round(deterministicNumber(seed, 300000, 2000000));
      return { value, unit: "KRW" };
    }
    case "INVESTING:annualReturnRate": {
      const value = getAnnualReturnRatePercent() ?? 0;
      return { value, unit: "%" };
    }
    case "CAREER:studyHoursWeek": {
      const value = Math.round(deterministicNumber(seed, 3, 15));
      return { value, unit: "hours" };
    }
    case "GUITAR:practiceSessionsByYear": {
      const year = resolveLinkedYear(linkedSource);
      const value = getGuitarPracticeSessionsByYear(year);
      return { value, unit: "sessions", summary: `Guitar practice sessions in ${year}` };
    }
    case "GUITAR:practiceSessions2026": {
      const value = getGuitarPracticeSessionsByYear(2026);
      return { value, unit: "sessions", summary: "Guitar practice sessions in 2026" };
    }
    default:
      return { value: "N/A" };
  }
}
