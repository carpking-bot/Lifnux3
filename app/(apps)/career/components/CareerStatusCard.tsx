import type { Employment, EmploymentChange } from "../types";

type Props = {
  currentEmployment: Employment | null;
  latestChange: EmploymentChange | null;
  tenureDays: number;
  totalCareerDays: number;
  onOpenEditor: () => void;
  onOpenOverview: () => void;
};

function fmtDateRange(start: string, end: string | null) {
  return `${start} ~ ${end ?? "재직중"}`;
}

function fmtSalary(value: number | null) {
  if (typeof value !== "number") return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

function fmtCareerDuration(days: number) {
  const safeDays = Math.max(0, Math.floor(days));
  const years = Math.floor(safeDays / 365);
  const months = Math.floor((safeDays % 365) / 30);
  return `${years}년 ${months}개월`;
}

export function CareerStatusCard({ currentEmployment, latestChange, tenureDays, totalCareerDays, onOpenEditor, onOpenOverview }: Props) {
  const displayTitle = latestChange?.title || currentEmployment?.title || "-";
  const displayDepartment = latestChange?.department || currentEmployment?.department || "-";
  const displayLevel = latestChange?.level || currentEmployment?.level || "-";
  const displaySalary = latestChange?.salaryKRW ?? currentEmployment?.salaryKRW ?? null;

  return (
    <section className="lifnux-glass rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">현재 경력 사항</h2>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-[var(--ink-1)]" onClick={onOpenOverview}>
            Career Overview
          </button>
          <button className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-[var(--ink-1)]" onClick={onOpenEditor}>
            Edit Career
          </button>
        </div>
      </div>

      {!currentEmployment ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-[var(--ink-1)]">현재 재직 정보가 없습니다. 커리어 편집에서 추가하세요.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--ink-1)]">회사</div>
            <div className="mt-1.5 text-lg font-semibold text-white">{currentEmployment.companyName}</div>
            <div className="mt-1.5 text-sm text-[var(--ink-1)]">{fmtDateRange(currentEmployment.startDate, currentEmployment.endDate)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--ink-1)]">재직기간</div>
            <div className="mt-1.5 text-lg font-semibold text-white">{tenureDays}일</div>
            <div className="mt-1.5 text-sm text-[var(--ink-1)]">{currentEmployment.contractType}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--ink-1)]">전체 경력기간</div>
            <div className="mt-1.5 text-lg font-semibold text-white">{fmtCareerDuration(totalCareerDays)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--ink-1)]">직책/직급</div>
            <div className="mt-1.5 text-lg font-semibold text-white">{displayTitle}</div>
            <div className="mt-1.5 text-sm text-[var(--ink-1)]">{`${displayDepartment} / ${displayLevel}`}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--ink-1)]">연봉 / 휴가</div>
            <div className="mt-1.5 text-lg font-semibold text-white">{fmtSalary(displaySalary)}</div>
            <div className="mt-1.5 text-sm text-[var(--ink-1)]">잔여 연차: {currentEmployment.remainingPTO ?? "-"}일</div>
          </div>
        </div>
      )}
    </section>
  );
}
