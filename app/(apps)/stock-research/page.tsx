"use client";

import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { loadState, saveState } from "../../(shared)/lib/storage";
import { Copy, Download, GripVertical, Pencil, Plus, RefreshCcw, Save, Search, Trash2, Upload, X } from "lucide-react";

const REPORTS_KEY = "lifnux:stockResearch:reports";
const TAG_OPTIONS_KEY = "lifnux:stockResearch:tagOptions";
const PROFILE_OPTIONS_KEY = "lifnux:stockResearch:profileOptions";
const DEFAULT_REPORT_UPDATED_AT = "2026-04-29T00:00:00.000Z";

type Rating = "ignore" | "watch" | "buy" | "holding";
type Metric = { id: string; label: string; value: string };
type RevenueItem = { id: string; label: string; amount: string; percent: string };
type EarningsRow = { id: string; period: string; revenue: string; profit: string; eps: string; growth: string };
type ConferenceCallNote = { id: string; source: string; date: string; content: string; sources: string };
type ResearchScore = { id: string; model: string; variant: string; date: string; score: string; memo: string };
type ProfileOptions = { markets: string[]; sectors: string[] };
type OptionModal = "market" | "sector" | "tag" | null;

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
  researchScores: ResearchScore[];
  thesis: string;
  evidence: string;
  risks: string;
  catalysts: string;
  revenueTotal: string;
  revenueCurrency: string;
  revenueUnit: string;
  revenueSource: string;
  revenueItems: RevenueItem[];
  earnings: EarningsRow[];
  conferenceCalls: ConferenceCallNote[];
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

const defaultTags = ["NYSE", "NASDAQ", "AI", "GPU", "반도체", "클라우드", "배당"];
const defaultProfileOptions: ProfileOptions = {
  markets: ["US NASDAQ", "US NYSE", "US AMEX", "KR KOSPI", "KR KOSDAQ"],
  sectors: ["반도체", "소프트웨어", "클라우드", "에너지", "금융", "헬스케어", "소비재", "산업재"]
};
const revenueColors = ["#0f766e", "#2563eb", "#a16207", "#7c3aed", "#dc2626", "#0891b2"];
const currencyOptions = [
  { value: "KRW", label: "KRW / 원" },
  { value: "USD", label: "USD / 달러" },
  { value: "HKD", label: "HKD / 홍콩달러" },
  { value: "CNY", label: "CNY / 위안" },
  { value: "JPY", label: "JPY / 엔" },
  { value: "EUR", label: "EUR / 유로" },
  { value: "GBP", label: "GBP / 파운드" },
  { value: "CAD", label: "CAD / 캐나다달러" },
  { value: "AUD", label: "AUD / 호주달러" },
  { value: "SGD", label: "SGD / 싱가포르달러" }
];
const westernMoneyUnits = ["K", "M", "B", "T"];
const eastAsianMoneyUnits = ["백만", "억"];
const researchScoreModels = ["Gemini", "Deepseek", "GPT", "Claude"];
const surface = "border border-white/10 bg-slate-950/85 shadow-2xl shadow-black/25";
const fieldClass =
  "w-full rounded-lg border border-white/10 bg-slate-950/90 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-300/45";
const textareaClass = `${fieldClass} min-h-[112px] resize-y leading-6`;
const callFieldClass =
  "w-full rounded-lg border border-emerald-300/15 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-emerald-300/45 focus:bg-slate-950/90";
const callTextareaClass = `${callFieldClass} min-h-[112px] resize-y leading-6 scrollbar-thin scrollbar-track-slate-950/80 scrollbar-thumb-emerald-300/25 hover:scrollbar-thumb-emerald-300/40 [scrollbar-color:rgba(110,231,183,0.28)_rgba(2,6,23,0.82)] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-950/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-emerald-300/25 [&::-webkit-scrollbar-thumb:hover]:bg-emerald-300/40`;

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function now() {
  return new Date().toISOString();
}

function metric(label = "", value = ""): Metric {
  return { id: makeId(), label, value };
}

function revenue(label = "", amount = "", percent = ""): RevenueItem {
  return { id: makeId(), label, amount, percent };
}

function earnings(period = "", revenueValue = "", profit = "", eps = "", growth = ""): EarningsRow {
  return { id: makeId(), period, revenue: revenueValue, profit, eps, growth };
}

function conferenceCall(source = "", content = "", sources = "", date = ""): ConferenceCallNote {
  return { id: makeId(), source, date, content, sources };
}

function researchScore(model = "GPT", variant = "Deep Research", date = "", score = "", memo = ""): ResearchScore {
  return { id: makeId(), model, variant, date, score, memo };
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
  researchScores: [
    researchScore("GPT", "Deep Research", "2026-04-29", "82", "AI 인프라 수요와 데이터센터 성장성을 높게 평가"),
    researchScore("Gemini", "Pro", "2026-04-28", "78", "밸류에이션 부담을 반영해 점수 조정")
  ],
  thesis: "AI 인프라 수요가 핵심 투자 동력입니다. 데이터센터 성장률, 공급 제약, 마진 지속성을 함께 추적합니다.",
  evidence: "데이터센터 매출 성장, CUDA 생태계, 높은 전환 비용, 클라우드 CAPEX 계획을 주요 근거로 모니터링합니다.",
  risks: "높은 밸류에이션, 자체 AI 칩 전환, 수출 규제, 공급 병목은 멀티플 압박 요인입니다.",
  catalysts: "분기 실적, Blackwell 공급 상황, 하이퍼스케일러 CAPEX 가이던스, 마진 코멘트가 주요 강점입니다.",
  revenueTotal: "$46.7B",
  revenueCurrency: "USD",
  revenueUnit: "B",
  revenueSource: "FY26 Q2 실적",
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
  conferenceCalls: [
    conferenceCall(
      "FY26 Q2 실적",
      "경영진은 클라우드, 엔터프라이즈, 국가 AI 고객 전반의 AI 인프라 수요를 강조했습니다. 공급 램프와 차세대 GPU 전환이 핵심 체크포인트입니다.",
      "Deep Research 링크, 공시, 컨퍼런스콜 원문, 애널리스트 노트",
      "2026-04-29"
    )
  ],
  earningsCall:
    "경영진은 클라우드, 엔터프라이즈, 국가 AI 고객 전반의 AI 인프라 수요를 강조했습니다. 공급 램프와 차세대 GPU 전환이 핵심 체크포인트입니다.",
  sources: "Deep Research 링크, 공시, 컨퍼런스콜 원문, 애널리스트 노트를 붙여넣으세요.",
  updatedAt: DEFAULT_REPORT_UPDATED_AT
};

function emptyReport(): ResearchReport {
  return {
    id: makeId(),
    company: "새 기업",
    ticker: "",
    sector: defaultProfileOptions.sectors[0],
    market: defaultProfileOptions.markets[0],
    price: "",
    rating: "watch",
    tags: [],
    metrics: [metric("PER"), metric("Forward PER")],
    researchScores: [],
    thesis: "",
    evidence: "",
    risks: "",
    catalysts: "",
    revenueTotal: "",
    revenueCurrency: "USD",
    revenueUnit: "B",
    revenueSource: "",
    revenueItems: [revenue()],
    earnings: [earnings()],
    conferenceCalls: [conferenceCall()],
    earningsCall: "",
    sources: "",
    updatedAt: now()
  };
}

function normalizeList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const next = value.map(String).map((entry) => entry.trim()).filter(Boolean);
  return next.length ? Array.from(new Set(next)) : fallback;
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

function normalizeResearchScores(value: unknown): ResearchScore[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row: any) => researchScore(String(row.model ?? "GPT"), String(row.variant ?? ""), String(row.date ?? ""), String(row.score ?? ""), String(row.memo ?? "")))
    .filter((row) => row.model || row.variant || row.date || row.score || row.memo);
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

function normalizeConferenceCalls(value: unknown, fallbackSource = "", fallbackContent = "", fallbackSources = ""): ConferenceCallNote[] {
  if (Array.isArray(value)) {
    const rows = value
      .map((row: any) => conferenceCall(String(row.source ?? ""), String(row.content ?? ""), String(row.sources ?? ""), String(row.date ?? "")))
      .filter((row) => row.source || row.content || row.sources);
    if (rows.length) return rows;
  }
  if (fallbackContent || fallbackSources) return [conferenceCall(fallbackSource, fallbackContent, fallbackSources)];
  return [];
}

function normalizeRevenue(value: unknown): RevenueItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((row: any) => revenue(String(row.label ?? ""), String(row.amount ?? ""), String(row.percent ?? "")));
}

function normalizeReport(raw: any): ResearchReport {
  const base = emptyReport();
  const rating: Rating = ["ignore", "watch", "buy", "holding"].includes(raw?.rating) ? raw.rating : "watch";
  const metrics = normalizeMetrics(raw?.metrics);
  const researchScores = normalizeResearchScores(raw?.researchScores);
  const revenueItems = normalizeRevenue(raw?.revenueItems);
  const earningsRows = normalizeEarnings(raw?.earnings);
  const revenueSource = String(raw?.revenueSource || "");
  const conferenceCalls = normalizeConferenceCalls(raw?.conferenceCalls, revenueSource, String(raw?.earningsCall || ""), String(raw?.sources || ""));
  return {
    ...base,
    ...raw,
    id: String(raw?.id || makeId()),
    company: String(raw?.company || "새 기업"),
    ticker: String(raw?.ticker || ""),
    sector: String(raw?.sector || base.sector),
    market: String(raw?.market || base.market),
    price: String(raw?.price || ""),
    rating,
    tags: normalizeTags(raw?.tags),
    metrics: metrics.length ? metrics : base.metrics,
    researchScores,
    revenueCurrency: String(raw?.revenueCurrency || base.revenueCurrency),
    revenueUnit: String(raw?.revenueUnit || base.revenueUnit),
    revenueSource,
    revenueItems: revenueItems.length ? revenueItems : base.revenueItems,
    earnings: earningsRows.length ? earningsRows : base.earnings,
    conferenceCalls: conferenceCalls.length ? conferenceCalls : base.conferenceCalls,
    updatedAt: String(raw?.updatedAt || now())
  };
}

function logoSrc(report: ResearchReport) {
  return report.ticker.trim().toUpperCase() === "BE" ? "/stock-research/image/BI/BE.png" : "";
}

function initials(report: ResearchReport) {
  return (report.ticker || report.company || "SR").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "SR";
}

function currencySymbol(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (normalized === "USD") return "$";
  if (normalized === "EUR") return "€";
  if (normalized === "GBP") return "£";
  return normalized ? `${normalized} ` : "";
}

function isEastAsianCurrency(currency: string) {
  return ["KRW", "CNY", "JPY"].includes(currency.trim().toUpperCase());
}

function currencySuffix(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (normalized === "KRW") return "원";
  if (normalized === "CNY") return "위안";
  if (normalized === "JPY") return "엔";
  return "";
}

function moneyUnitOptions(currency: string) {
  return isEastAsianCurrency(currency) ? eastAsianMoneyUnits : westernMoneyUnits;
}

function normalizeMoneyUnit(unit: string) {
  const trimmed = unit.trim();
  const upper = trimmed.toUpperCase();
  if (upper === "K" || upper === "M" || upper === "B" || upper === "T") return upper;
  if (trimmed === "백만" || upper === "MILLION") return "백만";
  if (trimmed === "억") return "억";
  return trimmed;
}

function normalizeRevenueUnitForCurrency(currency: string, unit: string) {
  const options = moneyUnitOptions(currency);
  const normalized = normalizeMoneyUnit(unit);
  return options.includes(normalized) ? normalized : options[isEastAsianCurrency(currency) ? 1 : 2];
}

function parseMoneyAmount(value: string, defaultUnit = "") {
  const trimmed = value.trim();
  const amount = Number.parseFloat(trimmed.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount)) return null;
  const normalized = trimmed.toUpperCase();
  const westernMatch = normalized.match(/\b(K|M|B|T)\b|([KMBT])$/);
  const eastAsianMatch = trimmed.match(/(백만|억)/);
  return { amount, unit: normalizeMoneyUnit(eastAsianMatch?.[1] || westernMatch?.[1] || westernMatch?.[2] || defaultUnit) };
}

function unitMultiplier(unit: string) {
  const normalized = normalizeMoneyUnit(unit);
  if (normalized === "K") return 1_000;
  if (normalized === "M") return 1_000_000;
  if (normalized === "B") return 1_000_000_000;
  if (normalized === "T") return 1_000_000_000_000;
  if (normalized === "백만") return 1_000_000;
  if (normalized === "억") return 100_000_000;
  return 1;
}

function formatMoneyInput(value: string, currency: string, unit: string) {
  const parsed = parseMoneyAmount(value, unit);
  if (!parsed) return value.trim() || "-";
  const displayUnit = normalizeMoneyUnit(parsed.unit || unit);
  const amount = parsed.amount.toLocaleString(isEastAsianCurrency(currency) ? "ko-KR" : "en-US", { maximumFractionDigits: 2 });
  if (isEastAsianCurrency(currency)) return `${amount}${displayUnit} ${currencySuffix(currency)}`;
  return `${currencySymbol(currency)}${amount}${displayUnit}`;
}

function isNegativeValue(value: string) {
  const parsed = Number.parseFloat(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed < 0;
}

function getRevenueComputed(items: RevenueItem[], currency: string, unit: string) {
  const normalizedUnit = normalizeRevenueUnitForCurrency(currency, unit);
  const rows = items.map((item) => {
    const parsed = parseMoneyAmount(item.amount, normalizedUnit);
    const baseValue = parsed ? parsed.amount * unitMultiplier(parsed.unit || normalizedUnit) : 0;
    return { item, baseValue, displayAmount: formatMoneyInput(item.amount, currency, normalizedUnit) };
  });
  const totalBase = rows.reduce((sum, row) => sum + row.baseValue, 0);
  const totalAmount = totalBase / unitMultiplier(normalizedUnit);
  const totalDisplay = totalBase > 0 ? formatMoneyInput(String(totalAmount), currency, normalizedUnit) : "-";
  return {
    rows: rows.map((row) => ({ ...row, percent: totalBase > 0 ? (row.baseValue / totalBase) * 100 : 0 })),
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

function splitMemoItems(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean);
}

function joinMemoItems(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean).join("\n");
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function sortMomentumItems(items: ConferenceCallNote[]) {
  return [...items].sort((a, b) => {
    const left = a.date ? new Date(a.date).getTime() : 0;
    const right = b.date ? new Date(b.date).getTime() : 0;
    return right - left;
  });
}

function baseResearchModel(model: string) {
  const normalized = model.trim().toLowerCase();
  if (normalized.includes("gemini")) return "Gemini";
  if (normalized.includes("deepseek")) return "Deepseek";
  if (normalized.includes("claude")) return "Claude";
  if (normalized.includes("gpt") || normalized.includes("openai")) return "GPT";
  return model.trim() || "기타";
}

function scoreNumber(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

function latestScoresByModel(scores: ResearchScore[]) {
  const latest = new Map<string, ResearchScore>();
  scores.forEach((score) => {
    const value = scoreNumber(score.score);
    if (value === null) return;
    const model = baseResearchModel(score.model);
    const current = latest.get(model);
    const nextTime = score.date ? new Date(score.date).getTime() : 0;
    const currentTime = current?.date ? new Date(current.date).getTime() : 0;
    if (!current || nextTime >= currentTime) latest.set(model, score);
  });
  return Array.from(latest.values()).sort((a, b) => baseResearchModel(a.model).localeCompare(baseResearchModel(b.model)));
}

function averageResearchScore(scores: ResearchScore[]) {
  const latest = latestScoresByModel(scores);
  const values = latest.map((score) => scoreNumber(score.score)).filter((score): score is number => score !== null);
  if (!values.length) return null;
  return values.reduce((sum, score) => sum + score, 0) / values.length;
}

function metricDisplayItems(report: ResearchReport) {
  const average = averageResearchScore(report.researchScores);
  const displayScore = average !== null ? `${average.toFixed(1)}점` : "-";
  const hasSuitability = report.metrics.some((item) => item.label.trim() === "투자 적합도");
  const metrics = report.metrics.map((item) => (item.label.trim() === "투자 적합도" ? { ...item, value: displayScore } : item));
  return hasSuitability ? metrics : [{ id: "research-score-average", label: "투자 적합도", value: displayScore }, ...metrics];
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
  const [profileOptions, setProfileOptions] = useState<ProfileOptions>(defaultProfileOptions);
  const [selectedId, setSelectedId] = useState(defaultReport.id);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Rating | "all">("all");
  const [tagDraft, setTagDraft] = useState("");
  const [newTag, setNewTag] = useState("");
  const [toast, setToast] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [lastQuote, setLastQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [optionModal, setOptionModal] = useState<OptionModal>(null);
  const [optionDraft, setOptionDraft] = useState("");
  const [optionEdit, setOptionEdit] = useState<Record<string, string>>({});
  const [scoreDraft, setScoreDraft] = useState<ResearchScore>(() => researchScore("GPT", "Deep Research", new Date().toISOString().slice(0, 10), ""));

  useEffect(() => {
    const loaded = loadState<unknown[]>(REPORTS_KEY, []);
    const normalized = Array.isArray(loaded) && loaded.length ? loaded.map(normalizeReport) : [defaultReport];
    const tags = loadState<string[]>(TAG_OPTIONS_KEY, defaultTags);
    const options = loadState<Partial<ProfileOptions>>(PROFILE_OPTIONS_KEY, defaultProfileOptions);
    setReports(normalized);
    setSelectedId(normalized[0]?.id ?? defaultReport.id);
    setTagOptions(normalizeList(tags, defaultTags));
    setProfileOptions({
      markets: normalizeList(options.markets, defaultProfileOptions.markets),
      sectors: normalizeList(options.sectors, defaultProfileOptions.sectors)
    });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(REPORTS_KEY, reports);
  }, [hydrated, reports]);

  useEffect(() => {
    if (hydrated) saveState(TAG_OPTIONS_KEY, tagOptions);
  }, [hydrated, tagOptions]);

  useEffect(() => {
    if (hydrated) saveState(PROFILE_OPTIONS_KEY, profileOptions);
  }, [hydrated, profileOptions]);

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

  const selectedRevenue = selected ? getRevenueComputed(selected.revenueItems, selected.revenueCurrency, selected.revenueUnit) : null;
  const logo = selected ? logoSrc(selected) : "";
  const quoteChange = quoteChangeText(lastQuote);

  const updateSelected = (patch: Partial<ResearchReport>) => {
    if (!selected) return;
    setReports((current) => current.map((report) => (report.id === selected.id ? { ...report, ...patch, updatedAt: now() } : report)));
  };

  const updateRevenueCurrency = (currency: string) => {
    if (!selected) return;
    updateSelected({
      revenueCurrency: currency,
      revenueUnit: normalizeRevenueUnitForCurrency(currency, selected.revenueUnit)
    });
  };

  const updateRevenueUnit = (unit: string) => {
    if (!selected) return;
    updateSelected({ revenueUnit: normalizeRevenueUnitForCurrency(selected.revenueCurrency, unit) });
  };

  const addResearchScore = () => {
    if (!selected || !scoreDraft.score.trim()) return;
    updateSelected({ researchScores: [...selected.researchScores, { ...scoreDraft, id: makeId() }] });
    setScoreDraft((current) => ({ ...current, score: "", memo: "", date: new Date().toISOString().slice(0, 10) }));
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
      const data = (await response.json()) as { quotes?: Quote[] };
      const quote = data.quotes?.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase()) ?? data.quotes?.[0] ?? null;
      const formatted = quote ? formatQuotePrice(quote) : null;
      if (!quote || !formatted) {
        setLastQuote(quote);
        setQuoteError("현재가를 찾지 못했습니다. 티커/시장을 확인하세요.");
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
    const copy = normalizeReport({ ...selected, id: makeId(), company: `${selected.company} 복사본`, updatedAt: now() });
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

  const addOption = () => {
    const value = optionDraft.trim();
    if (!value || !optionModal) return;
    if (optionModal === "market") setProfileOptions((prev) => ({ ...prev, markets: Array.from(new Set([...prev.markets, value])) }));
    if (optionModal === "sector") setProfileOptions((prev) => ({ ...prev, sectors: Array.from(new Set([...prev.sectors, value])) }));
    if (optionModal === "tag") setTagOptions((prev) => Array.from(new Set([...prev, value])).sort());
    setOptionDraft("");
  };

  const renameOption = (oldValue: string) => {
    const nextValue = (optionEdit[oldValue] ?? oldValue).trim();
    if (!optionModal || !nextValue || nextValue === oldValue) return;
    if (optionModal === "market") {
      setProfileOptions((prev) => ({ ...prev, markets: prev.markets.map((item) => (item === oldValue ? nextValue : item)) }));
      setReports((current) => current.map((report) => (report.market === oldValue ? { ...report, market: nextValue, updatedAt: now() } : report)));
    }
    if (optionModal === "sector") {
      setProfileOptions((prev) => ({ ...prev, sectors: prev.sectors.map((item) => (item === oldValue ? nextValue : item)) }));
      setReports((current) => current.map((report) => (report.sector === oldValue ? { ...report, sector: nextValue, updatedAt: now() } : report)));
    }
    if (optionModal === "tag") {
      setTagOptions((prev) => prev.map((item) => (item === oldValue ? nextValue : item)).sort());
      setReports((current) =>
        current.map((report) => ({
          ...report,
          tags: report.tags.map((tag) => (tag === oldValue ? nextValue : tag)),
          updatedAt: report.tags.includes(oldValue) ? now() : report.updatedAt
        }))
      );
    }
    setOptionEdit((prev) => ({ ...prev, [oldValue]: nextValue }));
  };

  const deleteOption = (value: string) => {
    if (!optionModal) return;
    if (optionModal === "tag") {
      const usedElsewhere = reports.some((report) => report.id !== selected?.id && report.tags.includes(value));
      if (usedElsewhere) {
        setAlertMessage("다른 기업 보고서에서 사용 중인 태그는 삭제할 수 없습니다.");
        return;
      }
      setTagOptions((prev) => prev.filter((item) => item !== value));
      setReports((current) =>
        current.map((report) => (report.id === selected?.id ? { ...report, tags: report.tags.filter((tag) => tag !== value), updatedAt: now() } : report))
      );
      return;
    }
    if (optionModal === "market") {
      const used = reports.some((report) => report.market === value);
      if (used) {
        setAlertMessage("보고서에서 사용 중인 시장 옵션은 삭제할 수 없습니다. 먼저 다른 시장으로 변경하세요.");
        return;
      }
      setProfileOptions((prev) => ({ ...prev, markets: prev.markets.filter((item) => item !== value) }));
    }
    if (optionModal === "sector") {
      const used = reports.some((report) => report.sector === value);
      if (used) {
        setAlertMessage("보고서에서 사용 중인 섹터 옵션은 삭제할 수 없습니다. 먼저 다른 섹터로 변경하세요.");
        return;
      }
      setProfileOptions((prev) => ({ ...prev, sectors: prev.sectors.filter((item) => item !== value) }));
    }
  };

  const exportReports = () => {
    const blob = new Blob([JSON.stringify({ reports, tagOptions, profileOptions }, null, 2)], { type: "application/json" });
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
      if (Array.isArray(parsed.tagOptions)) setTagOptions(normalizeList(parsed.tagOptions, defaultTags));
      if (parsed.profileOptions) {
        setProfileOptions({
          markets: normalizeList(parsed.profileOptions.markets, defaultProfileOptions.markets),
          sectors: normalizeList(parsed.profileOptions.sectors, defaultProfileOptions.sectors)
        });
      }
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

  if (!selected || !selectedRevenue) {
    return (
      <AppShell title="Stock Research">
        <div className={`rounded-xl p-6 text-white ${surface}`}>리포트 데이터가 없습니다.</div>
      </AppShell>
    );
  }

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
              <button type="button" onClick={addReport} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white hover:bg-white/15" aria-label="새 리포트">
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
                  <SelectWithManage label="시장" value={selected.market} options={profileOptions.markets} onChange={(value) => updateSelected({ market: value })} onManage={() => setOptionModal("market")} />
                  <SelectWithManage label="섹터" value={selected.sector} options={profileOptions.sectors} onChange={(value) => updateSelected({ sector: value })} onManage={() => setOptionModal("sector")} />
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

              <Panel
                eyebrow="태그"
                title="태그 관리"
                right={
                  <button type="button" onClick={() => setOptionModal("tag")} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold hover:bg-white/12">
                    <Pencil className="h-3.5 w-3.5" />
                    태그 옵션 편집
                  </button>
                }
              >
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
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.06] p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-black text-white/45">투자 적합도</div>
                      <div className="mt-1 text-sm font-bold text-white/75">모델별 최신 점수만 평균에 반영</div>
                    </div>
                    <div className="text-right text-sm font-black text-emerald-100">{averageResearchScore(selected.researchScores)?.toFixed(1) ?? "-"}점</div>
                  </div>
                  <div className="grid gap-2 lg:grid-cols-[120px_minmax(0,1fr)_150px_110px_auto]">
                    <select className={fieldClass} value={scoreDraft.model} onChange={(event) => setScoreDraft((prev) => ({ ...prev, model: event.target.value }))}>
                      {researchScoreModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                    <input className={fieldClass} value={scoreDraft.variant} onChange={(event) => setScoreDraft((prev) => ({ ...prev, variant: event.target.value }))} placeholder="Deep Research / Pro" />
                    <input type="date" className={fieldClass} value={scoreDraft.date} onChange={(event) => setScoreDraft((prev) => ({ ...prev, date: event.target.value }))} />
                    <input className={fieldClass} value={scoreDraft.score} onChange={(event) => setScoreDraft((prev) => ({ ...prev, score: event.target.value }))} placeholder="0-100" />
                    <button type="button" onClick={addResearchScore} className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-sm font-bold text-white/75 hover:bg-white/12">
                      점수 추가
                    </button>
                  </div>
                  <input className={`${fieldClass} mt-2`} value={scoreDraft.memo} onChange={(event) => setScoreDraft((prev) => ({ ...prev, memo: event.target.value }))} placeholder="점수 근거 메모" />
                  <div className="mt-4 grid gap-2">
                    {selected.researchScores.length ? (
                      selected.researchScores.map((score, index) => (
                        <div key={score.id} className="grid gap-2 rounded-lg border border-white/10 bg-slate-950/45 p-2 lg:grid-cols-[120px_minmax(0,1fr)_150px_100px_minmax(0,1.2fr)_auto]">
                          <select className={fieldClass} value={score.model} onChange={(event) => updateSelected({ researchScores: replaceAt(selected.researchScores, index, { ...score, model: event.target.value }) })}>
                            {researchScoreModels.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                          <input className={fieldClass} value={score.variant} onChange={(event) => updateSelected({ researchScores: replaceAt(selected.researchScores, index, { ...score, variant: event.target.value }) })} placeholder="Deep Research / Pro" />
                          <input type="date" className={fieldClass} value={score.date} onChange={(event) => updateSelected({ researchScores: replaceAt(selected.researchScores, index, { ...score, date: event.target.value }) })} />
                          <input className={fieldClass} value={score.score} onChange={(event) => updateSelected({ researchScores: replaceAt(selected.researchScores, index, { ...score, score: event.target.value }) })} placeholder="0-100" />
                          <input className={fieldClass} value={score.memo} onChange={(event) => updateSelected({ researchScores: replaceAt(selected.researchScores, index, { ...score, memo: event.target.value }) })} placeholder="메모" />
                          <RemoveButton onClick={() => updateSelected({ researchScores: selected.researchScores.filter((item) => item.id !== score.id) })} />
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-white/10 bg-slate-950/45 px-3 py-3 text-sm text-white/35">등록된 모델 점수 없음</div>
                    )}
                  </div>
                </div>
              </Panel>

              <Panel eyebrow="투자 서사" title="리서치 메모">
                <div className="grid gap-3 lg:grid-cols-2">
                  <TextArea label="사업 개요 / 투자 논지" value={selected.thesis} onChange={(value) => updateSelected({ thesis: value })} />
                  <TextArea label="투자 근거" value={selected.evidence} onChange={(value) => updateSelected({ evidence: value })} />
                  <MemoItemEditor title="강점" value={selected.catalysts} tone="positive" onChange={(value) => updateSelected({ catalysts: value })} />
                  <MemoItemEditor title="단점" value={selected.risks} tone="negative" onChange={(value) => updateSelected({ risks: value })} />
                </div>
              </Panel>

              <Panel
                eyebrow="매출 구성"
                title="매출 믹스"
                right={
                  <div className="min-w-[220px] rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2">
                    <div className="text-xs font-bold text-white/45">Data 출처</div>
                    <input className="mt-1 w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/30" value={selected.revenueSource} onChange={(event) => updateSelected({ revenueSource: event.target.value })} placeholder="예: 1Q2026 실적" />
                  </div>
                }
              >
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
                  <SelectField label="화폐 단위" value={selected.revenueCurrency} options={currencyOptions} onChange={updateRevenueCurrency} />
                  <SelectField label="금액 단위" value={normalizeRevenueUnitForCurrency(selected.revenueCurrency, selected.revenueUnit)} options={moneyUnitOptions(selected.revenueCurrency)} onChange={updateRevenueUnit} />
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
                      <div className="rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2 text-sm font-bold text-white/80">{percent > 0 ? `${percent.toFixed(1)}%` : "-"}</div>
                      <RemoveButton onClick={() => updateSelected({ revenueItems: removeAt(selected.revenueItems, index, revenue()) })} />
                    </div>
                  ))}
                </div>
                <AddButton onClick={() => updateSelected({ revenueItems: [...selected.revenueItems, revenue()] })}>매출 항목 추가</AddButton>
              </Panel>

              <Panel eyebrow="최근 실적" title="실적 테이블">
                <div className="mb-3 grid gap-3 md:grid-cols-2">
                  <SelectField label="실적 화폐" value={selected.revenueCurrency} options={currencyOptions} onChange={updateRevenueCurrency} />
                  <SelectField label="실적 금액 단위" value={normalizeRevenueUnitForCurrency(selected.revenueCurrency, selected.revenueUnit)} options={moneyUnitOptions(selected.revenueCurrency)} onChange={updateRevenueUnit} />
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

              <Panel eyebrow="모멘텀" title="모멘텀 / 뉴스">
                <div className="grid gap-3">
                  {selected.conferenceCalls.map((call, index) => (
                    <div key={call.id} className="grid gap-3 rounded-lg border border-emerald-300/10 bg-slate-950/55 p-3 shadow-inner shadow-black/20">
                      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                        <label className="grid gap-1 text-xs font-bold text-emerald-100/55">
                          타이틀
                          <input
                            className={callFieldClass}
                            value={call.source}
                            onChange={(event) => updateSelected({ conferenceCalls: replaceAt(selected.conferenceCalls, index, { ...call, source: event.target.value }) })}
                            placeholder="예: 1Q26 실적발표 컨퍼런스콜"
                          />
                        </label>
                        <label className="grid gap-1 text-xs font-bold text-emerald-100/55">
                          날짜
                          <input
                            type="date"
                            className={callFieldClass}
                            value={call.date}
                            onChange={(event) => updateSelected({ conferenceCalls: replaceAt(selected.conferenceCalls, index, { ...call, date: event.target.value }) })}
                          />
                        </label>
                        <RemoveButton onClick={() => updateSelected({ conferenceCalls: removeAt(selected.conferenceCalls, index, conferenceCall()) })} />
                      </div>
                      <ConferenceCallTextArea label="세부 내용" value={call.content} onChange={(value) => updateSelected({ conferenceCalls: replaceAt(selected.conferenceCalls, index, { ...call, content: value }) })} />
                    </div>
                  ))}
                </div>
                <AddButton onClick={() => updateSelected({ conferenceCalls: [...selected.conferenceCalls, conferenceCall(selected.revenueSource)] })}>모멘텀 추가</AddButton>
              </Panel>
            </form>
          )}
        </main>
      </div>

      <OptionManagerModal
        open={optionModal !== null}
        type={optionModal}
        values={optionModal === "market" ? profileOptions.markets : optionModal === "sector" ? profileOptions.sectors : tagOptions}
        edits={optionEdit}
        draft={optionDraft}
        onDraftChange={setOptionDraft}
        onEditChange={(key, value) => setOptionEdit((prev) => ({ ...prev, [key]: value }))}
        onAdd={addOption}
        onRename={renameOption}
        onDelete={deleteOption}
        onClose={() => setOptionModal(null)}
      />
      <AlertModal message={alertMessage} onClose={() => setAlertMessage("")} />
      {toast ? <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-2xl">{toast}</div> : null}
    </AppShell>
  );
}

function Reader({ report }: { report: ResearchReport }) {
  const revenueComputed = getRevenueComputed(report.revenueItems, report.revenueCurrency, report.revenueUnit);
  const momentumItems = sortMomentumItems(report.conferenceCalls?.length ? report.conferenceCalls : normalizeConferenceCalls([], report.revenueSource, report.earningsCall, report.sources));
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [selectedMomentum, setSelectedMomentum] = useState<ConferenceCallNote | null>(null);
  const displayMetrics = metricDisplayItems(report);
  return (
    <div className="grid gap-4">
      <Panel eyebrow="사업 개요" title="회사 개요">
        <Paragraph value={report.thesis} />
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.08] p-3">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white/35">투자 근거</div>
          <Paragraph value={report.evidence} />
        </div>
      </Panel>

      <Panel
        eyebrow="시장 스냅샷"
        title="핵심 지표"
        right={
          <span className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${ratingStyles[report.rating]}`}>{ratingLabels[report.rating]}</span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {displayMetrics.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.label.trim() === "투자 적합도" ? () => setScoreModalOpen(true) : undefined}
              className={`rounded-lg border p-4 text-left ${item.label.trim() === "투자 적합도" ? "border-emerald-300/20 bg-emerald-300/10 hover:bg-emerald-300/15" : "border-white/10 bg-white/[0.09]"}`}
            >
              <div className="text-xs uppercase tracking-[0.18em] text-white/40">{item.label || "지표"}</div>
              <div className={`mt-2 break-words text-xl font-black ${item.label.trim() === "투자 적합도" ? "text-emerald-100" : ""}`}>{item.value || "-"}</div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel eyebrow="강점 / 단점" title="강점과 단점">
        <div className="grid gap-4 md:grid-cols-2">
          <MemoItemList title="강점" value={report.catalysts} tone="positive" />
          <MemoItemList title="단점" value={report.risks} tone="negative" />
        </div>
      </Panel>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
        <Panel
          eyebrow="매출 구성"
          title="매출 믹스"
          right={
            <div className="rounded-lg border border-white/10 bg-white/[0.08] px-3 py-2 text-right">
              <div className="text-xs font-bold text-white/45">Data 출처</div>
              <div className="mt-1 text-sm font-black text-white">{report.revenueSource || "-"}</div>
            </div>
          }
        >
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
                    <td className={`px-3 py-3 ${isNegativeValue(row.revenue) ? "text-rose-300" : ""}`}>{formatMoneyInput(row.revenue, report.revenueCurrency, report.revenueUnit)}</td>
                    <td className={`px-3 py-3 ${isNegativeValue(row.profit) ? "text-rose-300" : ""}`}>{formatMoneyInput(row.profit, report.revenueCurrency, report.revenueUnit)}</td>
                    <td className={`px-3 py-3 ${isNegativeValue(row.eps) ? "text-rose-300" : ""}`}>{row.eps || "-"}</td>
                    <td className={`px-3 py-3 ${isNegativeValue(row.growth) ? "text-rose-300" : ""}`}>{row.growth || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <Panel eyebrow="모멘텀" title="모멘텀 / 뉴스">
        <div className="grid gap-2">
          {momentumItems.length ? (
            momentumItems.map((item, index) => (
              <button key={item.id || index} type="button" onClick={() => setSelectedMomentum(item)} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.07] px-3 py-3 text-left text-sm font-black text-white hover:bg-white/[0.11]">
                  <span className="min-w-0 truncate">{item.source || `모멘텀 ${index + 1}`}</span>
                  <span className="shrink-0 text-xs font-bold text-white/45">{item.date || "날짜 없음"}</span>
              </button>
            ))
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/[0.07] px-3 py-3 text-sm text-white/35">등록된 모멘텀 없음</div>
          )}
        </div>
      </Panel>
      <ResearchScoreModal open={scoreModalOpen} scores={report.researchScores} onClose={() => setScoreModalOpen(false)} />
      <MomentumModal item={selectedMomentum} onClose={() => setSelectedMomentum(null)} />
    </div>
  );
}

function ResearchScoreModal({ open, scores, onClose }: { open: boolean; scores: ResearchScore[]; onClose: () => void }) {
  if (!open) return null;
  const latest = latestScoresByModel(scores);
  const latestIds = new Set(latest.map((score) => score.id));
  const average = averageResearchScore(scores);
  const sorted = [...scores].sort((a, b) => {
    const left = a.date ? new Date(a.date).getTime() : 0;
    const right = b.date ? new Date(b.date).getTime() : 0;
    return right - left;
  });
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[760px] rounded-xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100/45">투자 적합도</div>
            <h3 className="mt-1 text-lg font-black">모델별 점수 리스트</h3>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/8">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-2">
          <div className="text-xs font-bold text-white/45">평균 계산</div>
          <div className="mt-1 text-xl font-black text-emerald-100">{average !== null ? `${average.toFixed(1)}점` : "-"}</div>
          <div className="mt-1 text-xs text-white/45">같은 모델 계열은 최신 날짜 점수 1개만 평균에 반영합니다.</div>
        </div>
        <div className="mt-4 grid max-h-[55vh] gap-2 overflow-auto pr-1">
          {sorted.length ? (
            sorted.map((score) => (
              <div key={score.id} className={`rounded-lg border p-3 ${latestIds.has(score.id) ? "border-emerald-300/25 bg-emerald-300/[0.07]" : "border-white/10 bg-white/[0.05]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-black">
                    {baseResearchModel(score.model)}
                    {score.variant ? <span className="ml-2 text-sm font-bold text-white/45">{score.variant}</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {latestIds.has(score.id) ? <span className="rounded-full bg-emerald-300/15 px-2 py-1 text-[10px] font-black text-emerald-100">평균 반영</span> : null}
                    <span className="text-xs font-bold text-white/45">{score.date || "날짜 없음"}</span>
                    <span className="text-lg font-black text-white">{scoreNumber(score.score)?.toFixed(0) ?? "-"}점</span>
                  </div>
                </div>
                {score.memo ? <div className="mt-2 text-sm leading-6 text-white/62">{score.memo}</div> : null}
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/[0.05] px-3 py-8 text-center text-sm text-white/35">등록된 점수 없음</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MomentumModal({ item, onClose }: { item: ConferenceCallNote | null; onClose: () => void }) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[680px] rounded-xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100/45">모멘텀 / 뉴스</div>
            <h3 className="mt-1 text-lg font-black">{item.source || "모멘텀"}</h3>
            <div className="mt-1 text-xs font-bold text-white/45">{item.date || "날짜 없음"}</div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/8">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.06] p-4">
          <Paragraph value={item.content} />
        </div>
      </div>
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

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<string | { value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-bold text-white/55">
      {label}
      <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const item = typeof option === "string" ? { value: option, label: option } : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function SelectWithManage({ label, value, options, onChange, onManage }: { label: string; value: string; options: string[]; onChange: (value: string) => void; onManage: () => void }) {
  return (
    <label className="grid gap-1 text-xs font-bold text-white/55">
      {label}
      <div className="flex gap-2">
        <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button type="button" onClick={onManage} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/8 hover:bg-white/12" aria-label={`${label} 옵션 관리`}>
          <Pencil className="h-4 w-4" />
        </button>
      </div>
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

function MemoItemEditor({ title, value, tone, onChange }: { title: string; value: string; tone: "positive" | "negative"; onChange: (value: string) => void }) {
  const parsedItems = splitMemoItems(value);
  const [items, setItems] = useState<string[]>(parsedItems.length ? parsedItems : [""]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const accent = tone === "positive" ? "border-emerald-300/15 bg-emerald-300/[0.04]" : "border-rose-300/15 bg-rose-300/[0.04]";
  const dot = tone === "positive" ? "bg-emerald-300" : "bg-rose-300";

  useEffect(() => {
    const nextItems = splitMemoItems(value);
    setItems(nextItems.length ? nextItems : [""]);
  }, [value]);

  const commitItems = (nextItems: string[]) => {
    setItems(nextItems.length ? nextItems : [""]);
    onChange(joinMemoItems(nextItems));
  };
  const updateItem = (index: number, nextValue: string) => commitItems(replaceAt(items, index, nextValue));
  const removeItem = (index: number) => commitItems(removeAt(items, index, ""));
  const addItem = () => setItems((current) => [...current, ""]);
  const reorderItem = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const nextItems = moveItem(items, dragIndex, targetIndex);
    setDragIndex(targetIndex);
    commitItems(nextItems);
  };

  return (
    <div className={`grid gap-2 rounded-lg border p-3 ${accent}`}>
      <div className="text-xs font-black text-white/65">{title}</div>
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div
            key={index}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => {
              event.preventDefault();
              reorderItem(index);
            }}
            onDragEnd={() => setDragIndex(null)}
            className={`grid gap-2 rounded-lg border border-white/10 bg-slate-950/35 p-2 md:grid-cols-[auto_auto_minmax(0,1fr)_auto] md:items-center ${dragIndex === index ? "border-emerald-300/35 bg-emerald-300/10" : ""}`}
          >
            <span className="grid h-8 w-8 cursor-grab place-items-center rounded-md border border-white/10 bg-white/5 text-white/35 active:cursor-grabbing" aria-label={`${title} 순서 변경`}>
              <GripVertical className="h-4 w-4" />
            </span>
            <span className={`hidden h-2 w-2 rounded-full md:block ${dot}`} />
            <input className={fieldClass} value={item} onChange={(event) => updateItem(index, event.target.value)} placeholder={`${title} 항목`} />
            <RemoveButton onClick={() => removeItem(index)} />
          </div>
        ))}
      </div>
      <button type="button" onClick={addItem} className="w-fit rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/12">
        {title} 추가
      </button>
    </div>
  );
}

function MemoItemList({ title, value, tone }: { title: string; value: string; tone: "positive" | "negative" }) {
  const items = splitMemoItems(value);
  const accent = tone === "positive" ? "border-emerald-300/15 bg-emerald-300/[0.04]" : "border-rose-300/15 bg-rose-300/[0.04]";
  const dot = tone === "positive" ? "bg-emerald-300" : "bg-rose-300";
  return (
    <div className={`rounded-lg border p-3 ${accent}`}>
      <div className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-white/40">{title}</div>
      {items.length ? (
        <ul className="grid gap-2">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2 rounded-lg border border-white/10 bg-slate-950/35 px-3 py-2 text-sm leading-6 text-white/75">
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-white/10 bg-slate-950/35 px-3 py-2 text-sm text-white/35">등록된 항목 없음</div>
      )}
    </div>
  );
}

function ConferenceCallTextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-bold text-emerald-100/55">
      {label}
      <textarea className={callTextareaClass} value={value} onChange={(event) => onChange(event.target.value)} />
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

function OptionManagerModal({
  open,
  type,
  values,
  edits,
  draft,
  onDraftChange,
  onEditChange,
  onAdd,
  onRename,
  onDelete,
  onClose
}: {
  open: boolean;
  type: OptionModal;
  values: string[];
  edits: Record<string, string>;
  draft: string;
  onDraftChange: (value: string) => void;
  onEditChange: (key: string, value: string) => void;
  onAdd: () => void;
  onRename: (value: string) => void;
  onDelete: (value: string) => void;
  onClose: () => void;
}) {
  if (!open || !type) return null;
  const title = type === "market" ? "시장 옵션 관리" : type === "sector" ? "섹터 옵션 관리" : "태그 옵션 관리";
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[560px] rounded-xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black">{title}</h3>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/8">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid gap-2">
          {values.map((value) => (
            <div key={value} className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.06] p-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <input className={fieldClass} value={edits[value] ?? value} onChange={(event) => onEditChange(value, event.target.value)} />
              <button type="button" onClick={() => onRename(value)} className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-sm font-bold hover:bg-white/12">
                변경
              </button>
              <button type="button" onClick={() => onDelete(value)} className="rounded-lg border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-100 hover:bg-rose-500/15">
                삭제
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input className={fieldClass} value={draft} onChange={(event) => onDraftChange(event.target.value)} placeholder="새 옵션" />
          <button type="button" onClick={onAdd} className="rounded-lg bg-emerald-300 px-4 py-2 text-sm font-black text-emerald-950 hover:bg-emerald-200">
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertModal({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-xl border border-white/10 bg-slate-950 p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="text-lg font-black">알림</div>
        <p className="mt-3 text-sm leading-6 text-white/70">{message}</p>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-lg bg-emerald-300 px-4 py-2 text-sm font-black text-emerald-950 hover:bg-emerald-200">
          확인
        </button>
      </div>
    </div>
  );
}
