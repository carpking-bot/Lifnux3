import { latestStageResultDate } from "../lib/stageHelpers";
import type { Application, JobPosting } from "../types";

type Props = {
  applications: Application[];
  postingMap: Map<string, JobPosting>;
  industryNameMap: Map<string, string>;
  onOpen: (app: Application) => void;
};

function importanceClass(importance: number) {
  if (importance >= 7) return "border-rose-400/50 text-rose-300";
  if (importance >= 4) return "border-amber-300/50 text-amber-300";
  return "border-cyan-300/50 text-cyan-300";
}

function finalLabel(value: Application["finalResult"]) {
  if (value === "PASS") return "합격";
  if (value === "FAIL") return "불합격";
  return "-";
}

export function DoneView({ applications, postingMap, industryNameMap, onOpen }: Props) {
  return (
    <div className="space-y-2">
      {applications.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-base text-[var(--ink-1)]">완료된 지원 내역이 없습니다.</div>
      ) : (
        applications.map((app) => {
          const posting = postingMap.get(app.postingId);
          const resultAt = latestStageResultDate(app);
          const importance = posting?.importance ?? 1;
          const industryName = posting?.industryId ? industryNameMap.get(posting.industryId) ?? "미분류" : "미분류";

          return (
            <button key={app.applicationId} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left" onClick={() => onOpen(app)}>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-lg border px-3 py-1 text-sm font-semibold ${importanceClass(importance)}`}>{importance}</span>
                    <span className="rounded-lg border border-white/20 px-3 py-1 text-base font-semibold text-white">{posting?.companyName ?? "알 수 없음"}</span>
                    <span className="rounded-lg border border-white/20 px-3 py-1 text-base text-white">{posting?.postingTitle ?? "공고 없음"}</span>
                  </div>
                  <div className="ml-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-white/20 px-3 py-1 text-sm text-[var(--ink-1)]">{industryName}</span>
                    <span className="rounded-lg border border-white/20 px-3 py-1 text-sm text-[var(--ink-1)]">{posting?.role ?? "-"}</span>
                    <span className="rounded-lg border border-white/20 px-3 py-1 text-sm text-[var(--ink-1)]">{posting?.contractType ?? "-"}</span>
                  </div>
                  <div className="ml-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-white/20 px-3 py-1 text-sm text-[var(--ink-1)]">지원일 {app.appliedAt}</span>
                    <span className="rounded-lg border border-white/20 px-3 py-1 text-sm text-[var(--ink-1)]">결과일 {resultAt ?? "-"}</span>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${app.finalResult === "PASS" ? "border-emerald-300/50 text-emerald-300" : "border-rose-400/50 text-rose-300"}`}>
                  {finalLabel(app.finalResult)}
                </span>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
