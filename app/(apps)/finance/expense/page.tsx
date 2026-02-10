"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../(shared)/components/AppShell";
import { Modal } from "../../../(shared)/components/Modal";
import { loadState, saveState } from "../../../(shared)/lib/storage";

const EXPENSE_LEDGER_KEY = "lifnux.finance.expense.ledger.v1";
const EXPENSE_CATEGORIES_KEY = "lifnux.finance.expense.categories.v1";
const EXPENSE_REVIEW_KEY = "lifnux.finance.expense.review.v1";
const EXPENSE_BUDGET_KEY = "lifnux.finance.expense.budget.v1";
const EXPENSE_SEED_BATCH = "seed-2010-2019";

const formatNumberInput = (value: string) => {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
};

const parseNumberInput = (value: string) => Number(value.replace(/[^\d]/g, ""));

type ExpenseEntry = {
  id: string;
  createdAt?: number;
  date: string;
  category: string;
  title: string;
  amount: number;
  memo?: string;
  batchId?: string;
};

type ReviewRating = "Great" | "Good" | "Soso" | "Bad" | "Worst";
type MonthlyReviewEntry = {
  month: string;
  overallRating: ReviewRating;
  overallComment: string;
  categoryReviews: Record<string, { rating: ReviewRating; comment: string }>;
  updatedAt: number;
};
type MonthlyReviewStore = Record<string, MonthlyReviewEntry>;

const formatKrw = (value: number) => `₩${Math.round(value).toLocaleString("ko-KR")}`;
const DEFAULT_CATEGORY = "Uncategorized";
const SMALL_GROUP_LABEL = "Other (small)";
const CATEGORY_COLORS = ["#7dd3fc", "#6ee7b7", "#f9a8d4", "#fde68a", "#c4b5fd", "#fca5a5"];
const REVIEW_RATINGS: ReviewRating[] = ["Great", "Good", "Soso", "Bad", "Worst"];

const buildCategoryTotals = (list: ExpenseEntry[]) => {
  const map = new Map<string, number>();
  list.forEach((entry) => map.set(entry.category, (map.get(entry.category) ?? 0) + entry.amount));
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.map(([label, value], index) => ({
    label,
    value,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
  }));
};

const groupCategoryTotals = (totals: { label: string; value: number; color: string }[], total: number) => {
  if (!totals.length || total <= 0) {
    return { data: totals, smallLabels: [] as string[] };
  }
  const thresholdPct = 1;
  const small = totals.filter((item) => (item.value / total) * 100 < thresholdPct);
  if (!small.length) return { data: totals, smallLabels: [] as string[] };
  const big = totals.filter((item) => !small.includes(item));
  const smallValue = small.reduce((sum, item) => sum + item.value, 0);
  return {
    data: [...big, { label: SMALL_GROUP_LABEL, value: smallValue, color: "#94a3b8" }],
    smallLabels: small.map((item) => item.label)
  };
};

const getPrevMonthKey = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  const prev = new Date(year, month - 2, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
};

export default function FinanceExpensePage() {
  const isDev = process.env.NODE_ENV !== "production";
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [categories, setCategories] = useState<string[]>(["Food", "Transport", "Housing", "Shopping", "Other"]);
  const [budgetByMonth, setBudgetByMonth] = useState<Record<string, number>>({});
  const [reviewByMonth, setReviewByMonth] = useState<MonthlyReviewStore>({});

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("Food");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [budgetInput, setBudgetInput] = useState("");
  const [reviewWriteOpen, setReviewWriteOpen] = useState(false);
  const [reviewListOpen, setReviewListOpen] = useState(false);
  const [reviewDetailOpen, setReviewDetailOpen] = useState(false);
  const [reviewSortDir, setReviewSortDir] = useState<"asc" | "desc">("desc");
  const [reviewDraft, setReviewDraft] = useState<{
    month: string;
    overallRating: ReviewRating;
    overallComment: string;
    categoryReviews: Record<string, { rating: ReviewRating; comment: string }>;
  } | null>(null);
  const [reviewDetailMonth, setReviewDetailMonth] = useState<string | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryDrafts, setCategoryDrafts] = useState<string[]>([]);
  const [categoryMoveTarget, setCategoryMoveTarget] = useState<Record<string, string>>({});
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<ExpenseEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExpenseEntry | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState<number>(new Date().getFullYear());
  const [monthPickerMonth, setMonthPickerMonth] = useState<number>(new Date().getMonth() + 1);
  const [viewMode, setViewMode] = useState<"monthly" | "yearly" | "range">("monthly");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [seedStartMonth, setSeedStartMonth] = useState("2010-01");
  const [seedEndMonth, setSeedEndMonth] = useState("2019-12");
  const [seedDensity, setSeedDensity] = useState<"light" | "normal" | "heavy">("normal");
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);
  const [seedSkipCount, setSeedSkipCount] = useState(0);
  const [seedStatusMessage, setSeedStatusMessage] = useState<string | null>(null);
  const [seedPendingConfig, setSeedPendingConfig] = useState<{ start: string; end: string; density: "light" | "normal" | "heavy" } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryPinned, setCategoryPinned] = useState(false);
  const [reportDetailOpen, setReportDetailOpen] = useState(false);
  const [reportContext, setReportContext] = useState<"main" | "history">("main");
  const [reportContextMonth, setReportContextMonth] = useState<string | null>(null);
  const [reportDetailSortKey, setReportDetailSortKey] = useState<"amount" | "date">("amount");
  const [reportDetailSortDir, setReportDetailSortDir] = useState<"asc" | "desc">("desc");
  const [ledgerSort, setLedgerSort] = useState<"date" | "amount">("date");
  const [ledgerSortDir, setLedgerSortDir] = useState<"asc" | "desc">("desc");
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [historyDetailMode, setHistoryDetailMode] = useState<"monthly" | "yearly" | "range">("monthly");
  const [historyDetailRangeStart, setHistoryDetailRangeStart] = useState("");
  const [historyDetailRangeEnd, setHistoryDetailRangeEnd] = useState("");
  const [historyDrillOpen, setHistoryDrillOpen] = useState(false);
  const [historyDrillMonth, setHistoryDrillMonth] = useState<string | null>(null);
  const [historyDrillCategory, setHistoryDrillCategory] = useState<string | null>(null);
  const [historyDrillPinned, setHistoryDrillPinned] = useState(false);
  const [historyDrillSortKey, setHistoryDrillSortKey] = useState<"amount" | "date">("amount");
  const [historyDrillSortDir, setHistoryDrillSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const loadedEntries = loadState<ExpenseEntry[]>(EXPENSE_LEDGER_KEY, []);
    const loadedCategories = loadState<string[]>(EXPENSE_CATEGORIES_KEY, ["Food", "Transport", "Housing", "Shopping", "Other"]);
    const loadedBudget = loadState<Record<string, number>>(EXPENSE_BUDGET_KEY, {});
    const loadedReview = loadState<MonthlyReviewStore>(EXPENSE_REVIEW_KEY, {});
    setEntries(loadedEntries);
    setCategories(loadedCategories.includes(DEFAULT_CATEGORY) ? loadedCategories : [...loadedCategories, DEFAULT_CATEGORY]);
    setBudgetByMonth(loadedBudget);
    setReviewByMonth(loadedReview);
    setBudgetInput(loadedBudget[selectedMonth] ? formatNumberInput(String(loadedBudget[selectedMonth])) : "");
    setSelectedCategories([]);
  }, []);

  useEffect(() => {
    setBudgetInput(budgetByMonth[selectedMonth] ? formatNumberInput(String(budgetByMonth[selectedMonth])) : "");
  }, [budgetByMonth, selectedMonth]);

  const monthEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(selectedMonth)),
    [entries, selectedMonth]
  );
  const yearKey = useMemo(() => selectedMonth.slice(0, 4), [selectedMonth]);
  const yearEntries = useMemo(() => entries.filter((entry) => entry.date.startsWith(yearKey)), [entries, yearKey]);
  const rangeEntries = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [];
    const start = new Date(`${rangeStart}T00:00:00Z`).getTime();
    const end = new Date(`${rangeEnd}T23:59:59Z`).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || start > end) return [];
    return entries.filter((entry) => {
      const time = new Date(`${entry.date}T00:00:00Z`).getTime();
      return time >= start && time <= end;
    });
  }, [entries, rangeStart, rangeEnd]);
  const activeEntries = useMemo(() => {
    if (viewMode === "yearly") return yearEntries;
    if (viewMode === "range") return rangeEntries;
    return monthEntries;
  }, [monthEntries, rangeEntries, viewMode, yearEntries]);
  const filteredEntries = useMemo(() => {
    if (!selectedCategories.length) return activeEntries;
    const set = new Set(selectedCategories);
    return activeEntries.filter((entry) => set.has(entry.category));
  }, [activeEntries, selectedCategories]);

  const sortedMonthEntries = useMemo(() => {
    const rows = [...filteredEntries];
    if (ledgerSort === "amount") {
      rows.sort((a, b) => a.amount - b.amount);
    } else {
      rows.sort((a, b) => {
        const aTime = a.createdAt ?? new Date(`${a.date}T00:00:00Z`).getTime();
        const bTime = b.createdAt ?? new Date(`${b.date}T00:00:00Z`).getTime();
        return aTime - bTime;
      });
    }
    return ledgerSortDir === "asc" ? rows : rows.reverse();
  }, [filteredEntries, ledgerSort, ledgerSortDir]);
  const monthTotal = useMemo(() => monthEntries.reduce((sum, entry) => sum + entry.amount, 0), [monthEntries]);
  const yearTotal = useMemo(() => yearEntries.reduce((sum, entry) => sum + entry.amount, 0), [yearEntries]);
  const rangeTotal = useMemo(() => rangeEntries.reduce((sum, entry) => sum + entry.amount, 0), [rangeEntries]);
  const categoryTotals = useMemo(() => buildCategoryTotals(monthEntries), [monthEntries]);
  const yearCategoryTotals = useMemo(() => buildCategoryTotals(yearEntries), [yearEntries]);
  const rangeCategoryTotals = useMemo(() => buildCategoryTotals(rangeEntries), [rangeEntries]);
  const summaryEntries = useMemo(
    () => (viewMode === "monthly" ? monthEntries : viewMode === "yearly" ? yearEntries : rangeEntries),
    [monthEntries, rangeEntries, viewMode, yearEntries]
  );
  const summaryTotal = useMemo(
    () => (viewMode === "monthly" ? monthTotal : viewMode === "yearly" ? yearTotal : rangeTotal),
    [monthTotal, rangeTotal, viewMode, yearTotal]
  );
  const summaryCategoryTotals = useMemo(
    () => (viewMode === "monthly" ? categoryTotals : viewMode === "yearly" ? yearCategoryTotals : rangeCategoryTotals),
    [categoryTotals, rangeCategoryTotals, viewMode, yearCategoryTotals]
  );
  const topCategory = useMemo(() => summaryCategoryTotals[0]?.label ?? "-", [summaryCategoryTotals]);
  const groupedCategoryData = useMemo(
    () => groupCategoryTotals(summaryCategoryTotals, summaryTotal),
    [summaryCategoryTotals, summaryTotal]
  );
  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((entry) => map.set(entry.category, (map.get(entry.category) ?? 0) + 1));
    return map;
  }, [entries]);
  const budget = budgetByMonth[selectedMonth] ?? 0;
  const budgetPct = budget > 0 ? (monthTotal / budget) * 100 : 0;

  const monthlyHistory = useMemo(() => {
    const byMonth = new Map<string, number>();
    entries.forEach((entry) => {
      const monthKey = entry.date.slice(0, 7);
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + entry.amount);
    });
    const monthKeys = new Set<string>([...byMonth.keys(), ...Object.keys(budgetByMonth)]);
    return [...monthKeys]
      .sort((a, b) => a.localeCompare(b))
      .map((month) => ({
        month,
        total: byMonth.get(month) ?? 0,
        budget: budgetByMonth[month] ?? null
      }));
  }, [budgetByMonth, entries]);

  const totalsByMonth = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((entry) => {
      const key = entry.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + entry.amount);
    });
    return map;
  }, [entries]);

  const reviewRows = useMemo(() => {
    const rows = Object.values(reviewByMonth);
    rows.sort((a, b) => a.month.localeCompare(b.month));
    return reviewSortDir === "asc" ? rows : rows.reverse();
  }, [reviewByMonth, reviewSortDir]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setAmount("");
    setMemo("");
    setDate(new Date().toISOString().slice(0, 10));
  };

  const openCreate = () => {
    resetForm();
    setCategory(categories[0] ?? "Other");
    setExpenseModalOpen(true);
  };

  const applyMonth = (year: number, month: number) => {
    const nextMonth = `${year}-${String(month).padStart(2, "0")}`;
    setSelectedMonth(nextMonth);
  };

  const shiftMonth = (delta: number) => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    applyMonth(next.getFullYear(), next.getMonth() + 1);
  };

  const saveEntry = () => {
    if (!date || !category || !title.trim()) return;
    const amountValue = parseNumberInput(amount);
    if (!(amountValue > 0)) return;
    const payload: ExpenseEntry = {
      id: editingId ?? crypto.randomUUID(),
      createdAt: editingId ? entries.find((entry) => entry.id === editingId)?.createdAt ?? Date.now() : Date.now(),
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
    setExpenseModalOpen(false);
  };

  const startEdit = (entry: ExpenseEntry) => {
    setEditingId(entry.id);
    setDate(entry.date);
    setCategory(entry.category);
    setTitle(entry.title);
    setAmount(formatNumberInput(String(entry.amount)));
    setMemo(entry.memo ?? "");
    setExpenseModalOpen(true);
  };

  const removeEntry = (id: string) => {
    const next = entries.filter((entry) => entry.id !== id);
    setEntries(next);
    saveState(EXPENSE_LEDGER_KEY, next);
    if (editingId === id) resetForm();
  };

  const saveBudget = () => {
    const value = parseNumberInput(budgetInput) || 0;
    const next = { ...budgetByMonth, [selectedMonth]: value };
    setBudgetByMonth(next);
    saveState(EXPENSE_BUDGET_KEY, next);
  };

  const openCategoryModal = () => {
    setCategoryDrafts(categories.length ? [...categories] : []);
    setNewCategory("");
    const targets: Record<string, string> = {};
    categories.forEach((item) => {
      targets[item] = DEFAULT_CATEGORY;
    });
    setCategoryMoveTarget(targets);
    setCategoryModalOpen(true);
  };

  const saveCategories = () => {
    const normalized = categoryDrafts.map((item) => item.trim()).filter((item) => item.length > 0);
    const unique = Array.from(new Set(normalized));
    const next = unique.length ? unique : ["Other"];
    setCategories(next);
    saveState(EXPENSE_CATEGORIES_KEY, next);
    if (!next.includes(category)) setCategory(next[0]);
    setCategoryModalOpen(false);
  };

  const addCategoryDraft = () => {
    const value = newCategory.trim();
    if (!value || categoryDrafts.includes(value)) return;
    setCategoryDrafts((prev) => [...prev, value]);
    setNewCategory("");
  };

  const applyCategoryMove = (from: string, to: string) => {
    if (!from || !to || from === to) return;
    const next = entries.map((entry) => (entry.category === from ? { ...entry, category: to } : entry));
    setEntries(next);
    saveState(EXPENSE_LEDGER_KEY, next);
  };

  const deleteCategory = (label: string) => {
    if (label === DEFAULT_CATEGORY) return;
    if ((categoryCounts.get(label) ?? 0) > 0) return;
    const next = categories.filter((item) => item !== label);
    setCategories(next);
    saveState(EXPENSE_CATEGORIES_KEY, next);
    if (category === label) setCategory(DEFAULT_CATEGORY);
  };

  const seedExpenses = (config: { start: string; end: string; density: "light" | "normal" | "heavy" }, force = false) => {
    if (entries.some((entry) => entry.batchId === EXPENSE_SEED_BATCH || entry.title.startsWith("[TEST2010_2019] "))) {
      setSeedStatusMessage("Seed already exists.");
      return;
    }

    const monthsInRange: string[] = [];
    const [startYear, startMonth] = config.start.split("-").map(Number);
    const [endYear, endMonth] = config.end.split("-").map(Number);
    if (!startYear || !startMonth || !endYear || !endMonth) {
      setSeedStatusMessage("Invalid seed range.");
      return;
    }
    const cursor = new Date(startYear, startMonth - 1, 1);
    const end = new Date(endYear, endMonth - 1, 1);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      monthsInRange.push(key);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const existingMonths = new Set(entries.map((entry) => entry.date.slice(0, 7)));
    const eligibleMonths = monthsInRange.filter((month) => !existingMonths.has(month) && month !== "2026-02");
    const skipCount = monthsInRange.length - eligibleMonths.length;

    if (skipCount > 0 && !force) {
      setSeedSkipCount(skipCount);
      setSeedPendingConfig(config);
      setSeedConfirmOpen(true);
      return;
    }

    let state = 123456789;
    const rand = () => {
      state = (1103515245 * state + 12345) % 2147483648;
      return state / 2147483648;
    };
    const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
    const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
    const withChance = (p: number) => rand() < p;

    const densityRanges: Record<"light" | "normal" | "heavy", [number, number]> = {
      light: [25, 60],
      normal: [40, 120],
      heavy: [80, 180]
    };

    const baseCategories = [
      "Food",
      "Snacks & Coffee",
      "Transport",
      "Shopping",
      "Subscription",
      "Entertainment",
      "Game",
      "Other",
      DEFAULT_CATEGORY
    ];
    const rareCategories = ["Medical", "Gift", "Education"];
    const allCategories = Array.from(new Set([...categories, ...baseCategories, ...rareCategories]));
    const nextCategories = allCategories.includes(DEFAULT_CATEGORY) ? allCategories : [...allCategories, DEFAULT_CATEGORY];

    const categoryWeights: { label: string; weight: number }[] = [
      { label: "Food", weight: 18 },
      { label: "Snacks & Coffee", weight: 16 },
      { label: "Transport", weight: 12 },
      { label: "Shopping", weight: 14 },
      { label: "Subscription", weight: 10 },
      { label: "Entertainment", weight: 8 },
      { label: "Game", weight: 6 },
      { label: "Other", weight: 6 },
      { label: DEFAULT_CATEGORY, weight: 5 },
      { label: "Medical", weight: 2 },
      { label: "Gift", weight: 2 },
      { label: "Education", weight: 1 }
    ];
    const weightedPickCategory = () => {
      const total = categoryWeights.reduce((sum, item) => sum + item.weight, 0);
      let roll = rand() * total;
      for (const item of categoryWeights) {
        roll -= item.weight;
        if (roll <= 0) return item.label;
      }
      return categoryWeights[0].label;
    };

    const titles: Record<string, string[]> = {
      "Food": ["점심 식사", "저녁 식사", "브런치", "회사 식대", "배달 음식"],
      "Snacks & Coffee": ["아메리카노", "카페라떼", "디저트", "편의점 간식", "베이커리"],
      "Transport": ["버스", "지하철", "택시", "주유", "주차"],
      "Shopping": ["의류 구매", "생활용품", "온라인 쇼핑", "가전 소모품", "잡화"],
      "Subscription": ["넷플릭스", "유튜브 프리미엄", "멜론", "클라우드", "뉴스 구독"],
      "Entertainment": ["영화", "전시", "공연", "여행 티켓", "테마파크"],
      "Game": ["게임 충전", "스팀", "모바일 패스", "아이템 구매"],
      "Other": ["기타 지출", "선물 포장", "잡비"],
      "Medical": ["병원", "약국", "검진"],
      "Gift": ["선물", "축의금", "기념일"],
      "Education": ["강의", "교재", "세미나"]
    };

    const amountRanges: Record<string, [number, number]> = {
      "Snacks & Coffee": [2000, 12000],
      "Food": [6000, 35000],
      "Transport": [1200, 50000],
      "Shopping": [10000, 300000],
      "Subscription": [3000, 30000],
      "Entertainment": [5000, 150000],
      "Game": [5000, 150000],
      "Other": [3000, 80000],
      "Medical": [8000, 200000],
      "Gift": [10000, 200000],
      "Education": [12000, 300000],
      [DEFAULT_CATEGORY]: [3000, 60000]
    };

    const recurringSubs = [
      { title: "Netflix", amount: 13500 },
      { title: "YouTube Premium", amount: 12900 },
      { title: "Music", amount: 10900 },
      { title: "Cloud Storage", amount: 5900 }
    ];

    const seeded: ExpenseEntry[] = [];
    const [minCount, maxCount] = densityRanges[config.density];
    eligibleMonths.forEach((monthKey) => {
      const [year, month] = monthKey.split("-").map(Number);
      const count = randInt(minCount, maxCount);
      const spike = month === 6 || month === 12;
      recurringSubs.forEach((sub) => {
        const day = randInt(3, 12);
        const date = `${monthKey}-${String(day).padStart(2, "0")}`;
        seeded.push({
          id: crypto.randomUUID(),
          batchId: EXPENSE_SEED_BATCH,
          createdAt: new Date(`${date}T12:00:00Z`).getTime() + randInt(0, 3600_000),
          date,
          category: "Subscription",
          title: `[TEST2010_2019] ${sub.title}`,
          amount: sub.amount + randInt(-1000, 1000),
          memo: withChance(0.2) ? "Monthly subscription" : undefined
        });
      });

      for (let i = 0; i < count; i += 1) {
        const day = randInt(1, 28);
        const date = `${monthKey}-${String(day).padStart(2, "0")}`;
        const categoryPicked = weightedPickCategory();
        const titlePool = titles[categoryPicked] ?? ["일반 지출"];
        const baseTitle = pick(titlePool);
        const range = amountRanges[categoryPicked] ?? [5000, 50000];
        const amount = randInt(range[0], range[1]);
        const spikeAmount = spike && withChance(0.12) ? randInt(300000, 2000000) : 0;
        const finalAmount = amount + spikeAmount;
        seeded.push({
          id: crypto.randomUUID(),
          batchId: EXPENSE_SEED_BATCH,
          createdAt: new Date(`${date}T09:00:00Z`).getTime() + randInt(0, 10_000_000),
          date,
          category: categoryPicked,
          title: `[TEST2010_2019] ${baseTitle}`,
          amount: finalAmount,
          memo: withChance(0.2) ? "Test memo" : undefined
        });
      }
    });

    const nextEntries = [...entries, ...seeded];
    setEntries(nextEntries);
    saveState(EXPENSE_LEDGER_KEY, nextEntries);
    setCategories(nextCategories);
    saveState(EXPENSE_CATEGORIES_KEY, nextCategories);
    setSeedStatusMessage(`Seeded ${eligibleMonths.length} months. Skipped ${skipCount} months.`);
    setSeedConfirmOpen(false);
    setSeedPendingConfig(null);
  };

  const clearSeededExpenses = () => {
    const next = entries.filter((entry) => entry.batchId !== EXPENSE_SEED_BATCH && !entry.title.startsWith("[TEST2010_2019] "));
    setEntries(next);
    saveState(EXPENSE_LEDGER_KEY, next);
    setSeedStatusMessage("Cleared seeded test data.");
  };

  const buildReviewDraft = (monthKey: string) => {
    const existing = reviewByMonth[monthKey];
    const monthEntriesForDraft = entries.filter((entry) => entry.date.startsWith(monthKey));
    const monthTotals = buildCategoryTotals(monthEntriesForDraft);
    const categoryList = monthTotals.length ? monthTotals.map((item) => item.label) : categories;
    const categoryReviews: Record<string, { rating: ReviewRating; comment: string }> = {};
    categoryList.forEach((label) => {
      categoryReviews[label] = {
        rating: existing?.categoryReviews[label]?.rating ?? "Soso",
        comment: existing?.categoryReviews[label]?.comment ?? ""
      };
    });
    return {
      month: monthKey,
      overallRating: existing?.overallRating ?? "Soso",
      overallComment: existing?.overallComment ?? "",
      categoryReviews
    };
  };

  const openWriteReview = (monthKey = selectedMonth) => {
    setReviewDraft(buildReviewDraft(monthKey));
    setReviewWriteOpen(true);
  };

  const saveReviewDraft = () => {
    if (!reviewDraft) return;
    const nextEntry: MonthlyReviewEntry = {
      month: reviewDraft.month,
      overallRating: reviewDraft.overallRating,
      overallComment: reviewDraft.overallComment,
      categoryReviews: reviewDraft.categoryReviews,
      updatedAt: Date.now()
    };
    const next = { ...reviewByMonth, [reviewDraft.month]: nextEntry };
    setReviewByMonth(next);
    saveState(EXPENSE_REVIEW_KEY, next);
    setReviewWriteOpen(false);
  };

  const openReviewDetail = (monthKey: string) => {
    setReviewDetailMonth(monthKey);
    setReviewDetailOpen(true);
  };

  const historyEntries = useMemo(
    () => (historyDrillMonth ? entries.filter((entry) => entry.date.startsWith(historyDrillMonth)) : []),
    [entries, historyDrillMonth]
  );
  const historyTotal = useMemo(() => historyEntries.reduce((sum, entry) => sum + entry.amount, 0), [historyEntries]);
  const historyCategoryTotals = useMemo(() => buildCategoryTotals(historyEntries), [historyEntries]);
  const historyGroupedCategoryData = useMemo(
    () => groupCategoryTotals(historyCategoryTotals, historyTotal),
    [historyCategoryTotals, historyTotal]
  );

  const reportBaseMonth = useMemo(() => {
    if (reportContext === "history") return reportContextMonth;
    if (viewMode === "monthly") return selectedMonth;
    return null;
  }, [reportContext, reportContextMonth, selectedMonth, viewMode]);
  const reportEntries = useMemo(
    () => (reportContext === "history" && reportContextMonth ? historyEntries : summaryEntries),
    [historyEntries, reportContext, reportContextMonth, summaryEntries]
  );
  const reportTotal = useMemo(
    () => (reportContext === "history" ? historyTotal : summaryTotal),
    [historyTotal, reportContext, summaryTotal]
  );
  const reportCategoryTotals = useMemo(
    () => (reportContext === "history" ? historyCategoryTotals : summaryCategoryTotals),
    [historyCategoryTotals, reportContext, summaryCategoryTotals]
  );
  const reportGroupedCategoryData = useMemo(
    () => (reportContext === "history" ? historyGroupedCategoryData : groupedCategoryData),
    [groupedCategoryData, historyGroupedCategoryData, reportContext]
  );
  const reportPrevMonthKey = useMemo(() => (reportBaseMonth ? getPrevMonthKey(reportBaseMonth) : null), [reportBaseMonth]);
  const reportPrevMonthEntries = useMemo(
    () => (reportPrevMonthKey ? entries.filter((entry) => entry.date.startsWith(reportPrevMonthKey)) : []),
    [entries, reportPrevMonthKey]
  );
  const reportPrevCategoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    reportPrevMonthEntries.forEach((entry) => map.set(entry.category, (map.get(entry.category) ?? 0) + entry.amount));
    return map;
  }, [reportPrevMonthEntries]);

  const reportDetailMeta = useMemo(() => {
    if (!reportDetailOpen || !selectedCategory) return null;
    const smallSet = new Set(reportGroupedCategoryData.smallLabels);
    const value =
      selectedCategory === SMALL_GROUP_LABEL
        ? reportCategoryTotals
            .filter((item) => smallSet.has(item.label))
            .reduce((sum, item) => sum + item.value, 0)
        : reportCategoryTotals.find((item) => item.label === selectedCategory)?.value ?? 0;
    const pct = reportTotal > 0 ? (value / reportTotal) * 100 : 0;
    const prevValue =
      reportBaseMonth && reportPrevCategoryTotals.size > 0
        ? selectedCategory === SMALL_GROUP_LABEL
          ? reportGroupedCategoryData.smallLabels.reduce((sum, label) => sum + (reportPrevCategoryTotals.get(label) ?? 0), 0)
          : reportPrevCategoryTotals.get(selectedCategory) ?? 0
        : 0;
    const deltaAmount = value - prevValue;
    const deltaPercent = prevValue > 0 ? (deltaAmount / prevValue) * 100 : null;
    return { label: selectedCategory, value, pct, prevValue, deltaAmount, deltaPercent };
  }, [
    reportBaseMonth,
    reportCategoryTotals,
    reportDetailOpen,
    reportGroupedCategoryData.smallLabels,
    reportPrevCategoryTotals,
    reportTotal,
    selectedCategory
  ]);
  const reportDeltaClass = useMemo(() => {
    if (!reportDetailMeta) return "text-[var(--ink-1)]";
    if (reportDetailMeta.prevValue === 0) return "text-[var(--ink-1)]";
    return reportDetailMeta.deltaAmount < 0 ? "text-emerald-300" : "text-rose-300";
  }, [reportDetailMeta]);
  const reportDetailEntries = useMemo(() => {
    if (!reportDetailMeta) return [];
    const smallSet = new Set(reportGroupedCategoryData.smallLabels);
    const rows = [...reportEntries].filter((entry) =>
      reportDetailMeta.label === SMALL_GROUP_LABEL ? smallSet.has(entry.category) : entry.category === reportDetailMeta.label
    );
    rows.sort((a, b) => {
      if (reportDetailSortKey === "amount") return a.amount - b.amount;
      return a.date.localeCompare(b.date);
    });
    return reportDetailSortDir === "asc" ? rows : rows.reverse();
  }, [reportDetailMeta, reportDetailSortDir, reportDetailSortKey, reportEntries, reportGroupedCategoryData.smallLabels]);

  const insightEntries = useMemo(() => {
    if (!selectedCategory) return [];
    const smallSet = new Set(groupedCategoryData.smallLabels);
    return [...summaryEntries]
      .filter((entry) =>
        selectedCategory === SMALL_GROUP_LABEL ? smallSet.has(entry.category) : entry.category === selectedCategory
      )
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [groupedCategoryData.smallLabels, selectedCategory, summaryEntries]);

  const historyInsightEntries = useMemo(() => {
    if (!historyDrillMonth || !historyDrillCategory) return [];
    const smallSet = new Set(historyGroupedCategoryData.smallLabels);
    return [...historyEntries]
      .filter((entry) =>
        historyDrillCategory === SMALL_GROUP_LABEL ? smallSet.has(entry.category) : entry.category === historyDrillCategory
      )
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [historyDrillCategory, historyDrillMonth, historyEntries, historyGroupedCategoryData.smallLabels]);

  const reviewDraftMonth = reviewDraft?.month ?? selectedMonth;
  const reviewDraftEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(reviewDraftMonth)),
    [entries, reviewDraftMonth]
  );
  const reviewDraftTotal = useMemo(() => reviewDraftEntries.reduce((sum, entry) => sum + entry.amount, 0), [reviewDraftEntries]);
  const reviewDraftCategoryTotals = useMemo(() => buildCategoryTotals(reviewDraftEntries), [reviewDraftEntries]);
  const reviewDraftGrouped = useMemo(
    () => groupCategoryTotals(reviewDraftCategoryTotals, reviewDraftTotal),
    [reviewDraftCategoryTotals, reviewDraftTotal]
  );
  const reviewDetail = useMemo(
    () => (reviewDetailMonth ? reviewByMonth[reviewDetailMonth] ?? null : null),
    [reviewByMonth, reviewDetailMonth]
  );

  const reviewDraftInsightEntries = useMemo(() => {
    if (!selectedCategory) return [];
    const smallSet = new Set(reviewDraftGrouped.smallLabels);
    return [...reviewDraftEntries]
      .filter((entry) =>
        selectedCategory === SMALL_GROUP_LABEL ? smallSet.has(entry.category) : entry.category === selectedCategory
      )
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [reviewDraftEntries, reviewDraftGrouped.smallLabels, selectedCategory]);

  const historyDetailPoints = useMemo(() => {
    if (historyDetailMode === "yearly") {
      const map = new Map<string, number>();
      entries.forEach((entry) => {
        const yearKey = entry.date.slice(0, 4);
        map.set(yearKey, (map.get(yearKey) ?? 0) + entry.amount);
      });
      return [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([year, total]) => ({ month: year, total, budget: null }));
    }
    const rangeStart = historyDetailRangeStart ? `${historyDetailRangeStart}-01` : "";
    const rangeEnd = historyDetailRangeEnd ? `${historyDetailRangeEnd}-01` : "";
    const startTime = rangeStart ? new Date(`${rangeStart}T00:00:00Z`).getTime() : null;
    const endTime = rangeEnd ? new Date(`${rangeEnd}T23:59:59Z`).getTime() : null;
    return monthlyHistory.filter((point) => {
      if (historyDetailMode !== "range" || (!startTime && !endTime)) return true;
      const pointTime = new Date(`${point.month}-01T00:00:00Z`).getTime();
      if (startTime && pointTime < startTime) return false;
      if (endTime && pointTime > endTime) return false;
      return true;
    });
  }, [entries, historyDetailMode, historyDetailRangeEnd, historyDetailRangeStart, monthlyHistory]);

  const historyDrillReportEntries = useMemo(() => {
    if (!historyDrillCategory) return [];
    const smallSet = new Set(historyGroupedCategoryData.smallLabels);
    const rows = [...historyEntries].filter((entry) =>
      historyDrillCategory === SMALL_GROUP_LABEL ? smallSet.has(entry.category) : entry.category === historyDrillCategory
    );
    rows.sort((a, b) => {
      if (historyDrillSortKey === "amount") return a.amount - b.amount;
      return a.date.localeCompare(b.date);
    });
    return historyDrillSortDir === "asc" ? rows : rows.reverse();
  }, [
    historyDrillCategory,
    historyDrillSortDir,
    historyDrillSortKey,
    historyEntries,
    historyGroupedCategoryData.smallLabels
  ]);

  const yearlyMonthTotals = useMemo(() => {
    const map = new Map<string, number>();
    yearEntries.forEach((entry) => {
      const key = entry.date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + entry.amount);
    });
    return Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      const key = `${yearKey}-${month}`;
      return { month: key, total: map.get(key) ?? 0 };
    });
  }, [yearEntries, yearKey]);

  useEffect(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    setMonthPickerYear(year);
    setMonthPickerMonth(month);
  }, [selectedMonth]);

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

        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
          <section className="lifnux-glass rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Ledger</div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-1 py-1">
                  <button
                    className="rounded-full border border-white/10 px-2 py-1 text-[11px]"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                  >
                    Prev
                  </button>
                  <button
                    className="rounded-full border border-white/20 px-3 py-1 text-[11px]"
                    onClick={() => setMonthPickerOpen(true)}
                  >
                    {selectedMonth}
                  </button>
                  <button
                    className="rounded-full border border-white/10 px-2 py-1 text-[11px]"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                  >
                    Next
                  </button>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 p-1">
                  <button
                    className={`rounded-full px-2 py-1 text-[11px] ${viewMode === "monthly" ? "border border-white/20 text-white" : "text-[var(--ink-1)]"}`}
                    onClick={() => setViewMode("monthly")}
                  >
                    Monthly
                  </button>
                  <button
                    className={`rounded-full px-2 py-1 text-[11px] ${viewMode === "yearly" ? "border border-white/20 text-white" : "text-[var(--ink-1)]"}`}
                    onClick={() => setViewMode("yearly")}
                  >
                    Yearly
                  </button>
                  <button
                    className={`rounded-full px-2 py-1 text-[11px] ${viewMode === "range" ? "border border-white/20 text-white" : "text-[var(--ink-1)]"}`}
                    onClick={() => setViewMode("range")}
                  >
                    Range
                  </button>
                </div>
                <button className="rounded-full border border-white/10 px-3 py-1 text-xs" onClick={openCreate}>
                  + Add Expense
                </button>
                {isDev ? (
                  <button className="rounded-full border border-white/10 px-3 py-1 text-[11px]" onClick={() => setDebugOpen(true)}>
                    Debug
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <button
                className={`rounded-full border px-3 py-1 ${ledgerSort === "date" ? "border-white/30 text-white" : "border-white/10 text-[var(--ink-1)]"}`}
                onClick={() => {
                  if (ledgerSort === "date") {
                    setLedgerSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                  } else {
                    setLedgerSort("date");
                    setLedgerSortDir("desc");
                  }
                }}
              >
                Latest {ledgerSort === "date" ? (ledgerSortDir === "asc" ? "▲" : "▼") : ""}
              </button>
              <button
                className={`rounded-full border px-3 py-1 ${ledgerSort === "amount" ? "border-white/30 text-white" : "border-white/10 text-[var(--ink-1)]"}`}
                onClick={() => {
                  if (ledgerSort === "amount") {
                    setLedgerSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                  } else {
                    setLedgerSort("amount");
                    setLedgerSortDir("desc");
                  }
                }}
              >
                Amount {ledgerSort === "amount" ? (ledgerSortDir === "asc" ? "▲" : "▼") : ""}
              </button>
              <button
                className="rounded-full border border-white/10 px-3 py-1 text-[var(--ink-1)]"
                onClick={() => setCategoryFilterOpen(true)}
              >
                Category Filter
              </button>
            </div>
            {viewMode === "range" ? (
              <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                <label className="block">
                  <div className="text-[var(--ink-1)]">From</div>
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(event) => setRangeStart(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs"
                  />
                </label>
                <label className="block">
                  <div className="text-[var(--ink-1)]">To</div>
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={(event) => setRangeEnd(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs"
                  />
                </label>
              </div>
            ) : null}
            <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {viewMode === "monthly" || viewMode === "range" ? (
                sortedMonthEntries.length ? (
                  sortedMonthEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-sm"
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => setDetailEntry(entry)}
                      >
                        <span className="truncate text-white/85">
                          {entry.date} | {entry.title}
                        </span>
                      </button>
                      <div className="flex items-center gap-3">
                        <span className="text-right font-semibold">{formatKrw(entry.amount)}</span>
                        <button
                          className="rounded-full border border-white/10 px-2 py-[2px] text-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            startEdit(entry);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-full border border-rose-500/40 px-2 py-[2px] text-xs text-rose-200"
                          onClick={(event) => {
                            event.stopPropagation();
                            setPendingDelete(entry);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-[var(--ink-1)]">No entries in this view.</div>
                )
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Year Total</div>
                    <div className="mt-2 text-lg font-semibold">{formatKrw(yearTotal)}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Monthly Totals</div>
                    <div className="mt-3 grid gap-2 text-xs">
                      {yearlyMonthTotals.map((row) => (
                        <div key={row.month} className="flex items-center justify-between rounded-md border border-white/5 bg-black/30 px-2 py-2">
                          <span>{row.month}</span>
                          <span className="font-semibold">{formatKrw(row.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Category Share</div>
                    <div className="mt-3 space-y-2 text-xs">
                      {yearCategoryTotals.length ? (
                        yearCategoryTotals.map((item) => {
                          const pct = yearTotal > 0 ? (item.value / yearTotal) * 100 : 0;
                          return (
                            <div key={item.label} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                <span>{item.label}</span>
                              </div>
                              <span className="text-[var(--ink-1)]">
                                {formatKrw(item.value)} | {pct.toFixed(1)}%
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-[var(--ink-1)]">No yearly data.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="relative space-y-6">
            <section className="lifnux-glass rounded-2xl p-6">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">
                {viewMode === "monthly"
                  ? `Monthly Summary (${selectedMonth})`
                  : viewMode === "yearly"
                    ? `Yearly Summary (${yearKey})`
                    : `Range Summary (${rangeStart || "----"} ~ ${rangeEnd || "----"})`}
              </div>
              <div className="mt-3 text-2xl font-semibold">
                {formatKrw(viewMode === "monthly" ? monthTotal : viewMode === "yearly" ? yearTotal : rangeTotal)}
              </div>
              <div className="mt-1 text-sm text-white/85">
                Top category:{" "}
                {topCategory}
              </div>
              {viewMode === "monthly" ? (
                <>
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
                </>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-full border border-white/10 px-3 py-2 text-xs" onClick={() => openWriteReview()}>
                  Write Monthly Review
                </button>
                <button className="rounded-full border border-white/10 px-3 py-2 text-xs" onClick={() => setReviewListOpen(true)}>
                  View Reviews
                </button>
              </div>
              <div className="mt-4">
                <PieChart
                  data={groupedCategoryData.data}
                  activeLabel={selectedCategory}
                  onHoverLabel={(label) => {
                    if (!categoryPinned) setSelectedCategory(label);
                  }}
                  onLeave={() => {
                    if (!categoryPinned) setSelectedCategory(null);
                  }}
                  onSelectLabel={(label) => {
                    if (selectedCategory === label && categoryPinned) {
                      setCategoryPinned(false);
                      setSelectedCategory(null);
                    } else {
                      setSelectedCategory(label);
                      setCategoryPinned(true);
                    }
                  }}
                />
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Insight</div>
                  {categoryPinned ? (
                    <button
                      className="rounded-full border border-white/10 px-2 py-1 text-[11px]"
                      onClick={() => {
                        setCategoryPinned(false);
                        setSelectedCategory(null);
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                {selectedCategory ? (
                  <>
                    <div className="mt-2 text-sm">{selectedCategory} top 5</div>
                    <div className="mt-3 space-y-2">
                      {insightEntries.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between gap-2">
                          <span className="truncate text-white/80">
                            {entry.date} · {entry.title}
                          </span>
                          <span className="shrink-0 font-semibold">{formatKrw(entry.amount)}</span>
                        </div>
                      ))}
                      {!insightEntries.length ? <div className="text-[var(--ink-1)]">No entries.</div> : null}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        className="rounded-full border border-white/10 px-3 py-1 text-[11px]"
                        onClick={() => {
                          if (!selectedCategory) return;
                          setReportContext("main");
                          setReportContextMonth(null);
                          setReportDetailOpen(true);
                          setReportDetailSortKey("amount");
                          setReportDetailSortDir("desc");
                        }}
                      >
                        View all
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-[var(--ink-1)]">카테고리를 선택하면 상위 소비내역이 표시됩니다.</div>
                )}
              </div>
            </section>
            {reportDetailOpen && reportDetailMeta ? (
              <div className="absolute left-full top-0 ml-4 w-[360px] rounded-2xl lifnux-glass p-4 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Report Detail</div>
                  <button
                    className="rounded-full border border-white/10 px-3 py-1 text-xs"
                    onClick={() => {
                      setReportDetailOpen(false);
                      setReportContext("main");
                      setReportContextMonth(null);
                    }}
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: reportGroupedCategoryData.data.find((item) => item.label === reportDetailMeta.label)?.color ?? "#94a3b8" }}
                    />
                    <div className="text-base">{reportDetailMeta.label}</div>
                  </div>
                  <div className="text-xs text-[var(--ink-1)]">
                    {formatKrw(reportDetailMeta.value)} | {reportDetailMeta.pct.toFixed(1)}%
                  </div>
                </div>
                <div className={`mt-1 text-xs ${reportDeltaClass}`}>
                  전월 대비:{" "}
                  {reportDetailMeta.prevValue === 0
                    ? reportDetailMeta.value > 0
                      ? "NEW"
                      : "전월 데이터 없음"
                    : `${reportDetailMeta.deltaAmount >= 0 ? "+" : "-"}${formatKrw(Math.abs(reportDetailMeta.deltaAmount))} (${reportDetailMeta.deltaPercent ? `${reportDetailMeta.deltaPercent >= 0 ? "+" : ""}${reportDetailMeta.deltaPercent.toFixed(1)}%` : "-"})`}
                </div>
                <div className="mt-4 flex items-center gap-2 text-[11px] text-[var(--ink-1)]">
                  <span>Sort</span>
                  <button
                    className={`rounded-full border px-2 py-1 ${reportDetailSortKey === "amount" ? "border-white/30 text-white" : "border-white/10"}`}
                    onClick={() => {
                      if (reportDetailSortKey === "amount") {
                        setReportDetailSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                      } else {
                        setReportDetailSortKey("amount");
                        setReportDetailSortDir("desc");
                      }
                    }}
                  >
                    Amount {reportDetailSortKey === "amount" ? (reportDetailSortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                  <button
                    className={`rounded-full border px-2 py-1 ${reportDetailSortKey === "date" ? "border-white/30 text-white" : "border-white/10"}`}
                    onClick={() => {
                      if (reportDetailSortKey === "date") {
                        setReportDetailSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                      } else {
                        setReportDetailSortKey("date");
                        setReportDetailSortDir("desc");
                      }
                    }}
                  >
                    Date {reportDetailSortKey === "date" ? (reportDetailSortDir === "asc" ? "▲" : "▼") : ""}
                  </button>
                </div>
                <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto text-xs">
                  {reportDetailEntries.map((entry) => (
                    <button
                      key={entry.id}
                      className="flex w-full items-start justify-between gap-2 border-b border-white/5 pb-2 text-left last:border-b-0 last:pb-0"
                      onClick={() => setDetailEntry(entry)}
                    >
                      <div>
                        <div className="text-white/80">
                          {entry.date} | {entry.title}
                        </div>
                      </div>
                      <div className="text-right font-semibold">{formatKrw(entry.amount)}</div>
                    </button>
                  ))}
                  {!reportDetailEntries.length ? <div className="text-[var(--ink-1)]">No entries.</div> : null}
                </div>
              </div>
            ) : null}

            <section className="lifnux-glass rounded-2xl p-6">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Expense History</div>
              <div className="mt-3">
                <ExpenseHistoryChart
                  points={monthlyHistory}
                  onChartClick={() => setHistoryDetailOpen(true)}
                />
              </div>
              <div className="mt-2 text-xs text-[var(--ink-1)]">Click a month point to drill down.</div>
            </section>
          </div>
        </div>
      </div>
      <Modal open={categoryModalOpen} title="Manage Categories" onClose={() => setCategoryModalOpen(false)}>
        <div className="space-y-3">
          {categoryDrafts.length ? (
            categoryDrafts.map((entry, index) => (
              <div key={`${entry}-${index}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex items-center gap-2">
                <input
                  value={entry}
                  onChange={(event) =>
                    setCategoryDrafts((prev) => prev.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                />
                <button
                  className="rounded-full border border-rose-500/40 px-3 py-2 text-xs text-rose-200 disabled:opacity-50"
                  disabled={(categoryCounts.get(entry) ?? 0) > 0}
                  onClick={() => {
                    deleteCategory(entry);
                    setCategoryDrafts((prev) => prev.filter((item) => item !== entry));
                  }}
                >
                  Delete
                </button>
                </div>
                <div className="mt-2 text-xs text-[var(--ink-1)]">
                  This category has {categoryCounts.get(entry) ?? 0} entries.
                </div>
                {(categoryCounts.get(entry) ?? 0) > 0 ? (
                  <div className="mt-2 grid gap-2 text-xs">
                    <div className="text-[var(--ink-1)]">Move entries to:</div>
                    <div className="flex items-center gap-2">
                      <select
                        value={categoryMoveTarget[entry] ?? DEFAULT_CATEGORY}
                        className="lifnux-select w-full rounded-lg border border-white/20 bg-[#0f1620] px-3 py-2 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                        onChange={(event) =>
                          setCategoryMoveTarget((prev) => ({ ...prev, [entry]: event.target.value }))
                        }
                      >
                        {[DEFAULT_CATEGORY, ...categories.filter((item) => item !== entry && item !== DEFAULT_CATEGORY)].map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                      <button
                        className="rounded-full border border-white/10 px-3 py-2 text-xs"
                        onClick={() => applyCategoryMove(entry, categoryMoveTarget[entry] ?? DEFAULT_CATEGORY)}
                      >
                        Move
                      </button>
                    </div>
                    <div className="text-[var(--ink-1)]">Entries must be moved before deleting.</div>
                    <div className="text-[var(--ink-1)]">이 카테고리에 속한 소비 내역이 남아 있어 삭제할 수 없습니다.</div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-[var(--ink-1)]">
                    You can delete this category because no entries remain.
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-sm text-[var(--ink-1)]">No categories yet.</div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="New category"
              className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            />
            <button className="rounded-full border border-white/10 px-3 py-2 text-xs" onClick={addCategoryDraft}>
              Add
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setCategoryModalOpen(false)}>
              Cancel
            </button>
            <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={saveCategories}>
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={categoryFilterOpen} title="Filter Categories" onClose={() => setCategoryFilterOpen(false)}>
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-full border px-3 py-1 text-xs ${selectedCategories.length === 0 ? "border-white/30 text-white" : "border-white/10 text-[var(--ink-1)]"}`}
              onClick={() => setSelectedCategories([])}
            >
              All
            </button>
            {categories.map((item) => {
              const active = selectedCategories.includes(item);
              return (
                <button
                  key={item}
                  className={`rounded-full border px-3 py-1 text-xs ${active ? "border-white/30 text-white" : "border-white/10 text-[var(--ink-1)]"}`}
                  onClick={() =>
                    setSelectedCategories((prev) =>
                      prev.includes(item) ? prev.filter((entry) => entry !== item) : [...prev, item]
                    )
                  }
                >
                  {item}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setCategoryFilterOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={debugOpen} title="Debug Tools" onClose={() => setDebugOpen(false)}>
        <div className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-[var(--ink-1)]">Start Month</div>
              <input
                type="month"
                value={seedStartMonth}
                onChange={(event) => setSeedStartMonth(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              />
            </label>
            <label className="block">
              <div className="text-[var(--ink-1)]">End Month</div>
              <input
                type="month"
                value={seedEndMonth}
                onChange={(event) => setSeedEndMonth(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              />
            </label>
          </div>
          <div>
            <div className="text-[var(--ink-1)]">Density</div>
            <div className="mt-2 flex items-center gap-2">
              {(["light", "normal", "heavy"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`rounded-full border px-3 py-1 text-xs ${seedDensity === mode ? "border-white/30 text-white" : "border-white/10 text-[var(--ink-1)]"}`}
                  onClick={() => setSeedDensity(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={() => seedExpenses({ start: seedStartMonth, end: seedEndMonth, density: seedDensity })}
            >
              Seed Test Data
            </button>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={clearSeededExpenses}>
              Clear Seeded Data
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={seedConfirmOpen} title="Seed Confirmation" onClose={() => setSeedConfirmOpen(false)}>
        <div className="space-y-4 text-sm">
          <div className="text-white/80">
            기존 데이터가 있는 {seedSkipCount}개월은 생성에서 제외됩니다. 계속할까요?
          </div>
          <div className="flex justify-end gap-2">
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setSeedConfirmOpen(false)}>
              Cancel
            </button>
            <button
              className="rounded-full border border-white/20 px-4 py-2 text-xs"
              onClick={() => {
                if (seedPendingConfig) seedExpenses(seedPendingConfig, true);
              }}
            >
              Continue
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!seedStatusMessage} title="Seed Status" onClose={() => setSeedStatusMessage(null)}>
        <div className="space-y-4 text-sm">
          <div className="text-white/80">{seedStatusMessage}</div>
          <div className="flex justify-end">
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setSeedStatusMessage(null)}>
              Close
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={historyDetailOpen}
        title="Expense History Detail"
        onClose={() => setHistoryDetailOpen(false)}
        panelClassName="w-[1100px] max-w-[92vw]"
      >
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {(["monthly", "yearly", "range"] as const).map((mode) => (
                <button
                  key={mode}
                  className={`rounded-full border px-3 py-1 text-xs ${historyDetailMode === mode ? "border-white/30 text-white" : "border-white/10 text-[var(--ink-1)]"}`}
                  onClick={() => setHistoryDetailMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
            {historyDetailMode === "range" ? (
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="month"
                  value={historyDetailRangeStart}
                  onChange={(event) => setHistoryDetailRangeStart(event.target.value)}
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                />
                <span>~</span>
                <input
                  type="month"
                  value={historyDetailRangeEnd}
                  onChange={(event) => setHistoryDetailRangeEnd(event.target.value)}
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                />
              </div>
            ) : null}
          </div>
          <ExpenseHistoryChart
            points={historyDetailPoints}
            height={240}
            onSelectMonth={(month) => {
              if (historyDetailMode === "yearly") return;
              const monthEntries = entries.filter((entry) => entry.date.startsWith(month));
              const monthTotals = buildCategoryTotals(monthEntries);
              setHistoryDrillMonth(month);
              setHistoryDrillCategory(monthTotals[0]?.label ?? null);
              setHistoryDrillPinned(false);
              setHistoryDrillSortKey("amount");
              setHistoryDrillSortDir("desc");
              setHistoryDrillOpen(true);
            }}
          />
          <div className="text-xs text-[var(--ink-1)]">Click a month to open summary + report detail.</div>
        </div>
      </Modal>

      <Modal
        open={historyDrillOpen}
        title={historyDrillMonth ? `Monthly Summary (${historyDrillMonth})` : "Monthly Summary"}
        onClose={() => setHistoryDrillOpen(false)}
        panelClassName="w-[1200px] max-w-[92vw]"
      >
        <div className="grid gap-4 text-sm md:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Summary</div>
              <div className="mt-2 text-lg font-semibold">{formatKrw(historyTotal)}</div>
              <div className="text-xs text-[var(--ink-1)]">Top category: {historyCategoryTotals[0]?.label ?? "-"}</div>
            </div>
            <PieChart
              data={historyGroupedCategoryData.data}
              activeLabel={historyDrillCategory}
              onHoverLabel={(label) => {
                if (!historyDrillPinned) setHistoryDrillCategory(label);
              }}
              onLeave={() => {
                if (!historyDrillPinned) setHistoryDrillCategory(null);
              }}
              onSelectLabel={(label) => {
                if (historyDrillCategory === label && historyDrillPinned) {
                  setHistoryDrillPinned(false);
                  setHistoryDrillCategory(null);
                } else {
                  setHistoryDrillCategory(label);
                  setHistoryDrillPinned(true);
                }
              }}
            />
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Insight</div>
                {historyDrillPinned ? (
                  <button
                    className="rounded-full border border-white/10 px-2 py-1 text-[11px]"
                    onClick={() => {
                      setHistoryDrillPinned(false);
                      setHistoryDrillCategory(null);
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {historyDrillCategory ? (
                <>
                  <div className="mt-2 text-sm">{historyDrillCategory} top 5</div>
                  <div className="mt-3 space-y-2">
                    {historyInsightEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-white/80">
                          {entry.date} · {entry.title}
                        </span>
                        <span className="shrink-0 font-semibold">{formatKrw(entry.amount)}</span>
                      </div>
                    ))}
                    {!historyInsightEntries.length ? <div className="text-[var(--ink-1)]">No entries.</div> : null}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-[var(--ink-1)]">카테고리를 선택하면 상위 소비내역이 표시됩니다.</div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Report Detail</div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--ink-1)]">
                <button
                  className={`rounded-full border px-2 py-1 ${historyDrillSortKey === "amount" ? "border-white/30 text-white" : "border-white/10"}`}
                  onClick={() => {
                    if (historyDrillSortKey === "amount") {
                      setHistoryDrillSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setHistoryDrillSortKey("amount");
                      setHistoryDrillSortDir("desc");
                    }
                  }}
                >
                  Amount {historyDrillSortKey === "amount" ? (historyDrillSortDir === "asc" ? "▲" : "▼") : ""}
                </button>
                <button
                  className={`rounded-full border px-2 py-1 ${historyDrillSortKey === "date" ? "border-white/30 text-white" : "border-white/10"}`}
                  onClick={() => {
                    if (historyDrillSortKey === "date") {
                      setHistoryDrillSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                    } else {
                      setHistoryDrillSortKey("date");
                      setHistoryDrillSortDir("desc");
                    }
                  }}
                >
                  Date {historyDrillSortKey === "date" ? (historyDrillSortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              </div>
            </div>
            <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto text-xs lifnux-scroll">
              {historyDrillReportEntries.map((entry) => (
                <button
                  key={entry.id}
                  className="flex w-full items-start justify-between gap-2 border-b border-white/5 pb-2 text-left last:border-b-0 last:pb-0"
                  onClick={() => setDetailEntry(entry)}
                >
                  <div className="text-white/80">
                    {entry.date} | {entry.title}
                  </div>
                  <div className="text-right font-semibold">{formatKrw(entry.amount)}</div>
                </button>
              ))}
              {!historyDrillReportEntries.length ? <div className="text-[var(--ink-1)]">No entries.</div> : null}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={reviewWriteOpen}
        title={reviewDraft ? `Write Monthly Review (${reviewDraft.month})` : "Write Monthly Review"}
        onClose={() => setReviewWriteOpen(false)}
        panelClassName="w-[1200px] max-w-[92vw] max-h-[90vh] overflow-hidden flex flex-col"
        contentClassName="flex-1 overflow-y-auto lifnux-scroll"
      >
        <div className="grid gap-6 text-sm md:grid-cols-[0.6fr_0.4fr]">
          <div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Summary</div>
              <div className="mt-2 text-lg font-semibold">{formatKrw(reviewDraftTotal)}</div>
              <div className="text-xs text-[var(--ink-1)]">Top category: {reviewDraftCategoryTotals[0]?.label ?? "-"}</div>
            </div>
            <div className="mt-3">
              <PieChart
                data={reviewDraftGrouped.data}
                activeLabel={selectedCategory}
                onHoverLabel={(label) => {
                  if (!categoryPinned) setSelectedCategory(label);
                }}
                onLeave={() => {
                  if (!categoryPinned) setSelectedCategory(null);
                }}
                onSelectLabel={(label) => {
                  if (selectedCategory === label && categoryPinned) {
                    setCategoryPinned(false);
                    setSelectedCategory(null);
                  } else {
                    setSelectedCategory(label);
                    setCategoryPinned(true);
                  }
                }}
              />
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Insight</div>
                {categoryPinned ? (
                  <button
                    className="rounded-full border border-white/10 px-2 py-1 text-[11px]"
                    onClick={() => {
                      setCategoryPinned(false);
                      setSelectedCategory(null);
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {selectedCategory ? (
                <>
                  <div className="mt-2 text-sm">{selectedCategory} top 5</div>
                  <div className="mt-3 space-y-2">
                    {reviewDraftInsightEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-white/80">
                          {entry.date} · {entry.title}
                        </span>
                        <span className="shrink-0 font-semibold">{formatKrw(entry.amount)}</span>
                      </div>
                    ))}
                    {!reviewDraftInsightEntries.length ? <div className="text-[var(--ink-1)]">No entries.</div> : null}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      className="rounded-full border border-white/10 px-3 py-1 text-[11px]"
                      onClick={() => {
                        if (!selectedCategory || !reviewDraft) return;
                        setReportContext("history");
                        setReportContextMonth(reviewDraft.month);
                        setReportDetailOpen(true);
                        setReportDetailSortKey("amount");
                        setReportDetailSortDir("desc");
                      }}
                    >
                      View all
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-2 text-[var(--ink-1)]">카테고리를 선택하면 상위 소비내역이 표시됩니다.</div>
              )}
            </div>
          </div>
          <div className="space-y-3">
            <label className="block">
              <div className="text-[var(--ink-1)]">Overall rating</div>
              <select
                value={reviewDraft?.overallRating ?? "Soso"}
                onChange={(event) =>
                  setReviewDraft((prev) => (prev ? { ...prev, overallRating: event.target.value as ReviewRating } : prev))
                }
                className="lifnux-select mt-1 w-full rounded-lg border border-white/20 bg-[#0f1620] px-3 py-2 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
              >
                {REVIEW_RATINGS.map((rating) => (
                  <option key={rating} value={rating}>
                    {rating}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <div className="text-[var(--ink-1)]">Overall comment</div>
              <textarea
                value={reviewDraft?.overallComment ?? ""}
                onChange={(event) =>
                  setReviewDraft((prev) => (prev ? { ...prev, overallComment: event.target.value } : prev))
                }
                className="mt-1 h-24 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              />
            </label>
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Per-category ratings</div>
            <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1 lifnux-scroll">
              {reviewDraft
                ? Object.entries(reviewDraft.categoryReviews).map(([label, data]) => (
                    <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="text-xs text-[var(--ink-1)]">{label}</div>
                      <select
                        value={data.rating}
                        onChange={(event) =>
                          setReviewDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  categoryReviews: {
                                    ...prev.categoryReviews,
                                    [label]: { ...prev.categoryReviews[label], rating: event.target.value as ReviewRating }
                                  }
                                }
                              : prev
                          )
                        }
                        className="lifnux-select mt-2 w-full rounded-lg border border-white/20 bg-[#0f1620] px-3 py-2 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                      >
                        {REVIEW_RATINGS.map((rating) => (
                          <option key={rating} value={rating}>
                            {rating}
                          </option>
                        ))}
                      </select>
                      <input
                        value={data.comment}
                        onChange={(event) =>
                          setReviewDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  categoryReviews: {
                                    ...prev.categoryReviews,
                                    [label]: { ...prev.categoryReviews[label], comment: event.target.value }
                                  }
                                }
                              : prev
                          )
                        }
                        placeholder="Comment (optional)"
                        className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                      />
                    </div>
                  ))
                : null}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setReviewWriteOpen(false)}>
                Cancel
              </button>
              <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={saveReviewDraft}>
                Save
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={reviewListOpen} title="Monthly Reviews" onClose={() => setReviewListOpen(false)}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Reviews</div>
            <button
              className="rounded-full border border-white/10 px-3 py-1 text-xs"
              onClick={() => setReviewSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
            >
              {reviewSortDir === "asc" ? "Oldest" : "Newest"}
            </button>
          </div>
          <div className="space-y-2">
            {reviewRows.map((row) => (
              <button
                key={row.month}
                className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left"
                onClick={() => openReviewDetail(row.month)}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{row.month}</div>
                  <div className="text-xs text-[var(--ink-1)]">{formatKrw(totalsByMonth.get(row.month) ?? 0)}</div>
                </div>
                <div className="mt-1 text-xs text-[var(--ink-1)]">Overall: {row.overallRating}</div>
                <div className="mt-1 truncate text-xs text-[var(--ink-1)]">{row.overallComment || "-"}</div>
              </button>
            ))}
            {!reviewRows.length ? <div className="text-[var(--ink-1)]">No reviews yet.</div> : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={reviewDetailOpen}
        title={reviewDetail ? `Review (${reviewDetail.month})` : "Review"}
        onClose={() => setReviewDetailOpen(false)}
      >
        {reviewDetail ? (
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Overall</div>
              <div className="mt-1 text-base">{reviewDetail.overallRating}</div>
              <div className="mt-2 text-xs text-[var(--ink-1)]">{reviewDetail.overallComment || "No comment."}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Per-category</div>
              <div className="mt-2 space-y-2">
                {Object.entries(reviewDetail.categoryReviews).map(([label, data]) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-[var(--ink-1)]">{label}</div>
                    <div className="mt-1 text-sm">{data.rating}</div>
                    <div className="mt-1 text-xs text-[var(--ink-1)]">{data.comment || "-"}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setReviewDetailOpen(false)}>
                Close
              </button>
              <button
                className="rounded-full border border-white/20 px-4 py-2 text-xs"
                onClick={() => {
                  setReviewDetailOpen(false);
                  openWriteReview(reviewDetail.month);
                }}
              >
                Edit
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-[var(--ink-1)]">No review data.</div>
        )}
      </Modal>

      <Modal open={monthPickerOpen} title="Select Month" onClose={() => setMonthPickerOpen(false)}>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <button
              className="rounded-full border border-white/10 px-3 py-1 text-xs"
              onClick={() => setMonthPickerYear((prev) => prev - 1)}
            >
              Prev Year
            </button>
            <div className="text-sm font-semibold">{monthPickerYear}</div>
            <button
              className="rounded-full border border-white/10 px-3 py-1 text-xs"
              onClick={() => setMonthPickerYear((prev) => prev + 1)}
            >
              Next Year
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {Array.from({ length: 12 }, (_, index) => {
              const month = index + 1;
              const isActive = monthPickerMonth === month;
              return (
                <button
                  key={month}
                  className={`rounded-lg border px-3 py-2 ${isActive ? "border-white/40 text-white" : "border-white/10 text-[var(--ink-1)]"}`}
                  onClick={() => {
                    setMonthPickerMonth(month);
                    applyMonth(monthPickerYear, month);
                    setMonthPickerOpen(false);
                  }}
                >
                  {month.toString().padStart(2, "0")}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setMonthPickerOpen(false)}>
              Cancel
            </button>
            <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={() => setMonthPickerOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={expenseModalOpen}
        title={editingId ? "Edit Expense" : "Add Expense"}
        onClose={() => setExpenseModalOpen(false)}
      >
        <div className="grid gap-3 text-sm">
          <label className="block">
            <div className="text-[var(--ink-1)]">Date</div>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
            />
          </label>
          <label className="block">
            <div className="flex items-center justify-between text-[var(--ink-1)]">
              <span>Category</span>
              <button
                type="button"
                className="rounded-full border border-white/10 px-2 py-[2px] text-[11px]"
                onClick={openCategoryModal}
              >
                Manage
              </button>
            </div>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="lifnux-select mt-1 w-full rounded-lg border border-white/20 bg-[#0f1620] px-3 py-2 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            >
              {categories.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="text-[var(--ink-1)]">Title</div>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
            />
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
          <label className="block">
            <div className="text-[var(--ink-1)]">Memo</div>
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              className="mt-1 h-24 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setExpenseModalOpen(false)}>
            Cancel
          </button>
          <button className="rounded-full border border-white/20 px-4 py-2 text-xs" onClick={saveEntry}>
            {editingId ? "Update" : "Save"}
          </button>
        </div>
      </Modal>

      <Modal open={!!detailEntry} title="Expense Detail" onClose={() => setDetailEntry(null)}>
        {detailEntry ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Metadata</div>
              <div className="mt-2 space-y-1">
                <div>
                  <span className="text-[var(--ink-1)]">Date:</span> {detailEntry.date}
                </div>
                <div>
                  <span className="text-[var(--ink-1)]">Category:</span> {detailEntry.category}
                </div>
                <div>
                  <span className="text-[var(--ink-1)]">Title:</span> {detailEntry.title}
                </div>
                <div>
                  <span className="text-[var(--ink-1)]">Amount:</span> {formatKrw(detailEntry.amount)}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Memo</div>
              <div className="mt-2 text-white/80">{detailEntry.memo ? detailEntry.memo : "-"}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-full border border-white/10 px-3 py-2 text-xs"
                onClick={() => {
                  setDetailEntry(null);
                  startEdit(detailEntry);
                }}
              >
                Edit
              </button>
              <button
                className="rounded-full border border-rose-500/40 px-3 py-2 text-xs text-rose-200"
                onClick={() => setPendingDelete(detailEntry)}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!pendingDelete} title="Delete this expense?" onClose={() => setPendingDelete(null)}>
        {pendingDelete ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-white/80">
              {pendingDelete.date} | {pendingDelete.title} | {formatKrw(pendingDelete.amount)}
            </div>
            <div className="flex justify-end gap-2">
              <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                className="rounded-full border border-rose-500/40 px-4 py-2 text-xs text-rose-200"
                onClick={() => {
                  removeEntry(pendingDelete.id);
                  setPendingDelete(null);
                  if (detailEntry?.id === pendingDelete.id) setDetailEntry(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AppShell>
  );
}

function PieChart({
  data,
  activeLabel,
  onHoverLabel,
  onLeave,
  onSelectLabel
}: {
  data: { label: string; value: number; color: string }[];
  activeLabel?: string | null;
  onHoverLabel?: (label: string) => void;
  onLeave?: () => void;
  onSelectLabel?: (label: string) => void;
}) {
  if (!data.length) return <div className="text-sm text-[var(--ink-1)]">No category data.</div>;
  const size = 200;
  const radius = 62;
  const stroke = 28;
  const circumference = 2 * Math.PI * radius;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  const gap = data.length > 1 ? Math.min(2, circumference * 0.004) : 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          {sorted.map((item) => {
            const value = total > 0 ? (item.value / total) * circumference : 0;
            const useGap = gap > 0 && value > gap * 1.4;
            const adjusted = useGap ? value - gap : value;
            const dasharray = `${adjusted} ${circumference - adjusted}`;
            const dashoffset = -(offset + (useGap ? gap / 2 : 0));
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
                opacity={activeLabel && activeLabel !== item.label ? 0.45 : 1}
                onMouseEnter={() => onHoverLabel?.(item.label)}
                onMouseLeave={() => onLeave?.()}
                onClick={() => onSelectLabel?.(item.label)}
              />
            );
          })}
        </g>
      </svg>
      <div className="space-y-2 text-xs">
        {sorted.map((item) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <button
              key={item.label}
              className="flex w-full items-center gap-2 text-left"
              onMouseEnter={() => onHoverLabel?.(item.label)}
              onMouseLeave={() => onLeave?.()}
              onClick={() => onSelectLabel?.(item.label)}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className={`min-w-0 flex-1 truncate ${activeLabel === item.label ? "text-white" : "text-[var(--ink-1)]"}`}>
                {item.label}
              </span>
              <span className="shrink-0">{formatKrw(item.value)}</span>
              <span className="shrink-0 text-[var(--ink-1)]">({pct.toFixed(1)}%)</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExpenseHistoryChart({
  points,
  onSelectMonth,
  onChartClick,
  height = 180
}: {
  points: { month: string; total: number; budget: number | null }[];
  onSelectMonth?: (month: string) => void;
  onChartClick?: () => void;
  height?: number;
}) {
  if (!points.length) return <div className="text-sm text-[var(--ink-1)]">No monthly history.</div>;
  const width = 420;
  const pad = 16;
  const [hovered, setHovered] = useState(false);
  const values = points.flatMap((point) => [point.total, point.budget ?? 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const toX = (index: number) => (points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2));
  const toY = (value: number) => pad + ((max - value) / range) * (height - pad * 2);
  const totalLine = points.map((point, index) => `${toX(index)},${toY(point.total)}`).join(" ");

  const budgetSegments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.budget === null || Number.isNaN(point.budget)) {
      if (current.length > 1) budgetSegments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${toX(index)},${toY(point.budget)}`);
  });
  if (current.length > 1) budgetSegments.push(current.join(" "));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full rounded-lg border border-white/10 bg-black/20"
      style={{ height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onChartClick?.()}
    >
      {budgetSegments.map((segment, index) => (
        <polyline key={index} points={segment} fill="none" stroke="#f9a8d4" strokeWidth="2" strokeDasharray="4 4" />
      ))}
      <polyline points={totalLine} fill="none" stroke="#7FE9CF" strokeWidth="2" />
      {points.map((point, index) => (
        <circle
          key={`hit-${point.month}`}
          cx={toX(index)}
          cy={toY(point.total)}
          r={8}
          className="fill-transparent"
          onClick={(event) => {
            if (onSelectMonth) {
              event.stopPropagation();
              onSelectMonth(point.month);
            }
          }}
        />
      ))}
      {hovered
        ? points.map((point, index) => (
            <circle key={`dot-${point.month}`} cx={toX(index)} cy={toY(point.total)} r={4} className="fill-white/90" />
          ))
        : null}
      <text x={pad} y={height - 8} className="fill-white/60 text-[10px]">
        {points[0]?.month}
      </text>
      <text x={width - pad} y={height - 8} textAnchor="end" className="fill-white/60 text-[10px]">
        {points[points.length - 1]?.month}
      </text>
    </svg>
  );
}
