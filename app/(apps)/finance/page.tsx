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
const ASSET_MONTHLY_SNAPSHOTS_KEY = "asset_monthly_snapshots";
const ASSET_CATEGORY_SCHEMA_KEY = "lifnux.finance.asset.category.schema.v1";
const EXPENSE_LEDGER_KEY = "lifnux.finance.expense.ledger.v1";
const LOCAL_DATA_IMPORTED_EVENT = "lifnux:data-imported";

type AssetCategory = { id: string; name: string };
type AssetItem = { categoryId?: string; amountKRW?: number };
type AssetSnapshot = { month?: string; items?: AssetItem[]; updatedAt?: number };
type AssetSnapshotMap = Record<string, AssetSnapshot>;

type ExpenseEntry = {
  id: string;
  date: string;
  category: string;
  title: string;
  amount: number;
  kind?: "expense" | "income";
  memo?: string;
};

const formatKrw = (value: number) => `\u20A9${Math.round(value).toLocaleString("ko-KR")}`;
const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const normalizeEntryKind = (entry: ExpenseEntry): "expense" | "income" => (entry.kind === "income" ? "income" : "expense");

export default function FinancePage() {
  const [revealed, setRevealed] = useState(false);
  const [ready, setReady] = useState(false);

  const [assetSnapshots, setAssetSnapshots] = useState<AssetSnapshotMap>({});
  const [assetCategories, setAssetCategories] = useState<AssetCategory[]>([]);
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [transactionCardTab, setTransactionCardTab] = useState<"expense" | "income">("expense");

  const reloadFinanceHubState = () => {
    setRevealed(loadState<boolean>(HUB_REVEAL_KEY, false));
    setAssetSnapshots(loadState<AssetSnapshotMap>(ASSET_MONTHLY_SNAPSHOTS_KEY, {}));
    setAssetCategories(loadState<AssetCategory[]>(ASSET_CATEGORY_SCHEMA_KEY, []));
    setExpenseEntries(loadState<ExpenseEntry[]>(EXPENSE_LEDGER_KEY, []));

    const data = loadFinanceState();
    setHoldings(data.holdings);
    setStocks(data.stocks);
    const initialFx = data.indices.find((item) => item.symbol === "USD/KRW")?.last ?? null;
    setFxRate(initialFx && initialFx > 0 ? initialFx : null);
    setReady(true);
  };

  useEffect(() => {
    reloadFinanceHubState();
  }, []);

  useEffect(() => {
    const handleImported = () => {
      reloadFinanceHubState();
    };
    window.addEventListener(LOCAL_DATA_IMPORTED_EVENT, handleImported);
    return () => window.removeEventListener(LOCAL_DATA_IMPORTED_EVENT, handleImported);
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

  const assetSummary = useMemo(() => {
    const debtCategoryIds = new Set(
      assetCategories
        .filter((category) => {
          const normalized = category.name.toUpperCase();
          return normalized.includes("DEBT") || category.name.includes("부채");
        })
        .map((category) => category.id)
    );
    const signedTotal = (snapshot: AssetSnapshot) =>
      Math.round(
        (snapshot.items ?? []).reduce((sum, item) => {
          const amount = typeof item.amountKRW === "number" ? item.amountKRW : 0;
          const categoryId = item.categoryId ?? "";
          if (debtCategoryIds.has(categoryId)) return sum - Math.abs(amount);
          return sum + amount;
        }, 0)
      );

    const currentMonth = new Date().toISOString().slice(0, 7);
    const rows = Object.entries(assetSnapshots)
      .map(([key, value]) => ({
        month: typeof value?.month === "string" ? value.month : key,
        updatedAt: typeof value?.updatedAt === "number" ? value.updatedAt : 0,
        total: signedTotal(value ?? {}),
        itemCount: Array.isArray(value?.items) ? value.items.length : 0
      }))
      .filter((row) => /^\d{4}-\d{2}$/.test(row.month) && row.month <= currentMonth && row.itemCount > 0)
      .sort((a, b) => a.month.localeCompare(b.month));

    // Treat zero-total snapshots as "not entered" to avoid fake monthly changes.
    const nonZeroRows = rows.filter((row) => row.total !== 0);
    if (!nonZeroRows.length) return null;

    const current = nonZeroRows.find((row) => row.month === currentMonth) ?? null;
    if (current) {
      const previous = [...nonZeroRows].reverse().find((row) => row.month < current.month) ?? null;
      const momDiff = previous ? current.total - previous.total : null;
      const momPct = previous && previous.total !== 0 && momDiff !== null ? (momDiff / previous.total) * 100 : null;
      return {
        total: current.total,
        momDiff,
        momPct,
        updatedAt: current.updatedAt,
        month: current.month,
        isMirrored: false,
        mirroredFrom: null as string | null
      };
    }

    const previous = [...nonZeroRows].reverse().find((row) => row.month < currentMonth) ?? null;
    if (!previous) return null;
    return {
      total: previous.total,
      momDiff: null as number | null,
      momPct: null as number | null,
      updatedAt: previous.updatedAt,
      month: currentMonth,
      isMirrored: true,
      mirroredFrom: previous.month
    };
  }, [assetCategories, assetSnapshots]);

  const expenseSummary = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);
    const monthEntries = expenseEntries.filter(
      (entry) => entry.date.startsWith(monthKey) && normalizeEntryKind(entry) === transactionCardTab
    );
    const total = monthEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const byCategory = new Map<string, number>();
    monthEntries.forEach((entry) => {
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amount);
    });
    const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
    return { total, topCategory, monthKey };
  }, [expenseEntries, transactionCardTab]);

  const sensitiveClass = revealed ? "" : "blur-sm select-none";

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1200px] pb-20 pt-10">
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl">Finance</h1>
            <div className="text-sm text-[var(--ink-1)]">Personal money hub: asset, transaction, and investing.</div>
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
            <div
              className={`mt-2 text-sm tabular-nums ${sensitiveClass} ${
                !assetSummary || assetSummary.momDiff === null ? "text-[var(--ink-1)]" : assetSummary.momDiff >= 0 ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {assetSummary
                ? assetSummary.momDiff === null || assetSummary.momPct === null
                  ? "MoM -"
                  : `${assetSummary.momDiff >= 0 ? "+" : "-"}${formatKrw(Math.abs(assetSummary.momDiff))} (${formatPct(assetSummary.momPct)})`
                : "MoM -"}
            </div>
            <div className="mt-2 text-xs text-[var(--ink-1)]">
              {assetSummary
                ? `${assetSummary.month}${assetSummary.isMirrored ? ` (mirrored from ${assetSummary.mirroredFrom ?? "-"})` : ""} / ${new Date(assetSummary.updatedAt).toLocaleDateString()}`
                : "No monthly update yet"}
            </div>
          </Link>

          <Link href="/finance/expense" className="lifnux-glass relative overflow-hidden rounded-2xl p-6 transition hover:border-white/20">
            <ReceiptText className="pointer-events-none absolute right-4 top-1/2 h-11 w-11 -translate-y-1/2 text-white/20" />
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Transaction</div>
              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 p-1 text-[10px]">
                <button
                  className={`rounded-full px-2 py-1 ${transactionCardTab === "expense" ? "border border-white/25 text-white" : "text-[var(--ink-1)]"}`}
                  onClick={(event) => {
                    event.preventDefault();
                    setTransactionCardTab("expense");
                  }}
                >
                  Expense
                </button>
                <button
                  className={`rounded-full px-2 py-1 ${transactionCardTab === "income" ? "border border-white/25 text-white" : "text-[var(--ink-1)]"}`}
                  onClick={(event) => {
                    event.preventDefault();
                    setTransactionCardTab("income");
                  }}
                >
                  Income
                </button>
              </div>
            </div>
            <div className="mt-3 text-2xl font-semibold tabular-nums">{formatKrw(expenseSummary.total)}</div>
            <div className="mt-2 text-sm text-white/85">Top category: {expenseSummary.topCategory}</div>
            <div className="mt-2 text-xs text-[var(--ink-1)]">
              {expenseSummary.monthKey} {transactionCardTab === "income" ? "income" : "expense"}
            </div>
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
