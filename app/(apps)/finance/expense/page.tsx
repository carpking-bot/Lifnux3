"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../(shared)/components/AppShell";
import { loadState, saveState } from "../../../(shared)/lib/storage";

const EXPENSE_LEDGER_KEY = "lifnux.finance.expense.ledger.v1";
const EXPENSE_CATEGORIES_KEY = "lifnux.finance.expense.categories.v1";
const EXPENSE_REVIEW_KEY = "lifnux.finance.expense.review.v1";
const EXPENSE_BUDGET_KEY = "lifnux.finance.expense.budget.v1";

const formatNumberInput = (value: string) => {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
};

const parseNumberInput = (value: string) => Number(value.replace(/[^\d]/g, ""));

type ExpenseEntry = {
  id: string;
  date: string;
  category: string;
  title: string;
  amount: number;
  memo?: string;
};

type MonthlyReview = Record<string, { grade: string; note: string }>;

const formatKrw = (value: number) => `₩${Math.round(value).toLocaleString("ko-KR")}`;

export default function FinanceExpensePage() {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [categories, setCategories] = useState<string[]>(["Food", "Transport", "Housing", "Shopping", "Other"]);
  const [budgetByMonth, setBudgetByMonth] = useState<Record<string, number>>({});
  const [reviewByMonth, setReviewByMonth] = useState<MonthlyReview>({});

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("Food");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [budgetInput, setBudgetInput] = useState("");
  const [grade, setGrade] = useState("");
  const [reviewNote, setReviewNote] = useState("");

  useEffect(() => {
    const loadedEntries = loadState<ExpenseEntry[]>(EXPENSE_LEDGER_KEY, []);
    const loadedCategories = loadState<string[]>(EXPENSE_CATEGORIES_KEY, ["Food", "Transport", "Housing", "Shopping", "Other"]);
    const loadedBudget = loadState<Record<string, number>>(EXPENSE_BUDGET_KEY, {});
    const loadedReview = loadState<MonthlyReview>(EXPENSE_REVIEW_KEY, {});
    setEntries(loadedEntries);
    setCategories(loadedCategories);
    setBudgetByMonth(loadedBudget);
    setReviewByMonth(loadedReview);
    setBudgetInput(loadedBudget[selectedMonth] ? formatNumberInput(String(loadedBudget[selectedMonth])) : "");
    setGrade(loadedReview[selectedMonth]?.grade ?? "");
    setReviewNote(loadedReview[selectedMonth]?.note ?? "");
  }, []);

  useEffect(() => {
    setBudgetInput(budgetByMonth[selectedMonth] ? formatNumberInput(String(budgetByMonth[selectedMonth])) : "");
    setGrade(reviewByMonth[selectedMonth]?.grade ?? "");
    setReviewNote(reviewByMonth[selectedMonth]?.note ?? "");
  }, [budgetByMonth, reviewByMonth, selectedMonth]);

  const monthEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(selectedMonth)).sort((a, b) => b.date.localeCompare(a.date)),
    [entries, selectedMonth]
  );
  const monthTotal = useMemo(() => monthEntries.reduce((sum, entry) => sum + entry.amount, 0), [monthEntries]);
  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    monthEntries.forEach((entry) => map.set(entry.category, (map.get(entry.category) ?? 0) + entry.amount));
    return [...map.entries()].map(([label, value], index) => ({
      label,
      value,
      color: ["#7dd3fc", "#6ee7b7", "#f9a8d4", "#fde68a", "#c4b5fd", "#fca5a5"][index % 6]
    }));
  }, [monthEntries]);
  const topCategory = categoryTotals.sort((a, b) => b.value - a.value)[0]?.label ?? "-";
  const budget = budgetByMonth[selectedMonth] ?? 0;
  const budgetPct = budget > 0 ? (monthTotal / budget) * 100 : 0;

  const monthlyHistory = useMemo(() => {
    const byMonth = new Map<string, number>();
    entries.forEach((entry) => {
      const monthKey = entry.date.slice(0, 7);
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + entry.amount);
    });
    return [...byMonth.entries()]
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [entries]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setAmount("");
    setMemo("");
    setDate(new Date().toISOString().slice(0, 10));
  };

  const saveEntry = () => {
    if (!date || !category || !title.trim()) return;
    const amountValue = parseNumberInput(amount);
    if (!(amountValue > 0)) return;
    const payload: ExpenseEntry = {
      id: editingId ?? crypto.randomUUID(),
      date,
      category,
      title: title.trim(),
      amount: amountValue,
      memo: memo.trim() || undefined
    };
    const next = editingId ? entries.map((entry) => (entry.id === editingId ? payload : entry)) : [...entries, payload];
    setEntries(next);
    saveState(EXPENSE_LEDGER_KEY, next);
    resetForm();
  };

  const startEdit = (entry: ExpenseEntry) => {
    setEditingId(entry.id);
    setDate(entry.date);
    setCategory(entry.category);
    setTitle(entry.title);
    setAmount(formatNumberInput(String(entry.amount)));
    setMemo(entry.memo ?? "");
  };

  const removeEntry = (id: string) => {
    const next = entries.filter((entry) => entry.id !== id);
    setEntries(next);
    saveState(EXPENSE_LEDGER_KEY, next);
    if (editingId === id) resetForm();
  };

  const addCategory = () => {
    const value = newCategory.trim();
    if (!value || categories.includes(value)) return;
    const next = [...categories, value];
    setCategories(next);
    saveState(EXPENSE_CATEGORIES_KEY, next);
    setCategory(value);
    setNewCategory("");
  };

  const saveBudget = () => {
    const value = parseNumberInput(budgetInput) || 0;
    const next = { ...budgetByMonth, [selectedMonth]: value };
    setBudgetByMonth(next);
    saveState(EXPENSE_BUDGET_KEY, next);
  };

  const saveReview = () => {
    const next = { ...reviewByMonth, [selectedMonth]: { grade: grade.trim(), note: reviewNote.trim() } };
    setReviewByMonth(next);
    saveState(EXPENSE_REVIEW_KEY, next);
  };

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1200px] pb-20 pt-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl">Expense</h1>
            <div className="text-sm text-[var(--ink-1)]">Daily ledger and monthly review.</div>
          </div>
          <Link className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)]" href="/finance">
            Back
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="lifnux-glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Add / Edit Expense</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
              <label className="block">
                <div className="text-[var(--ink-1)]">Date</div>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2" />
              </label>
              <label className="block">
                <div className="text-[var(--ink-1)]">Category</div>
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  {categories.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="text-[var(--ink-1)]">Title</div>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2" />
              </label>
              <label className="block">
                <div className="text-[var(--ink-1)]">Amount (KRW)</div>
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(formatNumberInput(event.target.value))}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                />
              </label>
              <label className="block md:col-span-2">
                <div className="text-[var(--ink-1)]">Memo</div>
                <input value={memo} onChange={(event) => setMemo(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="rounded-full border border-white/10 px-4 py-2 text-sm" onClick={saveEntry}>
                {editingId ? "Update" : "Add"} Entry
              </button>
              {editingId ? (
                <button className="rounded-full border border-white/10 px-4 py-2 text-sm" onClick={resetForm}>
                  Cancel Edit
                </button>
              ) : null}
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm">
              <input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="New category"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              />
              <button className="rounded-full border border-white/10 px-3 py-2" onClick={addCategory}>
                Add
              </button>
            </div>
          </section>

          <section className="lifnux-glass rounded-2xl p-6">
            <div className="flex items-end justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Monthly Summary</div>
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-sm"
              />
            </div>
            <div className="mt-3 text-2xl font-semibold">{formatKrw(monthTotal)}</div>
            <div className="mt-1 text-sm text-white/85">Top category: {topCategory}</div>
            <div className="mt-3 flex items-center gap-2 text-sm">
                <input
                  inputMode="numeric"
                  value={budgetInput}
                  onChange={(event) => setBudgetInput(formatNumberInput(event.target.value))}
                  placeholder="Monthly budget"
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                />
              <button className="rounded-full border border-white/10 px-3 py-2" onClick={saveBudget}>
                Save
              </button>
            </div>
            <div className="mt-2 text-xs text-[var(--ink-1)]">
              Budget usage: {budget > 0 ? `${budgetPct.toFixed(1)}% (${formatKrw(monthTotal)} / ${formatKrw(budget)})` : "-"}
            </div>
            <div className="mt-4">
              <PieChart data={categoryTotals} />
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="lifnux-glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Ledger ({selectedMonth})</div>
            <div className="mt-3 max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {monthEntries.length ? (
                monthEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="text-white/80">
                        {entry.date} / {entry.category}
                      </div>
                      <div className="truncate">{entry.title}</div>
                      {entry.memo ? <div className="truncate text-xs text-[var(--ink-1)]">{entry.memo}</div> : null}
                    </div>
                    <div className="ml-3 text-right">
                      <div className="font-semibold">{formatKrw(entry.amount)}</div>
                      <div className="mt-1 flex gap-1">
                        <button className="rounded-full border border-white/10 px-2 py-[2px] text-xs" onClick={() => startEdit(entry)}>
                          Edit
                        </button>
                        <button className="rounded-full border border-rose-500/40 px-2 py-[2px] text-xs text-rose-200" onClick={() => removeEntry(entry.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-[var(--ink-1)]">No entries in this month.</div>
              )}
            </div>
          </section>

          <section className="lifnux-glass rounded-2xl p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Monthly History & Review</div>
            <div className="mt-3">
              <MiniLineChart points={monthlyHistory} />
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <input
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                placeholder="Grade (A/B/C...)"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              />
              <textarea
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder="Monthly review"
                className="h-24 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              />
              <button className="rounded-full border border-white/10 px-4 py-2 text-sm" onClick={saveReview}>
                Save Review
              </button>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  if (!data.length) return <div className="text-sm text-[var(--ink-1)]">No category data.</div>;
  const size = 200;
  const radius = 62;
  const stroke = 28;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;

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
                strokeLinecap="butt"
              />
            );
          })}
        </g>
      </svg>
      <div className="space-y-2 text-xs">
        {data.map((item) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
          <div key={item.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-[var(--ink-1)]">{item.label}</span>
            <span>{formatKrw(item.value)}</span>
            <span className="text-[var(--ink-1)]">({pct.toFixed(1)}%)</span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniLineChart({ points }: { points: { month: string; total: number }[] }) {
  if (!points.length) return <div className="text-sm text-[var(--ink-1)]">No monthly history.</div>;
  const width = 420;
  const height = 180;
  const pad = 16;
  const values = points.map((point) => point.total);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const toX = (index: number) => (points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2));
  const toY = (value: number) => pad + ((max - value) / range) * (height - pad * 2);
  const polyline = points.map((point, index) => `${toX(index)},${toY(point.total)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full rounded-lg border border-white/10 bg-black/20">
      <polyline points={polyline} fill="none" stroke="#7FE9CF" strokeWidth="2" />
      <text x={pad} y={height - 8} className="fill-white/60 text-[10px]">
        {points[0]?.month}
      </text>
      <text x={width - pad} y={height - 8} textAnchor="end" className="fill-white/60 text-[10px]">
        {points[points.length - 1]?.month}
      </text>
    </svg>
  );
}
