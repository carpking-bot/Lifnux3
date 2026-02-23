import { useMemo, useState } from "react";
import { Modal } from "../../../(shared)/components/Modal";

export type PostingSnapshot = {
  industry?: string | null;
  role?: string | null;
  contractType?: string | null;
  departmentInfo?: string | null;
  requirements?: string | null;
  neededSkills?: string | null;
  preferred?: string | null;
  memo?: string | null;
  comment?: string | null;
};

export type DocumentOutcomeDetail = {
  applicationId: string;
  companyName: string;
  postingTitle: string;
  submittedAt: string | null;
  resultAt: string | null;
  result: "PASS" | "FAIL";
  posting?: PostingSnapshot;
};

export type DocumentLeadTimeDetail = {
  applicationId: string;
  companyName: string;
  postingTitle: string;
  submittedAt: string;
  resultAt: string;
  businessDays: number;
  result: "PASS" | "FAIL";
};

type Props = {
  open: boolean;
  loading?: boolean;
  passCount: number;
  failCount: number;
  outcomeDetails: DocumentOutcomeDetail[];
  avgBusinessDays: number | null;
  leadTimeDetails: DocumentLeadTimeDetail[];
  onClose: () => void;
};

const DARK_SCROLLBAR_CLASS = "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30";

function fmtAvg(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}일`;
}

export function ApplicationAnalysisModal({
  open,
  loading,
  passCount,
  failCount,
  outcomeDetails,
  avgBusinessDays,
  leadTimeDetails,
  onClose
}: Props) {
  const [activeResult, setActiveResult] = useState<"PASS" | "FAIL" | null>(null);
  const [outcomeSort, setOutcomeSort] = useState<"desc" | "asc">("desc");
  const [leadSort, setLeadSort] = useState<"desc" | "asc">("desc");

  const totalResolved = passCount + failCount;
  const passRate = totalResolved > 0 ? (passCount / totalResolved) * 100 : 0;

  const passDetails = useMemo(() => outcomeDetails.filter((item) => item.result === "PASS"), [outcomeDetails]);
  const failDetails = useMemo(() => outcomeDetails.filter((item) => item.result === "FAIL"), [outcomeDetails]);
  const activeDetails = useMemo(() => {
    const source = activeResult === "PASS" ? passDetails : activeResult === "FAIL" ? failDetails : [];
    const next = [...source];
    const key = (item: DocumentOutcomeDetail) => item.resultAt ?? "";
    next.sort((a, b) => {
      const ak = key(a);
      const bk = key(b);
      if (!ak && !bk) return 0;
      if (!ak) return 1;
      if (!bk) return -1;
      return outcomeSort === "desc" ? bk.localeCompare(ak) : ak.localeCompare(bk);
    });
    return next;
  }, [activeResult, passDetails, failDetails, outcomeSort]);
  const sortedLeadTime = useMemo(() => {
    const next = [...leadTimeDetails];
    next.sort((a, b) => (leadSort === "desc" ? b.businessDays - a.businessDays : a.businessDays - b.businessDays));
    return next;
  }, [leadTimeDetails, leadSort]);

  return (
    <Modal
      open={open}
      title="지원 분석"
      onClose={onClose}
      closeOnBackdrop
      closeOnEsc
      panelClassName={`!max-w-[1220px] ${DARK_SCROLLBAR_CLASS}`}
      actions={<button className="rounded-full border border-white/20 px-5 py-2.5 text-sm" onClick={onClose}>닫기</button>}
    >
      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-sm text-[var(--ink-1)]">
          분석 계산 중...
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="text-lg font-semibold text-white">서류 지원 합격률</div>
            <div className="mt-4 text-3xl font-bold text-white">{totalResolved > 0 ? `${passRate.toFixed(1)}%` : "-"}</div>
            <div className="mt-1 text-sm text-[var(--ink-1)] whitespace-nowrap">합격 {passCount} / 불합격 {failCount}</div>

            <div className="mt-4 overflow-hidden rounded-full border border-white/10 bg-black/40">
              <div className="flex h-4">
                <div className="bg-emerald-400/75" style={{ width: `${totalResolved > 0 ? (passCount / totalResolved) * 100 : 0}%` }} />
                <div className="bg-rose-400/75" style={{ width: `${totalResolved > 0 ? (failCount / totalResolved) * 100 : 0}%` }} />
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${activeResult === "PASS" ? "border-emerald-300/80 bg-emerald-300/10 text-emerald-300" : "border-emerald-300/60 text-emerald-300"}`}
                onClick={() => {
                  setActiveResult((prev) => (prev === "PASS" ? null : "PASS"));
                }}
              >
                합격 상세 ({passCount})
              </button>
              <button
                className={`rounded-full border px-3 py-1.5 text-sm whitespace-nowrap ${activeResult === "FAIL" ? "border-rose-400/80 bg-rose-400/10 text-rose-300" : "border-rose-400/60 text-rose-300"}`}
                onClick={() => {
                  setActiveResult((prev) => (prev === "FAIL" ? null : "FAIL"));
                }}
              >
                불합격 상세 ({failCount})
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                className={`rounded-full border px-3 py-1 text-xs ${outcomeSort === "desc" ? "border-cyan-300/70 text-cyan-300" : "border-white/20 text-[var(--ink-1)]"}`}
                onClick={() => setOutcomeSort("desc")}
              >
                결과일 내림차순
              </button>
              <button
                className={`rounded-full border px-3 py-1 text-xs ${outcomeSort === "asc" ? "border-cyan-300/70 text-cyan-300" : "border-white/20 text-[var(--ink-1)]"}`}
                onClick={() => setOutcomeSort("asc")}
              >
                결과일 오름차순
              </button>
            </div>

            <div className={`mt-3 h-[290px] overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3 ${DARK_SCROLLBAR_CLASS}`}>
              {activeResult ? (
                <div className="space-y-2">
                  {activeDetails.length === 0 ? (
                    <div className="text-sm text-[var(--ink-1)]">상세 내역이 없습니다.</div>
                  ) : (
                    activeDetails.map((item) => (
                      <div key={item.applicationId} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left">
                        <div className="text-sm font-semibold text-white">{item.companyName} · {item.postingTitle}</div>
                        <div className="text-xs text-[var(--ink-1)]">서류 제출 {item.submittedAt ?? "-"} / 결과 {item.resultAt ?? "-"}</div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="text-sm text-[var(--ink-1)]">합격 상세/불합격 상세를 클릭해 내역을 확인하세요.</div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg font-semibold text-white">서류 지원 → 결과 발표 평균 소요일</div>
              <div className="flex items-center gap-2">
                <button
                  className={`rounded-full border px-3 py-1 text-xs ${leadSort === "desc" ? "border-cyan-300/70 text-cyan-300" : "border-white/20 text-[var(--ink-1)]"}`}
                  onClick={() => setLeadSort("desc")}
                >
                  내림차순
                </button>
                <button
                  className={`rounded-full border px-3 py-1 text-xs ${leadSort === "asc" ? "border-cyan-300/70 text-cyan-300" : "border-white/20 text-[var(--ink-1)]"}`}
                  onClick={() => setLeadSort("asc")}
                >
                  오름차순
                </button>
              </div>
            </div>
            <div className="mt-4 text-3xl font-bold text-white">{fmtAvg(avgBusinessDays)}</div>
            <div className="mt-1 text-sm text-[var(--ink-1)]">집계 건수 {leadTimeDetails.length}건</div>

            <div className={`mt-3 h-[290px] space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3 ${DARK_SCROLLBAR_CLASS}`}>
              {sortedLeadTime.length === 0 ? (
                <div className="text-sm text-[var(--ink-1)]">집계 가능한 내역이 없습니다.</div>
              ) : (
                sortedLeadTime.map((item) => (
                  <div key={item.applicationId} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white">{item.companyName} · {item.postingTitle}</div>
                      <div className={`rounded-full border px-3 py-0.5 text-xs whitespace-nowrap ${item.result === "PASS" ? "border-emerald-300/50 text-emerald-300" : "border-rose-400/50 text-rose-300"}`}>{item.result === "PASS" ? "합격" : "불합격"}</div>
                    </div>
                    <div className="mt-1 text-xs text-[var(--ink-1)]">서류 제출 {item.submittedAt} / 결과 {item.resultAt}</div>
                    <div className="mt-1 text-sm text-cyan-300">{item.businessDays} 영업일</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
