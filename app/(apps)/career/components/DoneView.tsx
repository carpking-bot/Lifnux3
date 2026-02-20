import { latestStageResultDate } from "../lib/stageHelpers";
import type { Application, JobPosting } from "../types";

type Props = {
  applications: Application[];
  postingMap: Map<string, JobPosting>;
  onOpen: (app: Application) => void;
};

export function DoneView({ applications, postingMap, onOpen }: Props) {
  return (
    <div className="space-y-2">
      {applications.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-[var(--ink-1)]">No completed applications.</div>
      ) : (
        applications.map((app) => {
          const posting = postingMap.get(app.postingId);
          const resultAt = latestStageResultDate(app);
          return (
            <button key={app.applicationId} className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left" onClick={() => onOpen(app)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-1 text-[10px] ${app.finalResult === "PASS" ? "border-emerald-300/50 text-emerald-300" : "border-rose-400/50 text-rose-300"}`}>{app.finalResult ?? "-"}</span>
                <div className="text-sm text-white">{posting?.companyName ?? "Unknown"} · {posting?.postingTitle ?? "Missing posting"}</div>
                <div className="text-xs text-[var(--ink-1)]">Applied {app.appliedAt}</div>
                <div className="ml-auto text-xs text-[var(--ink-1)]">Final {resultAt ?? "-"}</div>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
