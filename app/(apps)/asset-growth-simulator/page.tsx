"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../(shared)/components/AppShell";
import { Modal } from "../../(shared)/components/Modal";
import { loadState, saveState } from "../../(shared)/lib/storage";
import { Database, LineChart, RefreshCcw } from "lucide-react";

const STORAGE_KEY = "lifnux.assetGrowthSimulator.state.v1";
const IRP_MONTHLY_CAP_KRW = 750_000;
const DARK_FIELD_STYLE = { backgroundColor: "#0b0f1a", color: "#e5e7eb", colorScheme: "dark" as const };

type SalaryMode = "AUTO_GROWTH" | "MANUAL";
type AllocationMode = "RATE" | "FIXED";
type ReturnMode = "CAGR" | "HISTORICAL" | "CUSTOM_CSV";
type MarketKey = "SP500" | "NASDAQ100" | "KOSPI200";
type CsvSelectionMode = "SEQUENTIAL" | "RANDOM_NO_REPLACE";
type ReturnSource = "cagr" | "historical" | "custom-csv" | "fallback-cagr";

type SimulatorState = {
  startYear: number;
  planYears: number;
  salaryMode: SalaryMode;
  baseAnnualSalary: number;
  annualSalaryGrowthPct: number;
  manualAnnualSalaryByYear: Record<string, number>;
  initialSavings: number;
  initialPensionIrp: number;
  initialInvestments: number;
  savingsAnnualRatePct: number;
  savingsAllocationMode: AllocationMode;
  investmentAllocationMode: AllocationMode;
  monthlySavingsRatePct: number;
  monthlyInvestmentRatePct: number;
  monthlySavingsFixed: number;
  monthlyInvestmentFixed: number;
  monthlyPensionIrpFixed: number;
  pensionIrpReturnPct: number;
  returnMode: ReturnMode;
  cagrPct: number;
  historicalMarket: MarketKey;
  historicalStartYear: number;
  historicalEndYear: number;
  customCsvTicker: string;
  customCsvSelectionMode: CsvSelectionMode;
  customCsvRandomSeed: number;
};

type HistoricalSeriesPoint = { date?: string; close?: number };
type HistoryApiResponse = {
  series?: Array<{ symbol?: string; points?: HistoricalSeriesPoint[] }>;
};

type SimulationRow = {
  year: number;
  mappedHistoricalYear: number | null;
  annualSalary: number;
  monthlyNetSalary: number;
  monthlySavings: number;
  monthlyPensionIrp: number;
  monthlyInvestment: number;
  monthlyTotalContribution: number;
  returnRate: number;
  returnSource: ReturnSource;
  startSavings: number;
  startPensionIrp: number;
  startInvestments: number;
  endSavings: number;
  endPensionIrp: number;
  endInvestments: number;
  endTotal: number;
};

const MARKET_CONFIG: Record<MarketKey, { label: string; symbol: string; description: string }> = {
  SP500: { label: "S&P 500", symbol: "NAS:SPY", description: "Uses SPY as S&P 500 proxy." },
  NASDAQ100: { label: "NASDAQ 100", symbol: "NAS:QQQ", description: "Uses QQQ as Nasdaq proxy." },
  KOSPI200: { label: "KOSPI 200", symbol: "069500", description: "Uses 069500 (KODEX 200) as KOSPI proxy." }
};

const todayYear = new Date().getFullYear();

const defaultState: SimulatorState = {
  startYear: todayYear,
  planYears: 20,
  salaryMode: "AUTO_GROWTH",
  baseAnnualSalary: 48_000_000,
  annualSalaryGrowthPct: 4,
  manualAnnualSalaryByYear: {},
  initialSavings: 20_000_000,
  initialPensionIrp: 0,
  initialInvestments: 30_000_000,
  savingsAnnualRatePct: 3,
  savingsAllocationMode: "RATE",
  investmentAllocationMode: "RATE",
  monthlySavingsRatePct: 20,
  monthlyInvestmentRatePct: 30,
  monthlySavingsFixed: 1_000_000,
  monthlyInvestmentFixed: 1_300_000,
  monthlyPensionIrpFixed: 750_000,
  pensionIrpReturnPct: 6,
  returnMode: "CAGR",
  cagrPct: 7,
  historicalMarket: "SP500",
  historicalStartYear: todayYear - 20,
  historicalEndYear: todayYear - 1,
  customCsvTicker: "S&P 500",
  customCsvSelectionMode: "SEQUENTIAL",
  customCsvRandomSeed: 42
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const formatKrw = (value: number) => `KRW ${Math.round(value).toLocaleString("ko-KR")}`;
const formatPct = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;

function progressiveIncomeTax(taxableIncome: number) {
  if (taxableIncome <= 14_000_000) return taxableIncome * 0.06;
  if (taxableIncome <= 50_000_000) return taxableIncome * 0.15 - 1_260_000;
  if (taxableIncome <= 88_000_000) return taxableIncome * 0.24 - 5_760_000;
  if (taxableIncome <= 150_000_000) return taxableIncome * 0.35 - 15_440_000;
  if (taxableIncome <= 300_000_000) return taxableIncome * 0.38 - 19_940_000;
  if (taxableIncome <= 500_000_000) return taxableIncome * 0.4 - 25_940_000;
  if (taxableIncome <= 1_000_000_000) return taxableIncome * 0.42 - 35_940_000;
  return taxableIncome * 0.45 - 65_940_000;
}

function estimateMonthlyNetSalary(annualGrossSalary: number) {
  const gross = Math.max(0, annualGrossSalary);
  const nationalPension = gross * 0.045;
  const healthInsurance = gross * 0.03545;
  const longTermCare = healthInsurance * 0.1295;
  const employmentInsurance = gross * 0.009;
  const socialInsurance = nationalPension + healthInsurance + longTermCare + employmentInsurance;
  const taxableIncome = Math.max(0, gross * 0.78);
  const incomeTax = Math.max(0, progressiveIncomeTax(taxableIncome));
  const localIncomeTax = incomeTax * 0.1;
  const annualNet = Math.max(0, gross - socialInsurance - incomeTax - localIncomeTax);
  return annualNet / 12;
}

function getYearList(startYear: number, count: number) {
  return Array.from({ length: Math.max(1, count) }, (_, i) => startYear + i);
}

function yearlyReturnToMonthlyRate(annualRate: number) {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

function buildAnnualReturnMap(points: HistoricalSeriesPoint[]) {
  const grouped = new Map<number, Array<{ date: string; close: number }>>();
  points.forEach((point) => {
    if (typeof point.date !== "string" || typeof point.close !== "number" || !Number.isFinite(point.close)) return;
    const year = Number(point.date.slice(0, 4));
    if (!Number.isFinite(year)) return;
    const list = grouped.get(year) ?? [];
    list.push({ date: point.date, close: point.close });
    grouped.set(year, list);
  });

  const result = new Map<number, number>();
  grouped.forEach((rows, year) => {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length < 2) return;
    const first = rows[0].close;
    const last = rows[rows.length - 1].close;
    if (first <= 0) return;
    result.set(year, last / first - 1);
  });
  return result;
}

function parseReturnCsv(raw: string) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return { tickers: [] as string[], byTicker: new Map<string, Array<{ year: number; rate: number }>>() };

  const headers = lines[0].split(",").map((v) => v.trim());
  const yearIndex = headers.findIndex((header) => header.toLowerCase() === "year");
  const byTicker = new Map<string, Array<{ year: number; rate: number }>>();
  if (yearIndex < 0) return { tickers: [] as string[], byTicker };

  const tickerColumns = headers
    .map((header, index) => ({ header, index }))
    .filter((item) => item.index !== yearIndex && item.header.length > 0);
  tickerColumns.forEach((column) => byTicker.set(column.header, []));

  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(",").map((v) => v.trim());
    const year = Number(cells[yearIndex]);
    if (!Number.isFinite(year)) continue;
    tickerColumns.forEach((column) => {
      const rawCell = cells[column.index] ?? "";
      const normalized = rawCell.replace("%", "").trim();
      if (!normalized || normalized.toUpperCase() === "N/A") return;
      const pct = Number(normalized);
      if (!Number.isFinite(pct)) return;
      const arr = byTicker.get(column.header) ?? [];
      arr.push({ year: Math.round(year), rate: pct / 100 });
      byTicker.set(column.header, arr);
    });
  }

  byTicker.forEach((rows) => rows.sort((a, b) => a.year - b.year));
  const tickers = tickerColumns.map((column) => column.header).filter((ticker) => (byTicker.get(ticker)?.length ?? 0) > 0);
  return { tickers, byTicker };
}

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function solveAnnualizedIrr(startTotal: number, rows: SimulationRow[], endTotal: number) {
  const monthlyContributions: number[] = [];
  rows.forEach((row) => {
    for (let month = 0; month < 12; month += 1) {
      monthlyContributions.push(row.monthlyTotalContribution);
    }
  });
  const months = monthlyContributions.length;
  if (months <= 0 || endTotal <= 0) return null;

  const npv = (rate: number) => {
    const base = 1 + rate;
    if (base <= 0) return Number.NaN;
    let value = -startTotal;
    for (let m = 1; m <= months; m += 1) {
      value -= monthlyContributions[m - 1] / Math.pow(base, m);
    }
    value += endTotal / Math.pow(base, months);
    return value;
  };

  let low = -0.9999;
  let high = 1.0;
  let fLow = npv(low);
  let fHigh = npv(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh)) return null;

  let expandCount = 0;
  while (fLow * fHigh > 0 && expandCount < 20) {
    high = Math.min(high * 2, 1_000);
    fHigh = npv(high);
    if (!Number.isFinite(fHigh)) break;
    expandCount += 1;
  }
  if (fLow * fHigh > 0) return null;

  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const fMid = npv(mid);
    if (!Number.isFinite(fMid)) return null;
    if (Math.abs(fMid) < 1e-9) {
      return Math.pow(1 + mid, 12) - 1;
    }
    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  const monthlyRate = (low + high) / 2;
  return Math.pow(1 + monthlyRate, 12) - 1;
}

function fallbackAnnualizedRate(startTotal: number, totalContributions: number, years: number, endTotal: number) {
  const base = startTotal + totalContributions;
  if (base <= 0 || years <= 0 || endTotal <= 0) return null;
  return Math.pow(endTotal / base, 1 / years) - 1;
}

function computeAnnualizedTwrr(rows: SimulationRow[], savingsAnnualRatePct: number, pensionIrpReturnPct: number) {
  const totalMonths = rows.length * 12;
  if (totalMonths <= 0) return null;
  let factor = 1;
  const savingsMonthlyRate = yearlyReturnToMonthlyRate(Math.max(-0.99, savingsAnnualRatePct / 100));
  const pensionMonthlyRate = yearlyReturnToMonthlyRate(Math.max(-0.99, pensionIrpReturnPct / 100));

  rows.forEach((row) => {
    let s = row.startSavings;
    let p = row.startPensionIrp;
    let i = row.startInvestments;
    const investMonthlyRate = yearlyReturnToMonthlyRate(Math.max(-0.99, row.returnRate));
    for (let m = 0; m < 12; m += 1) {
      const start = s + p + i;
      const sAfter = s * (1 + savingsMonthlyRate);
      const pAfter = p * (1 + pensionMonthlyRate);
      const iAfter = i * (1 + investMonthlyRate);
      const endBeforeFlow = sAfter + pAfter + iAfter;
      if (start > 0) factor *= endBeforeFlow / start;
      s = sAfter + row.monthlySavings;
      p = pAfter + row.monthlyPensionIrp;
      i = iAfter + row.monthlyInvestment;
    }
  });

  if (!Number.isFinite(factor) || factor <= 0) return null;
  return Math.pow(factor, 12 / totalMonths) - 1;
}

function AssetGrowthChart({ rows }: { rows: SimulationRow[] }) {
  if (!rows.length) return null;

  const width = 860;
  const height = 260;
  const padLeft = 80;
  const padRight = 20;
  const padTop = 16;
  const padBottom = 36;
  const totals = rows.map((row) => row.endTotal);
  const min = Math.min(...totals, 0);
  const max = Math.max(...totals, 1);
  const range = Math.max(1, max - min);
  const x = (i: number) =>
    rows.length === 1 ? (padLeft + width - padRight) / 2 : padLeft + (i / (rows.length - 1)) * (width - padLeft - padRight);
  const y = (v: number) => padTop + ((max - v) / range) * (height - padTop - padBottom);
  const points = rows.map((row, i) => `${x(i)},${y(row.endTotal)}`).join(" ");

  return (
    <div className="rounded-2xl border border-white/10 bg-[#08111c]/85 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-white/90">
        <LineChart className="h-4 w-4" />
        Asset Growth
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full">
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke="rgba(255,255,255,0.2)" />
        <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} stroke="rgba(255,255,255,0.2)" />
        {Array.from({ length: 4 }).map((_, i) => {
          const tick = min + ((max - min) * i) / 3;
          const yy = y(tick);
          return (
            <g key={`tick-${i}`}>
              <line x1={padLeft} y1={yy} x2={width - padRight} y2={yy} stroke="rgba(255,255,255,0.08)" />
              <text x={padLeft - 8} y={yy + 4} textAnchor="end" className="fill-white/60 text-[11px]">
                {Math.round(tick / 1_000_000).toLocaleString("ko-KR")}M
              </text>
            </g>
          );
        })}
        <polyline points={points} fill="none" stroke="#4fd1c5" strokeWidth={2.5} />
      </svg>
    </div>
  );
}

function StatCard({ title, value, positive = true }: { title: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#08111c]/85 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">{title}</div>
      <div className={`mt-2 text-2xl font-semibold ${title === "Net Gain" ? (positive ? "text-emerald-300" : "text-rose-300") : ""}`}>{value}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  useThousands
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  useThousands?: boolean;
}) {
  const displayValue = useThousands ? Math.round(value || 0).toLocaleString("ko-KR") : value;
  return (
    <label className="block text-xs text-[var(--ink-1)]">
      {label}
      <input
        type={useThousands ? "text" : "number"}
        inputMode={useThousands ? "numeric" : undefined}
        min={min}
        max={max}
        step={step}
        className="mt-1 w-full rounded-lg border border-white/10 bg-[#08111c]/85 px-3 py-2"
        style={DARK_FIELD_STYLE}
        value={displayValue}
        onChange={(event) => {
          if (useThousands) {
            const normalized = event.target.value.replace(/[^\d.-]/g, "");
            onChange(toFiniteNumber(normalized, 0));
            return;
          }
          onChange(toFiniteNumber(event.target.value, value));
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-[var(--ink-1)]">
      {label}
      <select
        className="mt-1 w-full rounded-lg border border-white/10 bg-[#08111c]/85 px-3 py-2"
        style={DARK_FIELD_STYLE}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} style={{ backgroundColor: "#0b0f1a", color: "#e5e7eb" }}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AssetGrowthSimulatorPage() {
  const [state, setState] = useState<SimulatorState>(defaultState);
  const [historicalAnnualReturns, setHistoricalAnnualReturns] = useState<Map<number, number>>(new Map());
  const [customCsvByTicker, setCustomCsvByTicker] = useState<Map<string, Array<{ year: number; rate: number }>>>(new Map());
  const [customCsvTickers, setCustomCsvTickers] = useState<string[]>([]);
  const [customCsvFileName, setCustomCsvFileName] = useState<string>("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualSalaryOpen, setManualSalaryOpen] = useState(false);

  useEffect(() => {
    const loaded = loadState<SimulatorState>(STORAGE_KEY, defaultState);
    const legacyAllocationMode =
      (loaded as unknown as { allocationMode?: AllocationMode })?.allocationMode ?? "RATE";
    setState({
      ...defaultState,
      ...loaded,
      savingsAllocationMode: loaded?.savingsAllocationMode ?? legacyAllocationMode,
      investmentAllocationMode: loaded?.investmentAllocationMode ?? legacyAllocationMode,
      planYears: Math.max(1, Math.round(toFiniteNumber(loaded?.planYears, defaultState.planYears))),
      startYear: Math.round(toFiniteNumber(loaded?.startYear, defaultState.startYear))
    });
  }, []);

  useEffect(() => {
    saveState(STORAGE_KEY, state);
  }, [state]);

  const planYears = getYearList(state.startYear, state.planYears);

  const salaryRows = useMemo(() => {
    return planYears.map((year, index) => {
      if (state.salaryMode === "AUTO_GROWTH") {
        const annual = state.baseAnnualSalary * Math.pow(1 + state.annualSalaryGrowthPct / 100, index);
        return { year, annualSalary: Math.max(0, annual) };
      }
      const manual = state.manualAnnualSalaryByYear[String(year)];
      return { year, annualSalary: Math.max(0, toFiniteNumber(manual, 0)) };
    });
  }, [planYears, state.baseAnnualSalary, state.annualSalaryGrowthPct, state.manualAnnualSalaryByYear, state.salaryMode]);

  const runHistoricalFetch = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const market = MARKET_CONFIG[state.historicalMarket];
      const start = `${state.historicalStartYear}-01-01`;
      const end = `${state.historicalEndYear}-12-31`;
      const response = await fetch(
        `/api/history?symbols=${encodeURIComponent(market.symbol)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error(`History fetch failed (${response.status})`);
      const data = (await response.json()) as HistoryApiResponse;
      const points = data.series?.[0]?.points ?? [];
      const map = buildAnnualReturnMap(points);
      if (!map.size) throw new Error("No annual return points could be built from the selected range.");
      setHistoricalAnnualReturns(map);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Historical fetch failed.");
      setHistoricalAnnualReturns(new Map());
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleCsvUpload = async (file: File) => {
    const raw = await file.text();
    const parsed = parseReturnCsv(raw);
    setCustomCsvByTicker(parsed.byTicker);
    setCustomCsvTickers(parsed.tickers);
    setState((prev) =>
      parsed.tickers.length && !parsed.tickers.includes(prev.customCsvTicker) ? { ...prev, customCsvTicker: parsed.tickers[0] } : prev
    );
    setCustomCsvFileName(file.name);
  };

  const customCsvRateByYear = useMemo(() => {
    const rows = customCsvByTicker.get(state.customCsvTicker) ?? [];
    if (!rows.length) return new Map<number, number>();
    const selected: Array<{ year: number; rate: number }> = [];
    if (state.customCsvSelectionMode === "SEQUENTIAL") {
      for (let i = 0; i < Math.min(state.planYears, rows.length); i += 1) selected.push(rows[i]);
    } else {
      const pool = [...rows];
      const rng = createRng(Math.round(state.customCsvRandomSeed));
      while (pool.length > 0 && selected.length < state.planYears) {
        const idx = Math.floor(rng() * pool.length);
        const [picked] = pool.splice(idx, 1);
        selected.push(picked);
      }
    }
    const map = new Map<number, number>();
    selected.forEach((item, idx) => map.set(state.startYear + idx, item.rate));
    return map;
  }, [customCsvByTicker, state.customCsvRandomSeed, state.customCsvSelectionMode, state.customCsvTicker, state.planYears, state.startYear]);

  const simulationRows = useMemo(() => {
    let savingsBalance = Math.max(0, state.initialSavings);
    let pensionIrpBalance = Math.max(0, state.initialPensionIrp);
    let investmentBalance = Math.max(0, state.initialInvestments);
    const savingsMonthlyRate = yearlyReturnToMonthlyRate(Math.max(-0.99, state.savingsAnnualRatePct / 100));
    const rows: SimulationRow[] = [];

    salaryRows.forEach((salaryRow, index) => {
      const monthlyNetSalary = estimateMonthlyNetSalary(salaryRow.annualSalary);
      const monthlySavings =
        state.savingsAllocationMode === "RATE"
          ? (monthlyNetSalary * Math.max(0, state.monthlySavingsRatePct)) / 100
          : Math.max(0, state.monthlySavingsFixed);
      const monthlyInvestmentTotal =
        state.investmentAllocationMode === "RATE"
          ? (monthlyNetSalary * Math.max(0, state.monthlyInvestmentRatePct)) / 100
          : Math.max(0, state.monthlyInvestmentFixed);
      const monthlyPensionIrp = Math.min(IRP_MONTHLY_CAP_KRW, Math.max(0, state.monthlyPensionIrpFixed));
      const monthlyInvestment = Math.max(0, monthlyInvestmentTotal);
      const mappedHistoricalYear = state.returnMode === "HISTORICAL" ? state.historicalStartYear + index : null;
      const historicalRate = mappedHistoricalYear !== null ? historicalAnnualReturns.get(mappedHistoricalYear) : undefined;
      const csvRate = customCsvRateByYear.get(salaryRow.year);
      const fallbackCagr = state.cagrPct / 100;
      const returnRate =
        state.returnMode === "CAGR"
          ? fallbackCagr
          : state.returnMode === "HISTORICAL"
            ? historicalRate ?? fallbackCagr
            : csvRate ?? fallbackCagr;
      const returnSource: ReturnSource =
        state.returnMode === "CAGR"
          ? "cagr"
          : state.returnMode === "HISTORICAL"
            ? historicalRate === undefined
              ? "fallback-cagr"
              : "historical"
            : csvRate === undefined
              ? "fallback-cagr"
              : "custom-csv";
      const investmentMonthlyRate = yearlyReturnToMonthlyRate(Math.max(-0.99, returnRate));
      const pensionIrpMonthlyRate = yearlyReturnToMonthlyRate(Math.max(-0.99, state.pensionIrpReturnPct / 100));

      const startSavings = savingsBalance;
      const startPensionIrp = pensionIrpBalance;
      const startInvestments = investmentBalance;
      for (let month = 0; month < 12; month += 1) {
        savingsBalance = savingsBalance * (1 + savingsMonthlyRate) + monthlySavings;
        pensionIrpBalance = pensionIrpBalance * (1 + pensionIrpMonthlyRate) + monthlyPensionIrp;
        investmentBalance = investmentBalance * (1 + investmentMonthlyRate) + monthlyInvestment;
      }

      rows.push({
        year: salaryRow.year,
        mappedHistoricalYear,
        annualSalary: salaryRow.annualSalary,
        monthlyNetSalary,
        monthlySavings,
        monthlyPensionIrp,
        monthlyInvestment,
        monthlyTotalContribution: monthlySavings + monthlyPensionIrp + monthlyInvestment,
        returnRate,
        returnSource,
        startSavings,
        startPensionIrp,
        startInvestments,
        endSavings: savingsBalance,
        endPensionIrp: pensionIrpBalance,
        endInvestments: investmentBalance,
        endTotal: savingsBalance + pensionIrpBalance + investmentBalance
      });
    });

    return rows;
  }, [
    customCsvRateByYear,
    historicalAnnualReturns,
    salaryRows,
    state.savingsAllocationMode,
    state.investmentAllocationMode,
    state.cagrPct,
    state.historicalStartYear,
    state.initialPensionIrp,
    state.initialInvestments,
    state.initialSavings,
    state.monthlyPensionIrpFixed,
    state.monthlyInvestmentFixed,
    state.monthlyInvestmentRatePct,
    state.monthlySavingsFixed,
    state.monthlySavingsRatePct,
    state.pensionIrpReturnPct,
    state.returnMode,
    state.savingsAnnualRatePct
  ]);

  const summary = useMemo(() => {
    if (!simulationRows.length) return null;
    const first = simulationRows[0];
    const last = simulationRows[simulationRows.length - 1];
    const startTotal = first.startSavings + first.startPensionIrp + first.startInvestments;
    const totalContributions = simulationRows.reduce((sum, row) => sum + row.monthlyTotalContribution * 12, 0);
    const savingsContribTotal = simulationRows.reduce((sum, row) => sum + row.monthlySavings * 12, 0);
    const pensionContribTotal = simulationRows.reduce((sum, row) => sum + row.monthlyPensionIrp * 12, 0);
    const investmentContribTotal = simulationRows.reduce((sum, row) => sum + row.monthlyInvestment * 12, 0);
    const avgInvestmentRate =
      simulationRows.length > 0 ? simulationRows.reduce((sum, row) => sum + row.returnRate, 0) / simulationRows.length : 0;
    const weightedExpectedReturn =
      totalContributions > 0
        ? (savingsContribTotal * (state.savingsAnnualRatePct / 100) +
            pensionContribTotal * (state.pensionIrpReturnPct / 100) +
            investmentContribTotal * avgInvestmentRate) /
          totalContributions
        : null;
    const years = Math.max(1, simulationRows.length);
    const irr = solveAnnualizedIrr(startTotal, simulationRows, last.endTotal);
    const annualized = irr ?? fallbackAnnualizedRate(startTotal, totalContributions, years, last.endTotal);
    const twrr = computeAnnualizedTwrr(simulationRows, state.savingsAnnualRatePct, state.pensionIrpReturnPct);
    const fallbackCount = simulationRows.filter((row) => row.returnSource === "fallback-cagr").length;
    return {
      startTotal,
      endTotal: last.endTotal,
      endSavings: last.endSavings,
      endPensionIrp: last.endPensionIrp,
      endInvestment: last.endInvestments,
      totalContributions,
      gain: last.endTotal - startTotal - totalContributions,
      annualized,
      twrr,
      annualizedSource: irr !== null ? "IRR" : "Fallback",
      weightedExpectedReturn,
      fallbackCount
    };
  }, [simulationRows, state.pensionIrpReturnPct, state.savingsAnnualRatePct]);

  const historicalYears = useMemo(() => [...historicalAnnualReturns.keys()].sort((a, b) => a - b), [historicalAnnualReturns]);

  return (
    <AppShell showTitle={false}>
      <div className="mx-auto w-full max-w-[1320px] space-y-6 pb-20 pt-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl">Asset Growth Simulator</h1>
            <p className="mt-1 text-sm text-[var(--ink-1)]">
              Simulates long-term asset growth with salary plan, estimated net monthly pay, and saving/investing allocation.
            </p>
            <p className="mt-1 text-xs text-[var(--ink-1)]">
              Net pay estimate is simplified and may differ from real withholding.
            </p>
          </div>
          <button
            className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/85 hover:border-white/30"
            onClick={() => setState(defaultState)}
          >
            Reset
          </button>
        </div>

        <section className="rounded-2xl border border-white/10 bg-[#08111c]/85 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">A. Plan Control</div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/80">
            <span className="rounded-full border border-white/10 px-3 py-1">
              Period: {state.startYear} - {state.startYear + state.planYears - 1} ({state.planYears}y)
            </span>
            <span className="rounded-full border border-white/10 px-3 py-1">Salary: {state.salaryMode === "AUTO_GROWTH" ? "Auto" : "Manual"}</span>
            <span className="rounded-full border border-white/10 px-3 py-1">Returns: {state.returnMode}</span>
            {state.returnMode === "CUSTOM_CSV" ? (
              <span className="rounded-full border border-white/10 px-3 py-1">
                CSV: {state.customCsvTicker} / {state.customCsvSelectionMode}
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 px-3 py-1">Pension/IRP Return: {state.pensionIrpReturnPct.toFixed(1)}%</span>
            <button className="rounded-full border border-white/15 px-3 py-1 hover:border-white/35" onClick={() => setSettingsOpen(true)}>
              Open Settings
            </button>
            {state.salaryMode === "MANUAL" ? (
              <button className="rounded-full border border-white/15 px-3 py-1 hover:border-white/35" onClick={() => setManualSalaryOpen(true)}>
                Edit Manual Salary
              </button>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 rounded-2xl border border-white/10 bg-[#08111c]/85 p-4">
          <div className="col-span-full text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">B. Overall Data</div>
          <StatCard title="Start Asset" value={summary ? formatKrw(summary.startTotal) : "-"} />
          <StatCard title="End Asset" value={summary ? formatKrw(summary.endTotal) : "-"} />
          <StatCard title="Net Gain" value={summary ? formatKrw(summary.gain) : "-"} positive={summary ? summary.gain >= 0 : true} />
          <StatCard
            title="Annualized IRR"
            value={summary?.annualized !== null && summary?.annualized !== undefined ? formatPct(summary.annualized) : "-"}
          />
          <StatCard title="Strategy TWRR" value={summary?.twrr !== null && summary?.twrr !== undefined ? formatPct(summary.twrr) : "-"} />
          <StatCard
            title="Expected Mix Return"
            value={
              summary?.weightedExpectedReturn !== null && summary?.weightedExpectedReturn !== undefined
                ? formatPct(summary.weightedExpectedReturn)
                : "-"
            }
          />
          <div className="md:col-span-2 xl:col-span-4 rounded-xl border border-white/10 bg-[#08111c]/85 p-3 text-xs">
            <div className="text-[var(--ink-1)]">End Asset Breakdown</div>
            <div className="mt-1 text-[var(--ink-1)]">
              Total Contributions (salary deposits): {summary ? formatKrw(summary.totalContributions) : "-"}
            </div>
            <div className="mt-1 text-[var(--ink-1)]">
              Annualized IRR Source: {summary ? summary.annualizedSource : "-"}
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 px-3 py-2">
                <div className="text-[var(--ink-1)]">Savings</div>
                <div className="mt-1 text-white">{summary ? formatKrw(summary.endSavings) : "-"}</div>
              </div>
              <div className="rounded-lg border border-white/10 px-3 py-2">
                <div className="text-[var(--ink-1)]">Pension / IRP</div>
                <div className="mt-1 text-white">{summary ? formatKrw(summary.endPensionIrp) : "-"}</div>
              </div>
              <div className="rounded-lg border border-white/10 px-3 py-2">
                <div className="text-[var(--ink-1)]">Investment</div>
                <div className="mt-1 text-white">{summary ? formatKrw(summary.endInvestment) : "-"}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#08111c]/85 p-4">
          <div className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">C. Growth Chart</div>
          <AssetGrowthChart rows={simulationRows} />
          {state.returnMode === "HISTORICAL" ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-[#08111c]/85 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm text-white/90">
                <Database className="h-4 w-4" />
                Historical Yearly Returns
              </div>
              {historyLoading ? <div className="text-xs text-[var(--ink-1)]">Loading...</div> : null}
              {historyError ? <div className="text-xs text-rose-300">{historyError}</div> : null}
              {!historyLoading && !historyError && historicalYears.length ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {historicalYears.map((year) => {
                    const value = historicalAnnualReturns.get(year) ?? 0;
                    return (
                      <div key={year} className="rounded-lg border border-white/10 bg-[#08111c]/85 px-3 py-2 text-xs">
                        <div className="text-[var(--ink-1)]">{year}</div>
                        <div className={value >= 0 ? "text-emerald-300" : "text-rose-300"}>{formatPct(value)}</div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
          {state.returnMode === "CUSTOM_CSV" ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-[#08111c]/85 p-3 text-xs">
              <div className="text-[var(--ink-1)]">Custom CSV Return Data</div>
              <div className="mt-1 text-white/90">
                {customCsvFileName
                  ? `${customCsvFileName} loaded / ticker=${state.customCsvTicker} / mode=${state.customCsvSelectionMode} / used=${customCsvRateByYear.size}y`
                  : "No CSV loaded"}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#08111c]/85 p-4">
          <div className="mb-3 text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">D. Detail Data</div>
          <div className="overflow-auto">
            <table className="min-w-[1240px] text-xs">
              <thead>
                <tr className="text-left text-[var(--ink-1)]">
                  <th className="px-2 py-2">Year</th>
                  <th className="px-2 py-2">Annual Salary</th>
                  <th className="px-2 py-2">Net Monthly Pay</th>
                  <th className="px-2 py-2">Monthly Savings</th>
                  <th className="px-2 py-2">Monthly Pension/IRP</th>
                  <th className="px-2 py-2">Monthly Investment</th>
                  <th className="px-2 py-2">Return</th>
                  <th className="px-2 py-2">End Asset</th>
                </tr>
              </thead>
              <tbody>
                {simulationRows.map((row) => (
                  <tr key={row.year} className="border-t border-white/10">
                    <td className="px-2 py-2">{row.year}</td>
                    <td className="px-2 py-2">{formatKrw(row.annualSalary)}</td>
                    <td className="px-2 py-2">{formatKrw(row.monthlyNetSalary)}</td>
                    <td className="px-2 py-2">{formatKrw(row.monthlySavings)}</td>
                    <td className={`px-2 py-2 ${row.monthlyPensionIrp >= IRP_MONTHLY_CAP_KRW - 1 ? "text-amber-300" : ""}`}>{formatKrw(row.monthlyPensionIrp)}</td>
                    <td className="px-2 py-2">{formatKrw(row.monthlyInvestment)}</td>
                    <td className={row.returnRate >= 0 ? "px-2 py-2 text-emerald-300" : "px-2 py-2 text-rose-300"}>
                      {formatPct(row.returnRate)}
                      {row.returnSource === "historical"
                        ? ` (hist ${row.mappedHistoricalYear ?? "-"})`
                        : row.returnSource === "custom-csv"
                          ? " (csv)"
                        : row.returnSource === "fallback-cagr"
                          ? " (fallback)"
                          : ""}
                    </td>
                    <td className="px-2 py-2 font-semibold">{formatKrw(row.endTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary && summary.fallbackCount > 0 ? (
            <div className="mt-3 text-xs text-amber-300">{summary.fallbackCount} years used CAGR fallback due missing historical yearly returns.</div>
          ) : null}
        </section>

        <Modal open={settingsOpen} title="Simulation Settings" onClose={() => setSettingsOpen(false)} closeOnBackdrop closeOnEsc>
          <section className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Period and Salary</div>
            <NumberField label="Start Year" value={state.startYear} onChange={(v) => setState((prev) => ({ ...prev, startYear: Math.round(v) }))} />
            <NumberField
              label="Plan Years"
              value={state.planYears}
              min={1}
              max={60}
              onChange={(v) => setState((prev) => ({ ...prev, planYears: Math.min(60, Math.max(1, Math.round(v))) }))}
            />
            <SelectField
              label="Salary Input Mode"
              value={state.salaryMode}
              options={[
                { value: "AUTO_GROWTH", label: "Auto growth from prior year" },
                { value: "MANUAL", label: "Manual yearly salary" }
              ]}
              onChange={(value) => setState((prev) => ({ ...prev, salaryMode: value as SalaryMode }))}
            />
            {state.salaryMode === "AUTO_GROWTH" ? (
              <>
                <NumberField
                  label="Base Annual Salary (KRW)"
                  value={state.baseAnnualSalary}
                  useThousands
                  onChange={(v) => setState((prev) => ({ ...prev, baseAnnualSalary: Math.max(0, v) }))}
                />
                <NumberField
                  label="Annual Salary Growth (%)"
                  value={state.annualSalaryGrowthPct}
                  step={0.1}
                  onChange={(v) => setState((prev) => ({ ...prev, annualSalaryGrowthPct: v }))}
                />
              </>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Initial Asset and Savings</div>
            <NumberField
              label="Initial Savings (KRW)"
              value={state.initialSavings}
              useThousands
              onChange={(v) => setState((prev) => ({ ...prev, initialSavings: Math.max(0, v) }))}
            />
            <NumberField
              label="Initial Pension/IRP (KRW)"
              value={state.initialPensionIrp}
              useThousands
              onChange={(v) => setState((prev) => ({ ...prev, initialPensionIrp: Math.max(0, v) }))}
            />
            <NumberField
              label="Initial Investments (KRW)"
              value={state.initialInvestments}
              useThousands
              onChange={(v) => setState((prev) => ({ ...prev, initialInvestments: Math.max(0, v) }))}
            />
            <NumberField
              label="Annual Savings Interest (%)"
              value={state.savingsAnnualRatePct}
              step={0.1}
              onChange={(v) => setState((prev) => ({ ...prev, savingsAnnualRatePct: v }))}
            />
          </section>

          <section className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Monthly Allocation</div>
            <SelectField
              label="Savings Mode"
              value={state.savingsAllocationMode}
              options={[
                { value: "RATE", label: "Percent of net monthly pay" },
                { value: "FIXED", label: "Fixed monthly amount" }
              ]}
              onChange={(value) => setState((prev) => ({ ...prev, savingsAllocationMode: value as AllocationMode }))}
            />
            {state.savingsAllocationMode === "RATE" ? (
              <NumberField
                label="Monthly Savings (%)"
                value={state.monthlySavingsRatePct}
                step={0.1}
                onChange={(v) => setState((prev) => ({ ...prev, monthlySavingsRatePct: Math.max(0, v) }))}
              />
            ) : (
              <NumberField
                label="Monthly Savings Fixed (KRW)"
                value={state.monthlySavingsFixed}
                useThousands
                onChange={(v) => setState((prev) => ({ ...prev, monthlySavingsFixed: Math.max(0, v) }))}
              />
            )}
            <SelectField
              label="Investment Mode"
              value={state.investmentAllocationMode}
              options={[
                { value: "RATE", label: "Percent of net monthly pay" },
                { value: "FIXED", label: "Fixed monthly amount" }
              ]}
              onChange={(value) => setState((prev) => ({ ...prev, investmentAllocationMode: value as AllocationMode }))}
            />
            {state.investmentAllocationMode === "RATE" ? (
              <NumberField
                label="Monthly Investments (%)"
                value={state.monthlyInvestmentRatePct}
                step={0.1}
                onChange={(v) => setState((prev) => ({ ...prev, monthlyInvestmentRatePct: Math.max(0, v) }))}
              />
            ) : (
              <NumberField
                label="Monthly Investments Fixed (KRW)"
                value={state.monthlyInvestmentFixed}
                useThousands
                onChange={(v) => setState((prev) => ({ ...prev, monthlyInvestmentFixed: Math.max(0, v) }))}
              />
            )}
            <NumberField
              label="Monthly Pension/IRP Fixed (KRW)"
              value={state.monthlyPensionIrpFixed}
              useThousands
              onChange={(v) => setState((prev) => ({ ...prev, monthlyPensionIrpFixed: Math.max(0, Math.min(IRP_MONTHLY_CAP_KRW, v)) }))}
            />
            <div className="text-[11px] text-[var(--ink-1)]">Pension/IRP is fixed amount only. Monthly cap: {formatKrw(IRP_MONTHLY_CAP_KRW)}.</div>
          </section>

          <section className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--ink-1)]">Returns</div>
            <SelectField
              label="Return Mode"
              value={state.returnMode}
              options={[
                { value: "CAGR", label: "Fixed CAGR" },
                { value: "HISTORICAL", label: "Historical + CAGR fallback" },
                { value: "CUSTOM_CSV", label: "Custom CSV + CAGR fallback" }
              ]}
              onChange={(value) => setState((prev) => ({ ...prev, returnMode: value as ReturnMode }))}
            />
            <NumberField label="CAGR (%)" value={state.cagrPct} step={0.1} onChange={(v) => setState((prev) => ({ ...prev, cagrPct: v }))} />
            <NumberField
              label="Pension/IRP Return (%)"
              value={state.pensionIrpReturnPct}
              step={0.1}
              onChange={(v) => setState((prev) => ({ ...prev, pensionIrpReturnPct: v }))}
            />
            {state.returnMode === "HISTORICAL" ? (
              <div className="space-y-2 rounded-xl border border-white/10 bg-[#08111c]/85 p-3">
                <SelectField
                  label="Market"
                  value={state.historicalMarket}
                  options={[
                    { value: "SP500", label: MARKET_CONFIG.SP500.label },
                    { value: "NASDAQ100", label: MARKET_CONFIG.NASDAQ100.label },
                    { value: "KOSPI200", label: MARKET_CONFIG.KOSPI200.label }
                  ]}
                  onChange={(value) => setState((prev) => ({ ...prev, historicalMarket: value as MarketKey }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="History Start"
                    value={state.historicalStartYear}
                    onChange={(v) => setState((prev) => ({ ...prev, historicalStartYear: Math.round(v) }))}
                  />
                  <NumberField
                    label="History End"
                    value={state.historicalEndYear}
                    onChange={(v) => setState((prev) => ({ ...prev, historicalEndYear: Math.round(v) }))}
                  />
                </div>
                <div className="text-[11px] text-[var(--ink-1)]">{MARKET_CONFIG[state.historicalMarket].description}</div>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-white/35"
                  onClick={runHistoricalFetch}
                  disabled={historyLoading}
                >
                  <RefreshCcw className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} />
                  Load Historical Data
                </button>
              </div>
            ) : null}
            {state.returnMode === "CUSTOM_CSV" ? (
              <div className="space-y-2 rounded-xl border border-white/10 bg-[#08111c]/85 p-3">
                <div className="text-xs text-[var(--ink-1)]">CSV format: `year,&lt;ticker columns...&gt;` with percent cells (e.g. `16.39%`).</div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="w-full rounded-lg border border-white/10 bg-[#08111c]/85 px-3 py-2 text-xs"
                  style={DARK_FIELD_STYLE}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void handleCsvUpload(file);
                  }}
                />
                <div className="text-xs text-[var(--ink-1)]">
                  Template: `app/(apps)/asset-growth-simulator/custom_return_template.csv`
                </div>
                {customCsvTickers.length ? (
                  <SelectField
                    label="CSV Ticker (Investment Base Return)"
                    value={state.customCsvTicker}
                    options={customCsvTickers.map((ticker) => ({ value: ticker, label: ticker }))}
                    onChange={(value) => setState((prev) => ({ ...prev, customCsvTicker: value }))}
                  />
                ) : null}
                <SelectField
                  label="CSV Apply Mode"
                  value={state.customCsvSelectionMode}
                  options={[
                    { value: "SEQUENTIAL", label: "Sequential by dataset order (no repeat)" },
                    { value: "RANDOM_NO_REPLACE", label: "Random without replacement (no repeat)" }
                  ]}
                  onChange={(value) => setState((prev) => ({ ...prev, customCsvSelectionMode: value as CsvSelectionMode }))}
                />
                {state.customCsvSelectionMode === "RANDOM_NO_REPLACE" ? (
                  <NumberField
                    label="Random Seed"
                    value={state.customCsvRandomSeed}
                    onChange={(v) => setState((prev) => ({ ...prev, customCsvRandomSeed: Math.round(v) }))}
                  />
                ) : null}
                {customCsvFileName ? (
                  <div className="text-xs text-emerald-300">
                    Loaded: {customCsvFileName} / tickers: {customCsvTickers.join(", ") || "-"} / selected: {state.customCsvTicker}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </Modal>

        <Modal open={manualSalaryOpen} title="Manual Annual Salary" onClose={() => setManualSalaryOpen(false)} closeOnBackdrop closeOnEsc>
          <div className="text-xs text-[var(--ink-1)]">Edit annual salary for each simulation year.</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {planYears.map((year) => (
              <label key={year} className="block text-xs text-[var(--ink-1)]">
                {year}
                <input
                  type="text"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-[#08111c]/85 px-3 py-2"
                  style={DARK_FIELD_STYLE}
                  value={(state.manualAnnualSalaryByYear[String(year)] ?? 0).toLocaleString("ko-KR")}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      manualAnnualSalaryByYear: {
                        ...prev.manualAnnualSalaryByYear,
                        [String(year)]: Math.max(0, toFiniteNumber(event.target.value.replace(/[^\d.-]/g, ""), 0))
                      }
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
