import type { Employment, EmploymentChange } from "../types";

type Props = {
  currentEmployment: Employment | null;
  latestChange: EmploymentChange | null;
  tenureDays: number;
  onOpenEditor: () => void;
};

function fmtDateRange(start: string, end: string | null) {
  return `${start} ~ ${end ?? "Present"}`;
}

function fmtSalary(value: number | null) {
  if (typeof value !== "number") return "-";
  return `${value.toLocaleString("ko-KR")} KRW`;
}

export function CareerStatusCard({ currentEmployment, latestChange, tenureDays, onOpenEditor }: Props) {
  return (
    <section className="lifnux-glass rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl text-white">Current Career Status</h2>
          <div className="text-xs text-[var(--ink-1)]">Current employment summary and latest change snapshot.</div>
        </div>
        <button className="rounded-full border border-white/20 px-4 py-2 text-xs text-[var(--ink-1)]" onClick={onOpenEditor}>
          Edit Career
        </button>
      </div>

      {!currentEmployment ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-[var(--ink-1)]">No current employment. Add one in Edit Career.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-1)]">Company</div>
            <div className="mt-1 text-sm text-white">{currentEmployment.companyName}</div>
            <div className="mt-1 text-xs text-[var(--ink-1)]">{fmtDateRange(currentEmployment.startDate, currentEmployment.endDate)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-1)]">Tenure</div>
            <div className="mt-1 text-sm text-white">{tenureDays} days</div>
            <div className="mt-1 text-xs text-[var(--ink-1)]">{currentEmployment.contractType}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-1)]">Position</div>
            <div className="mt-1 text-sm text-white">{latestChange?.title || "-"}</div>
            <div className="mt-1 text-xs text-[var(--ink-1)]">{latestChange ? `${latestChange.department} / ${latestChange.level}` : "-"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-1)]">Salary / PTO</div>
            <div className="mt-1 text-sm text-white">{fmtSalary(latestChange?.salaryKRW ?? null)}</div>
            <div className="mt-1 text-xs text-[var(--ink-1)]">Remaining PTO: {currentEmployment.remainingPTO ?? "-"}</div>
          </div>
        </div>
      )}
    </section>
  );
}
