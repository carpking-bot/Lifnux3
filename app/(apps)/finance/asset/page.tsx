"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "../../../(shared)/components/AppShell";
import { Modal } from "../../../(shared)/components/Modal";
import { ConfirmModal } from "../../../(shared)/components/ConfirmModal";
import { loadFinanceState, normalizeSymbol } from "../../../(shared)/lib/finance";
import { loadState, saveState } from "../../../(shared)/lib/storage";
import { useQuotes } from "../../../../src/lib/quotes/useQuotes";
import type { BrokerAccount, Holding, StockItem } from "../../../(shared)/types/finance";
import { loadAssetDataset } from "./assetDataset";

const ASSET_ITEMS_TEMPLATE_KEY = "asset_items_template";
const ASSET_MONTHLY_SNAPSHOTS_KEY = "asset_monthly_snapshots";
const ASSET_CATEGORY_SCHEMA_KEY = "lifnux.finance.asset.category.schema.v1";
const ASSET_SNAPSHOT_LOGS_KEY = "lifnux.finance.asset.snapshot.logs.v1";
const ASSET_EDITOR_DRAFTS_KEY = "lifnux.finance.asset.editor.drafts.v1";
const ASSET_DATASET_IMPORTED_KEY = "lifnux.finance.asset.dataset.imported.v9";
const ASSET_MIN_MONTH = "2024-03";
const UNCATEGORIZED_ID = "uncategorized";

type CategoryKind = "CASH" | "SAVING" | "INVESTING" | "PHYSICAL";

type AssetSubcategory = { id: string; name: string };
type AssetCategory = { id: string; name: string; kind?: CategoryKind; subcategories: AssetSubcategory[] };
type AssetItem = {
  id: string;
  accountId?: string;
  institution?: string;
  name: string;
  categoryId: string;
  subcategoryId?: string;
  amountKRW: number;
  note?: string;
  source?: "manual" | "investing";
  investingAccountId?: string;
  seedTag?: string;
};
type MonthlyAssetSnapshot = { month: string; items: AssetItem[]; updatedAt: number; source?: "manual" | "seed" };
type SnapshotMap = Record<string, MonthlyAssetSnapshot>;
type HistorySeries = { key: string; label: string; color: string; values: number[] };
type ItemEditDraft = {
  categoryId: string;
  subcategoryId: string;
  name: string;
  amountInput: string;
  note: string;
};
type SnapshotLog = {
  id: string;
  month: string;
  type: "SAVED" | "OVERWRITE";
  at: number;
  source: "manual" | "seed";
};
type SeedScenario = "worker-default" | "investing-heavy" | "cash-heavy" | "physical-heavy";
type SeedAccount = {
  id: string;
  institution: string;
  name: string;
  memo?: string;
  categoryName: "CASH" | "SAVING" | "INVESTING" | "PHYSICAL";
  subcategoryName: string;
  behavior:
    | "living"
    | "emergency"
    | "wallet"
    | "platform"
    | "term-deposit"
    | "installment"
    | "housing-subscription"
    | "investing-core"
    | "investing-isa"
    | "investing-pension"
    | "home"
    | "car";
  base: number;
};
type SeedSummary = {
  categories: number;
  accounts: number;
  snapshots: number;
  firstMonth: string;
  lastMonth: string;
  firstGroupTotals: { label: string; value: number }[];
  lastGroupTotals: { label: string; value: number }[];
};
type DonutItem = { id: string; label: string; value: number; signed: number; color: string; isDebt: boolean };
type EffectiveLatestSnapshotResult = {
  effectiveLatest: MonthlyAssetSnapshot | null;
  isFallback: boolean;
  fallbackFromMonth?: string;
  lastUpdatedAt?: string;
};
type HoverSummary = {
  month: string;
  total: number;
  delta: number;
  deltaPercent: number | null;
  hasPrev: boolean;
} | null;

const COLORS = ["#7dd3fc", "#6ee7b7", "#f9a8d4", "#fde68a", "#c4b5fd", "#fca5a5", "#67e8f9", "#34d399", "#60a5fa"];
const DARK_SELECT_STYLE = { backgroundColor: "#0b0f1a", color: "#e5e7eb" } as const;
const formatKrw = (v: number) => {
  const rounded = Math.round(v);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}₩${Math.abs(rounded).toLocaleString("ko-KR")}`;
};
const formatPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const monthNow = () => new Date().toISOString().slice(0, 7);
const clampAssetMonth = (month: string) => (month < ASSET_MIN_MONTH ? ASSET_MIN_MONTH : month);
const shiftMonth = (m: string, d: number) => {
  const [y, mm] = m.split("-").map(Number);
  const dt = new Date(y, mm - 1 + d, 1);
  return clampAssetMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
};
const listMonthsInRange = (start: string, end: string) => {
  if (!start || !end || start > end) return [] as string[];
  const months: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    months.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return months;
};
const parseAmount = (raw: string | number) => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const parsed = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const formatAmountWithComma = (raw: string) => {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
};
const sumItems = (items: AssetItem[]) => items.reduce((sum, item) => sum + item.amountKRW, 0);

const toCategoryKind = (group: string): CategoryKind | undefined => {
  if (group === "CASH" || group === "SAVING" || group === "INVESTING" || group === "PHYSICAL") return group;
  return undefined;
};

function getEffectiveLatestSnapshot(snapshots: MonthlyAssetSnapshot[], currentMonth: string): EffectiveLatestSnapshotResult {
  const valid = [...snapshots].filter((snapshot) => Array.isArray(snapshot.items) && snapshot.items.length > 0).sort((a, b) => a.month.localeCompare(b.month));
  if (!valid.length) {
    return { effectiveLatest: null, isFallback: false };
  }
  const current = valid.find((snapshot) => snapshot.month === currentMonth);
  if (current) {
    return {
      effectiveLatest: current,
      isFallback: false,
      lastUpdatedAt: new Date(current.updatedAt).toISOString()
    };
  }
  const previous = [...valid].reverse().find((snapshot) => snapshot.month < currentMonth) ?? null;
  if (!previous) {
    return { effectiveLatest: null, isFallback: false };
  }
  return {
    effectiveLatest: previous,
    isFallback: true,
    fallbackFromMonth: previous.month,
    lastUpdatedAt: new Date(previous.updatedAt).toISOString()
  };
}

function monthDiff(startMonth: string, endMonth: string): number {
  const sy = Number(startMonth.slice(0, 4));
  const sm = Number(startMonth.slice(5, 7));
  const ey = Number(endMonth.slice(0, 4));
  const em = Number(endMonth.slice(5, 7));
  return (ey - sy) * 12 + (em - sm);
}

function getHoverSummary(
  snapshots: MonthlyAssetSnapshot[],
  hoverMonth: string | null,
  totalOf: (snapshot: MonthlyAssetSnapshot) => number
): HoverSummary {
  if (!hoverMonth) return null;
  const sorted = [...snapshots].sort((a, b) => a.month.localeCompare(b.month));
  const current = sorted.find((snapshot) => snapshot.month === hoverMonth);
  if (!current) return null;
  const prev = [...sorted].reverse().find((snapshot) => snapshot.month < hoverMonth) ?? null;
  const total = totalOf(current);
  if (!prev) {
    return { month: hoverMonth, total, delta: 0, deltaPercent: null, hasPrev: false };
  }
  const prevTotal = totalOf(prev);
  const delta = total - prevTotal;
  const deltaPercent = prevTotal === 0 ? null : (delta / prevTotal) * 100;
  return { month: hoverMonth, total, delta, deltaPercent, hasPrev: true };
}

const buildSnapshotSeedFromDataset = () => {
  const dataset = loadAssetDataset();
  if (!dataset.accounts.length || !dataset.snapshots.length) return null;

  const categoryMap = new Map<string, AssetCategory>();
  const subMap = new Map<string, string>();
  dataset.accounts.forEach((account) => {
    const categoryId = `dataset-cat-${account.group.toLowerCase()}`;
    if (!categoryMap.has(account.group)) {
      categoryMap.set(account.group, {
        id: categoryId,
        name: account.group,
        kind: toCategoryKind(account.group),
        subcategories: []
      });
    }
    const subKey = `${account.group}::${account.subGroup}`;
    if (!subMap.has(subKey)) {
      const subId = `dataset-sub-${account.group.toLowerCase()}-${categoryMap.get(account.group)?.subcategories.length ?? 0}`;
      subMap.set(subKey, subId);
      categoryMap.get(account.group)?.subcategories.push({ id: subId, name: account.subGroup });
    }
  });

  const categories = [...categoryMap.values()];
  const accountById = new Map(dataset.accounts.map((account) => [account.id, account]));
  const snapshots: SnapshotMap = {};
  const logs: SnapshotLog[] = [];

  dataset.snapshots.forEach((snapshot, index) => {
    const items: AssetItem[] = snapshot.lines
      .map((line) => {
        const account = accountById.get(line.accountId);
        if (!account) return null;
        const subKey = `${account.group}::${account.subGroup}`;
        return {
          id: crypto.randomUUID(),
          accountId: account.id,
          name: account.name,
          categoryId: `dataset-cat-${account.group.toLowerCase()}`,
          subcategoryId: subMap.get(subKey),
          amountKRW: Math.round(line.valueKRW),
          note: account.memo,
          source: "manual" as const
        };
      })
      .filter((item): item is AssetItem => !!item);
    const at = Number.isFinite(Date.parse(snapshot.createdAt)) ? Date.parse(snapshot.createdAt) : Date.now() + index;
    snapshots[snapshot.month] = {
      month: snapshot.month,
      items,
      updatedAt: at,
      source: "manual"
    };
    logs.unshift({
      id: crypto.randomUUID(),
      month: snapshot.month,
      type: "SAVED",
      at,
      source: "manual"
    });
  });

  const sorted = [...dataset.snapshots].sort((a, b) => a.month.localeCompare(b.month));
  const last = sorted[sorted.length - 1];
  const template = last
    ? (snapshots[last.month]?.items ?? []).map((item) => ({ ...item, id: crypto.randomUUID() }))
    : [];
  return {
    categories,
    snapshots,
    logs: logs.slice(0, 500),
    template,
    latestMonth: last?.month ?? monthNow()
  };
};

const defaultCategories = (): AssetCategory[] => [
  {
    id: "cat-cash",
    name: "CASH",
    kind: "CASH",
    subcategories: [
      { id: "sub-cash-1", name: "예금/입출금 계좌" },
      { id: "sub-cash-2", name: "지갑 현금" },
      { id: "sub-cash-3", name: "플랫폼 머니/포인트" },
      { id: "sub-cash-4", name: "crypto (즉시 현금화 가능)" }
    ]
  },
  { id: "cat-saving", name: "SAVING", kind: "SAVING", subcategories: [{ id: "sub-saving-1", name: "적금/정기예금/청약" }] },
  { id: "cat-investing", name: "INVESTING", kind: "INVESTING", subcategories: [{ id: "sub-investing-1", name: "계좌 단위/합산 평가금" }] },
  { id: "cat-physical", name: "PHYSICAL", kind: "PHYSICAL", subcategories: [{ id: "sub-physical-1", name: "부동산/자동차/실물" }] }
];

const migrateItem = (raw: any): AssetItem => {
  if (raw && typeof raw.categoryId === "string") {
    return {
      id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
      name: typeof raw.name === "string" ? raw.name : "",
      categoryId: raw.categoryId || UNCATEGORIZED_ID,
      subcategoryId: typeof raw.subcategoryId === "string" ? raw.subcategoryId : undefined,
      amountKRW: parseAmount(raw.amountKRW),
      note: typeof raw.note === "string" ? raw.note : undefined,
      source: raw.source === "investing" ? "investing" : "manual",
      investingAccountId: typeof raw.investingAccountId === "string" ? raw.investingAccountId : undefined
    };
  }
  const legacyCategory = typeof raw?.category === "string" ? raw.category : "";
  const categoryId = legacyCategory === "CASH" ? "cat-cash" : legacyCategory === "INVESTING" ? "cat-investing" : legacyCategory === "OTHER" ? "cat-physical" : UNCATEGORIZED_ID;
  return {
    id: typeof raw?.id === "string" ? raw.id : crypto.randomUUID(),
    name: typeof raw?.name === "string" ? raw.name : "",
    categoryId,
    amountKRW: parseAmount(raw?.amountKRW),
    note: typeof raw?.note === "string" ? raw.note : undefined,
    source: raw?.source === "investing" ? "investing" : "manual"
  };
};

const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const seedScenarioLabel = (scenario: SeedScenario) => {
  if (scenario === "worker-default") return "직장인 기본";
  if (scenario === "investing-heavy") return "투자 비중 높음";
  if (scenario === "cash-heavy") return "현금/예금 비중 높음";
  return "실물자산 보유(집/차)";
};

const ensureSeedCategories = (current: AssetCategory[]) => {
  const required: Array<{ name: "CASH" | "SAVING" | "INVESTING" | "PHYSICAL"; kind: CategoryKind; subs: string[] }> = [
    { name: "CASH", kind: "CASH", subs: ["입출금/생활비", "비상금", "지갑현금", "플랫폼 머니/포인트"] },
    { name: "SAVING", kind: "SAVING", subs: ["정기예금", "적금", "주택청약"] },
    { name: "INVESTING", kind: "INVESTING", subs: ["일반 투자계좌", "ISA", "연금저축(연저펀)"] },
    { name: "PHYSICAL", kind: "PHYSICAL", subs: ["주거(집/전세보증금/부동산)", "자동차"] }
  ];
  const next = [...current];
  const categoryIdByName = new Map<string, string>();
  const subIdByKey = new Map<string, string>();

  required.forEach((rule) => {
    let category = next.find((item) => item.kind === rule.kind || item.name.toUpperCase() === rule.name);
    if (!category) {
      category = { id: crypto.randomUUID(), name: rule.name, kind: rule.kind, subcategories: [] };
      next.push(category);
    }
    categoryIdByName.set(rule.name, category.id);
    rule.subs.forEach((subName) => {
      let sub = category?.subcategories.find((item) => item.name === subName);
      if (!sub) {
        sub = { id: crypto.randomUUID(), name: subName };
        category?.subcategories.push(sub);
      }
      subIdByKey.set(`${rule.name}:${subName}`, sub.id);
    });
  });

  return { nextCategories: next, categoryIdByName, subIdByKey };
};

const toSeedAccounts = (scenario: SeedScenario): SeedAccount[] => {
  const common: SeedAccount[] = [
    { id: "acc-cash-living", institution: "국민은행", name: "생활비통장", memo: "급여/생활비", categoryName: "CASH", subcategoryName: "입출금/생활비", behavior: "living", base: 2800000 },
    { id: "acc-cash-emergency", institution: "카카오뱅크", name: "비상금통장", memo: "긴급자금", categoryName: "CASH", subcategoryName: "비상금", behavior: "emergency", base: 5000000 },
    { id: "acc-cash-wallet", institution: "현금", name: "지갑 현금", memo: "오프라인 사용", categoryName: "CASH", subcategoryName: "지갑현금", behavior: "wallet", base: 180000 },
    { id: "acc-cash-point-1", institution: "네이버", name: "네이버포인트", memo: "쇼핑 적립", categoryName: "CASH", subcategoryName: "플랫폼 머니/포인트", behavior: "platform", base: 62000 },
    { id: "acc-cash-point-2", institution: "토스", name: "토스머니", memo: "간편결제", categoryName: "CASH", subcategoryName: "플랫폼 머니/포인트", behavior: "platform", base: 84000 },
    { id: "acc-saving-term", institution: "신한은행", name: "정기예금(12개월)", memo: "이자형", categoryName: "SAVING", subcategoryName: "정기예금", behavior: "term-deposit", base: 12000000 },
    { id: "acc-saving-install", institution: "하나은행", name: "적금", memo: "월 납입", categoryName: "SAVING", subcategoryName: "적금", behavior: "installment", base: 3500000 },
    { id: "acc-saving-housing", institution: "국민은행", name: "주택청약", memo: "주택청약 종합저축", categoryName: "SAVING", subcategoryName: "주택청약", behavior: "housing-subscription", base: 4200000 },
    { id: "acc-invest-core", institution: "키움증권", name: "일반 투자계좌", memo: "국내/해외 혼합", categoryName: "INVESTING", subcategoryName: "일반 투자계좌", behavior: "investing-core", base: 18000000 },
    { id: "acc-invest-isa", institution: "미래에셋증권", name: "ISA", memo: "중기 투자", categoryName: "INVESTING", subcategoryName: "ISA", behavior: "investing-isa", base: 9300000 },
    { id: "acc-invest-pension", institution: "NH투자증권", name: "연금저축", memo: "장기 연금", categoryName: "INVESTING", subcategoryName: "연금저축(연저펀)", behavior: "investing-pension", base: 12200000 }
  ];
  const physicalHome: SeedAccount = {
    id: "acc-physical-home",
    institution: "실물자산",
    name: "내 집(아파트)",
    memo: "실거주",
    categoryName: "PHYSICAL",
    subcategoryName: "주거(집/전세보증금/부동산)",
    behavior: "home",
    base: 340000000
  };
  const physicalCar: SeedAccount = {
    id: "acc-physical-car",
    institution: "실물자산",
    name: "내 차(아반떼)",
    memo: "감가상각 반영",
    categoryName: "PHYSICAL",
    subcategoryName: "자동차",
    behavior: "car",
    base: 19800000
  };

  if (scenario === "investing-heavy") {
    return [...common.map((acc) => (acc.categoryName === "INVESTING" ? { ...acc, base: Math.round(acc.base * 1.8) } : acc)), physicalHome];
  }
  if (scenario === "cash-heavy") {
    return [
      ...common.map((acc) =>
        acc.categoryName === "CASH" || acc.categoryName === "SAVING"
          ? { ...acc, base: Math.round(acc.base * 1.5) }
          : acc.categoryName === "INVESTING"
            ? { ...acc, base: Math.round(acc.base * 0.7) }
            : acc
      ),
      physicalHome
    ];
  }
  if (scenario === "physical-heavy") {
    return [
      ...common.map((acc) => (acc.categoryName === "INVESTING" ? { ...acc, base: Math.round(acc.base * 0.9) } : acc)),
      { ...physicalHome, base: 430000000 },
      physicalCar
    ];
  }
  return [...common, { ...physicalHome, base: 300000000 }, physicalCar];
};

export default function FinanceAssetPage() {
  const [month, setMonth] = useState(clampAssetMonth(monthNow()));
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotMap>({});
  const [snapshotLogs, setSnapshotLogs] = useState<SnapshotLog[]>([]);
  const [editorItems, setEditorItems] = useState<AssetItem[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [historyVisible, setHistoryVisible] = useState<Record<string, boolean>>({ total: true });

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newSubName, setNewSubName] = useState<Record<string, string>>({});
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});
  const [subNameDraft, setSubNameDraft] = useState<Record<string, string>>({});

  const [itemGuardPassed, setItemGuardPassed] = useState(false);
  const [itemGuardOpen, setItemGuardOpen] = useState(false);
  const pendingItemActionRef = useRef<null | (() => void)>(null);

  const [categoryConfirmOpen, setCategoryConfirmOpen] = useState(false);
  const [categoryConfirmDetail, setCategoryConfirmDetail] = useState("");
  const pendingCategoryActionRef = useRef<null | (() => void)>(null);

  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [seedStartMonth, setSeedStartMonth] = useState("2025-01");
  const [seedEndMonth, setSeedEndMonth] = useState("2026-01");
  const [seedScenario, setSeedScenario] = useState<SeedScenario>("worker-default");
  const [seedNumber, setSeedNumber] = useState("202501");
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);
  const [seedSkipCount, setSeedSkipCount] = useState(0);
  const [seedPendingRange, setSeedPendingRange] = useState<{ start: string; end: string; scenario: SeedScenario; seedNumber: string } | null>(null);
  const [seedStatusMessage, setSeedStatusMessage] = useState<string | null>(null);
  const [seedSummary, setSeedSummary] = useState<SeedSummary | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [growthModalOpen, setGrowthModalOpen] = useState(false);
  const [growthStartMonth, setGrowthStartMonth] = useState("");
  const [growthEndMonth, setGrowthEndMonth] = useState("");
  const [editorCategoryFilter, setEditorCategoryFilter] = useState("ALL");
  const [editorSubcategoryFilter, setEditorSubcategoryFilter] = useState("ALL");
  const [editorAmountSort, setEditorAmountSort] = useState<"none" | "asc" | "desc">("none");
  const [historyHoverMonth, setHistoryHoverMonth] = useState<string | null>(null);
  const [historyPinnedMonth, setHistoryPinnedMonth] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editApplyConfirmOpen, setEditApplyConfirmOpen] = useState(false);
  const [editAlertMessage, setEditAlertMessage] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ItemEditDraft | null>(null);

  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [fxRate, setFxRate] = useState<number | null>(null);
  const hydratedEditorMonthRef = useRef<string>("");
  const anyAssetModalOpen =
    categoryModalOpen ||
    historyModalOpen ||
    growthModalOpen ||
    logsModalOpen ||
    debugOpen ||
    seedConfirmOpen ||
    !!seedStatusMessage ||
    itemGuardOpen ||
    categoryConfirmOpen ||
    overwriteOpen ||
    editModalOpen ||
    editApplyConfirmOpen;

  useEffect(() => {
    if (month < ASSET_MIN_MONTH) setMonth(ASSET_MIN_MONTH);
  }, [month]);

  useEffect(() => {
    let loadedCategories = loadState<AssetCategory[]>(ASSET_CATEGORY_SCHEMA_KEY, []);
    let loadedLogs = loadState<SnapshotLog[]>(ASSET_SNAPSHOT_LOGS_KEY, []);
    const loadedSnapshotsRaw = loadState<any>(ASSET_MONTHLY_SNAPSHOTS_KEY, {});
    let migrated: SnapshotMap = {};
    Object.entries(loadedSnapshotsRaw ?? {}).forEach(([key, value]) => {
      const entry = value as any;
      if (!entry || typeof entry !== "object") return;
      const m = typeof entry.month === "string" ? entry.month : key;
      if (m < ASSET_MIN_MONTH) return;
      const items = Array.isArray(entry.items) ? entry.items.map((it: any) => migrateItem(it)) : [];
      migrated[m] = { month: m, items, updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : Date.now() };
    });
    const rawCount = Object.keys(loadedSnapshotsRaw ?? {}).length;
    const filteredCount = Object.keys(migrated).length;
    if (filteredCount !== rawCount) {
      saveState(ASSET_MONTHLY_SNAPSHOTS_KEY, migrated);
    }
    const alreadyImported = loadState<boolean>(ASSET_DATASET_IMPORTED_KEY, false);
    if (!alreadyImported) {
      const imported = buildSnapshotSeedFromDataset();
      if (imported) {
        loadedCategories = imported.categories;
        loadedLogs = imported.logs;
        migrated = Object.fromEntries(
          Object.entries(imported.snapshots).filter(([snapshotMonth]) => snapshotMonth >= ASSET_MIN_MONTH)
        ) as SnapshotMap;
        saveState(ASSET_CATEGORY_SCHEMA_KEY, imported.categories);
        saveState(ASSET_SNAPSHOT_LOGS_KEY, imported.logs);
        saveState(ASSET_MONTHLY_SNAPSHOTS_KEY, migrated);
        saveState(ASSET_ITEMS_TEMPLATE_KEY, imported.template);
        saveState(ASSET_EDITOR_DRAFTS_KEY, {});
        saveState(ASSET_DATASET_IMPORTED_KEY, true);
        setMonth(clampAssetMonth(imported.latestMonth));
      }
    }
    if (!alreadyImported) {
      const filteredLogs = loadedLogs.filter((log) => log.month >= ASSET_MIN_MONTH);
      if (filteredLogs.length !== loadedLogs.length) {
        loadedLogs = filteredLogs;
        saveState(ASSET_SNAPSHOT_LOGS_KEY, loadedLogs);
      }
    }
    setCategories(loadedCategories.length ? loadedCategories : defaultCategories());
    setSnapshotLogs(loadedLogs);
    setSnapshots(migrated);

    const data = loadFinanceState();
    setAccounts(data.accounts ?? []);
    setHoldings(data.holdings ?? []);
    setStocks(data.stocks ?? []);
    const initialFx = data.indices.find((item) => item.symbol === "USD/KRW")?.last ?? null;
    setFxRate(initialFx && initialFx > 0 ? initialFx : null);
  }, []);

  useEffect(() => {
    const s = snapshots[month];
    const drafts = loadState<Record<string, AssetItem[]>>(ASSET_EDITOR_DRAFTS_KEY, {});
    if (Object.prototype.hasOwnProperty.call(drafts, month)) {
      const monthDraft = (drafts[month] ?? []).map((item) => migrateItem(item));
      setEditorItems(monthDraft);
      hydratedEditorMonthRef.current = month;
      return;
    }
    if (s) {
      setEditorItems(s.items.map((item) => ({ ...item })));
      hydratedEditorMonthRef.current = month;
      return;
    }
    const template = loadState<any[]>(ASSET_ITEMS_TEMPLATE_KEY, []);
    setEditorItems(template.map((it) => migrateItem(it)).filter((it) => it.source !== "investing"));
    hydratedEditorMonthRef.current = month;
  }, [month, snapshots]);

  useEffect(() => {
    if (hydratedEditorMonthRef.current !== month) return;
    const drafts = loadState<Record<string, AssetItem[]>>(ASSET_EDITOR_DRAFTS_KEY, {});
    drafts[month] = editorItems;
    saveState(ASSET_EDITOR_DRAFTS_KEY, drafts);
  }, [editorItems, month]);

  useEffect(() => {
    const fetchFx = async () => {
      try {
        const res = await fetch("/api/fx?pair=USD/KRW", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { fx?: { rate?: number | null } };
        const rate = typeof data.fx?.rate === "number" ? data.fx.rate : null;
        if (rate && rate > 0) setFxRate(rate);
      } catch {
        // noop
      }
    };
    void fetchFx();
    const timer = window.setInterval(() => void fetchFx(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (anyAssetModalOpen) return;
    document.body.style.overflow = "";
  }, [anyAssetModalOpen]);

  useEffect(() => {
    if (!categoryModalOpen) return;
    const catDraft: Record<string, string> = {};
    const subDraft: Record<string, string> = {};
    categories.forEach((cat) => {
      catDraft[cat.id] = cat.name;
      cat.subcategories.forEach((sub) => {
        subDraft[`${cat.id}:${sub.id}`] = sub.name;
      });
    });
    setNameDraft(catDraft);
    setSubNameDraft(subDraft);
  }, [categoryModalOpen, categories]);

  useEffect(() => {
    if (editorCategoryFilter === "ALL") return;
    const exists = categories.some((category) => category.id === editorCategoryFilter);
    if (!exists) {
      setEditorCategoryFilter("ALL");
      setEditorSubcategoryFilter("ALL");
      return;
    }
    const category = categories.find((item) => item.id === editorCategoryFilter);
    const subExists = (category?.subcategories ?? []).some((sub) => sub.id === editorSubcategoryFilter);
    if (!subExists) setEditorSubcategoryFilter("ALL");
  }, [categories, editorCategoryFilter, editorSubcategoryFilter]);

  const isDebtCategoryId = (categoryId: string) => {
    const name = categories.find((category) => category.id === categoryId)?.name ?? "";
    const normalized = name.toUpperCase();
    return normalized.includes("DEBT") || name.includes("부채");
  };
  const signedAmountByCategory = (categoryId: string, rawAmount: number) =>
    isDebtCategoryId(categoryId) ? -Math.abs(rawAmount) : rawAmount;
  const signedSnapshotTotal = (items: AssetItem[]) =>
    items.reduce((sum, item) => sum + signedAmountByCategory(item.categoryId, item.amountKRW), 0);

  const sortedSnapshots = useMemo(() => Object.values(snapshots).sort((a, b) => a.month.localeCompare(b.month)), [snapshots]);
  const selectedSnapshot = snapshots[month] ?? null;
  const prevSnapshot = [...sortedSnapshots].reverse().find((snapshot) => snapshot.month < month) ?? null;
  const selectedTotal = signedSnapshotTotal(editorItems);
  const prevTotal = prevSnapshot ? signedSnapshotTotal(prevSnapshot.items) : 0;
  const momDiff = prevSnapshot ? selectedTotal - prevTotal : 0;
  const momPct = prevSnapshot && prevTotal !== 0 ? (momDiff / prevTotal) * 100 : 0;

  const activeHoldings = useMemo(() => holdings.filter((h) => h.qty > 0), [holdings]);
  const getQuoteSymbol = (stock: StockItem) => (stock.market === "KR" && !stock.symbol.includes(".") ? `${stock.symbol}.KS` : stock.symbol);
  const heldStockSet = useMemo(() => new Set(activeHoldings.map((h) => normalizeSymbol(h.symbolKey))), [activeHoldings]);
  const heldStocks = useMemo(() => stocks.filter((s) => heldStockSet.has(normalizeSymbol(s.symbol))), [stocks, heldStockSet]);
  const heldSymbols = useMemo(() => heldStocks.map((s) => getQuoteSymbol(s)), [heldStocks]);
  const { bySymbol: heldQuotes } = useQuotes(heldSymbols);

  const investingByAccount = useMemo(() => {
    const map = new Map<string, number>();
    activeHoldings.forEach((holding) => {
      const stock = stocks.find((s) => s.id === holding.stockId) ?? stocks.find((s) => normalizeSymbol(s.symbol) === normalizeSymbol(holding.symbolKey));
      const quote = stock ? heldQuotes.get(getQuoteSymbol(stock).toUpperCase()) : undefined;
      const price = quote?.price ?? stock?.last ?? 0;
      const value = price * holding.qty;
      const valueKrw = holding.currency === "USD" ? (fxRate ? value * fxRate : 0) : value;
      map.set(holding.accountId, (map.get(holding.accountId) ?? 0) + valueKrw);
    });
    return map;
  }, [activeHoldings, stocks, heldQuotes, fxRate]);

  const investingLiveTotal = useMemo(() => {
    let total = 0;
    investingByAccount.forEach((v) => (total += v));
    return total;
  }, [investingByAccount]);

  const categoryMap = useMemo(() => new Map(categories.map((cat) => [cat.id, cat])), [categories]);
  const categoryCards = useMemo(() => {
    const base = [...categories];
    if (editorItems.some((item) => !categoryMap.has(item.categoryId))) {
      base.push({ id: UNCATEGORIZED_ID, name: "Unassigned", subcategories: [] });
    }
    return base.map((cat, idx) => {
      const items = editorItems
        .filter((item) => (categoryMap.has(item.categoryId) ? item.categoryId === cat.id : cat.id === UNCATEGORIZED_ID))
        .sort((a, b) => b.amountKRW - a.amountKRW);
      return {
        ...cat,
        color: COLORS[idx % COLORS.length],
        total: items.reduce((sum, item) => sum + signedAmountByCategory(cat.id, item.amountKRW), 0),
        items
      };
    });
  }, [categories, editorItems, categoryMap]);

  const donutData = useMemo(
    () =>
      categoryCards
        .filter((card) => card.total !== 0)
        .map((card) => ({
          id: card.id,
          label: card.name,
          value: Math.abs(card.total),
          signed: card.total,
          color: card.color,
          isDebt: isDebtCategoryId(card.id)
        })),
    [categoryCards]
  );

  const historyMonths = useMemo(() => sortedSnapshots.map((s) => s.month), [sortedSnapshots]);
  const runtimeCurrentMonth = monthNow();
  const effectiveLatest = useMemo(() => getEffectiveLatestSnapshot(sortedSnapshots, runtimeCurrentMonth), [sortedSnapshots, runtimeCurrentMonth]);
  const effectiveLatestMonth = effectiveLatest.effectiveLatest?.month ?? null;
  const historySeries = useMemo(() => {
    const lines: HistorySeries[] = [
      { key: "total", label: "Total Asset", color: "#7FE9CF", values: sortedSnapshots.map((s) => signedSnapshotTotal(s.items)) }
    ];
    categoryCards.forEach((card) => {
      lines.push({
        key: card.id,
        label: card.name,
        color: card.color,
        values: sortedSnapshots.map((s) =>
          s.items
            .filter((item) => (categoryMap.has(item.categoryId) ? item.categoryId === card.id : card.id === UNCATEGORIZED_ID))
            .reduce((sum, item) => sum + signedAmountByCategory(card.id, item.amountKRW), 0)
        )
      });
    });
    return lines;
  }, [sortedSnapshots, categoryCards, categoryMap]);
  const activeTooltipMonth = historyPinnedMonth ?? historyHoverMonth ?? effectiveLatestMonth;
  const hoverSummary = useMemo(() => getHoverSummary(sortedSnapshots, activeTooltipMonth, (snapshot) => signedSnapshotTotal(snapshot.items)), [activeTooltipMonth, sortedSnapshots]);
  const categoryGroupById = useMemo(() => {
    const map = new Map<string, "CASH" | "SAVING" | "INVESTING" | "PHYSICAL" | "DEBT">();
    categories.forEach((category) => {
      const normalizedName = category.name.toUpperCase();
      if (normalizedName.includes("DEBT") || category.name.includes("부채")) {
        map.set(category.id, "DEBT");
      } else if (category.kind === "CASH") {
        map.set(category.id, "CASH");
      } else if (category.kind === "SAVING") {
        map.set(category.id, "SAVING");
      } else if (category.kind === "INVESTING") {
        map.set(category.id, "INVESTING");
      } else if (category.kind === "PHYSICAL") {
        map.set(category.id, "PHYSICAL");
      } else if (normalizedName.includes("CASH")) {
        map.set(category.id, "CASH");
      } else if (normalizedName.includes("SAV")) {
        map.set(category.id, "SAVING");
      } else if (normalizedName.includes("INVEST")) {
        map.set(category.id, "INVESTING");
      } else {
        map.set(category.id, "PHYSICAL");
      }
    });
    return map;
  }, [categories]);
  const growthInsights = useMemo(() => {
    const valid = [...sortedSnapshots].filter((snapshot) => snapshot.items.length > 0).sort((a, b) => a.month.localeCompare(b.month));
    if (!valid.length) return { enough: false as const };
    const endAnchor = growthEndMonth || effectiveLatestMonth || valid[valid.length - 1].month;
    const startAnchor = growthStartMonth || shiftMonth(endAnchor, -6);
    const resolvedStart = valid.find((snapshot) => snapshot.month >= startAnchor) ?? null;
    const resolvedEnd = [...valid].reverse().find((snapshot) => snapshot.month <= endAnchor) ?? null;
    if (!resolvedStart || !resolvedEnd || resolvedStart.month > resolvedEnd.month) return { enough: false as const };
    const periodSnapshots = valid.filter((snapshot) => snapshot.month >= resolvedStart.month && snapshot.month <= resolvedEnd.month);
    if (periodSnapshots.length < 2) {
      return { enough: false as const, resolvedStart, resolvedEnd };
    }
    const totalOf = (snapshot: MonthlyAssetSnapshot) => signedSnapshotTotal(snapshot.items);
    const startTotal = totalOf(resolvedStart);
    const endTotal = totalOf(resolvedEnd);
    const totalDelta = endTotal - startTotal;
    const totalPct = startTotal !== 0 ? (totalDelta / startTotal) * 100 : null;
    const monthsGap = monthDiff(resolvedStart.month, resolvedEnd.month);
    const cagrAnnual = monthsGap > 0 && startTotal > 0 && endTotal > 0 ? Math.pow(endTotal / startTotal, 12 / monthsGap) - 1 : null;
    const groups: Array<"CASH" | "SAVING" | "INVESTING" | "PHYSICAL" | "DEBT"> = ["CASH", "SAVING", "INVESTING", "PHYSICAL", "DEBT"];
    const groupTotal = (snapshot: MonthlyAssetSnapshot, group: "CASH" | "SAVING" | "INVESTING" | "PHYSICAL" | "DEBT") =>
      snapshot.items.reduce((sum, item) => {
        const g = categoryGroupById.get(item.categoryId) ?? "PHYSICAL";
        if (g !== group) return sum;
        return sum + signedAmountByCategory(item.categoryId, item.amountKRW);
      }, 0);
    const groupChange = groups.map((group) => {
      const start = groupTotal(resolvedStart, group);
      const end = groupTotal(resolvedEnd, group);
      const delta = end - start;
      const pct = start !== 0 ? (delta / start) * 100 : null;
      return { group, start, end, delta, pct };
    });
    const groupAth = groups.map((group) => {
      let peak = -Infinity;
      let peakMonth = resolvedStart.month;
      periodSnapshots.forEach((snapshot) => {
        const value = groupTotal(snapshot, group);
        if (value > peak) {
          peak = value;
          peakMonth = snapshot.month;
        }
      });
      const end = groupTotal(resolvedEnd, group);
      const vsAthPct = Number.isFinite(peak) && peak !== 0 ? ((end - peak) / peak) * 100 : null;
      return { group, athValue: Number.isFinite(peak) ? peak : 0, athMonth: peakMonth, endValue: end, vsAthPct };
    });
    let bestMonth: { month: string; delta: number } | null = null;
    let worstMonth: { month: string; delta: number } | null = null;
    for (let i = 1; i < periodSnapshots.length; i += 1) {
      const delta = totalOf(periodSnapshots[i]) - totalOf(periodSnapshots[i - 1]);
      if (!bestMonth || delta > bestMonth.delta) bestMonth = { month: periodSnapshots[i].month, delta };
      if (!worstMonth || delta < worstMonth.delta) worstMonth = { month: periodSnapshots[i].month, delta };
    }
    let peakTotal = -Infinity;
    let maxDrawdown = 0;
    periodSnapshots.forEach((snapshot) => {
      const total = totalOf(snapshot);
      if (total > peakTotal) peakTotal = total;
      if (peakTotal > 0) {
        const dd = (total - peakTotal) / peakTotal;
        if (dd < maxDrawdown) maxDrawdown = dd;
      }
    });
    return {
      enough: true as const,
      resolvedStart,
      resolvedEnd,
      totalDelta,
      totalPct,
      cagrAnnual,
      groupChange,
      groupAth,
      bestMonth,
      worstMonth,
      maxDrawdown
    };
  }, [categoryGroupById, effectiveLatestMonth, growthEndMonth, growthStartMonth, sortedSnapshots]);

  const requestItemGuard = (action: () => void) => {
    if (itemGuardPassed) {
      action();
      return;
    }
    pendingItemActionRef.current = action;
    setItemGuardOpen(true);
  };

  const requestCategoryConfirm = (detail: string, action: () => void) => {
    pendingCategoryActionRef.current = action;
    setCategoryConfirmDetail(detail);
    setCategoryConfirmOpen(true);
  };

  const saveCategorySchema = (next: AssetCategory[]) => {
    setCategories(next);
    saveState(ASSET_CATEGORY_SCHEMA_KEY, next);
  };

  const addItem = (categoryId?: string) => {
    const target = categoryId ?? categories[0]?.id ?? UNCATEGORIZED_ID;
    const subId = categories.find((c) => c.id === target)?.subcategories[0]?.id;
    setEditorItems((prev) => [...prev, { id: crypto.randomUUID(), name: "", categoryId: target, subcategoryId: subId, amountKRW: 0, source: "manual" }]);
  };

  const updateItem = (id: string, patch: Partial<AssetItem>) => setEditorItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id: string) => requestItemGuard(() => setEditorItems((prev) => prev.filter((it) => it.id !== id)));
  const openEditItem = (item: AssetItem) => {
    setEditingItemId(item.id);
    setEditDraft({
      categoryId: item.categoryId,
      subcategoryId: item.subcategoryId ?? "",
      name: item.name,
      amountInput: item.amountKRW ? item.amountKRW.toLocaleString("ko-KR") : "",
      note: item.note ?? ""
    });
    setEditModalOpen(true);
  };
  const closeEditItem = () => {
    setEditModalOpen(false);
    setEditApplyConfirmOpen(false);
    setEditingItemId(null);
    setEditDraft(null);
  };
  const applyEditItem = () => {
    if (!editingItemId || !editDraft) return;
    const nextAmount = parseAmount(editDraft.amountInput);
    setEditorItems((prev) =>
      prev.map((item) =>
        item.id === editingItemId
          ? {
              ...item,
              categoryId: editDraft.categoryId,
              subcategoryId: editDraft.subcategoryId || undefined,
              name: editDraft.name.trim(),
              amountKRW: Math.max(0, nextAmount),
              note: editDraft.note.trim() || undefined
            }
          : item
      )
    );
    closeEditItem();
    setEditAlertMessage("자산 항목 수정이 적용되었습니다. Snapshot 저장 전까지는 Draft 상태입니다.");
  };

  const duplicatePreviousMonth = () => {
    const previous = [...sortedSnapshots].reverse().find((s) => s.month < month);
    if (!previous) return;
    setEditorItems(previous.items.map((it) => ({ ...it, id: crypto.randomUUID() })));
  };

  const syncInvesting = (categoryId?: string) => {
    if (!isCurrentMonth) return;
    const target = categories.find((c) => c.id === categoryId) ?? categories.find((c) => c.kind === "INVESTING") ?? categories[0];
    if (!target) return;
    const subId = target.subcategories[0]?.id;
    const rows: AssetItem[] = [];
    investingByAccount.forEach((value, accountId) => {
      if (!value) return;
      const account = accounts.find((a) => a.id === accountId);
      rows.push({
        id: crypto.randomUUID(),
        name: account ? `${account.brokerName} (synced)` : `Account ${accountId.slice(0, 6)} (synced)`,
        categoryId: target.id,
        subcategoryId: subId,
        amountKRW: Math.round(value),
        note: "Investing Portfolio mirror",
        source: "investing",
        investingAccountId: accountId
      });
    });
    if (!rows.length) {
      rows.push({ id: crypto.randomUUID(), name: "Investing Total (synced)", categoryId: target.id, subcategoryId: subId, amountKRW: Math.round(investingLiveTotal), source: "investing" });
    }
    setEditorItems((prev) => [...prev.filter((it) => it.source !== "investing"), ...rows]);
  };

  const saveSnapshotNow = () => {
    const cleaned = editorItems.map((it) => ({ ...it, name: it.name.trim(), note: it.note?.trim() })).filter((it) => it.name || it.amountKRW !== 0 || it.note);
    const overwriting = !!snapshots[month];
    const nextSnapshots: SnapshotMap = { ...snapshots, [month]: { month, items: cleaned, updatedAt: Date.now(), source: "manual" } };
    setSnapshots(nextSnapshots);
    saveState(ASSET_MONTHLY_SNAPSHOTS_KEY, nextSnapshots);
    const template = cleaned.filter((it) => it.source !== "investing").map((it) => ({ ...it, id: crypto.randomUUID() }));
    saveState(ASSET_ITEMS_TEMPLATE_KEY, template);
    const drafts = loadState<Record<string, AssetItem[]>>(ASSET_EDITOR_DRAFTS_KEY, {});
    delete drafts[month];
    saveState(ASSET_EDITOR_DRAFTS_KEY, drafts);
    const manualLog: SnapshotLog = {
      id: crypto.randomUUID(),
      month,
      type: overwriting ? "OVERWRITE" : "SAVED",
      at: Date.now(),
      source: "manual"
    };
    const nextLogs = [
      manualLog,
      ...snapshotLogs
    ].slice(0, 500);
    setSnapshotLogs(nextLogs);
    saveState(ASSET_SNAPSHOT_LOGS_KEY, nextLogs);
  };

  const saveSnapshot = () => (snapshots[month] ? setOverwriteOpen(true) : saveSnapshotNow());

  const seedAssetSnapshots = (
    range: { start: string; end: string },
    force = false,
    config?: { scenario: SeedScenario; seedNumber: string }
  ) => {
    const months = listMonthsInRange(range.start, range.end);
    if (!months.length) {
      setSeedStatusMessage("Invalid seed range.");
      return;
    }
    const existingMonths = new Set(Object.keys(snapshots));
    const skipCount = months.filter((m) => existingMonths.has(m)).length;
    if (!force && skipCount > 0) {
      setSeedSkipCount(skipCount);
      setSeedPendingRange({ ...range, scenario: config?.scenario ?? seedScenario, seedNumber: config?.seedNumber ?? seedNumber });
      setSeedConfirmOpen(true);
      return;
    }

    const scenario = config?.scenario ?? seedScenario;
    const seedValue = Number((config?.seedNumber ?? seedNumber).replace(/[^\d-]/g, "")) || 202501;
    const rng = createRng(seedValue);
    const { nextCategories, categoryIdByName, subIdByKey } = ensureSeedCategories(categories);
    const seedAccounts = toSeedAccounts(scenario);
    const next = { ...snapshots };
    const nextLogs = [...snapshotLogs];
    const investingState = new Map<string, number>();
    seedAccounts
      .filter((acc) => acc.categoryName === "INVESTING")
      .forEach((acc) => {
        investingState.set(acc.id, acc.base);
      });

    let createdSnapshots = 0;
    months.forEach((targetMonth, idx) => {
      if (!force && existingMonths.has(targetMonth)) return;
      const monthNo = Number(targetMonth.slice(5, 7));
      const monthItems: AssetItem[] = seedAccounts.map((account) => {
        let value = account.base;
        const rand = (rng() - 0.5) * 2;
        if (account.behavior === "living") {
          value = account.base + Math.sin((monthNo + idx) * 0.9) * 350000 + rand * 220000;
        } else if (account.behavior === "emergency") {
          value = account.base + idx * 30000 + rand * 50000;
        } else if (account.behavior === "wallet") {
          value = account.base + Math.sin((idx + 1) * 1.4) * 25000 + rand * 18000;
        } else if (account.behavior === "platform") {
          value = account.base + rand * 30000 + Math.cos((idx + 1) * 0.8) * 18000;
        } else if (account.behavior === "term-deposit") {
          value = account.base + idx * 45000 + rand * 20000;
        } else if (account.behavior === "installment") {
          value = account.base + idx * 420000 + rand * 20000;
        } else if (account.behavior === "housing-subscription") {
          value = account.base + idx * 250000 + rand * 10000;
        } else if (account.behavior === "investing-core" || account.behavior === "investing-isa" || account.behavior === "investing-pension") {
          const prevValue = investingState.get(account.id) ?? account.base;
          const drift = account.behavior === "investing-core" ? 0.012 : account.behavior === "investing-isa" ? 0.009 : 0.007;
          const volatility = account.behavior === "investing-core" ? 0.07 : account.behavior === "investing-isa" ? 0.05 : 0.04;
          const nextValue = prevValue * (1 + drift + volatility * rand);
          investingState.set(account.id, Math.max(nextValue, account.base * 0.45));
          value = investingState.get(account.id) ?? prevValue;
        } else if (account.behavior === "home") {
          value = account.base + idx * 250000 + rand * 180000;
        } else if (account.behavior === "car") {
          value = account.base - idx * 180000 + rand * 70000;
        }
        value = Math.max(0, Math.round(value));
        const categoryId = categoryIdByName.get(account.categoryName) ?? UNCATEGORIZED_ID;
        const subId = subIdByKey.get(`${account.categoryName}:${account.subcategoryName}`);
        return {
          id: crypto.randomUUID(),
          accountId: account.id,
          institution: account.institution,
          name: `${account.name}`,
          categoryId,
          subcategoryId: subId,
          amountKRW: value,
          note: account.memo,
          source: account.categoryName === "INVESTING" ? "investing" : "manual",
          seedTag: "asset-debug-seed"
        };
      });

      next[targetMonth] = {
        month: targetMonth,
        items: monthItems,
        updatedAt: Date.now() + idx,
        source: "seed"
      };
      nextLogs.unshift({
        id: crypto.randomUUID(),
        month: targetMonth,
        type: existingMonths.has(targetMonth) ? "OVERWRITE" : "SAVED",
        at: Date.now() + idx,
        source: "seed"
      });
      createdSnapshots += 1;
    });

    setCategories(nextCategories);
    saveState(ASSET_CATEGORY_SCHEMA_KEY, nextCategories);
    setSnapshots(next);
    saveState(ASSET_MONTHLY_SNAPSHOTS_KEY, next);
    setSnapshotLogs(nextLogs.slice(0, 500));
    saveState(ASSET_SNAPSHOT_LOGS_KEY, nextLogs.slice(0, 500));
    setSeedConfirmOpen(false);
    setSeedPendingRange(null);

    const seededMonths = Object.values(next)
      .filter((snapshot) => snapshot.source === "seed")
      .sort((a, b) => a.month.localeCompare(b.month));
    const summarize = (snapshot: MonthlyAssetSnapshot | undefined) => {
      if (!snapshot) return [] as { label: string; value: number }[];
      const map = new Map<string, number>();
      snapshot.items.forEach((item) => {
        const catName = nextCategories.find((cat) => cat.id === item.categoryId)?.name ?? "Unassigned";
        map.set(catName, (map.get(catName) ?? 0) + item.amountKRW);
      });
      return [...map.entries()].map(([label, value]) => ({ label, value }));
    };
    const first = seededMonths[0];
    const last = seededMonths[seededMonths.length - 1];
    const summary: SeedSummary = {
      categories: nextCategories.length,
      accounts: seedAccounts.length,
      snapshots: seededMonths.length,
      firstMonth: first?.month ?? "-",
      lastMonth: last?.month ?? "-",
      firstGroupTotals: summarize(first),
      lastGroupTotals: summarize(last)
    };
    setSeedSummary(summary);
    console.log("[asset-seed] summary", summary);
    setSeedStatusMessage(
      `Generated ${createdSnapshots} snapshots (${range.start} ~ ${range.end}) | scenario: ${seedScenarioLabel(scenario)} | seed: ${seedValue}`
    );
  };

  const clearSeededSnapshots = () => {
    const isSeededItem = (item: AssetItem) =>
      item.seedTag === "asset-debug-seed" ||
      item.note === "debug-seed" ||
      /\(seed\)/i.test(item.name);

    const nextSnapshots: SnapshotMap = {};
    let removedSnapshots = 0;
    const removedMonths = new Set<string>();
    Object.values(snapshots).forEach((snapshot) => {
      const isSeededSnapshot =
        snapshot.source === "seed" ||
        snapshot.items.some((item) => isSeededItem(item)) ||
        snapshot.items.every((item) => item.source === "investing" && /\(synced\)/i.test(item.name));
      if (isSeededSnapshot) {
        removedSnapshots += 1;
        removedMonths.add(snapshot.month);
        return;
      }
      nextSnapshots[snapshot.month] = snapshot;
    });
    setSnapshots(nextSnapshots);
    saveState(ASSET_MONTHLY_SNAPSHOTS_KEY, nextSnapshots);

    const nextLogs = snapshotLogs.filter((log) => log.source !== "seed");
    setSnapshotLogs(nextLogs);
    saveState(ASSET_SNAPSHOT_LOGS_KEY, nextLogs);

    const template = loadState<AssetItem[]>(ASSET_ITEMS_TEMPLATE_KEY, []);
    const cleanedTemplate = template.filter((item) => !isSeededItem(item));
    saveState(ASSET_ITEMS_TEMPLATE_KEY, cleanedTemplate);

    const drafts = loadState<Record<string, AssetItem[]>>(ASSET_EDITOR_DRAFTS_KEY, {});
    Object.keys(drafts).forEach((monthKey) => {
      drafts[monthKey] = (drafts[monthKey] ?? []).filter((item) => !isSeededItem(item));
      if (!drafts[monthKey].length) delete drafts[monthKey];
    });
    saveState(ASSET_EDITOR_DRAFTS_KEY, drafts);

    if (removedMonths.has(month)) {
      const snapshot = nextSnapshots[month];
      if (snapshot) setEditorItems(snapshot.items.map((item) => ({ ...item })));
      else setEditorItems(cleanedTemplate.map((item) => ({ ...item, id: crypto.randomUUID() })));
    } else {
      setEditorItems((prev) => prev.filter((item) => !isSeededItem(item)));
    }

    setSeedSummary(null);
    setSeedStatusMessage(removedSnapshots ? `Cleared ${removedSnapshots} seeded snapshots.` : "No seeded snapshots found.");
  };

  const deleteSnapshot = (targetMonth: string) => {
    requestCategoryConfirm("스냅샷을 삭제합니다. 해당 월 기록이 제거됩니다.", () => {
      const next = { ...snapshots };
      delete next[targetMonth];
      setSnapshots(next);
      saveState(ASSET_MONTHLY_SNAPSHOTS_KEY, next);
      const drafts = loadState<Record<string, AssetItem[]>>(ASSET_EDITOR_DRAFTS_KEY, {});
      delete drafts[targetMonth];
      saveState(ASSET_EDITOR_DRAFTS_KEY, drafts);
      if (month === targetMonth) setEditorItems([]);
    });
  };

  const hasUnsaved = useMemo(() => {
    const normalize = (items: AssetItem[]) =>
      JSON.stringify(
        [...items]
          .map((it) => ({ n: it.name.trim(), c: it.categoryId, s: it.subcategoryId ?? "", a: Math.round(it.amountKRW), note: it.note?.trim() ?? "", src: it.source ?? "manual" }))
          .sort((a, b) => `${a.c}|${a.n}`.localeCompare(`${b.c}|${b.n}`))
      );
    return normalize(editorItems) !== normalize(snapshots[month]?.items ?? []);
  }, [editorItems, snapshots, month]);

  const isCurrentMonth = month === monthNow();

  const editorSubcategoryOptions = useMemo(() => {
    if (editorCategoryFilter === "ALL") {
      const map = new Map<string, string>();
      categories.forEach((category) => {
        category.subcategories.forEach((sub) => {
          map.set(sub.id, `${category.name} / ${sub.name}`);
        });
      });
      return [...map.entries()].map(([value, label]) => ({ value, label }));
    }
    const category = categories.find((item) => item.id === editorCategoryFilter);
    return (category?.subcategories ?? []).map((sub) => ({ value: sub.id, label: sub.name }));
  }, [categories, editorCategoryFilter]);

  const visibleEditorItems = useMemo(() => {
    const filtered = editorItems.filter((item) => {
      if (editorCategoryFilter !== "ALL" && item.categoryId !== editorCategoryFilter) return false;
      if (editorSubcategoryFilter !== "ALL" && (item.subcategoryId ?? "") !== editorSubcategoryFilter) return false;
      return true;
    });
    if (editorAmountSort === "asc") return [...filtered].sort((a, b) => a.amountKRW - b.amountKRW);
    if (editorAmountSort === "desc") return [...filtered].sort((a, b) => b.amountKRW - a.amountKRW);
    return filtered;
  }, [editorAmountSort, editorCategoryFilter, editorItems, editorSubcategoryFilter]);
  const editingItem = useMemo(
    () => (editingItemId ? editorItems.find((item) => item.id === editingItemId) ?? null : null),
    [editorItems, editingItemId]
  );
  const editSubcategoryOptions = useMemo(() => {
    if (!editDraft?.categoryId) return [] as AssetSubcategory[];
    return categories.find((category) => category.id === editDraft.categoryId)?.subcategories ?? [];
  }, [categories, editDraft?.categoryId]);

  const blurClass = revealed ? "" : "blur-sm select-none";

  useEffect(() => {
    if (!editAlertMessage) return;
    const timer = window.setTimeout(() => setEditAlertMessage(null), 2400);
    return () => window.clearTimeout(timer);
  }, [editAlertMessage]);

  useEffect(() => {
    if (!growthModalOpen) return;
    const end = effectiveLatestMonth ?? historyMonths[historyMonths.length - 1] ?? runtimeCurrentMonth;
    setGrowthEndMonth(end);
    setGrowthStartMonth(shiftMonth(end, -6));
  }, [effectiveLatestMonth, growthModalOpen, historyMonths, runtimeCurrentMonth]);

  useEffect(() => {
    if (!historyModalOpen) {
      setHistoryHoverMonth(null);
      setHistoryPinnedMonth(null);
      return;
    }
    if (!effectiveLatestMonth) return;
    setHistoryHoverMonth(effectiveLatestMonth);
  }, [effectiveLatestMonth, historyModalOpen]);

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1300px] pb-20 pt-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl">Asset</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)]" onClick={() => setHistoryModalOpen(true)}>
              Asset History
            </button>
            <button className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)]" onClick={() => setLogsModalOpen(true)}>
              Monthly Logs
            </button>
            <button className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)]" onClick={() => setDebugOpen(true)}>
              Debug
            </button>
            <button className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)]" onClick={() => setRevealed((p) => !p)}>
              {revealed ? "Hide" : "Reveal"}
            </button>
            <Link className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--ink-1)]" href="/finance">
              Back
            </Link>
          </div>
        </div>

        <section className="lifnux-glass rounded-2xl p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-[var(--ink-1)]">Month</span>
              <input
                type="month"
                min={ASSET_MIN_MONTH}
                value={month}
                onChange={(e) => setMonth(clampAssetMonth(e.target.value))}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              />
            </label>
            <button className="rounded-full border border-white/10 px-3 py-1 text-xs" onClick={() => setMonth(clampAssetMonth(monthNow()))}>Current</button>
            <button className="rounded-full border border-white/10 px-3 py-1 text-xs" onClick={() => setMonth(shiftMonth(month, -1))}>Prev</button>
            <button className="rounded-full border border-white/10 px-3 py-1 text-xs" onClick={() => setMonth(shiftMonth(month, 1))}>Next</button>
            <span className={`text-xs ${hasUnsaved ? "text-amber-300" : "text-[var(--ink-1)]"}`}>{hasUnsaved ? "Unsaved changes" : "Saved / No changes"}</span>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Overview</div>
              <div className={`text-4xl font-semibold ${blurClass}`}>{formatKrw(selectedTotal)}</div>
              <div className={`text-sm ${momDiff >= 0 ? "text-emerald-300" : "text-rose-300"} ${prevSnapshot ? blurClass : ""}`}>
                {prevSnapshot ? `${momDiff >= 0 ? "+" : "-"}${formatKrw(Math.abs(momDiff))} (${formatPct(momPct)})` : "MoM -"}
              </div>
              <div className="text-xs text-[var(--ink-1)]">
                Selected month: {month} ({selectedSnapshot ? "saved" : "draft"}) / Previous snapshot: {prevSnapshot?.month ?? "-"} / Live investing mirror:{" "}
                <span className={blurClass}>{formatKrw(investingLiveTotal)}</span>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <Donut data={donutData} highlightedId={activeCategoryId} onHighlight={setActiveCategoryId} blurClass={blurClass} />
            </div>
          </div>
        </section>

        <section className="mt-6 lifnux-glass rounded-2xl p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Breakdown</div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {categoryCards.map((card) => {
              const expanded = !!expandedCards[card.id];
              const display = expanded ? card.items : card.items.slice(0, 3);
              const isDebtCard = isDebtCategoryId(card.id);
              return (
                <div
                  key={card.id}
                  className={`rounded-xl border bg-black/20 p-4 transition ${activeCategoryId === card.id ? "border-[var(--accent-1)]" : "border-white/10"}`}
                  onMouseEnter={() => setActiveCategoryId(card.id)}
                  onMouseLeave={() => setActiveCategoryId((prevState) => (prevState === card.id ? null : prevState))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">{card.name}</div>
                      <div className={`mt-1 text-xl font-semibold ${blurClass} ${isDebtCard ? "text-rose-300" : ""}`}>{formatKrw(card.total)}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2 text-[11px]">
                      <button className="rounded-full border border-white/10 px-2 py-1" onClick={() => setCategoryModalOpen(true)}>Edit Category</button>
                      <button className="rounded-full border border-white/10 px-2 py-1" onClick={() => addItem(card.id)}>Add Item</button>
                      {card.kind === "INVESTING" ? (
                        <button
                          className={`rounded-full border px-2 py-1 ${isCurrentMonth ? "border-white/10" : "border-white/5 text-white/40 cursor-not-allowed"}`}
                          onClick={() => syncInvesting(card.id)}
                          disabled={!isCurrentMonth}
                          title={isCurrentMonth ? "Sync investing asset" : "현재 월에서만 Sync 가능합니다"}
                        >
                          Sync Investing Asset
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {display.length ? display.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-white/90">{item.name || "(Unnamed)"}</div>
                          <div className="truncate text-[11px] text-[var(--ink-1)]">
                            {item.institution ? `${item.institution} · ` : ""}
                            {categories.find((c) => c.id === item.categoryId)?.subcategories.find((s) => s.id === item.subcategoryId)?.name ?? "-"}
                          </div>
                        </div>
                        <div className={`shrink-0 ${blurClass} ${isDebtCard ? "text-rose-300" : ""}`}>
                          {formatKrw(signedAmountByCategory(item.categoryId, item.amountKRW))}
                        </div>
                      </div>
                    )) : <div className="text-sm text-[var(--ink-1)]">No items.</div>}
                    {card.items.length > 3 ? (
                      <button className="text-xs text-[var(--ink-1)] underline underline-offset-2" onClick={() => setExpandedCards((p) => ({ ...p, [card.id]: !expanded }))}>
                        {expanded ? "접기" : `더보기 (${card.items.length - 3})`}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6 lifnux-glass rounded-2xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Monthly Editor / Snapshot</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={() => setCategoryModalOpen(true)}>
                Manage Categories
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={() => addItem()}>
                + Add Item
              </button>
              <button className="rounded-full border border-white/10 px-3 py-1" onClick={duplicatePreviousMonth}>
                Duplicate Previous Month
              </button>
              <button
                className={`rounded-full border px-3 py-1 ${isCurrentMonth ? "border-white/10" : "border-white/5 text-white/40 cursor-not-allowed"}`}
                onClick={() => syncInvesting()}
                disabled={!isCurrentMonth}
                title={isCurrentMonth ? "Sync investing asset" : "현재 월에서만 Sync 가능합니다"}
              >
                Sync Investing Asset
              </button>
              <button className="rounded-full border border-[var(--accent-1)] px-3 py-1 text-[var(--accent-1)]" onClick={saveSnapshot}>
                Save Snapshot
              </button>
            </div>
          </div>

          {!isCurrentMonth ? <div className="mt-3 text-xs text-amber-300">과거/미래 월: Sync 비활성 (수동 입력만 가능)</div> : null}

          <div className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-3">
            <label className="text-xs text-[var(--ink-1)]">
              Category Filter
              <select
                className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                value={editorCategoryFilter}
                style={DARK_SELECT_STYLE}
                onChange={(event) => {
                  setEditorCategoryFilter(event.target.value);
                  setEditorSubcategoryFilter("ALL");
                }}
              >
                <option value="ALL">All</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--ink-1)]">
              Subcategory Filter
              <select
                className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                value={editorSubcategoryFilter}
                style={DARK_SELECT_STYLE}
                onChange={(event) => setEditorSubcategoryFilter(event.target.value)}
              >
                <option value="ALL">All</option>
                {editorSubcategoryOptions.map((sub) => (
                  <option key={sub.value} value={sub.value}>
                    {sub.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--ink-1)]">
              Amount Sort
              <select
                className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs"
                value={editorAmountSort}
                style={DARK_SELECT_STYLE}
                onChange={(event) => setEditorAmountSort(event.target.value as "none" | "asc" | "desc")}
              >
                <option value="none">Default</option>
                <option value="asc">Amount Asc</option>
                <option value="desc">Amount Desc</option>
              </select>
            </label>
          </div>

          <div className="mt-4 overflow-auto rounded-xl border border-white/10">
            <table className="min-w-[900px] w-full text-xs">
              <thead className="bg-black/30 text-[var(--ink-1)]">
                <tr>
                  <th className="px-2 py-2 text-left">Category</th>
                  <th className="px-2 py-2 text-left">Subcategory</th>
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-left">Amount (KRW)</th>
                  <th className="px-2 py-2 text-left">Note</th>
                  <th className="px-2 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleEditorItems.length ? (
                  visibleEditorItems.map((item) => {
                    const category = categories.find((c) => c.id === item.categoryId);
                    const subcategory = category?.subcategories.find((sub) => sub.id === item.subcategoryId);
                    return (
                      <tr key={item.id} className="border-t border-white/10">
                        <td className="px-2 py-2 text-white/90">{category?.name ?? "Unassigned"}</td>
                        <td className="px-2 py-2 text-white/85">{subcategory?.name ?? "-"}</td>
                        <td className="px-2 py-2 text-white/90">{item.name || "-"}</td>
                        <td className={`px-2 py-2 ${isDebtCategoryId(item.categoryId) ? "text-rose-300" : "text-white/90"}`}>
                          {formatKrw(signedAmountByCategory(item.categoryId, item.amountKRW))}
                        </td>
                        <td className="px-2 py-2 text-[var(--ink-1)]">{item.note ?? "-"}</td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button className="rounded-full border border-white/20 px-2 py-1 text-[11px] text-white/90" onClick={() => openEditItem(item)}>
                              Edit
                            </button>
                            <button className="rounded-full border border-rose-500/40 px-2 py-1 text-[11px] text-rose-200" onClick={() => removeItem(item.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr><td className="px-3 py-5 text-sm text-[var(--ink-1)]" colSpan={6}>No items in current filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Modal
        open={categoryModalOpen}
        title="Category Structure"
        onClose={() => setCategoryModalOpen(false)}
        panelClassName="!w-[96vw] !max-w-[980px]"
        actions={<button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setCategoryModalOpen(false)}>Close</button>}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-[var(--ink-1)]">분류 구조를 수정해도 기존 자산 아이템은 유지됩니다. 삭제된 분류는 Unassigned로 보존됩니다.</div>
          <div className="flex gap-2">
            <input className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" value={newCategoryName} placeholder="새 대분류" onChange={(e) => setNewCategoryName(e.target.value)} />
            <button
              className="rounded-full border border-white/10 px-3 py-2 text-xs"
              onClick={() => requestCategoryConfirm("자산 분류 구조를 변경합니다. 기존 자산 데이터는 유지됩니다.", () => {
                const label = newCategoryName.trim();
                if (!label) return;
                saveCategorySchema([...categories, { id: crypto.randomUUID(), name: label, subcategories: [] }]);
                setNewCategoryName("");
              })}
            >
              Add Category
            </button>
          </div>

          <div className="space-y-3">
            {categories.map((cat) => (
              <div key={cat.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" value={nameDraft[cat.id] ?? cat.name} onChange={(e) => setNameDraft((p) => ({ ...p, [cat.id]: e.target.value }))} />
                  <button
                    className="rounded-full border border-white/10 px-3 py-1 text-xs"
                    onClick={() => requestCategoryConfirm("자산 분류 구조를 변경합니다. 기존 자산 데이터는 유지됩니다.", () => {
                      const nextName = (nameDraft[cat.id] ?? "").trim();
                      if (!nextName) return;
                      saveCategorySchema(categories.map((c) => (c.id === cat.id ? { ...c, name: nextName } : c)));
                    })}
                  >
                    Rename
                  </button>
                  <button
                    className="rounded-full border border-rose-500/40 px-3 py-1 text-xs text-rose-200"
                    onClick={() => requestCategoryConfirm("자산 분류 구조를 변경합니다. 기존 자산 데이터는 유지됩니다.", () => {
                      saveCategorySchema(categories.filter((c) => c.id !== cat.id));
                    })}
                  >
                    Delete
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {cat.subcategories.map((sub) => (
                    <div key={sub.id} className="flex flex-wrap items-center gap-2">
                      <input className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" value={subNameDraft[`${cat.id}:${sub.id}`] ?? sub.name} onChange={(e) => setSubNameDraft((p) => ({ ...p, [`${cat.id}:${sub.id}`]: e.target.value }))} />
                      <button
                        className="rounded-full border border-white/10 px-3 py-1 text-xs"
                        onClick={() => requestCategoryConfirm("자산 분류 구조를 변경합니다. 기존 자산 데이터는 유지됩니다.", () => {
                          const nextName = (subNameDraft[`${cat.id}:${sub.id}`] ?? "").trim();
                          if (!nextName) return;
                          saveCategorySchema(categories.map((c) => c.id !== cat.id ? c : { ...c, subcategories: c.subcategories.map((s) => s.id === sub.id ? { ...s, name: nextName } : s) }));
                        })}
                      >
                        Rename
                      </button>
                      <button
                        className="rounded-full border border-rose-500/40 px-3 py-1 text-xs text-rose-200"
                        onClick={() => requestCategoryConfirm("자산 분류 구조를 변경합니다. 기존 자산 데이터는 유지됩니다.", () => {
                          saveCategorySchema(categories.map((c) => c.id !== cat.id ? c : { ...c, subcategories: c.subcategories.filter((s) => s.id !== sub.id) }));
                          setEditorItems((prevState) => prevState.map((it) => it.subcategoryId === sub.id ? { ...it, subcategoryId: undefined } : it));
                        })}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <input className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" placeholder="새 소분류" value={newSubName[cat.id] ?? ""} onChange={(e) => setNewSubName((p) => ({ ...p, [cat.id]: e.target.value }))} />
                  <button
                    className="rounded-full border border-white/10 px-3 py-2 text-xs"
                    onClick={() => requestCategoryConfirm("자산 분류 구조를 변경합니다. 기존 자산 데이터는 유지됩니다.", () => {
                      const label = (newSubName[cat.id] ?? "").trim();
                      if (!label) return;
                      saveCategorySchema(categories.map((c) => c.id !== cat.id ? c : { ...c, subcategories: [...c.subcategories, { id: crypto.randomUUID(), name: label }] }));
                      setNewSubName((p) => ({ ...p, [cat.id]: "" }));
                    })}
                  >
                    Add Subcategory
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={editModalOpen}
        title={editingItem ? `Edit Asset Item (${editingItem.name || "Unnamed"})` : "Edit Asset Item"}
        onClose={closeEditItem}
        actions={
          <>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={closeEditItem}>
              Cancel
            </button>
            <button
              className="rounded-full border border-white/20 px-4 py-2 text-xs"
              onClick={() => {
                if (!editDraft) return;
                setEditApplyConfirmOpen(true);
              }}
            >
              Apply
            </button>
          </>
        }
      >
        {editDraft ? (
          <div className="space-y-3 text-sm">
            <label className="block text-xs uppercase tracking-wide">
              Category
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={editDraft.categoryId}
                onChange={(event) => {
                  const categoryId = event.target.value;
                  const defaultSub = categories.find((c) => c.id === categoryId)?.subcategories[0]?.id ?? "";
                  setEditDraft((prev) => (prev ? { ...prev, categoryId, subcategoryId: defaultSub } : prev));
                }}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs uppercase tracking-wide">
              Subcategory
              <select
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={editDraft.subcategoryId}
                onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, subcategoryId: event.target.value } : prev))}
              >
                <option value="">-</option>
                {editSubcategoryOptions.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs uppercase tracking-wide">
              Name
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={editDraft.name}
                onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
              />
            </label>
            <label className="block text-xs uppercase tracking-wide">
              Amount (KRW)
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={editDraft.amountInput}
                onChange={(event) =>
                  setEditDraft((prev) => (prev ? { ...prev, amountInput: formatAmountWithComma(event.target.value) } : prev))
                }
              />
            </label>
            <label className="block text-xs uppercase tracking-wide">
              Note
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                value={editDraft.note}
                onChange={(event) => setEditDraft((prev) => (prev ? { ...prev, note: event.target.value } : prev))}
              />
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={historyModalOpen}
        title="Asset History"
        onClose={() => setHistoryModalOpen(false)}
        panelClassName="!w-[96vw] !max-w-[1400px] min-h-[70vh]"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap gap-2">
              {historySeries.map((line) => (
                <button
                  key={line.key}
                  className={`rounded-full border px-3 py-1 ${
                    historyVisible[line.key] ? "border-white/40 text-white" : "border-white/10 text-[var(--ink-1)]"
                  }`}
                  onClick={() => setHistoryVisible((prev) => ({ ...prev, [line.key]: !prev[line.key] }))}
                >
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
                  {line.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {effectiveLatest.isFallback ? (
                <span
                  className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-[10px] text-amber-200"
                  title="이번 달 스냅샷이 아직 저장되지 않았습니다. 가장 최근 스냅샷을 임시로 표시합니다."
                >
                  TEMP · 마지막 업데이트 {effectiveLatest.fallbackFromMonth ?? "-"}
                </span>
              ) : null}
              {effectiveLatest.isFallback ? (
                <button className="rounded-full border border-white/15 px-2 py-1 text-[11px]" onClick={() => setMonth(clampAssetMonth(runtimeCurrentMonth))}>
                  Update this month
                </button>
              ) : null}
              <button className="rounded-full border border-white/15 px-3 py-1 text-xs" onClick={() => setGrowthModalOpen(true)}>
                Growth
              </button>
            </div>
          </div>
          <HistoryChart
            months={historyMonths}
            series={historySeries.filter((line) => historyVisible[line.key])}
            blurClass=""
            selectedMonth={activeTooltipMonth}
            tooltipSummary={hoverSummary}
            onHoverMonth={(month) => {
              if (historyPinnedMonth) return;
              setHistoryHoverMonth(month);
            }}
            onSelectMonth={(month) => {
              setHistoryPinnedMonth((prev) => (prev === month ? null : month));
              setHistoryHoverMonth(month);
            }}
          />
          <div className="text-[11px] text-[var(--ink-1)]">Hover/tap point: month summary tooltip. Click point: pin month.</div>
        </div>
      </Modal>

      <Modal open={growthModalOpen} title="Growth Insights" onClose={() => setGrowthModalOpen(false)} panelClassName="!w-[96vw] !max-w-[1100px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid gap-2 md:grid-cols-2">
                <MonthClickPicker
                  label="Start Month"
                  value={growthStartMonth}
                  minMonth={ASSET_MIN_MONTH}
                  maxMonth={growthEndMonth || effectiveLatestMonth || runtimeCurrentMonth}
                  onChange={(next) => setGrowthStartMonth(clampAssetMonth(next))}
                />
                <MonthClickPicker
                  label="End Month"
                  value={growthEndMonth}
                  minMonth={ASSET_MIN_MONTH}
                  maxMonth={effectiveLatestMonth || runtimeCurrentMonth}
                  onChange={(next) => setGrowthEndMonth(clampAssetMonth(next))}
                />
              </div>
              {effectiveLatest.isFallback ? (
                <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-[10px] text-amber-200">
                  TEMP · 마지막 업데이트 {effectiveLatest.fallbackFromMonth ?? "-"}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="rounded-full border border-white/10 px-2 py-1 text-[11px]" onClick={() => growthEndMonth && setGrowthStartMonth(shiftMonth(growthEndMonth, -3))}>3M</button>
              <button className="rounded-full border border-white/10 px-2 py-1 text-[11px]" onClick={() => growthEndMonth && setGrowthStartMonth(shiftMonth(growthEndMonth, -6))}>6M</button>
              <button className="rounded-full border border-white/10 px-2 py-1 text-[11px]" onClick={() => growthEndMonth && setGrowthStartMonth(`${growthEndMonth.slice(0, 4)}-01`)}>YTD</button>
              <button
                className="rounded-full border border-white/10 px-2 py-1 text-[11px]"
                onClick={() => {
                  if (sortedSnapshots.length) {
                    setGrowthStartMonth(sortedSnapshots[0].month);
                    setGrowthEndMonth(effectiveLatestMonth ?? sortedSnapshots[sortedSnapshots.length - 1].month);
                  }
                }}
              >
                All
              </button>
            </div>
            {effectiveLatest.isFallback ? (
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-amber-200">
                <span>이번 달 스냅샷이 없어 가장 최근 스냅샷을 기준으로 계산합니다.</span>
                <button className="rounded-full border border-white/15 px-2 py-1 text-[10px] text-white/80" onClick={() => setMonth(clampAssetMonth(runtimeCurrentMonth))}>
                  Update this month
                </button>
              </div>
            ) : null}
          </div>

          {!growthInsights.enough ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-[var(--ink-1)]">Not enough data</div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">Total Change<br />{formatKrw(growthInsights.totalDelta)} {growthInsights.totalPct !== null ? `(${formatPct(growthInsights.totalPct)})` : "(N/A)"}</div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">CAGR<br />{growthInsights.cagrAnnual !== null ? formatPct(growthInsights.cagrAnnual * 100) : "N/A"}</div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">Best Month<br />{growthInsights.bestMonth ? `${growthInsights.bestMonth.month} ${formatKrw(growthInsights.bestMonth.delta)}` : "N/A"}</div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">Max Drawdown<br />{formatPct(growthInsights.maxDrawdown * 100)}</div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Group Change</div>
                  <table className="w-full text-xs">
                    <thead className="text-[var(--ink-1)]"><tr><th className="text-left">Group</th><th className="text-right">ΔKRW</th><th className="text-right">Δ%</th></tr></thead>
                    <tbody>
                      {growthInsights.groupChange.map((row) => (
                        <tr key={`chg-${row.group}`} className="border-t border-white/10"><td className="py-1">{row.group}</td><td className="py-1 text-right">{formatKrw(row.delta)}</td><td className="py-1 text-right">{row.pct !== null ? formatPct(row.pct) : "N/A"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Group ATH</div>
                  <table className="w-full text-xs">
                    <thead className="text-[var(--ink-1)]"><tr><th className="text-left">Group</th><th className="text-right">ATH</th><th className="text-right">Month</th><th className="text-right">vs End</th></tr></thead>
                    <tbody>
                      {growthInsights.groupAth.map((row) => (
                        <tr key={`ath-${row.group}`} className="border-t border-white/10"><td className="py-1">{row.group}</td><td className="py-1 text-right">{formatKrw(row.athValue)}</td><td className="py-1 text-right">{row.athMonth}</td><td className="py-1 text-right">{row.vsAthPct !== null ? formatPct(row.vsAthPct) : "N/A"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={logsModalOpen}
        title="Monthly Logs"
        onClose={() => setLogsModalOpen(false)}
        panelClassName="!w-[96vw] !max-w-[1100px] min-h-[60vh]"
      >
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {snapshotLogs.length ? (
            snapshotLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm">
                <div>
                  <div className="text-white/90">{log.month}</div>
                  <div className="text-[11px] text-[var(--ink-1)]">
                    {log.type} / {log.source}
                  </div>
                  <div className="text-[11px] text-[var(--ink-1)]">At: {new Date(log.at).toLocaleString()}</div>
                </div>
                <button className="rounded-full border border-rose-500/40 px-3 py-1 text-xs text-rose-200" onClick={() => deleteSnapshot(log.month)}>
                  Delete Month
                </button>
              </div>
            ))
          ) : (
            <div className="text-sm text-[var(--ink-1)]">No logs yet. Save Snapshot to create history.</div>
          )}
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
            <div className="text-[var(--ink-1)]">Scenario</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  { value: "worker-default", label: "직장인 기본" },
                  { value: "investing-heavy", label: "투자 비중 높음" },
                  { value: "cash-heavy", label: "현금/예금 비중 높음" },
                  { value: "physical-heavy", label: "실물자산 보유(집/차)" }
                ] as Array<{ value: SeedScenario; label: string }>
              ).map((option) => (
                <button
                  key={option.value}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    seedScenario === option.value ? "border-white/30 text-white" : "border-white/10 text-[var(--ink-1)]"
                  }`}
                  onClick={() => setSeedScenario(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <div className="text-[var(--ink-1)]">Random Seed Number</div>
            <input
              value={seedNumber}
              onChange={(event) => setSeedNumber(event.target.value.replace(/[^\d-]/g, ""))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              placeholder="202501"
            />
          </label>
          <div className="text-xs text-[var(--ink-1)]">기본 추천: 2025-01 ~ 2026-01, 월별 1개 스냅샷 생성</div>
          <div className="flex justify-end gap-2">
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-xs"
              onClick={() =>
                seedAssetSnapshots(
                  { start: seedStartMonth, end: seedEndMonth },
                  false,
                  { scenario: seedScenario, seedNumber }
                )
              }
            >
              Seed Test Data
            </button>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={clearSeededSnapshots}>
              Clear Seeded Data
            </button>
          </div>
          {seedSummary ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-[var(--ink-1)]">
              <div>
                Categories: {seedSummary.categories} / Accounts: {seedSummary.accounts} / Snapshots: {seedSummary.snapshots}
              </div>
              <div className="mt-1">First: {seedSummary.firstMonth}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {seedSummary.firstGroupTotals.map((entry) => (
                  <span key={`first-${entry.label}`}>
                    {entry.label} {formatKrw(entry.value)}
                  </span>
                ))}
              </div>
              <div className="mt-2">Last: {seedSummary.lastMonth}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {seedSummary.lastGroupTotals.map((entry) => (
                  <span key={`last-${entry.label}`}>
                    {entry.label} {formatKrw(entry.value)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal open={seedConfirmOpen} title="Seed Confirmation" onClose={() => setSeedConfirmOpen(false)}>
        <div className="space-y-4 text-sm">
          <div className="text-white/80">기존 데이터가 있는 {seedSkipCount}개월은 생성에서 제외됩니다. 계속할까요?</div>
          <div className="flex justify-end gap-2">
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs" onClick={() => setSeedConfirmOpen(false)}>
              Cancel
            </button>
            <button
              className="rounded-full border border-white/20 px-4 py-2 text-xs"
              onClick={() => {
                if (seedPendingRange) {
                  seedAssetSnapshots(
                    { start: seedPendingRange.start, end: seedPendingRange.end },
                    true,
                    { scenario: seedPendingRange.scenario, seedNumber: seedPendingRange.seedNumber }
                  );
                }
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

      <ConfirmModal
        open={itemGuardOpen}
        title="Confirm Item Change"
        description="자산 아이템 금액 수정/삭제를 진행합니다."
        detail="이 경고는 이번 세션에서 한 번만 표시됩니다."
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        onConfirm={() => {
          setItemGuardPassed(true);
          setItemGuardOpen(false);
          pendingItemActionRef.current?.();
          pendingItemActionRef.current = null;
        }}
        onCancel={() => {
          setItemGuardOpen(false);
          pendingItemActionRef.current = null;
        }}
      />

      <ConfirmModal
        open={categoryConfirmOpen}
        title="Category Structure Change"
        description="자산 분류 구조를 변경합니다. 기존 자산 데이터는 유지됩니다."
        detail={categoryConfirmDetail}
        confirmLabel="Apply"
        cancelLabel="Cancel"
        onConfirm={() => {
          setCategoryConfirmOpen(false);
          pendingCategoryActionRef.current?.();
          pendingCategoryActionRef.current = null;
        }}
        onCancel={() => {
          setCategoryConfirmOpen(false);
          pendingCategoryActionRef.current = null;
        }}
      />

      <ConfirmModal
        open={overwriteOpen}
        title="Overwrite Snapshot"
        description="이미 저장된 월입니다. 기존 스냅샷을 덮어씁니다."
        detail={`${month} 스냅샷을 최신 편집 내용으로 갱신합니다.`}
        confirmLabel="Overwrite"
        cancelLabel="Cancel"
        onConfirm={() => {
          setOverwriteOpen(false);
          saveSnapshotNow();
        }}
        onCancel={() => setOverwriteOpen(false)}
      />
      <ConfirmModal
        open={editApplyConfirmOpen}
        title="Apply Edit"
        description="수정 내용을 적용하시겠습니까?"
        detail="Apply 후 항목 값이 즉시 변경됩니다."
        confirmLabel="Apply"
        cancelLabel="Cancel"
        onConfirm={() => {
          setEditApplyConfirmOpen(false);
          applyEditItem();
        }}
        onCancel={() => setEditApplyConfirmOpen(false)}
      />
      {editAlertMessage ? (
        <div className="fixed right-6 top-20 z-[1300] max-w-[360px] rounded-xl border border-white/20 bg-[#0b0f1a]/95 px-4 py-3 text-sm text-white shadow-lg backdrop-blur">
          {editAlertMessage}
        </div>
      ) : null}
    </AppShell>
  );
}

function Donut({ data, highlightedId, onHighlight, blurClass }: { data: DonutItem[]; highlightedId: string | null; onHighlight: (id: string | null) => void; blurClass: string }) {
  if (!data.length) return <div className="text-sm text-[var(--ink-1)]">No composition data.</div>;
  const size = 220;
  const radius = 72;
  const stroke = 34;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="grid gap-3 md:grid-cols-[220px_1fr]">
      <svg width={size} height={size} className="mx-auto">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          {data.map((item) => {
            const arc = total > 0 ? (item.value / total) * circumference : 0;
            const dasharray = `${arc} ${circumference - arc}`;
            const dashoffset = -offset;
            offset += arc;
            const focused = highlightedId === null || highlightedId === item.id;
            return (
              <circle
                key={item.id}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={focused ? stroke + 2 : stroke}
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
                strokeLinecap="butt"
                opacity={focused ? 1 : 0.35}
                className="cursor-pointer transition"
                onMouseEnter={() => onHighlight(item.id)}
                onMouseLeave={() => onHighlight(null)}
                onClick={() => onHighlight(highlightedId === item.id ? null : item.id)}
              />
            );
          })}
        </g>
        <text x={size / 2} y={size / 2 - 5} textAnchor="middle" className="fill-white text-[11px] uppercase tracking-[0.16em]">Total</text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" className="fill-white text-xl font-semibold">{total > 0 ? "100%" : "-"}</text>
      </svg>

      <div className="space-y-2 text-sm">
        {data.map((item) => {
          const pct = total > 0 ? (item.value / total) * 100 : 0;
          const focused = highlightedId === null || highlightedId === item.id;
          return (
            <button key={item.id} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1 text-left transition ${highlightedId === item.id ? "border-white/40 bg-white/5" : "border-transparent hover:border-white/15"}`} onMouseEnter={() => onHighlight(item.id)} onMouseLeave={() => onHighlight(null)} onClick={() => onHighlight(highlightedId === item.id ? null : item.id)}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className={`truncate ${item.isDebt ? (focused ? "text-rose-300" : "text-rose-300/70") : focused ? "text-white/90" : "text-white/40"}`}>
                  {item.label}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <div className={`${item.isDebt ? (focused ? "text-rose-300" : "text-rose-300/70") : focused ? "text-white/90" : "text-white/40"} ${blurClass}`}>
                  {formatKrw(item.signed)}
                </div>
                <div className="text-[11px] text-[var(--ink-1)]">{pct.toFixed(1)}%</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HistoryChart({
  months,
  series,
  blurClass,
  tooltipSummary,
  onHoverMonth,
  onSelectMonth,
  selectedMonth
}: {
  months: string[];
  series: HistorySeries[];
  blurClass: string;
  tooltipSummary?: HoverSummary;
  onHoverMonth?: (month: string | null) => void;
  onSelectMonth?: (month: string) => void;
  selectedMonth?: string | null;
}) {
  if (!months.length || !series.length) return <div className="text-sm text-[var(--ink-1)]">No snapshot history yet.</div>;

  const width = 980;
  const height = 300;
  const padLeft = 112;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 34;
  const values = series.flatMap((line) => line.values);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const xAt = (i: number) => (months.length === 1 ? (padLeft + width - padRight) / 2 : padLeft + (i / (months.length - 1)) * (width - padLeft - padRight));
  const yAt = (v: number) => padTop + ((max - v) / range) * (height - padTop - padBottom);
  const yTicks = Array.from({ length: 4 }).map((_, i) => min + ((max - min) * i) / 3);

  const monthFromClientX = (clientX: number, rect: DOMRect) => {
    if (!months.length) return null;
    if (rect.width <= 0) return months[months.length - 1] ?? null;
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const clamped = Math.min(Math.max(svgX, padLeft), width - padRight);
    const ratio = (clamped - padLeft) / (width - padLeft - padRight || 1);
    const index = Math.round(ratio * (months.length - 1));
    return months[Math.min(Math.max(index, 0), months.length - 1)] ?? null;
  };
  const selectedIndex = selectedMonth ? months.findIndex((month) => month === selectedMonth) : -1;
  const selectedX = selectedIndex >= 0 ? xAt(selectedIndex) : null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20 p-3">
      <AssetHistoryTooltip summary={tooltipSummary ?? null} />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[320px] w-full"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onHoverMonth?.(monthFromClientX(event.clientX, rect));
        }}
        onMouseLeave={() => onHoverMonth?.(null)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const month = monthFromClientX(event.clientX, rect);
          if (month) onSelectMonth?.(month);
        }}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padLeft} y1={yAt(tick)} x2={width - padRight} y2={yAt(tick)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            <text x={padLeft - 10} y={yAt(tick) + 4} textAnchor="end" className={`fill-white/50 text-[11px] ${blurClass}`}>{formatKrw(tick)}</text>
          </g>
        ))}
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />

        {series.map((line) => {
          const points = line.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
          return <polyline key={line.key} points={points} fill="none" stroke={line.color} strokeWidth={line.key === "total" ? 2.8 : 1.8} />;
        })}
        {selectedX !== null ? (
          <line
            x1={selectedX}
            y1={padTop}
            x2={selectedX}
            y2={height - padBottom}
            stroke="rgba(255,255,255,0.35)"
            strokeDasharray="3 3"
            strokeWidth={1}
          />
        ) : null}
        {selectedIndex >= 0
          ? series.map((line) => {
              const value = line.values[selectedIndex];
              if (value === undefined) return null;
              return (
                <circle
                  key={`${line.key}-selected-dot`}
                  cx={selectedX ?? 0}
                  cy={yAt(value)}
                  r={3.2}
                  fill={line.color}
                  stroke="#ffffff"
                  strokeWidth={1}
                />
              );
            })
          : null}

        <text x={padLeft} y={height - 10} className="fill-white/60 text-[11px]">{months[0]}</text>
        <text x={width - padRight} y={height - 10} textAnchor="end" className="fill-white/60 text-[11px]">{months[months.length - 1]}</text>
      </svg>
    </div>
  );
}

function AssetHistoryTooltip({ summary }: { summary: HoverSummary }) {
  if (!summary) return null;
  return (
    <div className="absolute right-3 top-3 z-10 rounded-lg border border-white/15 bg-[#0b0f1a]/90 px-3 py-2 text-[11px] backdrop-blur">
      <div className="text-[var(--ink-1)]">Month: <span className="text-white/90">{summary.month}</span></div>
      <div className="text-[var(--ink-1)]">Total: <span className="text-white/90">{formatKrw(summary.total)}</span></div>
      <div className="text-[var(--ink-1)]">
        Change vs Prev:{" "}
        <span className={summary.hasPrev ? (summary.delta >= 0 ? "text-emerald-300" : "text-rose-300") : "text-white/70"}>
          {summary.hasPrev ? `${formatKrw(summary.delta)} (${summary.deltaPercent === null ? "N/A" : formatPct(summary.deltaPercent)})` : "N/A"}
        </span>
      </div>
    </div>
  );
}

function MonthClickPicker({
  label,
  value,
  minMonth,
  maxMonth,
  onChange
}: {
  label: string;
  value: string;
  minMonth: string;
  maxMonth: string;
  onChange: (month: string) => void;
}) {
  const minYear = Number(minMonth.slice(0, 4));
  const maxYear = Number(maxMonth.slice(0, 4));
  const selectedYear = Number((value || minMonth).slice(0, 4));
  const selectedMonthNo = Number((value || minMonth).slice(5, 7));
  const years = Array.from({ length: Math.max(1, maxYear - minYear + 1) }).map((_, idx) => minYear + idx);
  const makeMonth = (year: number, monthNo: number) => `${year}-${String(monthNo).padStart(2, "0")}`;
  const isDisabled = (candidate: string) => candidate < minMonth || candidate > maxMonth;

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
      <div className="mb-2 flex items-center gap-2 text-xs text-[var(--ink-1)]">
        <span>{label}</span>
        <select
          className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs"
          value={selectedYear}
          onChange={(event) => {
            const nextYear = Number(event.target.value);
            const candidate = makeMonth(nextYear, selectedMonthNo || 1);
            if (candidate < minMonth) onChange(minMonth);
            else if (candidate > maxMonth) onChange(maxMonth);
            else onChange(candidate);
          }}
        >
          {years.map((year) => (
            <option key={`${label}-year-${year}`} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {Array.from({ length: 12 }).map((_, idx) => {
          const monthNo = idx + 1;
          const candidate = makeMonth(selectedYear, monthNo);
          const active = candidate === value;
          const disabled = isDisabled(candidate);
          return (
            <button
              key={`${label}-${candidate}`}
              type="button"
              disabled={disabled}
              onClick={() => onChange(candidate)}
              className={`rounded px-2 py-1 text-[11px] ${
                active
                  ? "border border-white/40 bg-white/10 text-white"
                  : disabled
                    ? "border border-white/5 text-white/30 cursor-not-allowed"
                    : "border border-white/10 text-white/80 hover:border-white/30"
              }`}
            >
              {String(monthNo).padStart(2, "0")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

