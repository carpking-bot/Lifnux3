import { useRef, useState } from "react";
import { Modal } from "../../../(shared)/components/Modal";
import type { Employment, EmploymentChange } from "../types";

type Props = {
  open: boolean;
  employments: Employment[];
  changes: EmploymentChange[];
  onClose: () => void;
};

type SalaryPoint = {
  date: string;
  salary: number;
  label: string;
};

const EMPLOYMENT_COLORS = [
  "rgba(56,189,248,0.35)",
  "rgba(34,197,94,0.35)",
  "rgba(245,158,11,0.35)",
  "rgba(244,114,182,0.35)",
  "rgba(168,85,247,0.35)",
  "rgba(251,146,60,0.35)"
];

function ymd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toMs(dateKey: string) {
  const time = new Date(`${dateKey}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : 0;
}

function fmtMoney(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function fmtMoneyCompact(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function buildSalaryPoints(employments: Employment[], changes: EmploymentChange[]) {
  const fromChanges: SalaryPoint[] = changes
    .filter((change) => typeof change.salaryKRW === "number" && Number.isFinite(change.salaryKRW))
    .map((change) => ({
      date: change.effectiveDate,
      salary: change.salaryKRW as number,
      label: `${change.department || "-"} / ${change.title || "-"}`
    }));

  const fromEmployments: SalaryPoint[] = employments
    .filter((employment) => typeof employment.salaryKRW === "number" && Number.isFinite(employment.salaryKRW))
    .map((employment) => ({
      date: employment.startDate,
      salary: employment.salaryKRW as number,
      label: `${employment.companyName} start`
    }));

  return [...fromChanges, ...fromEmployments].sort((a, b) => a.date.localeCompare(b.date));
}

export function CareerOverviewModal({ open, employments, changes, onClose }: Props) {
  const today = ymd();
  const fixedStart = "2022-01-01";
  const sortedEmployments = [...employments].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const salaryPoints = buildSalaryPoints(sortedEmployments, changes);

  const maxEnd = sortedEmployments.reduce((latest, employment) => {
    const end = employment.endDate ?? today;
    return end > latest ? end : latest;
  }, today);

  const startMs = toMs(fixedStart);
  const endMs = Math.max(startMs + 86400000, toMs(maxEnd));
  const spanMs = endMs - startMs;

  const minSalary = salaryPoints.length ? Math.min(...salaryPoints.map((point) => point.salary)) : 0;
  const maxSalary = salaryPoints.length ? Math.max(...salaryPoints.map((point) => point.salary)) : 1;
  const salarySpan = Math.max(1, maxSalary - minSalary);

  const years: number[] = [];
  const endYear = new Date(maxEnd).getFullYear();
  for (let year = 2022; year <= endYear + 1; year += 1) years.push(year);

  const width = 1100;
  const height = 420;
  const left = 56;
  const right = 28;
  const top = 30;
  const bottom = 56;
  const axisY = height - bottom;
  const plotWidth = width - left - right;

  const toX = (dateKey: string) => {
    const ratio = (toMs(dateKey) - startMs) / spanMs;
    return left + Math.max(0, Math.min(1, ratio)) * plotWidth;
  };

  const toSalaryY = (salary: number) => {
    const topY = top + 12;
    const bottomY = axisY - 90;
    return bottomY - ((salary - minSalary) / salarySpan) * (bottomY - topY);
  };
  const salaryTicks = salaryPoints.length
    ? salarySpan <= 1
      ? [maxSalary]
      : [maxSalary, maxSalary - salarySpan / 3, maxSalary - (salarySpan * 2) / 3, minSalary]
    : [];

  const chartRef = useRef<HTMLDivElement | null>(null);
  const [hoveredEmployment, setHoveredEmployment] = useState<Employment | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleEmploymentHover = (event: React.MouseEvent<SVGRectElement>, employment: Employment) => {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    setTooltipPos({
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top - 12
    });
    setHoveredEmployment(employment);
  };

  return (
    <Modal
      open={open}
      title="Career Overview"
      onClose={onClose}
      closeOnBackdrop
      closeOnEsc
      panelClassName="!max-w-[1320px]"
      actions={<button className="rounded-full border border-white/20 px-5 py-2.5 text-sm" onClick={onClose}>Close</button>}
    >
      <div className="space-y-3">
        <div ref={chartRef} className="relative rounded-2xl border border-white/10 bg-black/25 p-4">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-[420px] w-full">
            {years.map((year) => {
              const x = toX(`${year}-01-01`);
              return (
                <g key={year}>
                  <line x1={x} y1={top} x2={x} y2={axisY + 18} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <text x={x} y={axisY + 36} textAnchor="middle" fontSize="11" fill="rgba(209,213,219,0.9)">
                    {year}
                  </text>
                </g>
              );
            })}
            {salaryTicks.map((tick, index) => {
              const y = toSalaryY(tick);
              return (
                <g key={`salary-tick-${index}`}>
                  <line x1={left} y1={y} x2={width - right} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <text x={left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="rgba(250,204,21,0.9)">
                    {fmtMoneyCompact(tick)}
                  </text>
                </g>
              );
            })}

            <line x1={left} y1={axisY} x2={width - right} y2={axisY} stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />

            {sortedEmployments.map((employment, index) => {
              const color = EMPLOYMENT_COLORS[index % EMPLOYMENT_COLORS.length];
              const startX = toX(employment.startDate);
              const endX = toX(employment.endDate ?? today);
              const blockWidth = Math.max(8, endX - startX);
              const blockY = axisY - 44;

              return (
                <g key={employment.employmentId}>
                  <rect
                    x={startX}
                    y={blockY}
                    width={blockWidth}
                    height={34}
                    rx={8}
                    fill={color}
                    stroke="rgba(255,255,255,0.35)"
                    onMouseEnter={(event) => handleEmploymentHover(event, employment)}
                    onMouseMove={(event) => handleEmploymentHover(event, employment)}
                    onMouseLeave={() => setHoveredEmployment(null)}
                  />
                  <text x={startX + blockWidth / 2} y={blockY + 22} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.95)">
                    {employment.companyName}
                  </text>
                </g>
              );
            })}

            {salaryPoints.length >= 2 ? (
              <>
                <polyline
                  fill="none"
                  stroke="rgba(250,204,21,0.95)"
                  strokeWidth="3"
                  points={salaryPoints.map((point) => `${toX(point.date)},${toSalaryY(point.salary)}`).join(" ")}
                />
                {salaryPoints.map((point, index) => (
                  <g key={`${point.date}-${index}`}>
                    <circle cx={toX(point.date)} cy={toSalaryY(point.salary)} r="4.5" fill="rgba(250,204,21,1)">
                      <title>{`${point.date} | ${fmtMoney(point.salary)} | ${point.label}`}</title>
                    </circle>
                  </g>
                ))}
              </>
            ) : null}
          </svg>
          {hoveredEmployment ? (
            <div
              className="pointer-events-none absolute z-20 max-w-[320px] rounded-lg border border-white/20 bg-[#0d1321]/95 px-3 py-2 text-xs text-[var(--ink-0)] shadow-xl"
              style={{
                left: `${Math.max(8, Math.min(tooltipPos.x, width - 330))}px`,
                top: `${Math.max(8, tooltipPos.y)}px`
              }}
            >
              <div className="mb-1 text-sm font-semibold">{hoveredEmployment.companyName}</div>
              <div>근무기간: {hoveredEmployment.startDate} ~ {hoveredEmployment.endDate ?? "재직중"}</div>
              <div>부서: {hoveredEmployment.department || "-"}</div>
              <div>직책: {hoveredEmployment.title || "-"}</div>
              <div>직급: {hoveredEmployment.level || "-"}</div>
              <div>연봉: {typeof hoveredEmployment.salaryKRW === "number" ? fmtMoney(hoveredEmployment.salaryKRW) : "-"}</div>
              <div>메모: {hoveredEmployment.notes || "-"}</div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
