"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../(shared)/components/AppShell";
import { loadFinanceState, normalizeSymbol } from "../../../(shared)/lib/finance";
import { loadState, saveState } from "../../../(shared)/lib/storage";
import { useQuotes } from "../../../../src/lib/quotes/useQuotes";
import type { Holding, StockItem } from "../../../(shared)/types/finance";

const ASSET_ITEMS_TEMPLATE_KEY = "asset_items_template";
const ASSET_MONTHLY_SNAPSHOTS_KEY = "asset_monthly_snapshots";
const LEGACY_ASSET_MONTHLY_KEY = "lifnux.finance.asset.monthly.v1";

const CATEGORY_OPTIONS = [
  { value: "CASH", label: "현금성" },
  { value: "INVESTING", label: "투자자산" },
  { value: "OTHER", label: "기타자산" },
  { value: "DEBT", label: "부채" }
] as const;

type AssetCategory = (typeof CATEGORY_OPTIONS)[number]["value"];

type AssetItem = {
  id: string;
  name: string;
  category: AssetCategory;
  amountKRW: number;
  note?: string;
  source?: "manual" | "investing";
};

type MonthlyAssetSnapshot = {
  month: string;
  items: AssetItem[];
  updatedAt: number;
};

type SnapshotMap = Record<string, MonthlyAssetSnapshot>;

type EditorRow = {
  id: string;
  name: string;
  category: AssetCategory;
  amountInput: string;
  note: string;
  source: "manual" | "investing";
};

type LegacySnapshot = {
  month: string;
  cash: number;
  other: number;
  debt: number;
  investing: number;
  updatedAt: number;
};

const formatKrw = (value: number) => `\u20A9${Math.round(value).toLocaleString("ko-KR")}`;
const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const normalizeAmountInput = (value: string) => value.replace(/[^0-9.-]/g, "");
const parseAmountInput = (value: string) => {
  const parsed = Number(normalizeAmountInput(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toRows = (items: AssetItem[]): EditorRow[] =>
  items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    amountInput: item.amountKRW ? Math.round(item.amountKRW).toLocaleString("ko-KR") : "",
    note: item.note ?? "",
    source: item.source ?? "manual"
  }));

const toItems = (rows: EditorRow[]): AssetItem[] =>
  rows.map((row) => ({
    id: row.id,
    name: row.name.trim(),
    category: row.category,
    amountKRW: parseAmountInput(row.amountInput),
    note: row.note.trim() || undefined,
    source: row.source
  }));

const computeBreakdown = (items: AssetItem[]) => {
  let cash = 0;
  let investing = 0;
  let other = 0;
  let debt = 0;

  items.forEach((item) => {
    const amount = item.amountKRW;
    if (item.category === "CASH") cash += amount;
    if (item.category === "INVESTING") investing += amount;
    if (item.category === "OTHER") other += amount;
    if (item.category === "DEBT") debt += Math.abs(amount);
  });

  const total = cash + investing + other - debt;
  return { cash, investing, other, debt, total };
};

export default function FinanceAssetPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [snapshots, setSnapshots] = useState<SnapshotMap>({});
  const [rows, setRows] = useState<EditorRow[]>([]);

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [fxRate, setFxRate] = useState<number | null>(null);

  useEffect(() => {
    const loadedSnapshots = loadState<SnapshotMap>(ASSET_MONTHLY_SNAPSHOTS_KEY, {});
    if (Object.keys(loadedSnapshots).length > 0) {
      setSnapshots(loadedSnapshots);
    } else {
      const legacy = loadState<LegacySnapshot[]>(LEGACY_ASSET_MONTHLY_KEY, []);
      if (legacy.length) {
        const migrated = legacy.reduce<SnapshotMap>((acc, entry) => {
          acc[entry.month] = {
            month: entry.month,
            updatedAt: entry.updatedAt,
            items: [
              { id: crypto.randomUUID(), name: "현금", category: "CASH", amountKRW: entry.cash, source: "manual" },
              { id: crypto.randomUUID(), name: "투자자산 (from Investing)", category: "INVESTING", amountKRW: entry.investing, source: "investing" },
              { id: crypto.randomUUID(), name: "기타자산", category: "OTHER", amountKRW: entry.other, source: "manual" },
              { id: crypto.randomUUID(), name: "부채", category: "DEBT", amountKRW: entry.debt, source: "manual" }
            ]
          };
          return acc;
        }, {});
        setSnapshots(migrated);
        saveState(ASSET_MONTHLY_SNAPSHOTS_KEY, migrated);
      }
    }

    const data = loadFinanceState();
    setHoldings(data.holdings);
    setStocks(data.stocks);
    const initialFx = data.indices.find((item) => item.symbol === "USD/KRW")?.last ?? null;
    setFxRate(initialFx && initialFx > 0 ? initialFx : null);
  }, []);

  useEffect(() => {
    const snapshot = snapshots[month];
    if (snapshot) {
      setRows(toRows(snapshot.items));
      return;
    }
    const template = loadState<AssetItem[]>(ASSET_ITEMS_TEMPLATE_KEY, []);
    setRows(template.length ? toRows(template) : []);
  }, [month, snapshots]);

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

  const investingValue = useMemo(() => {
    let krw = 0;
    let usd = 0;
    activeHoldings.forEach((holding) => {
      const stock = stocks.find((item) => normalizeSymbol(item.symbol) === normalizeSymbol(holding.symbolKey));
      const quote = stock ? heldQuotes.get(getQuoteSymbol(stock).toUpperCase()) : undefined;
      const price = quote?.price ?? stock?.last ?? 0;
      const marketValue = price * holding.qty;
      if (holding.currency === "KRW") krw += marketValue;
      else usd += marketValue;
    });
    if (fxRate && fxRate > 0) return krw + usd * fxRate;
    return krw;
  }, [activeHoldings, fxRate, heldQuotes, stocks]);

  const sortedSnapshots = useMemo(
    () => Object.values(snapshots).sort((a, b) => a.month.localeCompare(b.month)),
    [snapshots]
  );

  const latestSnapshot = sortedSnapshots[sortedSnapshots.length - 1] ?? null;
  const previousSnapshot = sortedSnapshots.length > 1 ? sortedSnapshots[sortedSnapshots.length - 2] : null;
  const latestBreakdown = latestSnapshot ? computeBreakdown(latestSnapshot.items) : null;
  const previousBreakdown = previousSnapshot ? computeBreakdown(previousSnapshot.items) : null;

  const momDiff = latestBreakdown && previousBreakdown ? latestBreakdown.total - previousBreakdown.total : 0;
  const momPct = previousBreakdown && previousBreakdown.total !== 0 ? (momDiff / previousBreakdown.total) * 100 : 0;

  const composition = useMemo(() => {
    if (!latestBreakdown) return [] as { label: string; value: number; color: string }[];
    return [
      { label: "현금성", value: latestBreakdown.cash, color: "#7dd3fc" },
      { label: "투자자산", value: latestBreakdown.investing, color: "#6ee7b7" },
      { label: "기타자산", value: latestBreakdown.other, color: "#f9a8d4" },
      { label: "부채", value: latestBreakdown.debt, color: "#fca5a5" }
    ].filter((entry) => entry.value > 0);
  }, [latestBreakdown]);

  const historyPoints = useMemo(
    () =>
      sortedSnapshots.map((snapshot) => ({
        x: snapshot.month,
        y: computeBreakdown(snapshot.items).total
      })),
    [sortedSnapshots]
  );

  const addItemRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        category: "CASH",
        amountInput: "",
        note: "",
        source: "manual"
      }
    ]);
  };

  const updateRow = (id: string, patch: Partial<EditorRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const deleteRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const duplicateFromPreviousMonth = () => {
    const previous = [...sortedSnapshots].reverse().find((snapshot) => snapshot.month < month);
    if (!previous) return;
    const cloned = previous.items.map((item) => ({
      ...item,
      id: crypto.randomUUID()
    }));
    setRows(toRows(cloned));
  };

  const syncInvestingAsset = () => {
    setRows((prev) => {
      const investingRow: EditorRow = {
        id: crypto.randomUUID(),
        name: "투자자산 (from Investing)",
        category: "INVESTING",
        amountInput: Math.round(investingValue).toLocaleString("ko-KR"),
        note: "포트폴리오 동기화",
        source: "investing"
      };
      const index = prev.findIndex((row) => row.source === "investing");
      if (index < 0) return [...prev, investingRow];
      const next = [...prev];
      next[index] = { ...next[index], ...investingRow, id: next[index].id };
      return next;
    });
  };

  const saveSnapshot = () => {
    if (!month) return;
    const cleanItems = toItems(rows).filter((item) => item.name.trim().length > 0 || item.amountKRW !== 0 || item.note);
    const nextSnapshot: MonthlyAssetSnapshot = {
      month,
      items: cleanItems,
      updatedAt: Date.now()
    };
    const next = {
      ...snapshots,
      [month]: nextSnapshot
    };
    setSnapshots(next);
    saveState(ASSET_MONTHLY_SNAPSHOTS_KEY, next);
    const manualTemplate = cleanItems
      .filter((item) => item.source !== "investing")
      .map((item) => ({ ...item, id: crypto.randomUUID() }));
    saveState(ASSET_ITEMS_TEMPLATE_KEY, manualTemplate);
  };

  const deleteSnapshot = (targetMonth: string) => {
    const next = { ...snapshots };
    delete next[targetMonth];
    setSnapshots(next);
    saveState(ASSET_MONTHLY_SNAPSHOTS_KEY, next);
    if (targetMonth === month) setRows([]);
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1200px] pb-20 pt-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl">Asset</h1>
            <div className="text-sm text-[var(--ink-1)]">Monthly snapshots with spreadsheet-style line items.</div>
          </div>
          <Link className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)]" href="/finance">
            Back
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="lifnux-glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Total Asset</div>
            <div className="mt-3 text-3xl font-semibold">{latestBreakdown ? formatKrw(latestBreakdown.total) : "-"}</div>
            <div className={`mt-2 text-sm ${momDiff >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {latestBreakdown && previousBreakdown ? `${momDiff >= 0 ? "+" : "-"}${formatKrw(Math.abs(momDiff))} (${formatPct(momPct)})` : "MoM -"}
            </div>
            <div className="mt-2 text-xs text-[var(--ink-1)]">Synced investing value: {formatKrw(investingValue)}</div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Composition</div>
                <PieChart data={composition} />
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Monthly History</div>
                <MiniLineChart points={historyPoints} />
              </div>
            </div>
          </section>

          <section className="lifnux-glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Monthly Editor</div>
            <div className="mt-3">
              <label className="text-sm text-[var(--ink-1)]">Month</label>
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={addItemRow}>
                + Add Item
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={duplicateFromPreviousMonth}>
                Duplicate Prev Month
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={syncInvestingAsset}>
                Sync Investing Asset
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-white/15 bg-black/20 px-3 py-4 text-sm text-[var(--ink-1)]">
                No snapshot yet. Add item or duplicate from previous month.
              </div>
            ) : (
              <div className="mt-4 max-h-[340px] overflow-auto rounded-lg border border-white/10">
                <table className="min-w-[700px] w-full text-xs">
                  <thead className="bg-black/30 text-[var(--ink-1)]">
                    <tr>
                      <th className="px-2 py-2 text-left">Category</th>
                      <th className="px-2 py-2 text-left">Name</th>
                      <th className="px-2 py-2 text-left">Amount (KRW)</th>
                      <th className="px-2 py-2 text-left">Note</th>
                      <th className="px-2 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const isInvestingSynced = row.source === "investing";
                      return (
                        <tr key={row.id} className="border-t border-white/10">
                          <td className="px-2 py-2">
                            <select
                              value={row.category}
                              disabled={isInvestingSynced}
                              onChange={(event) => updateRow(row.id, { category: event.target.value as AssetCategory })}
                              className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 disabled:opacity-60"
                            >
                              {CATEGORY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input
                              value={row.name}
                              disabled={isInvestingSynced}
                              onChange={(event) => updateRow(row.id, { name: event.target.value })}
                              className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 disabled:opacity-60"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              value={row.amountInput}
                              onFocus={() => updateRow(row.id, { amountInput: normalizeAmountInput(row.amountInput) })}
                              onBlur={() => {
                                const parsed = parseAmountInput(row.amountInput);
                                updateRow(row.id, { amountInput: parsed ? Math.round(parsed).toLocaleString("ko-KR") : "" });
                              }}
                              onChange={(event) => updateRow(row.id, { amountInput: event.target.value })}
                              className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              value={row.note}
                              onChange={(event) => updateRow(row.id, { note: event.target.value })}
                              className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              className="rounded-full border border-rose-500/40 px-2 py-1 text-[11px] text-rose-200"
                              onClick={() => deleteRow(row.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4">
              <button className="rounded-full border border-white/10 px-4 py-2 text-sm" onClick={saveSnapshot}>
                Save Snapshot
              </button>
            </div>
          </section>
        </div>

        <section className="mt-6 lifnux-glass rounded-2xl p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Monthly Logs</div>
          <div className="mt-3 space-y-2">
            {sortedSnapshots.length ? (
              [...sortedSnapshots].reverse().map((snapshot) => {
                const breakdown = computeBreakdown(snapshot.items);
                return (
                  <div key={snapshot.month} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                    <div>
                      <div className="text-white/85">{snapshot.month}</div>
                      <div className="text-white">{formatKrw(breakdown.total)}</div>
                      <div className="text-xs text-[var(--ink-1)]">Updated: {new Date(snapshot.updatedAt).toLocaleString()}</div>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-rose-500/40 px-3 py-1 text-xs text-rose-200"
                      onClick={() => deleteSnapshot(snapshot.month)}
                    >
                      Delete
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-[var(--ink-1)]">No snapshot yet.</div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const size = 180;
  const radius = 58;
  const stroke = 30;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;

  if (!data.length) return <div className="text-sm text-[var(--ink-1)]">No composition data.</div>;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          {data.map((item) => {
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
                stroke={item.color}
                strokeWidth={stroke}
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      </svg>
      <div className="space-y-2 text-xs">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-[var(--ink-1)]">{item.label}</span>
            <span>{formatKrw(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniLineChart({ points }: { points: { x: string; y: number }[] }) {
  if (!points.length) return <div className="text-sm text-[var(--ink-1)]">No history.</div>;
  const width = 420;
  const height = 190;
  const pad = 16;
  const values = points.map((point) => point.y);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const toX = (index: number) => (points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2));
  const toY = (value: number) => pad + ((max - value) / range) * (height - pad * 2);
  const polyline = points.map((point, index) => `${toX(index)},${toY(point.y)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full rounded-lg border border-white/10 bg-black/20">
      <polyline points={polyline} fill="none" stroke="#7FE9CF" strokeWidth="2" />
      <text x={pad} y={height - 8} className="fill-white/60 text-[10px]">
        {points[0]?.x}
      </text>
      <text x={width - pad} y={height - 8} textAnchor="end" className="fill-white/60 text-[10px]">
        {points[points.length - 1]?.x}
      </text>
    </svg>
  );
}


