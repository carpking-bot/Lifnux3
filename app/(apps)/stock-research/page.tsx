"use client";

import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { loadState, saveState } from "../../(shared)/lib/storage";
import { Copy, Download, Plus, RefreshCcw, Save, Search, Trash2, Upload } from "lucide-react";

const REPORTS_KEY = "lifnux:stockResearch:reports";
const TAG_OPTIONS_KEY = "lifnux:stockResearch:tagOptions";

type Rating = "ignore" | "watch" | "buy" | "holding";
type Metric = { id: string; label: string; value: string };
type RevenueItem = { id: string; label: string; amount: string; percent: string };
type EarningsRow = { id: string; period: string; revenue: string; profit: string; eps: string; growth: string };

type ResearchReport = {
  id: string;
  company: string;
  ticker: string;
  sector: string;
  market: string;
  price: string;
  rating: Rating;
  tags: string[];
  metrics: Metric[];
  thesis: string;
  evidence: string;
  risks: string;
  catalysts: string;
  revenueTotal: string;
  revenueCurrency: string;
  revenueUnit: string;
  revenueItems: RevenueItem[];
  earnings: EarningsRow[];
  earningsCall: string;
  sources: string;
  updatedAt: string;
};

type Quote = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  currency?: string | null;
  marketTime?: string | null;
  name?: string | null;
  warning?: string | null;
  status?: "VALID" | "RETRYING" | "ERROR" | "STALE";
};

const ratingLabels: Record<Rating, string> = {
  ignore: "관심 없음",
  watch: "관찰",
  buy: "매수 검토",
  holding: "보유 중"
};

const ratingStyles: Record<Rating, string> = {
  ignore: "border-white/10 bg-white/8 text-white/55",
  watch: "border-amber-300/25 bg-amber-300/12 text-amber-100",
  buy: "border-emerald-300/25 bg-emerald-300/12 text-emerald-100",
  holding: "border-rose-300/25 bg-rose-300/12 text-rose-100"
};

const revenueColors = ["#0f766e", "#2563eb", "#a16207", "#7c3aed", "#dc2626", "#0891b2"];
const defaultTags = ["NYSE", "NASDAQ", "AI", "GPU", "반도체", "클라우드", "배당"];
const surface = "border border-white/10 bg-slate-950/85 shadow-2xl shadow-black/25";
const fieldClass =
  "w-full rounded-lg border border-white/10 bg-slate-950/90 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-300/45";
const textareaClass = `${fieldClass} min-h-[112px] resize-y leading-6`;
const DEFAULT_REPORT_UPDATED_AT = "2026-04-29T00:00:00.000Z";

function id() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function metric(label = "", value = ""): Metric {
  return { id: id(), label, value };
}

function revenue(label = "", amount = "", percent = ""): RevenueItem {
  return { id: id(), label, amount, percent };
}

function earnings(period = "", revenueValue = "", profit = "", eps = "", growth = ""): EarningsRow {
  return { id: id(), period, revenue: revenueValue, profit, eps, growth };
}

const defaultReport: ResearchReport = {
  id: "stock-research-sample-nvidia",
  company: "NVIDIA",
  ticker: "NVDA",
  sector: "반도체",
  market: "US NASDAQ",
  price: "$879.44",
  rating: "buy",
  tags: ["NASDAQ", "AI", "GPU", "데이터센터"],
  metrics: [
    metric("PER", "52.1"),
    metric("Forward PER", "31.4"),
    metric("52W Range", "$410 - $974"),
    metric("시가총액", "$2.1T"),
    metric("매출 성장률", "+56%"),
    metric("Gross Margin", "73.5%")
  ],
  thesis: "AI 인프라 수요가 핵심 투자 동력입니다. 데이터센터 성장률, 공급 제약, 마진 지속성을 함께 추적합니다.",
  evidence: "데이터센터 매출 성장, CUDA 생태계, 높은 전환 비용, 클라우드 CAPEX 계획을 주요 근거로 모니터링합니다.",
  risks: "높은 밸류에이션, 자체 AI 칩 전환, 수출 규제, 공급 병목은 멀티플 압박 요인입니다.",
  catalysts: "분기 실적, Blackwell 공급 상황, 하이퍼스케일러 CAPEX 가이던스, 마진 코멘트가 주요 강점입니다.",
  revenueTotal: "$46.7B",
  revenueCurrency: "USD",
  revenueUnit: "B",
  revenueItems: [
    revenue("데이터센터", "$36.4B", "78"),
    revenue("게이밍", "$4.7B", "10"),
    revenue("전문 시각화", "$2.8B", "6"),
    revenue("자동차", "$2.8B", "6")
  ],
  earnings: [
    earnings("FY26 Q2", "$46.7B", "$28.4B", "$1.05", "+56%"),
    earnings("FY26 Q1", "$44.1B", "$26.0B", "$0.96", "+69%"),
    earnings("FY25 Q4", "$39.3B", "$24.0B", "$0.89", "+78%")
  ],
  earningsCall:
    "경영진은 클라우드, 엔터프라이즈, 국가 AI 고객 전반의 AI 인프라 수요를 강조했습니다. 공급 램프와 차세대 GPU 전환이 핵심 체크포인트입니다.",
  sources: "Deep Research 링크, 공시, 컨퍼런스콜 원문, 애널리스트 노트를 붙여넣으세요.",
  updatedAt: DEFAULT_REPORT_UPDATED_AT
};

function emptyReport(): ResearchReport {
  return {
    id: id(),
    company: "새 기업",
    ticker: "",
    sector: "",
    market: "",
    price: "",
    rating: "watch",
    tags: [],
    metrics: [metric("PER"), metric("Forward PER")],
    thesis: "",
    evidence: "",
    risks: "",
    catalysts: "",
    revenueTotal: "",
    revenueCurrency: "USD",
    revenueUnit: "B",
    revenueItems: [revenue()],
    earnings: [earnings()],
    earningsCall: "",
    sources: "",
    updatedAt: now()
  };
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  return [];
}

function normalizeMetrics(value: unknown): Metric[] {
  if (Array.isArray(value)) {
    return value.map((row: any) => metric(String(row.label ?? ""), String(row.value ?? ""))).filter((row) => row.label || row.value);
  }
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((line) => {
      const [label, ...rest] = line.split(":");
      return metric((label ?? "").trim(), rest.join(":").trim());
    })
    .filter((row) => row.label || row.value);
}

function normalizeEarnings(value: unknown): EarningsRow[] {
  if (Array.isArray(value)) {
    return value.map((row: any) =>
      earnings(String(row.period ?? ""), String(row.revenue ?? ""), String(row.profit ?? ""), String(row.eps ?? ""), String(row.growth ?? ""))
    );
  }
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((line) => {
      const [period, revenueValue, profit, eps, growth] = line.split("|").map((part) => part.trim());
      return earnings(period ?? "", revenueValue ?? "", profit ?? "", eps ?? "", growth ?? "");
    })
    .filter((row) => row.period || row.revenue || row.profit || row.eps || row.growth);
}

function normalizeRevenue(value: unknown): RevenueItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((row: any) => revenue(String(row.label ?? ""), String(row.amount ?? ""), String(row.percent ?? "")));
}

function normalizeReport(raw: any): ResearchReport {
  const base = emptyReport();
  const rating: Rating = ["ignore", "watch", "buy", "holding"].includes(raw?.rating) ? raw.rating : "watch";
  const metrics = normalizeMetrics(raw?.metrics);
  const revenueItems = normalizeRevenue(raw?.revenueItems);
  const earningsRows = normalizeEarnings(raw?.earnings);
  return {
    ...base,
    ...raw,
    id: String(raw?.id || id()),
    company: String(raw?.company || "새 기업"),
    ticker: String(raw?.ticker || ""),
    sector: String(raw?.sector || ""),
    market: String(raw?.market || ""),
    price: String(raw?.price || ""),
    rating,
    tags: normalizeTags(raw?.tags),
    metrics: metrics.length ? metrics : base.metrics,
    revenueItems: revenueItems.length ? revenueItems : base.revenueItems,
    earnings: earningsRows.length ? earningsRows : base.earnings,
    updatedAt: String(raw?.updatedAt || now())
  };
}

function logoSrc(report: ResearchReport) {
  return report.ticker.trim().toUpperCase() === "BE" ? "/stock-research/image/BI/BE.png" : "";
}

function initials(report: ResearchReport) {
  return (report.ticker || report.company || "SR").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "SR";
}

function numericPercent(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function currencySymbol(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (normalized === "USD") return "$";
  if (normalized === "KRW") return "₩";
  if (normalized === "JPY") return "¥";
  if (normalized === "EUR") return "€";
  if (normalized === "CNY") return "¥";
  return normalized ? `${normalized} ` : "";
}

function parseMoneyAmount(value: string, defaultUnit = "") {
  const trimmed = value.trim();
  const amount = Number.parseFloat(trimmed.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount)) return null;
  const unitMatch = trimmed.toUpperCase().match(/\b(M|B|T|억|조)\b|([MBT])$/);
  return {
    amount,
    unit: unitMatch?.[1] || unitMatch?.[2] || defaultUnit
  };
}

function unitMultiplier(unit: string) {
  const normalized = unit.trim().toUpperCase();
  if (normalized === "M") return 1_000_000;
  if (normalized === "B") return 1_000_000_000;
  if (normalized === "T") return 1_000_000_000_000;
  if (unit === "억") return 100_000_000;
  if (unit === "조") return 1_000_000_000_000;
  return 1;
}

function formatMoneyInput(value: string, currency: string, unit: string) {
  const parsed = parseMoneyAmount(value, unit);
  if (!parsed) return value.trim() || "-";
  const displayUnit = parsed.unit || unit;
  return `${currencySymbol(currency)}${parsed.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${displayUnit}`;
}

function getRevenueComputed(items: RevenueItem[], currency: string, unit: string) {
  const rows = items.map((item) => {
    const parsed = parseMoneyAmount(item.amount, unit);
    const baseValue = parsed ? parsed.amount * unitMultiplier(parsed.unit || unit) : 0;
    return { item, baseValue, displayAmount: formatMoneyInput(item.amount, currency, unit) };
  });
  const totalBase = rows.reduce((sum, row) => sum + row.baseValue, 0);
  const totalDisplay = totalBase > 0
    ? `${currencySymbol(currency)}${(totalBase / unitMultiplier(unit)).toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit}`
    : "-";
  return {
    rows: rows.map((row) => ({
      ...row,
      percent: totalBase > 0 ? (row.baseValue / totalBase) * 100 : numericPercent(row.item.percent)
    })),
    totalBase,
    totalDisplay
  };
}

function donutGradient(rows: Array<{ percent: number }>) {
  const total = rows.reduce((sum, item) => sum + Math.max(0, item.percent), 0) || 1;
  let cursor = 0;
  return `conic-gradient(${rows
    .map((item, index) => {
      const size = (Math.max(0, item.percent) / total) * 100;
      const start = cursor;
      cursor += size;
      return `${revenueColors[index % revenueColors.length]} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
    })
    .join(", ")})`;
}

function replaceAt<T>(items: T[], index: number, value: T) {
  return items.map((item, currentIndex) => (currentIndex === index ? value : item));
}

function removeAt<T>(items: T[], index: number, fallback: T) {
  const next = items.filter((_, currentIndex) => currentIndex !== index);
  return next.length ? next : [fallback];
}

function resolveQuoteSymbol(ticker: string, market: string) {
  const normalizedTicker = ticker.trim().toUpperCase();
  const normalizedMarket = market.trim().toUpperCase();
  if (!normalizedTicker) return "";
  if (normalizedTicker.includes(":")) return normalizedTicker;
  const isKorea = /KR|KOREA|KOSPI|KOSDAQ|KRX|한국|코스피|코스닥/.test(normalizedMarket);
  if (isKorea && /^\d{6}$/.test(normalizedTicker)) return normalizedTicker;
  if (isKorea && /^\d{6}\.(KS|KQ)$/.test(normalizedTicker)) return normalizedTicker;
  if (/NYSE|NEW YORK|NYS/.test(normalizedMarket)) return `NYS:${normalizedTicker}`;
  if (/NASDAQ|NAS/.test(normalizedMarket)) return `NAS:${normalizedTicker}`;
  if (/AMEX|AMERICAN|AMS/.test(normalizedMarket)) return `AMS:${normalizedTicker}`;
  return normalizedTicker;
}

function formatQuotePrice(quote: Quote) {
  if (typeof quote.price !== "number" || !Number.isFinite(quote.price) || quote.price <= 0) return null;
  const currency = quote.currency || (/^\d{6}/.test(quote.symbol) ? "KRW" : "USD");
  if (currency === "KRW") return `KRW ${Math.round(quote.price).toLocaleString("ko-KR")}`;
  return `${currency} ${quote.price.toLocaleString("en-US", { maximumFractionDigits: quote.price >= 100 ? 2 : 4 })}`;
}

function quoteChangeText(quote: Quote | null) {
  if (!quote || typeof quote.changePercent !== "number") return "";
  const pct = `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%`;
  if (typeof quote.change === "number") return `${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)} (${pct})`;
  return pct;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour24 = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const meridiem = hour24 >= 12 ? "오후" : "오전";
  const hour12 = hour24 % 12 || 12;
  return `${year}. ${month}. ${day}. ${meridiem} ${hour12}:${minute}`;
}

export default function StockResearchPage() {
  const [reports, setReports] = useState<ResearchReport[]>([defaultReport]);
  const [tagOptions, setTagOptions] = useState<string[]>(defaultTags);
  const [selectedId, setSelectedId] = useState(defaultReport.id);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Rating | "all">("all");
  const [tagDraft, setTagDraft] = useState("");
  const [newTag, setNewTag] = useState("");
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [lastQuote, setLastQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");

  useEffect(() => {
    const loaded = loadState<unknown[]>(REPORTS_KEY, []);
    const normalized = Array.isArray(loaded) && loaded.length ? loaded.map(normalizeReport) : [defaultReport];
    const tags = loadState<string[]>(TAG_OPTIONS_KEY, defaultTags);
    setReports(normalized);
    setSelectedId(normalized[0]?.id ?? defaultReport.id);
    setTagOptions(Array.isArray(tags) && tags.length ? tags.map(String) : defaultTags);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(REPORTS_KEY, reports);
  }, [hydrated, reports]);

  useEffect(() => {
    if (hydrated) saveState(TAG_OPTIONS_KEY, tagOptions);
  }, [hydrated, tagOptions]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = useMemo(() => reports.find((report) => report.id === selectedId) ?? reports[0], [reports, selectedId]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reports
      .filter((report) => {
        const text = [report.company, report.ticker, report.sector, report.market, report.tags.join(" ")].join(" ").toLowerCase();
        return (filter === "all" || report.rating === filter) && (!needle || text.includes(needle));
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [filter, query, reports]);

  const updateSelected = (patch: Partial<ResearchReport>) => {
    if (!selected) return;
    setReports((current) => current.map((report) => (report.id === selected.id ? { ...report, ...patch, updatedAt: now() } : report)));
  };

  const syncCurrentPrice = async () => {
    if (!selected) return;
    const symbol = resolveQuoteSymbol(selected.ticker, selected.market);
    if (!symbol) {
      setQuoteError("티커를 먼저 입력하세요.");
      return;
    }
    setQuoteLoading(true);
    setQuoteError("");
    try {
      const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("quote-api-error");
      const data = (await response.json()) as { quotes?: Quote[]; error?: string };
      const quote = data.quotes?.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase()) ?? data.quotes?.[0] ?? null;
      const formatted = quote ? formatQuotePrice(quote) : null;
      if (!quote || !formatted) {
        setLastQuote(quote);
        setQuoteError("현재가를 찾지 못했습니다. 티커/마켓을 확인하세요.");
        return;
      }
      setLastQuote(quote);
      updateSelected({ price: formatted });
      setToast("현재가를 업데이트했습니다.");
    } catch {
      setQuoteError("시세 API 연결에 실패했습니다. quote-service 실행 상태를 확인하세요.");
    } finally {
      setQuoteLoading(false);
    }
  };

  const addReport = () => {
    const report = emptyReport();
    setReports((current) => [report, ...current]);
    setSelectedId(report.id);
    setMode("edit");
  };

  const duplicateReport = () => {
    if (!selected) return;
    const copy = normalizeReport({ ...selected, id: id(), company: `${selected.company} 복사본`, updatedAt: now() });
    setReports((current) => [copy, ...current]);
    setSelectedId(copy.id);
    setMode("edit");
  };

  const deleteReport = () => {
    if (!selected || !window.confirm(`${selected.company} 리포트를 삭제할까요?`)) return;
    setReports((current) => {
      const next = current.filter((report) => report.id !== selected.id);
      const fallback = next.length ? next : [defaultReport];
      setSelectedId(fallback[0].id);
      return fallback;
    });
  };

  const addTag = (tag: string) => {
    const value = tag.trim();
    if (!selected || !value || selected.tags.includes(value)) return;
    updateSelected({ tags: [...selected.tags, value] });
    if (!tagOptions.includes(value)) setTagOptions((current) => [...current, value].sort());
    setTagDraft("");
    setNewTag("");
  };

  const exportReports = () => {
    const blob = new Blob([JSON.stringify({ reports, tagOptions }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-research-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importReports = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const rawReports = Array.isArray(parsed) ? parsed : parsed.reports;
      if (!Array.isArray(rawReports) || rawReports.length === 0) throw new Error("Invalid JSON");
      const next = rawReports.map(normalizeReport);
      setReports(next);
      setSelectedId(next[0].id);
      if (Array.isArray(parsed.tagOptions)) setTagOptions(parsed.tagOptions.map(String));
      setToast("가져왔습니다.");
    } catch {
      setToast("가져오기에 실패했습니다.");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    updateSelected({});
    setMode("view");
    setToast("저장했습니다.");
  };

  if (!selected) {
    return (
      <AppShell title="Stock Research">
        <div className={`rounded-xl p-6 text-white ${surface}`}>리포트 데이터가 없습니다.</div>
      </AppShell>
    );
  }

  const logo = logoSrc(selected);
  const quoteChange = quoteChangeText(lastQuote);
  const selectedRevenue = getRevenueComputed(selected.revenueItems, selected.revenueCurrency, selected.revenueUnit);

  return (
    <AppShell title="Stock Research" showTitle={false}>
      <div className="mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 gap-4 py-5 text-white lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 rounded-xl border border-white/10 bg-[#0f1f24] p-4 shadow-2xl shadow-black/25 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)] lg:overflow-auto">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-100 text-sm font-black text-emerald-800">DR</div>
            <div>
              <div className="text-sm font-bold">Deep Research</div>
              <div className="text-xs text-white/45">투자 리서치 노트</div>
            </div>
          </div>

          <section className="rounded-lg border border-white/10 bg-white/[0.09] p-4">
            <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-lg bg-emerald-50 text-3xl font-black text-emerald-800">
              {logo ? <img src={logo} alt={`${selected.company} BI`} className="h-full w-full object-contain p-2" /> : initials(selected)}
            </div>
            <h1 className="mt-4 break-words text-2xl font-black leading-tight">{selected.company}</h1>
            <p className="mt-1 text-xs text-white/45">{[selected.ticker, selected.market].filter(Boolean).join(" - ") || "티커 / 시장"}</p>
            <div className="mt-4 rounded-lg bg-[#183036] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-white/45">현재가</div>
                <button
                  type="button"
                  onClick={syncCurrentPrice}
                  disabled={quoteLoading}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[11px] font-bold text-white/70 hover:border-white/25 disabled:opacity-50"
                >
                  <RefreshCcw className={`h-3 w-3 ${quoteLoading ? "animate-spin" : ""}`} />
                  동기화
                </button>
              </div>
              <div className="text-2xl font-black">{selected.price || "-"}</div>
              <div className={`text-xs ${lastQuote?.changePercent !== undefined && lastQuote?.changePercent !== null ? (lastQuote.changePercent >= 0 ? "text-emerald-300" : "text-rose-300") : "text-white/40"}`}>
                {quoteChange || "수동 입력 또는 API 동기화"}
              </div>
              {quoteError ? <div className="mt-1 text-xs text-rose-300">{quoteError}</div> : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {selected.tags.length ? selected.tags.map((tag) => <Pill key={tag}>{tag}</Pill>) : <span className="text-xs text-white/35">태그 없음</span>}
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-white/[0.09] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-bold">리서치 목록</div>
              <button type="button" onClick={addReport} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white hover:bg-white/15" aria-label="New report">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/85 px-3 py-2">
              <Search className="h-4 w-4 text-white/45" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-white/30" placeholder="기업명, 티커, 태그 검색" />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["all", "ignore", "watch", "buy", "holding"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                    filter === item ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-slate-950/40 text-white/50 hover:text-white"
                  }`}
                >
                  {item === "all" ? "전체" : ratingLabels[item]}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              {filtered.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(report.id);
                    setMode("view");
                  }}
                  className={`rounded-lg border p-3 text-left transition ${
                    report.id === selected.id ? "border-emerald-300/45 bg-emerald-300/12" : "border-white/10 bg-slate-950/45 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <strong className="break-words text-sm">{report.company || "이름 없음"}</strong>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${ratingStyles[report.rating]}`}>{ratingLabels[report.rating]}</span>
                  </div>
                  <div className="mt-1 text-xs text-white/45">{[report.ticker, report.sector].filter(Boolean).join(" - ")}</div>
                </button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={exportReports} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold hover:bg-white/12">
              <Download className="h-4 w-4" />
              내보내기
            </button>
            <label className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold hover:bg-white/12">
              <Upload className="h-4 w-4" />
              가져오기
              <input type="file" accept="application/json" hidden onChange={importReports} />
            </label>
          </div>
        </aside>

        <main className="min-w-0">
          <header className={`mb-4 flex flex-col gap-3 rounded-xl p-4 backdrop-blur md:flex-row md:items-center md:justify-between ${surface}`}>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-emerald-200/60">기업 분석</p>
              <h2 className="mt-1 text-2xl font-black">{selected.company} 투자 리서치</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-white/10 bg-slate-950/90 p-1">
                <button type="button" onClick={() => setMode("view")} className={`rounded-md px-3 py-2 text-sm font-bold ${mode === "view" ? "bg-white/15 text-white" : "text-white/45"}`}>
                  보기
                </button>
                <button type="button" onClick={() => setMode("edit")} className={`rounded-md px-3 py-2 text-sm font-bold ${mode === "edit" ? "bg-white/15 text-white" : "text-white/45"}`}>
                  편집
                </button>
              </div>
              <IconOnly label="복제" onClick={duplicateReport}>
                <Copy className="h-4 w-4" />
              </IconOnly>
              <IconOnly label="삭제" onClick={deleteReport} danger>
                <Trash2 className="h-4 w-4" />
              </IconOnly>
              {mode === "edit" ? (
                <button type="submit" form="stockResearchForm" className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-300 px-4 text-sm font-black text-emerald-950 hover:bg-emerald-200">
                  <Save className="h-4 w-4" />
                  저장
                </button>
              ) : null}
            </div>
          </header>

          {mode === "view" ? (
            <Reader report={selected} />
          ) : (
            <form id="stockResearchForm" onSubmit={submit} className="grid gap-4">
              <Panel eyebrow="리서치 편집" title="기업 프로필">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="기업명" value={selected.company} onChange={(value) => updateSelected({ company: value })} required />
                  <Field label="티커" value={selected.ticker} onChange={(value) => updateSelected({ ticker: value.toUpperCase() })} />
                  <Field label="섹터" value={selected.sector} onChange={(value) => updateSelected({ sector: value })} />
                  <Field label="시장" value={selected.market} onChange={(value) => updateSelected({ market: value })} />
                  <div className="grid gap-1 text-xs font-bold text-white/55">
                    현재가
                    <div className="flex gap-2">
                      <input className={fieldClass} value={selected.price} onChange={(event) => updateSelected({ price: event.target.value })} />
                      <button
                        type="button"
                        onClick={syncCurrentPrice}
                        disabled={quoteLoading}
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-sm font-bold text-white hover:bg-white/12 disabled:opacity-50"
                      >
                        <RefreshCcw className={`h-4 w-4 ${quoteLoading ? "animate-spin" : ""}`} />
                        연동
                      </button>
                    </div>
                  </div>
                  <label className="grid gap-1 text-xs font-bold text-white/55">
                    투자 의견
                    <select className={fieldClass} value={selected.rating} onChange={(event) => updateSelected({ rating: event.target.value as Rating })}>
                      {(["ignore", "watch", "buy", "holding"] as const).map((item) => (
                        <option key={item} value={item}>
                          {ratingLabels[item]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </Panel>

              <Panel eyebrow="태그" title="태그 관리">
                <div className="flex flex-wrap gap-2">
                  {selected.tags.map((tag) => (
                    <button key={tag} type="button" onClick={() => updateSelected({ tags: selected.tags.filter((item) => item !== tag) })} className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-bold text-white/70 hover:border-rose-300/30 hover:text-rose-100">
                      {tag} x
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <select className={fieldClass} value={tagDraft} onChange={(event) => setTagDraft(event.target.value)}>
                    <option value="">태그 선택</option>
                    {tagOptions.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => addTag(tagDraft)} className="rounded-lg border border-white/10 bg-white/8 px-4 py-2 text-sm font-bold hover:bg-white/12">
                    추가
                  </button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                  <input className={fieldClass} value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="새 태그" />
                  <button type="button" onClick={() => addTag(newTag)} className="rounded-lg border border-white/10 bg-white/8 px-4 py-2 text-sm font-bold hover:bg-white/12">
                    생성
                  </button>
                </div>
              </Panel>

              <Panel eyebrow="구조화 데이터" title="핵심 지표">
                <div className="grid gap-2">
                  {selected.metrics.map((row, index) => (
                    <div key={row.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <input className={fieldClass} value={row.label} onChange={(event) => updateSelected({ metrics: replaceAt(selected.metrics, index, { ...row, label: event.target.value }) })} placeholder="PER" />
                      <input className={fieldClass} value={row.value} onChange={(event) => updateSelected({ metrics: replaceAt(selected.metrics, index, { ...row, value: event.target.value }) })} placeholder="52.1" />
                      <RemoveButton onClick={() => updateSelected({ metrics: removeAt(selected.metrics, index, metric()) })} />
                    </div>
                  ))}
                </div>
                <AddButton onClick={() => updateSelected({ metrics: [...selected.metrics, metric()] })}>지표 추가</AddButton>
              </Panel>

              <Panel eyebrow="투자 서사" title="리서치 메모">
                <div className="grid gap-3 lg:grid-cols-2">
                  <TextArea label="사업 개요 / 투자 논지" value={selected.thesis} onChange={(value) => updateSelected({ thesis: value })} />
                  <TextArea label="투자 근거" value={selected.evidence} onChange={(value) => updateSelected({ evidence: value })} />
                  <TextArea label="강점" value={selected.catalysts} onChange={(value) => updateSelected({ catalysts: value })} />
                  <TextArea label="단점" value={selected.risks} onChange={(value) => updateSelected({ risks: value })} />
                </div>
              </Panel>

              <Panel eyebrow="매출 구성" title="매출 믹스">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
                  <label className="grid gap-1 text-xs font-bold text-white/55">
                    화폐
                    <input className={fieldClass} value={selected.revenueCurrency} onChange={(event) => updateSelected({ revenueCurrency: event.target.value.toUpperCase() })} placeholder="USD" />
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-white/55">
                    단위
                    <input className={fieldClass} value={selected.revenueUnit} onChange={(event) => updateSelected({ revenueUnit: event.target.value.toUpperCase() })} placeholder="M 또는 B" />
                  </label>
                  <div className="rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2">
                    <div className="text-xs font-bold text-white/45">총 매출</div>
                    <div className="mt-1 text-lg font-black">{selectedRevenue.totalDisplay}</div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  {selectedRevenue.rows.map(({ item: row, percent, displayAmount }, index) => (
                    <div key={row.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_120px_auto]">
                      <input className={fieldClass} value={row.label} onChange={(event) => updateSelected({ revenueItems: replaceAt(selected.revenueItems, index, { ...row, label: event.target.value }) })} placeholder="데이터센터" />
                      <input className={fieldClass} value={row.amount} onChange={(event) => updateSelected({ revenueItems: replaceAt(selected.revenueItems, index, { ...row, amount: event.target.value }) })} placeholder="400" title={`표시: ${displayAmount}`} />
                      <div className="rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2 text-sm font-bold text-white/80">
                        {percent > 0 ? `${percent.toFixed(1)}%` : "-"}
                      </div>
                      <RemoveButton onClick={() => updateSelected({ revenueItems: removeAt(selected.revenueItems, index, revenue()) })} />
                    </div>
                  ))}
                </div>
                <AddButton onClick={() => updateSelected({ revenueItems: [...selected.revenueItems, revenue()] })}>매출 항목 추가</AddButton>
              </Panel>

              <Panel eyebrow="최근 실적" title="실적 테이블">
                <div className="mb-3 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 text-xs font-bold text-white/55">
                    실적 화폐
                    <input className={fieldClass} value={selected.revenueCurrency} onChange={(event) => updateSelected({ revenueCurrency: event.target.value.toUpperCase() })} placeholder="USD" />
                  </label>
                  <label className="grid gap-1 text-xs font-bold text-white/55">
                    실적 금액 단위
                    <input className={fieldClass} value={selected.revenueUnit} onChange={(event) => updateSelected({ revenueUnit: event.target.value.toUpperCase() })} placeholder="M 또는 B" />
                  </label>
                </div>
                <div className="grid gap-2">
                  {selected.earnings.map((row, index) => (
                    <div key={row.id} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
                      <input className={fieldClass} value={row.period} onChange={(event) => updateSelected({ earnings: replaceAt(selected.earnings, index, { ...row, period: event.target.value }) })} placeholder="FY26 Q2" />
                      <input className={fieldClass} value={row.revenue} onChange={(event) => updateSelected({ earnings: replaceAt(selected.earnings, index, { ...row, revenue: event.target.value }) })} placeholder="매출" />
                      <input className={fieldClass} value={row.profit} onChange={(event) => updateSelected({ earnings: replaceAt(selected.earnings, index, { ...row, profit: event.target.value }) })} placeholder="영업이익" />
                      <input className={fieldClass} value={row.eps} onChange={(event) => updateSelected({ earnings: replaceAt(selected.earnings, index, { ...row, eps: event.target.value }) })} placeholder="EPS" />
                      <input className={fieldClass} value={row.growth} onChange={(event) => updateSelected({ earnings: replaceAt(selected.earnings, index, { ...row, growth: event.target.value }) })} placeholder="성장률" />
                      <RemoveButton onClick={() => updateSelected({ earnings: removeAt(selected.earnings, index, earnings()) })} />
                    </div>
                  ))}
                </div>
                <AddButton onClick={() => updateSelected({ earnings: [...selected.earnings, earnings()] })}>실적 행 추가</AddButton>
              </Panel>

              <Panel eyebrow="콜 노트" title="컨퍼런스콜 / 출처">
                <div className="grid gap-3 lg:grid-cols-2">
                  <TextArea label="컨퍼런스콜 요약" value={selected.earningsCall} onChange={(value) => updateSelected({ earningsCall: value })} />
                  <TextArea label="출처 / 링크" value={selected.sources} onChange={(value) => updateSelected({ sources: value })} />
                </div>
              </Panel>
            </form>
          )}
        </main>
      </div>
      {toast ? <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-2xl">{toast}</div> : null}
    </AppShell>
  );
}

function Reader({ report }: { report: ResearchReport }) {
  const revenueComputed = getRevenueComputed(report.revenueItems, report.revenueCurrency, report.revenueUnit);
  return (
    <div className="grid gap-4">
      <Panel eyebrow="시장 스냅샷" title="핵심 지표" right={<span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${ratingStyles[report.rating]}`}>{ratingLabels[report.rating]}</span>}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {report.metrics.map((item) => (
            <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.09] p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-white/40">{item.label || "지표"}</div>
              <div className="mt-2 break-words text-xl font-black">{item.value || "-"}</div>
            </div>
          ))}
        </div>
      </Panel>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <Panel eyebrow="사업 개요" title="회사 개요">
          <Paragraph value={report.thesis} />
        </Panel>
        <Panel eyebrow="투자 논지" title="투자 근거">
          <Paragraph value={report.evidence} />
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
        <Panel eyebrow="매출 구성" title="매출 믹스">
          <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="relative mx-auto h-52 w-52 rounded-full border border-white/10" style={{ background: donutGradient(revenueComputed.rows) }}>
              <div className="absolute inset-12 grid place-items-center rounded-full bg-slate-950 text-center">
                <div>
                  <div className="text-xs text-white/45">합계</div>
                  <div className="text-lg font-black">{revenueComputed.totalDisplay}</div>
                </div>
              </div>
            </div>
            <div className="grid content-center gap-3">
              {revenueComputed.rows.map(({ item, percent, displayAmount }, index) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: revenueColors[index % revenueColors.length] }} />
                    <span className="truncate text-sm font-bold">{item.label || "부문"}</span>
                  </div>
                  <div className="shrink-0 text-right text-xs text-white/55">
                    <div>{displayAmount}</div>
                    <div>{percent > 0 ? percent.toFixed(1) : "0"}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel eyebrow="최근 실적" title="실적">
          <div className="overflow-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead className="bg-white/[0.08] text-left text-xs uppercase tracking-[0.16em] text-white/45">
                <tr>
                  <th className="px-3 py-3">기간</th>
                  <th className="px-3 py-3">매출</th>
                  <th className="px-3 py-3">영업이익</th>
                  <th className="px-3 py-3">EPS</th>
                  <th className="px-3 py-3">성장률</th>
                </tr>
              </thead>
              <tbody>
                {report.earnings.map((row) => (
                  <tr key={row.id} className="border-t border-white/10 text-white/70">
                    <td className="px-3 py-3 font-bold text-white">{row.period || "-"}</td>
                    <td className="px-3 py-3">{formatMoneyInput(row.revenue, report.revenueCurrency, report.revenueUnit)}</td>
                    <td className="px-3 py-3">{formatMoneyInput(row.profit, report.revenueCurrency, report.revenueUnit)}</td>
                    <td className="px-3 py-3">{row.eps || "-"}</td>
                    <td className="px-3 py-3">{row.growth || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel eyebrow="강점 / 단점" title="강점과 단점">
          <MiniBlock title="강점" value={report.catalysts} />
          <MiniBlock title="단점" value={report.risks} />
        </Panel>
        <Panel eyebrow="컨퍼런스콜" title="콜 노트">
          <Paragraph value={report.earningsCall} />
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.08] p-3 text-xs text-white/45">업데이트 {formatDateTime(report.updatedAt)}</div>
        </Panel>
      </section>
    </div>
  );
}

function Panel({ eyebrow, title, right, children }: { eyebrow: string; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className={`rounded-xl p-4 ${surface}`}>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/55">{eyebrow}</p>
          <h3 className="mt-1 text-lg font-black">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="grid gap-1 text-xs font-bold text-white/55">
      {label}
      <input className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-bold text-white/55">
      {label}
      <textarea className={textareaClass} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Paragraph({ value }: { value: string }) {
  return <p className="whitespace-pre-wrap text-sm leading-7 text-white/72">{value || "-"}</p>;
}

function MiniBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">{title}</div>
      <Paragraph value={value} />
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/75">{children}</span>;
}

function IconOnly({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid h-10 w-10 place-items-center rounded-lg border ${
        danger ? "border-rose-300/20 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15" : "border-white/10 bg-white/8 hover:bg-white/12"
      }`}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/8 text-white/55 hover:border-rose-300/30 hover:text-rose-100" aria-label="행 삭제">
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-sm font-bold hover:bg-white/12">
      <Plus className="h-4 w-4" />
      {children}
    </button>
  );
}
