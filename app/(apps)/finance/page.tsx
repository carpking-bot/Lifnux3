"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../(shared)/components/AppShell";
import { loadFinanceState, normalizeSymbol } from "../../(shared)/lib/finance";
import { loadState, saveState } from "../../(shared)/lib/storage";
import { ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { useQuotes } from "../../../src/lib/quotes/useQuotes";
import type { Holding, StockItem } from "../../(shared)/types/finance";

const HUB_REVEAL_KEY = "lifnux.finance.hub.reveal.v1";
const ASSET_MONTHLY_KEY = "lifnux.finance.asset.monthly.v1";
const EXPENSE_LEDGER_KEY = "lifnux.finance.expense.ledger.v1";

type AssetMonthlySnapshot = {
  month: string;
  cash: number;
  other: number;
  debt: number;
  investing?: number;
  total?: number;
  updatedAt: number;
};

type ExpenseEntry = {
  id: string;
  date: string;
  category: string;
  title: string;
  amount: number;
  memo?: string;
};

const formatKrw = (value: number) => `\u20A9${Math.round(value).toLocaleString("ko-KR")}`;
const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

export default function FinancePage() {
  const [revealed, setRevealed] = useState(false);
  const [ready, setReady] = useState(false);

  const [assetSnapshots, setAssetSnapshots] = useState<AssetMonthlySnapshot[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [fxRate, setFxRate] = useState<number | null>(null);

  useEffect(() => {
    setRevealed(loadState<boolean>(HUB_REVEAL_KEY, false));
    setAssetSnapshots(loadState<AssetMonthlySnapshot[]>(ASSET_MONTHLY_KEY, []));
    setExpenseEntries(loadState<ExpenseEntry[]>(EXPENSE_LEDGER_KEY, []));

    const data = loadFinanceState();
    setHoldings(data.holdings);
    setStocks(data.stocks);
    const initialFx = data.indices.find((item) => item.symbol === "USD/KRW")?.last ?? null;
    setFxRate(initialFx && initialFx > 0 ? initialFx : null);
    setReady(true);
  }, []);

  useEffect(() => {
    const fetchFxRate = async () => {
      try {
        const response = await fetch("/api/fx?pair=USD/KRW", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { fx?: { rate?: number | null } };
        const rate = typeof data.fx?.rate === "number" ? data.fx.rate : null;
        if (rate && rate > 0) setFxRate(rate);
      } catch {
        // keep last known rate
      }
    };
    void fetchFxRate();
    const timer = window.setInterval(() => {
      void fetchFxRate();
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveState(HUB_REVEAL_KEY, revealed);
  }, [ready, revealed]);

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

  const investingSummary = useMemo(() => {
    let krw = 0;
    let usd = 0;
    let costBasisKrw = 0;

    activeHoldings.forEach((holding) => {
      const stock = stocks.find((item) => normalizeSymbol(item.symbol) === normalizeSymbol(holding.symbolKey));
      const quote = stock ? heldQuotes.get(getQuoteSymbol(stock).toUpperCase()) : undefined;
      const price = quote?.price ?? stock?.last ?? 0;
      const marketValue = price * holding.qty;
      const costBasis = holding.avgPrice * holding.qty;
      const isUsd = holding.currency === "USD";
      const rate = useFx && isUsd ? fxRate : null;
      const costBasisKrwValue = rate ? costBasis * rate : costBasis;

      if (holding.currency === "KRW") krw += marketValue;
      else usd += marketValue;
      costBasisKrw += costBasisKrwValue;
    });

    const totalKrw = useFx && fxRate ? krw + usd * fxRate : null;
    const displayTotalKrw = totalKrw ?? krw;
    const pnlKrw = totalKrw !== null ? totalKrw - costBasisKrw : null;
    const pnlPct = pnlKrw !== null && costBasisKrw > 0 ? (pnlKrw / costBasisKrw) * 100 : null;

    return {
      totalKrw: displayTotalKrw,
      pnlKrw,
      pnlPct
    };
  }, [activeHoldings, fxRate, heldQuotes, stocks, useFx]);

  const sortedAssetSnapshots = useMemo(
    () => [...assetSnapshots].sort((a, b) => a.month.localeCompare(b.month)),
    [assetSnapshots]
  );

  const assetSummary = useMemo(() => {
    const latest = sortedAssetSnapshots[sortedAssetSnapshots.length - 1];
    const previous = sortedAssetSnapshots.length > 1 ? sortedAssetSnapshots[sortedAssetSnapshots.length - 2] : null;
    if (!latest) return null;

    const latestInvesting = latest.investing ?? investingSummary.totalKrw;
    const latestTotal = latest.total ?? Math.round((latest.cash || 0) + (latest.other || 0) + latestInvesting - (latest.debt || 0));

    const previousTotal = previous
      ? (previous.total ??
          Math.round((previous.cash || 0) + (previous.other || 0) + (previous.investing ?? latestInvesting) - (previous.debt || 0)))
      : null;

    const momDiff = previousTotal !== null ? latestTotal - previousTotal : 0;
    const momPct = previousTotal && previousTotal !== 0 ? (momDiff / previousTotal) * 100 : 0;

    return {
      total: latestTotal,
      momDiff,
      momPct,
      updatedAt: latest.updatedAt,
      month: latest.month
    };
  }, [investingSummary.totalKrw, sortedAssetSnapshots]);

  const expenseSummary = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthEntries = expenseEntries.filter((entry) => entry.date.startsWith(monthKey));
    const total = monthEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const byCategory = new Map<string, number>();
    monthEntries.forEach((entry) => {
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amount);
    });
    const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
    return { total, topCategory, monthKey };
  }, [expenseEntries]);

  const sensitiveClass = revealed ? "" : "blur-sm select-none";

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1200px] pb-20 pt-10">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl">Finance</h1>
            <div className="text-sm text-[var(--ink-1)]">Personal money hub: asset, expense, and investing.</div>
          </div>
          <button
            className={`rounded-full border px-3 py-1 text-xs ${revealed ? "border-[var(--accent-1)] text-[var(--accent-1)]" : "border-white/10 text-[var(--ink-1)]"}`}
            onClick={() => setRevealed((prev) => !prev)}
          >
            {revealed ? "Hide" : "Reveal"}
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Link href="/finance/asset" className="lifnux-glass relative overflow-hidden rounded-2xl p-6 transition hover:border-white/20">
            <Wallet className="pointer-events-none absolute right-4 top-1/2 h-11 w-11 -translate-y-1/2 text-white/20" />
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Asset</div>
            <div className={`mt-3 text-2xl font-semibold tabular-nums ${sensitiveClass}`}>
              {assetSummary ? formatKrw(assetSummary.total) : "-"}
            </div>
            <div className={`mt-2 text-sm tabular-nums ${sensitiveClass} ${(assetSummary?.momDiff ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {assetSummary
                ? `${assetSummary.momDiff >= 0 ? "+" : "-"}${formatKrw(Math.abs(assetSummary.momDiff))} (${formatPct(assetSummary.momPct)})`
                : "MoM -"}
            </div>
            <div className="mt-2 text-xs text-[var(--ink-1)]">
              {assetSummary ? `${assetSummary.month} / ${new Date(assetSummary.updatedAt).toLocaleDateString()}` : "No monthly update yet"}
            </div>
          </Link>

          <Link href="/finance/expense" className="lifnux-glass relative overflow-hidden rounded-2xl p-6 transition hover:border-white/20">
            <ReceiptText className="pointer-events-none absolute right-4 top-1/2 h-11 w-11 -translate-y-1/2 text-white/20" />
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Expense</div>
            <div className="mt-3 text-2xl font-semibold tabular-nums">{formatKrw(expenseSummary.total)}</div>
            <div className="mt-2 text-sm text-white/85">Top category: {expenseSummary.topCategory}</div>
            <div className="mt-2 text-xs text-[var(--ink-1)]">{expenseSummary.monthKey} month</div>
          </Link>

          <Link href="/investing" className="lifnux-glass relative overflow-hidden rounded-2xl p-6 transition hover:border-white/20">
            <TrendingUp className="pointer-events-none absolute right-4 top-1/2 h-11 w-11 -translate-y-1/2 text-white/20" />
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Investing</div>
            <div className={`mt-3 text-2xl font-semibold tabular-nums ${sensitiveClass}`}>{formatKrw(investingSummary.totalKrw)}</div>
            {investingSummary.pnlKrw !== null ? (
              <div
                className={`mt-2 text-sm tabular-nums ${sensitiveClass} ${investingSummary.pnlKrw >= 0 ? "text-emerald-300" : "text-rose-300"}`}
              >
                {`${investingSummary.pnlKrw >= 0 ? "+" : "-"}${formatKrw(Math.abs(investingSummary.pnlKrw))} (${formatPct(investingSummary.pnlPct ?? 0)})`}
              </div>
            ) : (
              <div className={`mt-2 text-sm tabular-nums ${sensitiveClass} text-[var(--ink-1)]`}>FX not ready</div>
            )}
            <div className="mt-2 text-xs text-[var(--ink-1)]">Open investing dashboard</div>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

